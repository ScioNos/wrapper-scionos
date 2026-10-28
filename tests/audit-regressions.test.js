import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { PassThrough } from 'node:stream';
import { getCodexPaths, buildCodexThirdPartyConfig, restoreCodexConfig } from '../src/apps/codex.js';
import { launchClaudeCode, resolveTokenWithSource, buildStrategyPromptChoices } from '../src/apps/claude-code.js';
import { launchCodexForService } from '../src/cli/commands/codex.js';
import { launchOpenCodeForService } from '../src/cli/commands/opencode.js';
import { restoreOfficialClaudeDesktop } from '../src/apps/claude-desktop.js';
import { fetchModels, fetchModelsDirect } from '../src/routerlab/models.js';
import { runStructuredConsole } from '../src/cli/console/controller.js';
import { normalizePreferences } from '../src/cli/console/preferences.js';
import { formatSelectChoice } from '../src/cli/menu.js';
import { runInteractiveCli } from '../src/platform/process.js';
import { startLongRunningLlmProxy, stopLongRunningLlmProxy } from '../src/platform/llm-proxy.js';
import { removeTestDirectory, closeTestServer } from './support/lifecycle.mjs';

const TOKEN = 'audit-fixture-token-with-enough-length';
const AWS = ['aws-claude-opus-5-5', 'aws-claude-sonnet-5-5', 'aws-claude-haiku-4-5'];
const legacyConfig = () => buildCodexThirdPartyConfig({ baseUrl: 'https://api.routerlab.ch/v1' });
function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scionos-audit-'));
  t.after(() => removeTestDirectory(root));
  return root;
}
async function listen(t, handler) {
  const server = http.createServer(handler);
  t.after(() => closeTestServer(server));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

test('A1: legacy restore refuses foreign, extended and misleading configs even with a backup', t => {
  const paths = getCodexPaths({ CODEX_HOME: temporary(t) });
  const backup = 'model = "personal-original"\n';
  const catalog = '{"models":[]}';
  for (const current of ['model = "personal-new"\n', legacyConfig() + '\n[mcp_servers.personal]\ncommand="node"\n',
    '# model_provider="custom"\n# [model_providers.custom]\nbase_url="https://api.routerlab.ch/v1"\n']) {
    fs.writeFileSync(paths.configPath, current);
    fs.writeFileSync(paths.backupPath, backup);
    fs.writeFileSync(paths.modelCatalogPath, catalog);
    const preview = restoreCodexConfig({ paths });
    assert.equal(preview.restoreConflict, true);
    assert.equal(preview.canRestore, false);
    assert.throws(() => restoreCodexConfig({ paths, dryRun: false }), { code: 'config_conflict' });
    assert.equal(fs.readFileSync(paths.configPath, 'utf8'), current);
    assert.equal(fs.readFileSync(paths.backupPath, 'utf8'), backup);
    assert.equal(fs.readFileSync(paths.modelCatalogPath, 'utf8'), catalog);
  }
});

test('A1: a recognized legacy restore retains the current bytes in a separate recovery copy', t => {
  const paths = getCodexPaths({ CODEX_HOME: temporary(t) });
  const current = legacyConfig() + '\n# keep this comment\n';
  fs.writeFileSync(paths.configPath, current);
  fs.writeFileSync(paths.backupPath, 'model="original"\n');
  const result = restoreCodexConfig({ paths, dryRun: false });
  assert.equal(fs.readFileSync(result.preservedConfigPath, 'utf8'), current);
  assert.equal(fs.readFileSync(paths.configPath, 'utf8'), 'model="original"\n');
});

test('A2: SIGTERM during revalidation cannot start any console client', async t => {
  for (const client of ['claude-code', 'codex', 'opencode']) await t.test(client, async () => {
    const signals = new EventEmitter();
    const processState = {};
    const input = new PassThrough(), output = new PassThrough(); output.resume();
    let fetches = 0, starts = 0, spawns = 0, catalogs = 0;
    const discover = async (_token, options) => {
      if (++fetches === 2) { assert.ok(options.signal); signals.emit('SIGTERM'); }
      return { valid: true, models: client === 'claude-code' ? AWS : ['gpt-6.1-sol'] };
    };
    const resolve = async () => ({ token: TOKEN, source: 'secure-storage' });
    const detected = () => ({ installed: true, versionSupported: true, version: '2.1.296', cliPath: process.execPath });
    const common = { service: 'routerlab', noPrompt: true, quiet: true, prepareOnly: true };
    const prepare = client === 'claude-code'
      ? () => launchClaudeCode({ serviceValue: 'routerlab', ...common, claudeArgs: [] }, {
        detectClaudeCodeFn: detected, resolveTokenWithSourceFn: resolve, fetchModelsFn: discover,
        startLongRunningLlmProxyFn: async () => { starts++; throw new Error('Unexpected proxy'); },
        runInteractiveCliFn: async () => { spawns++; return 0; },
      })
      : () => (client === 'codex' ? launchCodexForService : launchOpenCodeForService)(common, {
        assertCodexCliAvailable: detected, assertOpenCodeCliAvailable: detected,
        resolveTokenWithSource: resolve, fetchModels: discover,
        writeCodexRuntimeModelCatalog: () => { catalogs++; throw new Error('Unexpected catalog'); },
        startLongRunningLlmProxy: async () => { starts++; throw new Error('Unexpected proxy'); },
        launchCodex: async () => { spawns++; return 0; }, launchOpenCode: async () => { spawns++; return 0; },
      });
    const queue = [{ action: 'tool', value: client }, { action: 'launch' }, { action: 'confirm' }];
    try {
      await runStructuredConsole(common, { input, output, signalSource: signals, processState,
        loadPreferences: () => ({ value: normalizePreferences(null) }), savePreferences: () => ({ ok: true }),
        startInspection: () => ({ done: Promise.resolve({}), stop: async () => {} }),
        services: { prepare }, prompt: async () => { assert.ok(queue.length); return queue.shift(); },
      });
      assert.equal(fetches, 2); assert.equal(starts, 0); assert.equal(catalogs, 0); assert.equal(spawns, 0);
      assert.equal(processState.exitCode, 143);
      assert.equal(signals.listenerCount('SIGTERM'), 0);
    } finally { input.destroy(); output.destroy(); }
  });
});

test('A2: cancellation after proxy allocation closes it before the Claude child can start', async () => {
  const abort = new AbortController(); let stopped = 0, spawned = 0;
  await assert.rejects(launchClaudeCode({ serviceValue: 'routerlab', noPrompt: true, quiet: true, signal: abort.signal }, {
    detectClaudeCodeFn: () => ({ installed: true, versionSupported: true, version: '2.1.296' }),
    resolveTokenWithSourceFn: async () => ({ token: TOKEN, source: 'env' }),
    fetchModelsFn: async () => ({ valid: true, models: AWS }),
    startLongRunningLlmProxyFn: async () => { abort.abort(); return { baseUrl: 'http://127.0.0.1:1', gatewayToken: TOKEN }; },
    stopLongRunningLlmProxyFn: async () => { stopped++; },
    runInteractiveCliFn: async () => { spawned++; },
  }), { name: 'AbortError' });
  assert.equal(stopped, 1); assert.equal(spawned, 0);
});

test('A2: an already-aborted process launch never emits spawn', async () => {
  const abort = new AbortController(); abort.abort(); let spawned = false;
  await assert.rejects(runInteractiveCli(process.execPath, ['-e', 'process.exit(0)'], {
    signal: abort.signal, updateProcessExitCode: false, onSpawn: () => { spawned = true; },
  }), { name: 'AbortError' });
  assert.equal(spawned, false);
});

test('A2: cancellation after spawn terminates the process and releases its signal listeners', async () => {
  const abort = new AbortController(), signals = new EventEmitter();
  const previous = process.exitCode;
  const code = await runInteractiveCli(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    signal: abort.signal, signalSource: signals, updateProcessExitCode: false,
    onSpawn: () => abort.abort(Object.assign(new Error('terminated'), { signal: 'SIGTERM' })),
  });
  assert.equal(code, 143); assert.equal(process.exitCode, previous);
  assert.equal(signals.listenerCount('SIGINT'), 0); assert.equal(signals.listenerCount('SIGTERM'), 0);
});

