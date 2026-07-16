import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getClaudeDesktopPaths } from '../src/apps/claude-desktop.js';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIR, '..');
const ENTRYPOINT = path.join(PROJECT_ROOT, 'index.js');
const TEST_TOKEN = 'desktop-entry-smoke-token-with-enough-length';

const SERVICE_CASES = [
  {
    service: 'routerlab',
    args: [],
    tokenKey: 'ROUTERLAB_API_KEY',
    baseUrlKey: 'ROUTERLAB_BASE_URL',
    expectedStrategies: ['default', 'aws', 'claude-gpt', 'claude-kimi-k2.7-code', 'glm-5.2'],
    routeId: 'claude-5.6-sol',
    upstreamModel: 'gpt-5.6-sol',
  },
  {
    service: 'llm',
    args: ['--service', 'llm'],
    tokenKey: 'ROUTERLAB_LLM_API_KEY',
    baseUrlKey: 'ROUTERLAB_LLM_BASE_URL',
    expectedStrategies: ['claude', 'claude-gpt', 'glm-5.2', 'claude-qwen3.7-max', 'claude-MiniMax-M3', 'deepseek-v4'],
    routeId: 'claude-5.6-sol-pro',
    upstreamModel: 'gpt-5.6-sol-pro',
  },
];

test('interactive Claude Desktop selection configures and proxies the selected service', {
  timeout: 60000,
}, async (t) => {
  for (const serviceCase of SERVICE_CASES) {
    await t.test(serviceCase.service, { timeout: 25000 }, async () => {
      const fixture = await createDesktopLaunchFixture();
      const env = buildIsolatedEnvironment(fixture, serviceCase);
      const child = spawn(process.execPath, [
        ENTRYPOINT,
        ...serviceCase.args,
        '--port',
        String(fixture.proxyPort),
      ], {
        cwd: PROJECT_ROOT,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      fixture.child = child;

      let stdout = '';
      let stderr = '';
      let mainAnswered = false;
      let desktopAnswered = false;
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        if (!mainAnswered && stdout.includes('Choose where you want to go:')) {
          mainAnswered = true;
          child.stdin.write('\u001b[B\r');
          return;
        }
        if (mainAnswered
          && !desktopAnswered
          && stdout.includes('Choose a Claude Desktop action:')) {
          desktopAnswered = true;
          child.stdin.write('\r');
        }
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });

      try {
        await waitForCondition(
          () => stdout.includes('Claude Desktop local mapping proxy listening on '),
          () => `Proxy did not start.\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        );
        assert.equal(mainAnswered, true);
        assert.equal(desktopAnswered, true);

        const paths = getClaudeDesktopPaths(env, process.platform);
        await waitForCondition(
          () => fs.existsSync(paths.profilePath) && fs.existsSync(paths.metaPath),
          () => `Desktop profile was not created.\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        );
        const profile = JSON.parse(fs.readFileSync(paths.profilePath, 'utf8'));
        const meta = JSON.parse(fs.readFileSync(paths.metaPath, 'utf8'));
        assert.equal(meta.wrapperScionos.service, serviceCase.service);
        assert.deepEqual(meta.wrapperScionos.strategies, serviceCase.expectedStrategies);
        assert.deepEqual(profile.coworkEgressAllowedHosts, ['127.0.0.1']);
        assert.equal(profile.inferenceGatewayBaseUrl, `http://127.0.0.1:${fixture.proxyPort}`);
        assert.ok(profile.inferenceGatewayApiKey.length >= 32);
        assert.notEqual(profile.inferenceGatewayApiKey, TEST_TOKEN);

        const modelsResponse = await fetch(profile.inferenceGatewayBaseUrl + '/v1/models', {
          headers: { authorization: `Bearer ${profile.inferenceGatewayApiKey}` },
          signal: AbortSignal.timeout(3000),
        });
        assert.equal(modelsResponse.status, 200);
        const models = await modelsResponse.json();
        assert.equal(models.data.some((model) => model.id === serviceCase.routeId), true);

        const messageResponse = await fetch(profile.inferenceGatewayBaseUrl + '/v1/messages', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${profile.inferenceGatewayApiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: serviceCase.routeId,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
          }),
          signal: AbortSignal.timeout(3000),
        });
        assert.equal(messageResponse.status, 200);
        assert.equal(fixture.requests.length, 1);
        assert.equal(fixture.requests[0].apiKey, TEST_TOKEN);
        assert.equal(fixture.requests[0].authorization, null);
        assert.equal(JSON.parse(fixture.requests[0].body).model, serviceCase.upstreamModel);
        assert.doesNotMatch(stdout + stderr, new RegExp(TEST_TOKEN));
        assert.doesNotMatch(stdout + stderr, new RegExp(profile.inferenceGatewayApiKey));

        if (process.platform !== 'win32') {
          const outputLengthBeforeSignal = stdout.length;
          child.kill('SIGINT');
          await waitForCondition(
            () => stdout.slice(outputLengthBeforeSignal).includes('Choose a Claude Desktop action:'),
            () => `Desktop menu did not return after SIGINT.\nstdout:\n${stdout}\nstderr:\n${stderr}`,
          );
          child.stdin.write('\u001b[B\u001b[B\u001b[B\r');
          await waitForCondition(
            () => stdout.slice(outputLengthBeforeSignal).includes('Choose where you want to go:'),
            () => `Home menu did not return.\nstdout:\n${stdout}\nstderr:\n${stderr}`,
          );
          child.stdin.write('\u001b[B\u001b[B\u001b[B\u001b[B\u001b[B\r');
          const result = await waitForExit(child);
          assert.equal(result.signal, null);
          assert.equal(result.code, 0, `stdout:\n${stdout}\nstderr:\n${stderr}`);
        }
      } finally {
        await fixture.cleanup();
      }
    });
  }
});

