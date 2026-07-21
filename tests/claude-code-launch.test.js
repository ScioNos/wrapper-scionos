import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIR, '..');
const ENTRYPOINT = path.join(PROJECT_ROOT, 'index.js');
const TEST_TOKEN = 'routerlab-entry-smoke-token-with-enough-length';

const SERVICE_CASES = [
  {
    service: 'routerlab',
    args: ['--strategy', 'default'],
    tokenKey: 'ROUTERLAB_API_KEY',
    baseUrlKey: 'ROUTERLAB_BASE_URL',
    models: [
      'claude-fable-5',
      'claude-sonnet-5',
      'claude-opus-4-8',
      'aws-claude-haiku-4-5-20251001',
    ],
    expectedEnvironment: {
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-8',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-5',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-fable-5',
      CLAUDE_CODE_SUBAGENT_MODEL: 'aws-claude-haiku-4-5-20251001',
    },
  },
  {
    service: 'llm',
    args: ['--service', 'llm', '--strategy', 'claude'],
    tokenKey: 'ROUTERLAB_LLM_API_KEY',
    baseUrlKey: 'ROUTERLAB_LLM_BASE_URL',
    models: [
      'claude-opus-4-8',
      'claude-sonnet-5',
      'claude-haiku-4-5-20251001',
    ],
    expectedEnvironment: {
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-8',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-5',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
      CLAUDE_CODE_SUBAGENT_MODEL: 'claude-sonnet-5',
    },
  },
];

test('interactive Claude Code selection launches through the authenticated local proxy for both services', {
  timeout: 60000,
}, async (t) => {
  for (const serviceCase of SERVICE_CASES) {
    await t.test(serviceCase.service, { timeout: 25000 }, async () => {
      const fixture = await createClaudeLaunchFixture(serviceCase.models);
      let menuAnswered = false;
      try {
        const env = buildIsolatedEnvironment(fixture, serviceCase);
        const result = await runCli(serviceCase.args, env, {
          onStdout: (stdout, child) => {
            if (menuAnswered || !stdout.includes('Choose where you want to go:')) return;
            menuAnswered = true;
            child.stdin.write('\r');
          },
        });

        assert.equal(menuAnswered, true, result.diagnostic);
        assert.equal(result.signal, null, result.diagnostic);
        assert.equal(result.code, 0, result.diagnostic);
        assert.equal(fs.existsSync(fixture.capturePath), true, result.diagnostic);

        const capture = JSON.parse(fs.readFileSync(fixture.capturePath, 'utf8'));
        assert.match(capture.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
        assert.notEqual(capture.authToken, TEST_TOKEN);
        assert.ok(capture.authToken.length >= 32);
        assert.equal(capture.apiKey, '');
        assert.equal(capture.disableExperimentalBetas, '1');
        assert.equal(capture.responseStatus, 200);
        for (const [key, expected] of Object.entries(serviceCase.expectedEnvironment)) {
          assert.equal(capture.modelEnvironment[key], expected);
        }

        const modelsRequest = fixture.requests.find((request) => request.url === '/v1/models');
        const messageRequest = fixture.requests.find((request) => request.url === '/v1/messages');
        assert.equal(modelsRequest?.apiKey, TEST_TOKEN);
        assert.equal(messageRequest?.apiKey, TEST_TOKEN);
        assert.equal(messageRequest?.authorization, null);
        assert.doesNotMatch(result.stdout + result.stderr, new RegExp(TEST_TOKEN));
        assert.doesNotMatch(result.stdout + result.stderr, new RegExp(capture.authToken));
        assert.match(result.stderr, new RegExp(serviceCase.baseUrlKey));

        await assert.rejects(
          fetch(capture.baseUrl + '/v1/messages', { signal: AbortSignal.timeout(1000) }),
        );
      } finally {
        await fixture.cleanup();
      }
    });
  }
});

test('Claude Code stops before proxy startup when a legacy LLM token is rejected', {
  timeout: 25000,
}, async () => {
  const fixture = await createClaudeLaunchFixture([], { modelStatus: 403 });
  try {
    const env = buildIsolatedEnvironment(fixture, {
      service: 'llm',
      tokenKey: 'ANTHROPIC_AUTH_TOKEN',
      baseUrlKey: 'ANTHROPIC_BASE_URL',
    });
    const result = await runCli([
      'claude-code',
      '--service',
      'llm',
      '--strategy',
      'claude-gpt',
      '--no-prompt',
    ], env);

    assert.equal(result.signal, null, result.diagnostic);
    assert.equal(result.code, 1, result.diagnostic);
    assert.equal(fs.existsSync(fixture.capturePath), false, result.diagnostic);
    assert.equal(fixture.requests.filter((request) => request.url === '/v1/models').length, 1);
    assert.equal(fixture.requests.some((request) => request.url === '/v1/messages'), false);
    assert.match(result.stderr, /ANTHROPIC_AUTH_TOKEN/);
    assert.match(result.stderr, /ANTHROPIC_BASE_URL/);
    assert.match(result.stderr, /HTTP 403/);
    assert.match(result.stderr, /auth status --service llm/);
    assert.match(result.stderr, /auth test --service llm/);
    assert.match(result.stderr, /auth login --service llm/);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(TEST_TOKEN));
  } finally {
    await fixture.cleanup();
  }
});

