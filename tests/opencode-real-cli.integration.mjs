import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildOpenCodeEnvironment } from '../src/apps/opencode.js';
import { detectOpenCodeCli } from '../src/platform/detect.js';
import { buildInteractiveCliInvocation } from '../src/platform/process.js';
import { startLongRunningLlmProxy, stopLongRunningLlmProxy } from '../src/platform/llm-proxy.js';

const MODEL = 'gpt-6-astra';
const ROUTERLAB_TOKEN = 'real-routerlab-token-with-enough-length';
const LOCAL_GATEWAY_TOKEN = 'local-opencode-gateway-token-with-enough-length';

test('installed OpenCode uses the wrapper local OpenAI-compatible provider', { timeout: 60000 }, async (t) => {
  const openCode = detectOpenCodeCli();
  assert.equal(openCode.installed, true, 'OpenCode CLI must be installed for the real integration check');
  assert.equal(openCode.versionSupported, true, `Unsupported OpenCode CLI version: ${openCode.version ?? 'unknown'}`);
  t.diagnostic(`Validating ${openCode.version}`);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapper-scionos-opencode-real-'));
  const configHome = path.join(tempDir, 'config');
  const dataHome = path.join(tempDir, 'data');
  const cacheHome = path.join(tempDir, 'cache');
  fs.mkdirSync(configHome, { recursive: true });
  fs.mkdirSync(dataHome, { recursive: true });
  fs.mkdirSync(cacheHome, { recursive: true });

  let upstream = null;
  let proxy = null;
  const requests = [];
  try {
    upstream = createChatCompletionsServer(requests);
    await listenOnLoopback(upstream);
    proxy = await startLongRunningLlmProxy({
      targetBaseUrl: `http://127.0.0.1:${upstream.address().port}`,
      routerlabToken: ROUTERLAB_TOKEN,
      gatewayToken: LOCAL_GATEWAY_TOKEN,
      upstreamAuth: 'openai',
      allowedModels: [MODEL],
    });

    const env = {
      ...buildOpenCodeEnvironment({
        sourceEnv: {
          ...process.env,
          OPENCODE_CONFIG_CONTENT: '{"provider":{"hostile":{}}}',
          ROUTERLAB_API_KEY: 'hostile-routerlab-token',
        },
        proxyBaseUrl: proxy.baseUrl,
        gatewayToken: LOCAL_GATEWAY_TOKEN,
        model: MODEL,
        models: [MODEL],
      }),
      XDG_CONFIG_HOME: configHome,
      XDG_DATA_HOME: dataHome,
      XDG_CACHE_HOME: cacheHome,
      OPENCODE_DISABLE_AUTOUPDATE: '1',
      OPENCODE_DISABLE_PRUNE: '1',
      NO_COLOR: '1',
    };

    const result = await runOpenCode(openCode.cliPath, [
      'run',
      '--format',
      'json',
      'Reply with exactly opencode-smoke-ok and do not call tools.',
    ], env, tempDir);

    assert.equal(result.code, 0, result.diagnostic);
    assert.match(result.stdout, /opencode-smoke-ok/, result.diagnostic);
    assert.ok(requests.length >= 1, result.diagnostic);
    assert.ok(requests.every((request) => request.url === '/v1/chat/completions'));
    assert.ok(requests.every((request) => request.authorization === `Bearer ${ROUTERLAB_TOKEN}`));
    assert.ok(requests.every((request) => request.body.model === MODEL));
    assert.equal(env.OPENCODE_CONFIG_CONTENT.includes('hostile'), false);
    assert.equal(env.OPENCODE_CONFIG_CONTENT.includes('hostile-routerlab-token'), false);
  } finally {
    await stopLongRunningLlmProxy(proxy, { graceMs: 0 });
    await closeServer(upstream);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function createChatCompletionsServer(requests) {
  return http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'not found' } }));
        return;
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'invalid JSON' } }));
        return;
      }
      requests.push({
        url: req.url,
        authorization: req.headers.authorization ?? null,
        body,
      });
      if (body.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream', connection: 'close' });
        res.write(`data: ${JSON.stringify({
          id: 'chatcmpl_wrapper_scionos',
          object: 'chat.completion.chunk',
          model: body.model,
          choices: [{ index: 0, delta: { role: 'assistant', content: 'opencode-smoke-ok' }, finish_reason: null }],
        })}\n\n`);
        res.write(`data: ${JSON.stringify({
          id: 'chatcmpl_wrapper_scionos',
          object: 'chat.completion.chunk',
          model: body.model,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        })}\n\n`);
        res.end('data: [DONE]\n\n');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'chatcmpl_wrapper_scionos',
        object: 'chat.completion',
        model: body.model,
        choices: [{ index: 0, message: { role: 'assistant', content: 'opencode-smoke-ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 8, completion_tokens: 1, total_tokens: 9 },
      }));
    });
  });
}

function listenOnLoopback(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

async function closeServer(server) {
  if (!server?.listening) return;
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

function runOpenCode(command, args, env, cwd) {
  const invocation = buildInteractiveCliInvocation(command, args);
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      ...(invocation.spawnOptions ?? {}),
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Real OpenCode integration timed out.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 45000);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({
        code,
        signal,
        stdout,
        stderr,
        diagnostic: `exit=${code} signal=${signal ?? 'none'}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
      });
    });
  });
}