async function createDesktopLaunchFixture() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapper-scionos-desktop-launch-'));
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
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'msg_desktop_test',
        type: 'message',
        role: 'assistant',
        model: 'test-model',
        content: [{ type: 'text', text: 'ok' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }));
    });
  });
  await listen(upstream);

  const portProbe = http.createServer();
  await listen(portProbe);
  const proxyPort = portProbe.address().port;
  await new Promise((resolve) => portProbe.close(resolve));

  return {
    tempDir,
    requests,
    proxyPort,
    baseUrl: `http://127.0.0.1:${upstream.address().port}`,
    child: null,
    async cleanup() {
      if (this.child && this.child.exitCode === null) terminateChildTree(this.child);
      if (this.child && this.child.exitCode === null) {
        await Promise.race([
          waitForExit(this.child),
          new Promise((resolve) => setTimeout(resolve, 1000)),
        ]);
      }
      upstream.closeAllConnections?.();
      if (upstream.listening) await new Promise((resolve) => upstream.close(resolve));
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

function buildIsolatedEnvironment(fixture, serviceCase) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    const normalized = key.toUpperCase();
    if (normalized === 'ROUTERLAB_API_KEY'
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
  const configHome = path.join(fixture.tempDir, 'config');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(appData, { recursive: true });
  fs.mkdirSync(localAppData, { recursive: true });
  fs.mkdirSync(configHome, { recursive: true });

  env.HOME = home;
  env.USERPROFILE = home;
  env.APPDATA = appData;
  env.LOCALAPPDATA = localAppData;
  env.XDG_CONFIG_HOME = configHome;
  env.FORCE_COLOR = '0';
  env.NO_COLOR = '1';
  env[serviceCase.tokenKey] = TEST_TOKEN;
  env[serviceCase.baseUrlKey] = fixture.baseUrl;
  return env;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

async function waitForCondition(predicate, diagnostic, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(typeof diagnostic === 'function' ? diagnostic() : diagnostic);
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
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
