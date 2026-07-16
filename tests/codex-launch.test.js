import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIR, '..');
const ENTRYPOINT = path.join(PROJECT_ROOT, 'index.js');
const TEST_TOKEN = 'codex-entry-smoke-token-with-enough-length';

const SERVICE_CASES = [
  {
    service: 'routerlab',
    args: [],
    tokenKey: 'ROUTERLAB_API_KEY',
    baseUrlKey: 'ROUTERLAB_BASE_URL',
    defaultModel: 'gpt-5.6-sol',
    models: [
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'deepseek-v4-pro',
      'kimi-k2.7-code',
      'glm-5.2',
    ],
  },
  {
    service: 'llm',
    args: ['--service', 'llm'],
    tokenKey: 'ROUTERLAB_LLM_API_KEY',
    baseUrlKey: 'ROUTERLAB_LLM_BASE_URL',
    defaultModel: 'gpt-5.6-sol-pro',
    models: [
      'gpt-5.6-sol-pro',
      'gpt-5.6-terra-pro',
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'glm-5.2',
      'qwen3.7-max',
      'MiniMax-M3',
    ],
  },
];

test('interactive Codex selection launches through the authenticated local proxy for both services', {
  timeout: 60000,
}, async (t) => {
  for (const serviceCase of SERVICE_CASES) {
    await t.test(serviceCase.service, { timeout: 25000 }, async () => {
      const fixture = await createCodexLaunchFixture({ models: serviceCase.models });
      let menuAnswered = false;
      try {
        const result = await runCli([
          ...serviceCase.args,
          '--token',
          TEST_TOKEN,
        ], buildIsolatedEnvironment(fixture, serviceCase), {
          onStdout: (stdout, child) => {
            if (menuAnswered || !stdout.includes('Choose where you want to go:')) return;
            menuAnswered = true;
            child.stdin.write('\u001b[B\u001b[B\r');
          },
        });

        assert.equal(menuAnswered, true, result.diagnostic);
        assert.equal(result.signal, null, result.diagnostic);
        assert.equal(result.code, 0, result.diagnostic);
        assert.equal(fs.existsSync(fixture.capturePath), true, result.diagnostic);

        const capture = JSON.parse(fs.readFileSync(fixture.capturePath, 'utf8'));
        assert.equal(capture.model, serviceCase.defaultModel);
        assert.equal(capture.providerName, serviceCase.service);
        assert.match(capture.baseUrl, /^http:\/\/127\.0\.0\.1:\d+\/v1$/);
        assert.notEqual(capture.apiKey, TEST_TOKEN);
        assert.ok(capture.apiKey.length >= 32);
        assert.equal(capture.responseStatus, 200);
        assert.deepEqual(
          capture.catalog.models.map((entry) => entry.slug),
          serviceCase.models,
        );

        const modelsRequest = fixture.requests.find((request) => request.url === '/v1/models');
        const responsesRequest = fixture.requests.find((request) => request.url === '/v1/responses');
        assert.equal(modelsRequest?.apiKey, TEST_TOKEN);
        assert.equal(responsesRequest?.authorization, `Bearer ${TEST_TOKEN}`);
        assert.equal(responsesRequest?.apiKey, null);
        assert.equal(JSON.parse(responsesRequest.body).store, false);

        assert.equal(fs.existsSync(capture.catalogPath), false, 'runtime catalog should be removed');
        assert.doesNotMatch(result.stdout + result.stderr, new RegExp(TEST_TOKEN));
        assert.doesNotMatch(result.stdout + result.stderr, new RegExp(capture.apiKey));
        assert.match(result.stderr, new RegExp(serviceCase.baseUrlKey));
        await assert.rejects(
          fetch(capture.baseUrl + '/responses', { signal: AbortSignal.timeout(1000) }),
        );
      } finally {
        await fixture.cleanup();
      }
    });
  }
});

