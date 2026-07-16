import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import * as zlib from 'node:zlib';
import { parseOptions, isLoopbackHost } from '../src/cli/args.js';
import { main, resolveCommandInvocation } from '../src/cli/main.js';
import { printError } from '../src/cli/commands/output.js';
import { defaultDesktopStrategy, formatDesktopReplacementPrompt, mergeExplicitProxyConfig, planInteractiveClaudeDesktopStart, requestedProxyConfig, runClaudeDesktopProxy, sameProxyConfig, storedProxyConfig, waitForProxyShutdown } from '../src/cli/commands/claude-desktop.js';
import { extractModelMetadata, fetchModels } from '../src/routerlab/models.js';
import {
  buildCodexModelCatalogFromCache,
  cleanupStaleCodexRuntimeModelCatalogs,
  CODEX_MODEL_CATALOG_FILENAME,
  CODEX_RUNTIME_MODEL_CATALOG_DIR,
} from '../src/apps/codex.js';
import { isCodexVersionSupported } from '../src/platform/detect.js';
import { assertSupportedNodeVersion, isSupportedNodeVersion } from '../src/platform/runtime.js';
import { createClaudeDesktopProxy } from '../src/apps/claude-desktop-proxy.js';
import {
  DESKTOP_MAPPING_STRATEGIES,
  applyProxyClaudeDesktop,
  buildLoopbackUrl,
  generateLocalProxyGatewayToken,
  getClaudeDesktopPaths,
  readClaudeDesktopProxyCredential,
  redactClaudeDesktopProfile,
} from '../src/apps/claude-desktop.js';
import { buildUpstreamUrl, forwardHeaders, readRequestBody, startLongRunningLlmProxy, stopLongRunningLlmProxy } from '../src/platform/llm-proxy.js';
import { resetDeprecationWarningsForTests, warnDeprecationOnce } from '../src/cli/deprecations.js';

test('v4 CLI validates loopback hosts, numeric ports, origins, and legacy transport', () => {
  assert.equal(isLoopbackHost('127.0.0.42'), true);
  assert.equal(isLoopbackHost('127.999.0.1'), false);
  assert.equal(isLoopbackHost('0.0.0.0'), false);
  assert.throws(() => parseOptions(['--host', '0.0.0.0']), /loopback/);
  assert.throws(() => parseOptions(['--port', '12x']), /TCP port/);
  assert.throws(() => parseOptions(['--port', '65536']), /TCP port/);
  assert.throws(() => parseOptions(['--allow-origin', 'ftp://example.com']), (error) => error.exitCode === 2);
  const options = parseOptions([
    '--host', '::1',
    '--port', '8080',
    '--allow-origin', 'https://example.test/path',
    '--allow-origin=https://second.test',
    '--transport', 'direct',
  ]);
  assert.equal(options.port, 8080);
  assert.deepEqual(options.allowOrigins, ['https://example.test', 'https://second.test']);
  assert.equal(options.transport, 'direct');
  assert.deepEqual(options.deprecations, ['--transport']);
});

test('v4 runtime version requirements follow the published ranges', () => {
  assert.equal(isSupportedNodeVersion('22.12.0'), false);
  assert.equal(isSupportedNodeVersion('22.13.0'), true);
  assert.equal(isSupportedNodeVersion('23.4.0'), false);
  assert.equal(isSupportedNodeVersion('23.5.0'), true);
  assert.equal(isSupportedNodeVersion('24.0.0'), true);
  assert.equal(isCodexVersionSupported('codex-cli 0.144.0'), false);
  assert.equal(isCodexVersionSupported('codex-cli 0.144.1'), true);
  assert.equal(isCodexVersionSupported('codex 1.0.0'), true);
});

test('RouterLab model metadata is normalized without optimistic capabilities', () => {
  const metadata = extractModelMetadata({
    data: [{
      id: 'model-a',
      context_window: 200000,
      input_modalities: ['text', 'image'],
      capabilities: { reasoning: true, parallel_tool_calls: true, tools: true },
    }, 'model-b'],
  });
  assert.equal(metadata[0].contextWindow, 200000);
  assert.deepEqual(metadata[0].inputModalities, ['text', 'image']);
  assert.equal(metadata[0].supportsReasoning, true);
  assert.equal(metadata[0].supportsParallelToolCalls, true);
  assert.equal(metadata[0].supportsFunctionTools, true);
  assert.equal(metadata[0].supportsHostedTools, false);
  assert.equal(metadata[1].contextWindow, 128000);
  assert.deepEqual(metadata[1].inputModalities, ['text']);
});