test('Claude Code validates endpoint protocols and explicit tokens before proxy startup', {
  timeout: 30000,
}, async (t) => {
  await t.test('invalid endpoint syntax', async () => {
    const fixture = await createClaudeLaunchFixture([]);
    try {
      const env = buildIsolatedEnvironment(fixture, SERVICE_CASES[0]);
      env.ROUTERLAB_BASE_URL = 'not-a-valid-url';
      const result = await runCli([
        'claude-code',
        '--strategy',
        'default',
        '--token',
        TEST_TOKEN,
        '--no-prompt',
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
    const fixture = await createClaudeLaunchFixture([]);
    try {
      const env = buildIsolatedEnvironment(fixture, SERVICE_CASES[0]);
      env.ROUTERLAB_BASE_URL = 'file:///tmp/routerlab';
      const result = await runCli([
        'claude-code',
        '--strategy',
        'default',
        '--token',
        TEST_TOKEN,
        '--no-prompt',
      ], env);
      assert.equal(result.code, 1, result.diagnostic);
      assert.match(result.stderr, /must use HTTP or HTTPS/);
      assert.equal(fixture.requests.length, 0);
      assert.equal(fs.existsSync(fixture.capturePath), false);
    } finally {
      await fixture.cleanup();
    }
  });

  await t.test('explicit rejected token', async () => {
    const fixture = await createClaudeLaunchFixture([], { modelStatus: 401 });
    try {
      const env = buildIsolatedEnvironment(fixture, SERVICE_CASES[0]);
      const result = await runCli([
        'claude-code',
        '--strategy',
        'default',
        '--token',
        TEST_TOKEN,
        '--no-prompt',
      ], env);
      assert.equal(result.code, 1, result.diagnostic);
      assert.match(result.stderr, /token from --token with HTTP 401/);
      assert.equal(fixture.requests.length, 1);
      assert.equal(fs.existsSync(fixture.capturePath), false);
    } finally {
      await fixture.cleanup();
    }
  });

  await t.test('invalid explicit token format', async () => {
    const fixture = await createClaudeLaunchFixture([]);
    try {
      const env = buildIsolatedEnvironment(fixture, SERVICE_CASES[0]);
      const result = await runCli([
        'claude-code',
        '--strategy',
        'default',
        '--token',
        'short',
        '--no-prompt',
      ], env);
      assert.equal(result.code, 1, result.diagnostic);
      assert.match(result.stderr, /too short/);
      assert.equal(fixture.requests.length, 0);
      assert.equal(fs.existsSync(fixture.capturePath), false);
    } finally {
      await fixture.cleanup();
    }
  });
});

test('Claude Code can launch with unverified models after a non-authentication discovery failure', {
  timeout: 25000,
}, async () => {
  const fixture = await createClaudeLaunchFixture([], { modelStatus: 500 });
  let menuAnswered = false;
  try {
    const env = buildIsolatedEnvironment(fixture, SERVICE_CASES[0]);
    const result = await runCli(['--strategy', 'default'], env, {
      onStdout: (stdout, child) => {
        if (menuAnswered || !stdout.includes('Choose where you want to go:')) return;
        menuAnswered = true;
        child.stdin.write('\r');
      },
    });

    assert.equal(menuAnswered, true, result.diagnostic);
    assert.equal(result.code, 0, result.diagnostic);
    assert.match(stripVTControlCharacters(result.stdout), /model list unavailable: Server responded with 500/);
    assert.equal(fs.existsSync(fixture.capturePath), true, result.diagnostic);
    assert.equal(fixture.requests.some((request) => request.url === '/v1/messages'), true);
  } finally {
    await fixture.cleanup();
  }
});

async function createClaudeLaunchFixture(models, { modelStatus = 200 } = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapper-scionos-claude-launch-'));
  const capturePath = path.join(tempDir, 'claude-capture.json');
  const requests = [];
  const upstream = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        apiKey: req.headers['x-api-key'] ?? null,
        authorization: req.headers.authorization ?? null,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      if (req.url === '/v1/models') {
        res.writeHead(modelStatus, { 'content-type': 'application/json' });
        res.end(modelStatus === 200
          ? JSON.stringify({ data: models.map((id) => ({ id })) })
          : JSON.stringify({ error: { message: 'test token rejected' } }));
        return;
      }
      if (req.url === '/v1/messages') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: 'test-model',
          content: [{ type: 'text', text: 'ok' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        }));
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

  const fakeScriptPath = path.join(tempDir, 'fake-claude.mjs');
  fs.writeFileSync(fakeScriptPath, [
    "import fs from 'node:fs';",
    'const args = process.argv.slice(2);',
    "if (args.includes('--version')) {",
    "  console.log('2.1.0-test');",
    '  process.exit(0);',
    '}',
    'const capture = {',
    '  args,',
    '  baseUrl: process.env.ANTHROPIC_BASE_URL,',
    '  authToken: process.env.ANTHROPIC_AUTH_TOKEN,',
    '  apiKey: process.env.ANTHROPIC_API_KEY,',
    '  disableExperimentalBetas: process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS,',
    '  modelEnvironment: {',
    '    ANTHROPIC_DEFAULT_OPUS_MODEL: process.env.ANTHROPIC_DEFAULT_OPUS_MODEL,',
    '    ANTHROPIC_DEFAULT_SONNET_MODEL: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL,',
    '    ANTHROPIC_DEFAULT_HAIKU_MODEL: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL,',
    '    CLAUDE_CODE_SUBAGENT_MODEL: process.env.CLAUDE_CODE_SUBAGENT_MODEL,',
    '  },',
    '};',
    'try {',
    "  const response = await fetch(process.env.ANTHROPIC_BASE_URL + '/v1/messages', {",
    "    method: 'POST',",
    '    headers: {',
    "      'x-api-key': process.env.ANTHROPIC_AUTH_TOKEN,",
    "      'anthropic-version': '2023-06-01',",
    "      'content-type': 'application/json',",
    '    },',
    "    body: JSON.stringify({ model: 'test-model', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),",
    '  });',
    '  capture.responseStatus = response.status;',
    '  capture.responseBody = await response.text();',
    '  if (!response.ok) process.exitCode = 9;',
    '} catch (error) {',
    '  capture.error = error.message;',
    '  process.exitCode = 9;',
    '} finally {',
    "  fs.writeFileSync(process.env.SCIONOS_FAKE_CLAUDE_CAPTURE, JSON.stringify(capture, null, 2));",
    '}',
  ].join('\n'));

  const executablePath = path.join(tempDir, process.platform === 'win32' ? 'claude.cmd' : 'claude');
  if (process.platform === 'win32') {
    fs.writeFileSync(executablePath, [
      '@echo off',
      '"%SCIONOS_FAKE_NODE%" "%SCIONOS_FAKE_CLAUDE_SCRIPT%" %*',
    ].join('\r\n'));
  } else {
    fs.writeFileSync(executablePath, [
      '#!/bin/sh',
      'exec "$SCIONOS_FAKE_NODE" "$SCIONOS_FAKE_CLAUDE_SCRIPT" "$@"',
    ].join('\n'));
    fs.chmodSync(executablePath, 0o755);
  }

  const address = upstream.address();
  return {
    tempDir,
    capturePath,
    fakeScriptPath,
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
    const normalized = key.toUpperCase();
    if (normalized === 'PATH'
      || normalized === 'ROUTERLAB_API_KEY'
      || normalized === 'WRAPPER_SCIONOS_ROUTERLAB_TOKEN'
      || normalized === 'ROUTERLAB_LLM_API_KEY'
      || normalized === 'WRAPPER_SCIONOS_LLM_TOKEN'
      || normalized === 'ROUTERLAB_BASE_URL'
      || normalized === 'WRAPPER_SCIONOS_ROUTERLAB_BASE_URL'
      || normalized === 'ROUTERLAB_LLM_BASE_URL'
      || normalized === 'WRAPPER_SCIONOS_LLM_BASE_URL'
      || normalized === 'ANTHROPIC_AUTH_TOKEN'
      || normalized === 'ANTHROPIC_BASE_URL'
      || normalized === 'SCIONOS_DEBUG') {
      delete env[key];
    }
  }

  const home = path.join(fixture.tempDir, 'home');
  const appData = path.join(fixture.tempDir, 'appdata');
  const localAppData = path.join(fixture.tempDir, 'localappdata');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(appData, { recursive: true });
  fs.mkdirSync(localAppData, { recursive: true });

  env.PATH = fixture.tempDir + path.delimiter + (process.env.PATH ?? '');
  env.HOME = home;
  env.USERPROFILE = home;
  env.APPDATA = appData;
  env.LOCALAPPDATA = localAppData;
  env.FORCE_COLOR = '0';
  env.NO_COLOR = '1';
  env.SCIONOS_FAKE_NODE = process.execPath;
  env.SCIONOS_FAKE_CLAUDE_SCRIPT = fixture.fakeScriptPath;
  env.SCIONOS_FAKE_CLAUDE_CAPTURE = fixture.capturePath;
  env[serviceCase.tokenKey] = TEST_TOKEN;
  env[serviceCase.baseUrlKey] = fixture.baseUrl;
  return env;
}

async function runCli(args, env, { onStdout = null, timeoutMs = 20000 } = {}) {
  const child = spawn(process.execPath, [ENTRYPOINT, ...args], {
    cwd: PROJECT_ROOT,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    onStdout?.(stdout, child);
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
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