test('Codex validates endpoint, token, authentication, and model availability before launch', {
  timeout: 60000,
}, async (t) => {
  await t.test('invalid endpoint syntax', async () => {
    const fixture = await createCodexLaunchFixture({ models: SERVICE_CASES[0].models });
    try {
      const env = buildIsolatedEnvironment(fixture, SERVICE_CASES[0]);
      env.ROUTERLAB_BASE_URL = 'not-a-valid-url';
      const result = await runCli([
        'codex', 'launch', '--token', TEST_TOKEN, '--no-prompt',
      ], env);
      assert.equal(result.code, 1, result.diagnostic);
      assert.match(result.stderr, /base URL is invalid/);
      assert.equal(fixture.requests.length, 0);
      assert.equal(fs.existsSync(fixture.capturePath), false);
    } finally {
      await fixture.cleanup();
    }
  });

  await t.test('unsupported endpoint protocol', async () => {
    const fixture = await createCodexLaunchFixture({ models: SERVICE_CASES[0].models });
    try {
      const env = buildIsolatedEnvironment(fixture, SERVICE_CASES[0]);
      env.ROUTERLAB_BASE_URL = 'file:///tmp/routerlab';
      const result = await runCli([
        'codex', 'launch', '--token', TEST_TOKEN, '--no-prompt',
      ], env);
      assert.equal(result.code, 1, result.diagnostic);
      assert.match(result.stderr, /must use HTTP or HTTPS/);
      assert.equal(fixture.requests.length, 0);
      assert.equal(fs.existsSync(fixture.capturePath), false);
    } finally {
      await fixture.cleanup();
    }
  });

  await t.test('invalid explicit token format', async () => {
    const fixture = await createCodexLaunchFixture({ models: SERVICE_CASES[0].models });
    try {
      const result = await runCli([
        'codex', 'launch', '--token', 'short', '--no-prompt',
      ], buildIsolatedEnvironment(fixture, SERVICE_CASES[0]));
      assert.equal(result.code, 1, result.diagnostic);
      assert.match(result.stderr, /too short/);
      assert.equal(fixture.requests.length, 0);
      assert.equal(fs.existsSync(fixture.capturePath), false);
    } finally {
      await fixture.cleanup();
    }
  });

  await t.test('rejected token', async () => {
    const fixture = await createCodexLaunchFixture({
      models: SERVICE_CASES[1].models,
      modelStatus: 403,
    });
    try {
      const result = await runCli([
        'codex', 'launch', '--service', 'llm', '--token', TEST_TOKEN, '--no-prompt',
      ], buildIsolatedEnvironment(fixture, SERVICE_CASES[1]));
      assert.equal(result.code, 1, result.diagnostic);
      assert.match(result.stderr, /Codex token from --token with HTTP 403/);
      assert.match(result.stderr, /auth status --service llm/);
      assert.match(result.stderr, /auth test --service llm/);
      assert.match(result.stderr, /auth login --service llm/);
      assert.equal(fixture.requests.filter((request) => request.url === '/v1/models').length, 1);
      assert.equal(fixture.requests.some((request) => request.url === '/v1/responses'), false);
      assert.equal(fs.existsSync(fixture.capturePath), false);
      assert.doesNotMatch(result.stdout + result.stderr, new RegExp(TEST_TOKEN));
    } finally {
      await fixture.cleanup();
    }
  });

  await t.test('selected model absent from verified catalog', async () => {
    const fixture = await createCodexLaunchFixture({ models: ['glm-5.2'] });
    try {
      const result = await runCli([
        'codex', 'launch', '--token', TEST_TOKEN, '--no-prompt',
      ], buildIsolatedEnvironment(fixture, SERVICE_CASES[0]));
      assert.equal(result.code, 1, result.diagnostic);
      assert.match(result.stderr, /model "gpt-5\.6-sol" is not available/);
      assert.match(result.stderr, /Available Codex models: glm-5\.2/);
      assert.equal(fixture.requests.filter((request) => request.url === '/v1/models').length, 1);
      assert.equal(fixture.requests.some((request) => request.url === '/v1/responses'), false);
      assert.equal(fs.existsSync(fixture.capturePath), false);
    } finally {
      await fixture.cleanup();
    }
  });
});