test('Codex catalog applies metadata conservatively and removes stale runtime files', (t) => {
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), '.test-v4-catalog-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const catalog = buildCodexModelCatalogFromCache({
    models: ['model-a', 'model-b'],
    modelMetadata: [{
      id: 'model-a',
      contextWindow: 200000,
      inputModalities: ['text', 'image'],
      supportsReasoning: true,
      supportsParallelToolCalls: true,
      supportsSearch: true,
    }],
  });
  assert.equal(catalog.models[0].context_window, 200000);
  assert.deepEqual(catalog.models[0].input_modalities, ['text', 'image']);
  assert.equal(catalog.models[0].supports_parallel_tool_calls, true);
  assert.equal(catalog.models[1].context_window, 128000);
  assert.equal(catalog.models[1].supports_search_tool, false);

  const dir = path.join(tempDir, CODEX_RUNTIME_MODEL_CATALOG_DIR);
  fs.mkdirSync(dir);
  const stale = path.join(dir, 'old-' + CODEX_MODEL_CATALOG_FILENAME);
  const fresh = path.join(dir, 'new-' + CODEX_MODEL_CATALOG_FILENAME);
  fs.writeFileSync(stale, '{}');
  fs.writeFileSync(fresh, '{}');
  const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
  fs.utimesSync(stale, old, old);
  assert.equal(cleanupStaleCodexRuntimeModelCatalogs({ tmpDir: tempDir }), 1);
  assert.equal(fs.existsSync(stale), false);
  assert.equal(fs.existsSync(fresh), true);
});