test('A3: header-only upstream times out with JSON 504 and releases the upstream connection', async t => {
  let closed;
  const upstream = await listen(t, (_req, res) => {
    closed = once(res, 'close');
    res.writeHead(200, { 'content-type': 'text/event-stream' }); res.flushHeaders();
  });
  const proxy = await startLongRunningLlmProxy({ targetBaseUrl: upstream.baseUrl, routerlabToken: TOKEN, firstResponseTimeoutMs: 100 });
  t.after(() => stopLongRunningLlmProxy(proxy, { graceMs: 0 }));
  const response = await fetch(proxy.baseUrl + '/v1/models', { headers: { authorization: `Bearer ${proxy.gatewayToken}` } });
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error.code, 'upstream_first_response_timeout');
  await closed;
});

test('A3: an empty successful response is forwarded without waiting for a nonexistent body', async t => {
  const upstream = await listen(t, (_req, res) => { res.writeHead(204); res.end(); });
  const proxy = await startLongRunningLlmProxy({ targetBaseUrl: upstream.baseUrl, routerlabToken: TOKEN, firstResponseTimeoutMs: 1000 });
  t.after(() => stopLongRunningLlmProxy(proxy, { graceMs: 0 }));
  const response = await fetch(proxy.baseUrl + '/v1/models', { headers: { authorization: `Bearer ${proxy.gatewayToken}` } });
  assert.equal(response.status, 204);
});