test('Codex keeps non-authentication discovery fallback and direct child exit codes', {
  timeout: 40000,
}, async (t) => {
  await t.test('server failure uses conservative catalog', async () => {
    const fixture = await createCodexLaunchFixture({
      models: SERVICE_CASES[0].models,
      modelStatus: 500,
    });
    try {
      const result = await runCli([
        'codex', 'launch', '--token', TEST_TOKEN, '--no-prompt',
      ], buildIsolatedEnvironment(fixture, SERVICE_CASES[0]));
      assert.equal(result.code, 0, result.diagnostic);
      assert.match(result.stderr, /Model metadata unavailable \(server_error/);
      const capture = JSON.parse(fs.readFileSync(fixture.capturePath, 'utf8'));
      assert.deepEqual(
        capture.catalog.models.map((entry) => entry.slug),
        SERVICE_CASES[0].models,
      );
      assert.equal(fixture.requests.some((request) => request.url === '/v1/responses'), true);
    } finally {
      await fixture.cleanup();
    }
  });

  await t.test('direct command preserves non-zero Codex exit code', async () => {
    const fixture = await createCodexLaunchFixture({
      models: SERVICE_CASES[0].models,
      codexExitCode: 9,
    });
    try {
      const result = await runCli([
        'codex', 'launch', '--token', TEST_TOKEN, '--no-prompt',
      ], buildIsolatedEnvironment(fixture, SERVICE_CASES[0]));
      assert.equal(result.code, 9, result.diagnostic);
      const capture = JSON.parse(fs.readFileSync(fixture.capturePath, 'utf8'));
      assert.equal(fs.existsSync(capture.catalogPath), false);
      await assert.rejects(
        fetch(capture.baseUrl + '/responses', { signal: AbortSignal.timeout(1000) }),
      );
    } finally {
      await fixture.cleanup();
    }
  });
});

test('interactive Codex child failure returns to the main menu', {
  timeout: 25000,
}, async () => {
  const fixture = await createCodexLaunchFixture({
    models: SERVICE_CASES[0].models,
    codexExitCode: 9,
  });
  let codexSelected = false;
  let failureReported = false;
  let exitSelected = false;
  let postFailureStdout = '';
  try {
    const result = await runCli([
      '--token',
      TEST_TOKEN,
    ], buildIsolatedEnvironment(fixture, SERVICE_CASES[0]), {
      onStdout: (stdout, child, chunk) => {
        if (!codexSelected && stdout.includes('Choose where you want to go:')) {
          codexSelected = true;
          child.stdin.write('\u001b[B\u001b[B\r');
          return;
        }
        if (!failureReported || exitSelected) return;
        postFailureStdout += chunk;
        if (postFailureStdout.includes('Choose where you want to go:')) {
          exitSelected = true;
          child.stdin.write('\u001b[B'.repeat(5) + '\r');
        }
      },
      onStderr: (stderr) => {
        if (stderr.includes('Codex CLI exited with code 9')) {
          failureReported = true;
        }
      },
    });

    assert.equal(codexSelected, true, result.diagnostic);
    assert.equal(failureReported, true, result.diagnostic);
    assert.equal(exitSelected, true, result.diagnostic);
    assert.equal(result.signal, null, result.diagnostic);
    assert.equal(result.code, 0, result.diagnostic);
    assert.match(result.stderr, /Returning to ScioNos Wrapper/);
  } finally {
    await fixture.cleanup();
  }
});

async function createCodexLaunchFixture({
  models,
  modelStatus = 200,
  responseStatus = 200,
  codexExitCode = 0,
}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapper-scionos-codex-launch-'));
  const capturePath = path.join(tempDir, 'codex-capture.json');
  const requests = [];
  const upstream = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      requests.push({
        method: req.method,
        url: req.url,
        apiKey: req.headers['x-api-key'] ?? null,
        authorization: req.headers.authorization ?? null,
        body,
      });
      if (req.url === '/v1/models') {
        res.writeHead(modelStatus, { 'content-type': 'application/json' });
        res.end(modelStatus === 200
          ? JSON.stringify({
              data: models.map((id) => ({
                id,
                context_window: 200000,
                supports_reasoning: id.startsWith('gpt-5.6'),
              })),
            })
          : JSON.stringify({ error: { message: 'test model discovery failure' } }));
        return;
      }
      if (req.url === '/v1/responses') {
        res.writeHead(responseStatus, { 'content-type': 'application/json' });
        res.end(responseStatus === 200
          ? JSON.stringify({ id: 'resp_test', object: 'response', status: 'completed' })
          : JSON.stringify({ error: { message: 'test response failure' } }));
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'not found' } }));
    });
  });
  await new Promise((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', () => {
      upstream.off('error', reject);
      resolve();
    });
  });

  const fakeScriptPath = path.join(tempDir, 'fake-codex.mjs');
  fs.writeFileSync(fakeScriptPath, [
    "import fs from 'node:fs';",
    'const args = process.argv.slice(2);',
    "if (args.includes('--version')) {",
    "  console.log('codex-cli 0.144.5-test');",
    '  process.exit(0);',
    '}',
    'const readOverride = (name) => {',
    "  const value = args.find((arg) => arg.startsWith(name + '='));",
    '  return value ? JSON.parse(value.slice(name.length + 1)) : null;',
    '};',
    "const baseUrl = readOverride('model_providers.custom.base_url');",
    "const model = readOverride('model');",
    "const providerName = readOverride('model_providers.custom.name');",
    "const catalogPath = readOverride('model_catalog_json');",
    'const capture = {',
    '  args,',
    '  baseUrl,',
    '  model,',
    '  providerName,',
    '  catalogPath,',
    '  apiKey: process.env.OPENAI_API_KEY,',
    "  catalog: JSON.parse(fs.readFileSync(catalogPath, 'utf8')),",
    '};',
    'try {',
    "  const response = await fetch(baseUrl + '/responses', {",
    "    method: 'POST',",
    '    headers: {',
    "      authorization: 'Bearer ' + process.env.OPENAI_API_KEY,",
    "      'content-type': 'application/json',",
    '    },',
    "    body: JSON.stringify({ model, input: 'ping', store: true }),",
    '  });',
    '  capture.responseStatus = response.status;',
    '  capture.responseBody = await response.text();',
    '  if (!response.ok) process.exitCode = 8;',
    '} catch (error) {',
    '  capture.error = error.message;',
    '  process.exitCode = 8;',
    '} finally {',
    "  fs.writeFileSync(process.env.SCIONOS_FAKE_CODEX_CAPTURE, JSON.stringify(capture, null, 2));",
    '}',
    'const forcedExitCode = Number(process.env.SCIONOS_FAKE_CODEX_EXIT_CODE || 0);',
    'if (forcedExitCode) process.exitCode = forcedExitCode;',
  ].join('\n'));

  const appData = path.join(tempDir, 'appdata');
  const npmBin = path.join(appData, 'npm');
  fs.mkdirSync(npmBin, { recursive: true });
  const executablePath = path.join(
    process.platform === 'win32' ? npmBin : tempDir,
    process.platform === 'win32' ? 'codex.cmd' : 'codex',
  );
  if (process.platform === 'win32') {
    fs.writeFileSync(executablePath, [
      '@echo off',
      '"%SCIONOS_FAKE_NODE%" "%SCIONOS_FAKE_CODEX_SCRIPT%" %*',
    ].join('\r\n'));
  } else {
    fs.writeFileSync(executablePath, [
      '#!/bin/sh',
      'exec "$SCIONOS_FAKE_NODE" "$SCIONOS_FAKE_CODEX_SCRIPT" "$@"',
    ].join('\n'));
    fs.chmodSync(executablePath, 0o755);
  }

  const address = upstream.address();
  return {
    tempDir,
    appData,
    executableDir: path.dirname(executablePath),
    capturePath,
    fakeScriptPath,
    codexExitCode,
    requests,
    baseUrl: `http://127.0.0.1:${address.port}`,
    async cleanup() {
      upstream.closeAllConnections?.();
      if (upstream.listening) {
        await new Promise((resolve) => upstream.close(resolve));
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

function buildIsolatedEnvironment(fixture, serviceCase) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if ([
      'ROUTERLAB_API_KEY',
      'WRAPPER_SCIONOS_ROUTERLAB_TOKEN',
      'ROUTERLAB_LLM_API_KEY',
      'WRAPPER_SCIONOS_LLM_TOKEN',
      'ROUTERLAB_BASE_URL',
      'WRAPPER_SCIONOS_ROUTERLAB_BASE_URL',
      'ROUTERLAB_LLM_BASE_URL',
      'WRAPPER_SCIONOS_LLM_BASE_URL',
      'ANTHROPIC_AUTH_TOKEN',
      'ANTHROPIC_BASE_URL',
      'OPENAI_API_KEY',
      'SCIONOS_DEBUG',
    ].includes(key.toUpperCase())) {
      delete env[key];
    }
  }

  const home = path.join(fixture.tempDir, 'home');
  const codexHome = path.join(fixture.tempDir, 'codex-home');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });

  env.PATH = fixture.executableDir + path.delimiter + (process.env.PATH ?? '');
  env.HOME = home;
  env.USERPROFILE = home;
  env.APPDATA = fixture.appData;
  env.LOCALAPPDATA = path.join(fixture.tempDir, 'localappdata');
  env.CODEX_HOME = codexHome;
  env.FORCE_COLOR = '0';
  env.NO_COLOR = '1';
  env.SCIONOS_FAKE_NODE = process.execPath;
  env.SCIONOS_FAKE_CODEX_SCRIPT = fixture.fakeScriptPath;
  env.SCIONOS_FAKE_CODEX_CAPTURE = fixture.capturePath;
  env.SCIONOS_FAKE_CODEX_EXIT_CODE = String(fixture.codexExitCode);
  env[serviceCase.tokenKey] = TEST_TOKEN;
  env[serviceCase.baseUrlKey] = fixture.baseUrl;
  return env;
}

async function runCli(args, env, {
  onStdout = null,
  onStderr = null,
  timeoutMs = 20000,
} = {}) {
  const child = spawn(process.execPath, [ENTRYPOINT, ...args], {
    cwd: PROJECT_ROOT,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    stdout += text;
    onStdout?.(stdout, child, text);
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderr += text;
    onStderr?.(stderr, child, text);
  });

  let timer = null;
  try {
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
      timer = setTimeout(() => {
        terminateChildTree(child);
        reject(new Error(`CLI timed out after ${timeoutMs}ms.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
      }, timeoutMs);
      timer.unref?.();
    });
    return {
      ...result,
      stdout,
      stderr,
      diagnostic: `stdout:\n${stdout}\nstderr:\n${stderr}`,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function terminateChildTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }
  child.kill('SIGKILL');
}