test('Claude Desktop catalog requires auth and enforces exact CORS origins', async (t) => {
  const gatewayToken = 'local-random-token';
  const { server } = createClaudeDesktopProxy({
    serviceValue: 'routerlab',
    strategyValue: 'claude-gpt',
    strategyValues: DESKTOP_MAPPING_STRATEGIES.routerlab,
    routerlabToken: 'upstream-token',
    gatewayToken,
    allowedOrigins: ['https://allowed.test'],
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;

  assert.equal((await fetch(base + '/v1/models')).status, 401);
  assert.equal((await fetch(base + '/v1/models', {
    headers: { authorization: 'Bearer wrong' },
  })).status, 401);
  assert.equal((await fetch(base + '/v1/models', {
    headers: { authorization: 'Bearer ' + gatewayToken, origin: 'https://denied.test' },
  })).status, 403);
  const allowed = await fetch(base + '/v1/models', {
    headers: { authorization: 'Bearer ' + gatewayToken, origin: 'https://allowed.test' },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://allowed.test');
});

test('Codex proxy forces store false before forwarding', async (t) => {
  let captured;
  const upstream = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      captured = JSON.parse(Buffer.concat(chunks));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => upstream.close(resolve)));
  const proxy = await startLongRunningLlmProxy({
    targetBaseUrl: 'http://127.0.0.1:' + upstream.address().port,
    routerlabToken: 'upstream',
    upstreamAuth: 'openai',
    codexServiceValue: 'llm',
  });
  t.after(() => stopLongRunningLlmProxy(proxy));
  const response = await fetch(proxy.baseUrl + '/v1/responses', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + proxy.gatewayToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: 'gpt-5.5', store: true }),
  });
  assert.equal(response.status, 200);
  assert.equal(captured.store, false);
});
test('central command registry drives non-interactive help and diagnostic commands', async () => {
  const originalLog = console.log;
  const originalError = console.error;
  const output = [];
  console.log = (...values) => output.push(values.join(' '));
  console.error = (...values) => output.push(values.join(' '));
  try {
    await main(['--version']);
    await main(['--help']);
    await main(['strategies', '--json']);
    await main(['auth', 'status', '--json']);
    await main(['doctor', '--json']);
    await main(['codex', 'status', '--json']);
    await main(['codex', 'template', '--json']);
    await main(['claude-desktop', 'status', '--json']);
    await main(['claude-desktop', 'apply-proxy', '--dry-run', '--json']);
    await main([
      'claude-desktop', 'apply', '--dry-run', '--json',
      '--token', 'test-token-with-sufficient-length',
    ]);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  assert.match(output.join('\n'), /wrapper-scionos v4\.1\.0/);
  assert.match(output.join('\n'), /model_provider/);
  assert.equal(output.join('\n').includes('test-token-with-sufficient-length'), false);
});
test('model discovery handles metadata, invalid JSON, auth failures, and timeouts', async (t) => {
  const server = http.createServer((req, res) => {
    if (req.url === '/valid/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"data":[{"id":"m","context_window":64000}]}');
    } else if (req.url === '/invalid/v1/models') {
      res.writeHead(200);
      res.end('not json');
    } else if (req.url === '/auth/v1/models') {
      res.writeHead(403);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const valid = await fetchModels('token', { baseUrl: base + '/valid', timeoutMs: 1000 });
  assert.equal(valid.valid, true);
  assert.equal(valid.modelMetadata[0].contextWindow, 64000);
  assert.equal((await fetchModels('token', { baseUrl: base + '/invalid' })).reason, 'invalid_response');
  assert.equal((await fetchModels('token', { baseUrl: base + '/auth' })).reason, 'auth_failed');
  assert.equal((await fetchModels('token', { baseUrl: base + '/missing', timeoutMs: 20 })).reason, 'timeout');
});

test('generated Desktop credentials are strong, readable only for loopback, and redact cleanly', (t) => {
  const token = generateLocalProxyGatewayToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.test-profile-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const profilePath = path.join(dir, 'profile.json');
  fs.writeFileSync(profilePath, JSON.stringify({
    inferenceGatewayApiKey: token,
    inferenceGatewayBaseUrl: 'http://127.0.0.1:15721',
  }));
  const credential = readClaudeDesktopProxyCredential({ profilePath });
  assert.equal(credential.token, token);
  assert.equal(credential.legacy, false);
  assert.equal(redactClaudeDesktopProfile(JSON.parse(fs.readFileSync(profilePath))).inferenceGatewayApiKey, '[redacted]');
  fs.writeFileSync(profilePath, JSON.stringify({
    inferenceGatewayApiKey: token,
    inferenceGatewayBaseUrl: 'https://example.test',
  }));
  assert.equal(readClaudeDesktopProxyCredential({ profilePath }), null);
});

test('deprecations emit once on stderr and runtime assertions reject unsupported Node', () => {
  resetDeprecationWarningsForTests();
  const originalError = console.error;
  const lines = [];
  console.error = (line) => lines.push(line);
  try {
    warnDeprecationOnce('legacy', 'legacy option');
    warnDeprecationOnce('legacy', 'legacy option');
  } finally {
    console.error = originalError;
  }
  assert.equal(lines.length, 1);
  assert.throws(() => assertSupportedNodeVersion('22.12.0'), /required/);
  assert.doesNotThrow(() => assertSupportedNodeVersion('22.13.0'));
});

test('request body limit rejects oversized local proxy payloads', async () => {
  await assert.rejects(
    readRequestBody(Readable.from([Buffer.from('123456')]), 5),
    (error) => error.statusCode === 413,
  );
});

test('request bodies decode identity, gzip, deflate, br, and conditional zstd', async () => {
  const source = Buffer.from(JSON.stringify({ model: 'x', input: 'hello' }));
  const cases = [
    ['identity', source],
    ['gzip', zlib.gzipSync(source)],
    ['deflate', zlib.deflateSync(source)],
    ['br', zlib.brotliCompressSync(source)],
  ];
  if (typeof zlib.zstdCompressSync === 'function') cases.push(['zstd', zlib.zstdCompressSync(source)]);
  for (const [encoding, body] of cases) {
    const request = Readable.from([body]);
    request.headers = { 'content-encoding': encoding };
    assert.equal(await readRequestBody(request), source.toString('utf8'));
  }
});

test('request body decoding reports unsupported, corrupt, compressed, and decompressed limits', async () => {
  const unsupported = Readable.from([Buffer.from('x')]);
  unsupported.headers = { 'content-encoding': 'compress' };
  await assert.rejects(readRequestBody(unsupported), (error) => error.statusCode === 415 && error.code === 'unsupported_content_encoding');
  const unsupportedEmpty = Readable.from([]);
  unsupportedEmpty.headers = { 'content-encoding': 'compress' };
  await assert.rejects(readRequestBody(unsupportedEmpty), (error) => error.statusCode === 415);

  const corrupt = Readable.from([Buffer.from('not gzip')]);
  corrupt.headers = { 'content-encoding': 'gzip' };
  await assert.rejects(readRequestBody(corrupt), (error) => error.statusCode === 400 && error.code === 'invalid_compressed_body');

  const compressedLarge = Readable.from([Buffer.alloc(6)]);
  compressedLarge.headers = {};
  await assert.rejects(readRequestBody(compressedLarge, 5), (error) => error.statusCode === 413);

  const bomb = Readable.from([zlib.gzipSync(Buffer.alloc(100, 1))]);
  bomb.headers = { 'content-encoding': 'gzip' };
  await assert.rejects(readRequestBody(bomb, 50), (error) => error.statusCode === 413);
});

test('Claude Desktop profile metadata restores loopback URL, service, and strategies', (t) => {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.test-desktop-meta-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const paths = {
    normalConfigPath: path.join(dir, 'normal.json'),
    threepConfigPath: path.join(dir, 'threep.json'),
    configLibraryPath: dir,
    profilePath: path.join(dir, 'profile.json'),
    metaPath: path.join(dir, '_meta.json'),
  };
  const applied = applyProxyClaudeDesktop({
    serviceValue: 'llm', strategyValue: 'glm-5.2', strategyValues: ['glm-5.2'],
    host: '::1', port: 18080, gatewayToken: 'local-test-token', dryRun: false, paths,
  });
  assert.equal(applied.profile.inferenceGatewayBaseUrl, 'http://[::1]:18080');
  assert.equal(buildLoopbackUrl('[::1]', 18080), 'http://[::1]:18080');
  const credential = readClaudeDesktopProxyCredential(paths);
  assert.equal(credential.host, '::1');
  assert.equal(credential.port, 18080);
  assert.equal(credential.metadata.service, 'llm');
  assert.deepEqual(credential.metadata.strategies, ['glm-5.2']);
  assert.equal(credential.metadata.baseUrl, 'http://[::1]:18080');
});

test('Claude Desktop accepts authenticated requests, unauthenticated allowed preflights, and valid JSON only', async (t) => {
  const gatewayToken = 'local-random-token';
  const { server } = createClaudeDesktopProxy({
    serviceValue: 'routerlab', strategyValue: 'claude-gpt',
    routerlabToken: 'upstream-token', gatewayToken, allowedOrigins: ['https://allowed.test'],
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  assert.equal((await fetch(base + '/v1/models', { method: 'OPTIONS' })).status, 403);
  const preflight = await fetch(base + '/v1/models', { method: 'OPTIONS', headers: { origin: 'https://allowed.test' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://allowed.test');
  assert.equal((await fetch(base + '/v1/models', { method: 'OPTIONS', headers: { origin: 'https://denied.test' } })).status, 403);
  assert.equal((await fetch(base + '/v1/models', { headers: { origin: 'https://allowed.test' } })).status, 401);
  const invalid = await fetch(base + '/v1/messages', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + gatewayToken, 'content-type': 'application/json' },
    body: '{',
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'invalid_json');
});

test('CLI validation rejects irrelevant options, extra arguments, and interactive JSON modes', async () => {
  const invalid = [
    ['--no-prompt'],
    ['--json'],
    ['auth', 'unknown'],
    ['auth', 'status', 'extra'],
    ['doctor', '--token', 'secret'],
    ['codex', 'launch', '--json'],
    ['claude-desktop', 'proxy', '--json'],
  ];
  for (const argv of invalid) {
    await assert.rejects(() => main(argv), (error) => error.exitCode === 2 && error.code === 'invalid_usage');
  }
});

test('CLI JSON output uses one stable success or error document', async () => {
  const originalLog = console.log;
  const lines = [];
  console.log = (line) => lines.push(line);
  try {
    await main(['codex', 'status', '--json']);
  } finally {
    console.log = originalLog;
  }
  assert.equal(lines.length, 1);
  const payload = JSON.parse(lines[0]);
  assert.equal(payload.ok, true);
  assert.equal(payload.command, 'codex:status');
  assert.equal(typeof payload.data, 'object');
});

test('Auth test and strategies honor explicit token before environment and storage', async (t) => {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(req.headers['x-api-key']);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"data":[{"id":"gpt-5.6-sol"}]}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const oldBase = process.env.ROUTERLAB_BASE_URL;
  const oldToken = process.env.ROUTERLAB_API_KEY;
  process.env.ROUTERLAB_BASE_URL = 'http://127.0.0.1:' + server.address().port;
  process.env.ROUTERLAB_API_KEY = 'environment-token-with-enough-length';
  const originalLog = console.log;
  const lines = [];
  console.log = (line) => lines.push(line);
  try {
    await main(['auth', 'test', '--token', 'explicit-token-with-enough-length', '--json', '--no-prompt']);
    await main(['strategies', '--token', 'explicit-token-with-enough-length', '--json', '--no-prompt']);
  } finally {
    console.log = originalLog;
    if (oldBase === undefined) delete process.env.ROUTERLAB_BASE_URL; else process.env.ROUTERLAB_BASE_URL = oldBase;
    if (oldToken === undefined) delete process.env.ROUTERLAB_API_KEY; else process.env.ROUTERLAB_API_KEY = oldToken;
  }
  assert.deepEqual(seen, ['explicit-token-with-enough-length', 'explicit-token-with-enough-length']);
  assert.equal(JSON.parse(lines[0]).data.tokenSource, 'option');
  assert.equal(JSON.parse(lines[1]).data.tokenSource, 'option');
});

test('Auth dry-run validates input and does not request a secret', async () => {
  const originalLog = console.log;
  const lines = [];
  console.log = (line) => lines.push(line);
  try {
    await main(['auth', 'login', '--dry-run', '--token', 'preview-token-with-enough-length', '--json']);
  } finally {
    console.log = originalLog;
  }
  const payload = JSON.parse(lines[0]);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.dryRun, true);
  assert.equal(payload.data.tokenProvided, true);
  assert.equal(payload.data.wouldReplace === true || payload.data.wouldReplace === false, true);
});

test('CLI process exit codes distinguish success, usage, and runtime failures', (t) => {
  const root = path.resolve('index.js');
  const success = spawnSync(process.execPath, [root, '--version'], { encoding: 'utf8' });
  if (success.error?.code === 'EPERM') {
    t.skip('The local coverage sandbox blocks child processes');
    return;
  }
  assert.equal(success.status, 0);
  const usage = spawnSync(process.execPath, [root, '--json'], { encoding: 'utf8' });
  assert.equal(usage.status, 2);
  assert.equal(JSON.parse(usage.stdout.trim()).error.code, 'invalid_usage');
  const runtime = spawnSync(process.execPath, [root, 'codex', 'launch', '--no-prompt'], { encoding: 'utf8' });
  assert.equal(runtime.status, 1);
});

test('Desktop stored proxy configuration helpers restore and reconcile explicit choices', () => {
  const credential = {
    host: '::1', port: 17000,
    metadata: { schemaVersion: 1, mode: 'proxy', service: 'llm', strategy: null, strategies: ['glm-5.2'] },
  };
  const baseOptions = parseOptions([]);
  const stored = storedProxyConfig(credential, baseOptions);
  assert.deepEqual(stored, { serviceValue: 'llm', strategyValue: 'claude', strategyValues: ['glm-5.2'], host: '::1', port: 17000 });
  assert.equal(defaultDesktopStrategy('routerlab'), 'default');
  assert.equal(defaultDesktopStrategy('llm'), 'claude');

  const serviceChange = parseOptions(['--service', 'routerlab']);
  const merged = mergeExplicitProxyConfig(stored, serviceChange);
  assert.equal(merged.serviceValue, 'routerlab');
  assert.equal(merged.strategyValue, 'default');
  assert.deepEqual(merged.strategyValues, DESKTOP_MAPPING_STRATEGIES.routerlab);
  assert.equal(sameProxyConfig(stored, merged), false);
  assert.equal(sameProxyConfig(stored, { ...stored }), true);

  const requestedOptions = parseOptions(['--service', 'llm', '--strategy', 'glm-5.2', '--host', '[::1]', '--port', '18000']);
  const requested = requestedProxyConfig(requestedOptions);
  assert.deepEqual(requested, { serviceValue: 'llm', strategyValue: 'glm-5.2', strategyValues: null, host: '[::1]', port: 18000 });
  const reconciled = mergeExplicitProxyConfig(stored, requestedOptions);
  assert.equal(reconciled.strategyValue, 'glm-5.2');
  assert.equal(reconciled.strategyValues, null);
  assert.equal(reconciled.host, '::1');
});

test('Desktop interactive start plans create, reuse, or confirm replacements without exposing credentials', () => {
  const credential = {
    token: 'generated-local-secret',
    host: '::1',
    port: 17000,
    metadata: {
      schemaVersion: 1,
      mode: 'proxy',
      service: 'llm',
      strategy: null,
      strategies: DESKTOP_MAPPING_STRATEGIES.llm,
    },
  };
  const healthyStatus = {
    configured: true,
    profileExists: true,
    healthy: true,
  };

  const create = planInteractiveClaudeDesktopStart(parseOptions([]), {
    credential: null,
    status: { configured: false, profileExists: false, healthy: false },
  });
  assert.equal(create.action, 'create');
  assert.equal(create.requiresConfirmation, false);
  assert.equal(create.config.serviceValue, 'routerlab');
  assert.deepEqual(create.config.strategyValues, DESKTOP_MAPPING_STRATEGIES.routerlab);

  const reuse = planInteractiveClaudeDesktopStart(parseOptions(['--service', 'llm']), {
    credential,
    status: healthyStatus,
  });
  assert.equal(reuse.action, 'reuse');
  assert.equal(reuse.requiresConfirmation, false);
  assert.equal(reuse.config.host, '::1');
  assert.equal(reuse.config.port, 17000);
  assert.equal(reuse.credential.token, 'generated-local-secret');

  const replace = planInteractiveClaudeDesktopStart(parseOptions([]), {
    credential,
    status: healthyStatus,
  });
  assert.equal(replace.action, 'replace');
  assert.equal(replace.requiresConfirmation, true);
  assert.equal(replace.config.serviceValue, 'routerlab');
  assert.equal(replace.config.host, '::1');
  assert.equal(replace.config.port, 17000);
  assert.deepEqual(replace.config.strategyValues, DESKTOP_MAPPING_STRATEGIES.routerlab);
  const prompt = formatDesktopReplacementPrompt(replace);
  assert.match(prompt, /llm/);
  assert.match(prompt, /routerlab/);
  assert.doesNotMatch(prompt, /generated-local-secret/);

  const unhealthy = planInteractiveClaudeDesktopStart(parseOptions(['--service', 'llm']), {
    credential,
    status: { ...healthyStatus, healthy: false, issues: ['metadata_invalid'] },
  });
  assert.equal(unhealthy.action, 'replace');
  assert.equal(unhealthy.reason, 'profile_unhealthy');
  assert.equal(unhealthy.requiresConfirmation, true);

  const invalidMetadata = planInteractiveClaudeDesktopStart(parseOptions([]), {
    credential: {
      ...credential,
      metadata: { ...credential.metadata, service: 'invalid-service' },
    },
    status: { ...healthyStatus, healthy: false, issues: ['metadata_invalid'] },
  });
  assert.equal(invalidMetadata.current, null);
  assert.match(formatDesktopReplacementPrompt(invalidMetadata), /invalid or non-proxy/);
});

test('Desktop proxy shutdown returns to the menu on interactive SIGINT and preserves direct exit codes', async () => {
  function createShutdownFixture() {
    const signalSource = new EventEmitter();
    const server = new EventEmitter();
    server.listening = true;
    server.closeAllConnections = () => {};
    server.close = () => {
      server.listening = false;
      queueMicrotask(() => server.emit('close'));
    };
    return { signalSource, server };
  }

  {
    const { signalSource, server } = createShutdownFixture();
    const exitState = { exitCode: undefined };
    const waiting = waitForProxyShutdown(server, {
      signalSource,
      exitState,
      returnToMenuOnSigint: true,
    });
    signalSource.emit('SIGINT');
    assert.deepEqual(await waiting, { kind: 'back', signal: 'SIGINT', exitCode: 0 });
    assert.equal(exitState.exitCode, 0);
    assert.equal(signalSource.listenerCount('SIGINT'), 0);
    assert.equal(signalSource.listenerCount('SIGTERM'), 0);
  }

  {
    const { signalSource, server } = createShutdownFixture();
    const exitState = {};
    const waiting = waitForProxyShutdown(server, { signalSource, exitState });
    signalSource.emit('SIGINT');
    assert.deepEqual(await waiting, { kind: 'terminate', signal: 'SIGINT', exitCode: 130 });
    assert.equal(exitState.exitCode, 130);
  }

  {
    const { signalSource, server } = createShutdownFixture();
    const exitState = {};
    const waiting = waitForProxyShutdown(server, {
      signalSource,
      exitState,
      returnToMenuOnSigint: true,
    });
    signalSource.emit('SIGTERM');
    assert.deepEqual(await waiting, { kind: 'terminate', signal: 'SIGTERM', exitCode: 143 });
    assert.equal(exitState.exitCode, 143);
  }

  {
    const signalSource = new EventEmitter();
    const server = new EventEmitter();
    server.listening = false;
    const exitState = {};
    const waiting = waitForProxyShutdown(server, { signalSource, exitState });
    signalSource.emit('SIGINT');
    assert.deepEqual(await waiting, { kind: 'terminate', signal: 'SIGINT', exitCode: 130 });
  }
});

test('CLI help, version, dry-run logout, and errors honor JSON contracts', async () => {
  const originalLog = console.log;
  const originalError = console.error;
  const out = [];
  const err = [];
  console.log = (line) => out.push(line);
  console.error = (line) => err.push(line);
  try {
    await main(['--help', '--json']);
    await main(['--version', '--json']);
    await main(['auth', 'logout', '--dry-run', '--json']);
    printError(Object.assign(new Error('bad usage'), { exitCode: 2 }), { json: true });
    printError(new Error('runtime'), { json: false });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  assert.equal(JSON.parse(out[0]).command, 'help');
  assert.equal(JSON.parse(out[1]).command, 'version');
  assert.equal(JSON.parse(out[2]).data.dryRun, true);
  assert.equal(JSON.parse(out[3]).error.code, 'invalid_usage');
  assert.match(err[0], /runtime/);
});

test('CLI validation classifies invalid services and strategies as usage errors', async () => {
  await assert.rejects(() => main(['doctor', '--service', 'missing']), (error) => error.exitCode === 2);
  await assert.rejects(() => main(['claude-code', '--service', 'routerlab', '--strategy', 'missing']), (error) => error.exitCode === 2);
  await assert.rejects(() => main(['claude-desktop', 'apply-proxy', '--strategy', 'missing']), (error) => error.exitCode === 2);
});

test('Auth and doctor cover environment and no-token preview branches', async () => {
  const oldToken = process.env.ROUTERLAB_API_KEY;
  process.env.ROUTERLAB_API_KEY = 'environment-token-with-enough-length';
  const originalLog = console.log;
  const lines = [];
  console.log = (line) => lines.push(line);
  try {
    await main(['auth', 'status', '--json']);
    await main(['auth', 'login', '--dry-run', '--json']);
    await main(['doctor', '--json']);
    await assert.rejects(() => main(['auth', 'login', '--dry-run', '--token', 'short', '--json']), /too short/);
  } finally {
    console.log = originalLog;
    if (oldToken === undefined) delete process.env.ROUTERLAB_API_KEY; else process.env.ROUTERLAB_API_KEY = oldToken;
  }
  assert.equal(JSON.parse(lines[0]).data.effectiveTokenSource, 'env');
  assert.equal(JSON.parse(lines[1]).data.tokenProvided, false);
  assert.equal(JSON.parse(lines[2]).data.token.effectiveTokenSource, 'env');
});

test('proxy helpers cover empty bodies, array encodings, URLs, headers, and null cleanup', async () => {
  const empty = Readable.from([]);
  empty.headers = {};
  assert.equal(await readRequestBody(empty), '');
  const identity = Readable.from([Buffer.from('x')]);
  identity.headers = { 'content-encoding': ['identity'] };
  assert.equal(await readRequestBody(identity), 'x');
  const req = { url: '/v1/models?q=1' };
  assert.equal(buildUpstreamUrl(req, 'https://example.test/').href, 'https://example.test/v1/models?q=1');
  assert.equal(buildUpstreamUrl(req, 'https://example.test/gateway/').href, 'https://example.test/gateway/v1/models?q=1');
  assert.equal(buildUpstreamUrl(req, 'https://example.test/v1').href, 'https://example.test/v1/models?q=1');
  assert.equal(buildUpstreamUrl(req, 'https://example.test/gateway/v1/').href, 'https://example.test/gateway/v1/models?q=1');
  assert.throws(() => buildUpstreamUrl(req, 'file:///tmp/routerlab'), /HTTP or HTTPS/);
  const headers = forwardHeaders({ authorization: 'local', 'x-api-key': 'local', connection: 'keep-alive, x-remove-me', 'x-remove-me': 'secret', 'content-encoding': 'gzip', 'content-length': '1', accept: 'x' }, { routerlabToken: 'upstream', upstreamAuth: 'both' });
  assert.equal(headers.authorization, 'Bearer upstream');
  assert.equal(headers['x-api-key'], 'upstream');
  assert.equal(headers['content-encoding'], undefined);
  assert.equal(headers['content-length'], undefined);
  assert.equal(headers.accept, 'x');
  assert.equal(headers['x-remove-me'], undefined);
  await stopLongRunningLlmProxy(null);
});

test('deprecated list-strategies alias remains functional with one warning', async () => {
  resetDeprecationWarningsForTests();
  const originalLog = console.log;
  const originalError = console.error;
  const out = [];
  const warnings = [];
  console.log = (line) => out.push(line);
  console.error = (line) => warnings.push(line);
  try {
    await main(['--list-strategies', '--json']);
    await main(['--list-strategies', '--json']);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  assert.equal(JSON.parse(out[0]).command, 'strategies');
  assert.equal(warnings.filter((line) => line.includes('--list-strategies')).length, 1);
});

test('global options can precede commands without consuming option values or passthrough', () => {
  assert.equal(resolveCommandInvocation(['--service', 'llm', 'doctor']).command.name, 'doctor');
  assert.deepEqual(resolveCommandInvocation(['--service', 'llm', 'doctor']).rest, ['--service', 'llm']);
  assert.equal(resolveCommandInvocation(['--service=llm', 'auth', 'status']).command.name, 'auth');
  assert.equal(resolveCommandInvocation(['--token', 'doctor', 'auth']).command.name, 'auth');
  assert.deepEqual(resolveCommandInvocation(['--token', 'doctor', 'auth']).rest, ['--token', 'doctor']);
  assert.equal(resolveCommandInvocation(['-p', 'doctor']).command, null);
  assert.equal(resolveCommandInvocation(['--', 'doctor']).command, null);
});

test('Desktop proxy does not mutate a profile before token and port validation', async (t) => {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.test-desktop-transaction-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const envKeys = [
    'LOCALAPPDATA',
    'HOME',
    'XDG_CONFIG_HOME',
    'WRAPPER_SCIONOS_TOKEN_DIR',
    'ROUTERLAB_API_KEY',
    'ROUTERLAB_LLM_API_KEY',
    'ROUTERLAB_BASE_URL',
    'ROUTERLAB_LLM_BASE_URL',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
  ];
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.LOCALAPPDATA = path.join(dir, 'local');
  process.env.HOME = path.join(dir, 'home');
  process.env.XDG_CONFIG_HOME = path.join(dir, 'config');
  process.env.WRAPPER_SCIONOS_TOKEN_DIR = path.join(dir, 'tokens');
  delete process.env.ROUTERLAB_API_KEY;
  delete process.env.ROUTERLAB_LLM_API_KEY;
  delete process.env.ROUTERLAB_BASE_URL;
  delete process.env.ROUTERLAB_LLM_BASE_URL;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.ANTHROPIC_BASE_URL;
  t.after(() => {
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  const paths = getClaudeDesktopPaths();
  for (const invalidCase of [
    {
      serviceArgs: [],
      envKey: 'ROUTERLAB_BASE_URL',
      value: 'file:///tmp/routerlab',
      expected: /must use HTTP or HTTPS/,
    },
    {
      serviceArgs: ['--service', 'llm'],
      envKey: 'ROUTERLAB_LLM_BASE_URL',
      value: 'not-a-valid-url',
      expected: /base URL is invalid/,
    },
  ]) {
    process.env[invalidCase.envKey] = invalidCase.value;
    await assert.rejects(
      () => main([
        'claude-desktop', 'apply-proxy', '--yes', '--no-prompt',
        ...invalidCase.serviceArgs,
      ]),
      invalidCase.expected,
    );
    await assert.rejects(
      () => main([
        'claude-desktop', 'proxy', '--yes', '--no-prompt',
        ...invalidCase.serviceArgs,
      ]),
      invalidCase.expected,
    );
    await assert.rejects(
      () => main([
        'claude-desktop', 'apply', '--yes', '--no-prompt',
        ...invalidCase.serviceArgs,
      ]),
      invalidCase.expected,
    );
    delete process.env[invalidCase.envKey];
    assert.equal(fs.existsSync(paths.profilePath), false);
    assert.equal(fs.existsSync(paths.metaPath), false);
  }

  await assert.rejects(
    () => main(['claude-desktop', 'proxy', '--yes', '--no-prompt']),
    /token is required/,
  );
  assert.equal(fs.existsSync(paths.profilePath), false);
  await assert.rejects(
    () => main(['claude-desktop', 'apply-proxy', '--yes', '--no-prompt']),
    /token is required/,
  );
  assert.equal(fs.existsSync(paths.profilePath), false);

  const blocker = http.createServer();
  await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  t.after(() => { if (blocker.listening) blocker.close(); });
  await assert.rejects(
    () => main(['claude-desktop', 'proxy', '--yes', '--token', 'valid-token-with-enough-length', '--port', String(blocker.address().port)]),
    (error) => error.code === 'EADDRINUSE',
  );
  assert.equal(fs.existsSync(paths.profilePath), false);
  await assert.rejects(
    () => main(['claude-desktop', 'apply-proxy', '--yes', '--token', 'valid-token-with-enough-length', '--port', String(blocker.address().port)]),
    (error) => error.code === 'EADDRINUSE',
  );
  assert.equal(fs.existsSync(paths.profilePath), false);
  await new Promise((resolve) => blocker.close(resolve));
});

test('Desktop command covers successful apply, stored-profile reuse, legacy replacement, and restore', async (t) => {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.test-desktop-command-success-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const envKeys = ['LOCALAPPDATA', 'HOME', 'XDG_CONFIG_HOME', 'WRAPPER_SCIONOS_TOKEN_DIR'];
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.LOCALAPPDATA = path.join(dir, 'local');
  process.env.HOME = path.join(dir, 'home');
  process.env.XDG_CONFIG_HOME = path.join(dir, 'config');
  process.env.WRAPPER_SCIONOS_TOKEN_DIR = path.join(dir, 'tokens');
  t.after(() => {
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  async function freePort() {
    const server = http.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    return port;
  }

  async function runAndInterrupt(options, { expectedKind = 'back' } = {}) {
    const signalSource = new EventEmitter();
    const exitState = {};
    const originalLog = console.log;
    const originalError = console.error;
    const output = [];
    console.log = (line) => {
      output.push(String(line));
      if (String(line).includes('Press Ctrl+C to stop.')) {
        queueMicrotask(() => signalSource.emit('SIGINT'));
      }
    };
    console.error = (line) => output.push(String(line));
    try {
      const result = await runClaudeDesktopProxy({
        ...options,
        returnToMenuOnSigint: expectedKind === 'back',
        shutdownOptions: { signalSource, exitState },
      });
      assert.equal(result.kind, expectedKind);
      return output;
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  }

  const token = 'valid-token-with-enough-length';
  const interactivePort = await freePort();
  const interactiveOptions = parseOptions(['--token', token]);
  interactiveOptions.interactiveDesktopPlan = {
    action: 'create',
    credential: null,
    config: {
      serviceValue: 'routerlab',
      strategyValue: 'default',
      strategyValues: DESKTOP_MAPPING_STRATEGIES.routerlab,
      host: '127.0.0.1',
      port: interactivePort,
    },
  };
  await runAndInterrupt(interactiveOptions);

  const port = await freePort();
  const originalLog = console.log;
  console.log = () => {};
  try {
    await main([
      'claude-desktop', 'apply-proxy', '--yes', '--token', token, '--port', String(port),
    ]);
  } finally {
    console.log = originalLog;
  }
  const paths = getClaudeDesktopPaths();
  assert.equal(fs.existsSync(paths.profilePath), true);
  const firstCredential = readClaudeDesktopProxyCredential(paths);
  assert.ok(firstCredential);

  const reuseOutput = await runAndInterrupt(parseOptions(['--token', token]));
  assert.equal(reuseOutput.some((line) => line.includes('Configured Claude Desktop local mapping profile')), false);
  assert.equal(readClaudeDesktopProxyCredential(paths).token, firstCredential.token);

  await assert.rejects(
    () => runClaudeDesktopProxy(parseOptions(['--service', 'llm', '--token', token])),
    /Explicit proxy options differ/,
  );

  const llmPort = await freePort();
  await runAndInterrupt(parseOptions([
    '--service', 'llm', '--yes', '--token', token, '--port', String(llmPort),
  ]));
  assert.equal(readClaudeDesktopProxyCredential(paths).metadata.service, 'llm');

  const legacyProfile = JSON.parse(fs.readFileSync(paths.profilePath, 'utf8'));
  legacyProfile.inferenceGatewayApiKey = 'scionos-local';
  fs.writeFileSync(paths.profilePath, JSON.stringify(legacyProfile));
  const legacyMeta = JSON.parse(fs.readFileSync(paths.metaPath, 'utf8'));
  delete legacyMeta.wrapperScionos;
  fs.writeFileSync(paths.metaPath, JSON.stringify(legacyMeta));
  const legacyOutput = await runAndInterrupt(parseOptions(['--yes', '--token', token]));
  assert.equal(legacyOutput.some((line) => line.includes('WARN Legacy Claude Desktop profile')), true);
  assert.notEqual(readClaudeDesktopProxyCredential(paths).token, 'scionos-local');

  console.log = () => {};
  try {
    await main(['claude-desktop', 'restore-official', '--yes']);
  } finally {
    console.log = originalLog;
  }
  assert.equal(fs.existsSync(paths.profilePath), false);
  await assert.rejects(
    () => runClaudeDesktopProxy(parseOptions(['--token', token])),
    /No wrapper-managed local Claude Desktop profile exists/,
  );
});

test('deprecated Desktop direct mode warns once and never prints its token', async () => {
  resetDeprecationWarningsForTests();
  const originalLog = console.log;
  const originalError = console.error;
  const output = [];
  const warnings = [];
  console.log = (line) => output.push(String(line));
  console.error = (line) => warnings.push(String(line));
  const token = 'direct-profile-token-with-enough-length';
  try {
    await main(['claude-desktop', 'apply', '--dry-run', '--json', '--token', token]);
    await main(['claude-desktop', 'apply', '--dry-run', '--json', '--token', token]);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  assert.equal(warnings.filter((line) => line.includes('deprecated in 4.x')).length, 1);
  assert.equal(output.some((line) => line.includes(token)), false);
  assert.equal(output.every((line) => JSON.parse(line).ok === true), true);
});