test('A4: direct discovery expires despite a continuously trickling body', async t => {
  let writes = 0;
  const upstream = await listen(t, (_req, res) => {
    res.writeHead(200); res.write('{"data":[');
    const interval = setInterval(() => { writes++; res.write(' '); }, 5);
    res.once('close', () => clearInterval(interval));
  });
  const result = await fetchModelsDirect(TOKEN, { baseUrl: upstream.baseUrl, timeoutMs: 100 });
  assert.equal(result.reason, 'timeout'); assert.ok(writes > 1);
});

test('A4/A2: caller cancellation aborts both discovery transports', async t => {
  for (const discover of [fetchModels, fetchModelsDirect]) {
    let connected;
    const connection = new Promise(resolve => { connected = resolve; });
    const upstream = await listen(t, (_req, res) => { connected({ closed: once(res, 'close') }); res.writeHead(200); res.flushHeaders(); });
    const abort = new AbortController();
    const result = discover(TOKEN, { baseUrl: upstream.baseUrl, signal: abort.signal });
    // Register rejection before aborting to avoid unhandled rejection races.
    const rejected = assert.rejects(result, { name: 'AbortError' });
    const { closed } = await connection;
    abort.abort();
    await rejected;
    await closed;
  }
});

test('A5: non-2xx discovery cancels unfinished bodies for redirects, auth and server errors', async t => {
  for (const discover of [fetchModels, fetchModelsDirect]) for (const status of [302, 401, 403, 500]) {
    let closed;
    const upstream = await listen(t, (_req, res) => {
      closed = once(res, 'close'); res.writeHead(status); res.write('unfinished error body');
    });
    const result = await discover(TOKEN, { baseUrl: upstream.baseUrl, timeoutMs: 1000 });
    assert.equal(result.status, status);
    await closed;
  }
});

test('A6: an unavailable lower-priority store does not disable environment authentication', async () => {
  const dependencies = { getStoredTokenFn() { throw new Error('locked store'); },
    resolveServiceEnvTokenFn: () => ({ token: TOKEN, source: 'env', envKey: 'ROUTERLAB_API_KEY' }) };
  assert.equal((await resolveTokenWithSource({ serviceValue: 'routerlab', noPrompt: true }, dependencies)).token, TOKEN);
  await assert.rejects(resolveTokenWithSource({ serviceValue: 'routerlab', preferStored: true }, dependencies), /locked store/);
  await assert.rejects(resolveTokenWithSource({ serviceValue: 'routerlab' }, {
    ...dependencies, resolveServiceEnvTokenFn: () => ({ token: null }),
  }), /locked store/);
});

test('A7: Desktop reclaims the lock left by an abruptly exiting owner but preserves live locks', t => {
  const root = temporary(t);
  const paths = Object.fromEntries(['normalConfigPath', 'threepConfigPath', 'profilePath', 'metaPath'].map(key => [key, path.join(root, key + '.json')]));
  const identity = Object.values(paths).map(value => path.resolve(value).toLowerCase()).sort().join('\0');
  const lock = path.join(os.tmpdir(), 'wrapper-scionos-claude-desktop-' + createHash('sha256').update(identity).digest('hex').slice(0, 24) + '.lock');
  t.after(() => fs.rmSync(lock, { force: true }));
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import fs from 'node:fs';
    import { restoreOfficialClaudeDesktop } from ${JSON.stringify(new URL('../src/apps/claude-desktop.js', import.meta.url).href)};
    const write = fs.writeFileSync;
    fs.writeFileSync = (file, ...args) => { const result = write(file, ...args); if (typeof file === 'number') process.exit(23); return result; };
    restoreOfficialClaudeDesktop({dryRun:false,paths:${JSON.stringify(paths)}});
  `], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  assert.equal(child.status, 23, child.stderr);
  assert.equal(fs.readFileSync(lock, 'utf8'), String(child.pid));
  restoreOfficialClaudeDesktop({ paths, dryRun: false });
  assert.equal(fs.existsSync(lock), false);
  assert.equal(JSON.parse(fs.readFileSync(paths.normalConfigPath)).deploymentMode, '1p');
  fs.writeFileSync(lock, String(process.pid));
  assert.throws(() => restoreOfficialClaudeDesktop({ paths, dryRun: false }), { code: 'concurrent_mutation' });
  assert.equal(fs.readFileSync(lock, 'utf8'), String(process.pid));
});

test('A8: the linear prompt retains unavailable strategy flags and their explanation', () => {
  const disabled = buildStrategyPromptChoices(AWS, 'routerlab').find(choice => choice.value === 'default');
  assert.equal(typeof disabled.disabled, 'string');
  assert.equal(formatSelectChoice(disabled).disabled, disabled.disabled);
  assert.equal(formatSelectChoice({ name: 'enabled', value: 'aws', disabled: false }).disabled, false);
});
