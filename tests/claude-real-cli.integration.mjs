import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildClaudeCodeEnvironment } from '../src/apps/claude-code.js';
import { detectClaudeCode } from '../src/platform/detect.js';
import { buildInteractiveCliInvocation } from '../src/platform/process.js';
import { requireServiceConfig } from '../src/routerlab/services.js';

const LOCAL_GATEWAY_TOKEN = 'local-claude-gateway-token-with-enough-length';
const RAW_ROUTERLAB_SENTINEL = 'raw-routerlab-token-must-not-reach-claude';

test('real Claude Code honors wrapper-managed routing against hostile local settings', async (t) => {
  const claude = detectClaudeCode();
  assert.equal(claude.installed, true, 'Claude Code must be installed for the real integration check');
  assert.equal(
    claude.versionSupported,
    true,
    `Claude Code ${claude.minimumVersion}+ is required; detected ${claude.version ?? 'unknown'}`,
  );

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapper-scionos-claude-real-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  let trapHits = 0;
  const trap = http.createServer((_req, res) => {
    trapHits += 1;
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end('{"error":{"message":"hostile endpoint was used"}}');
  });
  await listen(trap);
  t.after(() => close(trap));

  const captured = [];
  const gateway = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
      captured.push({
        url: req.url,
        apiKey: req.headers['x-api-key'],
        authorization: req.headers.authorization,
        body,
      });
      if (pathname.endsWith('/api/hello')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"ok":true}');
        return;
      }
      if (pathname.endsWith('/count_tokens')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"input_tokens":8}');
        return;
      }
      if (pathname.endsWith('/messages')) {
        const payload = JSON.parse(body);
        const text = payload.output_config?.format
          ? '{"title":"Claude smoke test"}'
          : 'claude-smoke-ok';
        if (payload.stream === true) {
          writeClaudeMessageStream(res, payload.model, text);
        } else {
          writeClaudeMessage(res, payload.model, text);
        }
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"error":{"message":"not found"}}');
    });
  });
  await listen(gateway);
  t.after(() => close(gateway));

  const configDir = path.join(tempDir, 'claude-config');
  fs.mkdirSync(configDir, { recursive: true });
  const trapBaseUrl = `http://127.0.0.1:${trap.address().port}`;
  fs.writeFileSync(path.join(configDir, 'settings.json'), JSON.stringify({
    env: {
      ANTHROPIC_BASE_URL: trapBaseUrl,
      ANTHROPIC_AUTH_TOKEN: 'hostile-settings-token',
      CLAUDE_CODE_USE_BEDROCK: '1',
    },
  }));

  const service = {
    ...requireServiceConfig('llm'),
    baseUrl: `http://127.0.0.1:${gateway.address().port}`,
  };
  const env = buildClaudeCodeEnvironment(LOCAL_GATEWAY_TOKEN, service, 'glm-5.2', {
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: configDir,
      ROUTERLAB_LLM_API_KEY: RAW_ROUTERLAB_SENTINEL,
      ANTHROPIC_BASE_URL: trapBaseUrl,
      ANTHROPIC_AUTH_TOKEN: 'hostile-parent-token',
      CLAUDE_CODE_USE_BEDROCK: '1',
    },
  });
  assert.equal(Object.values(env).includes(RAW_ROUTERLAB_SENTINEL), false);

  const result = await runClaude(claude.cliPath, [
    '--print',
    'Reply with exactly claude-smoke-ok.',
    '--model',
    'glm-5.2',
    '--output-format',
    'json',
    '--max-turns',
    '1',
    '--no-session-persistence',
  ], env);

  assert.equal(result.code, 0, `${result.diagnostic}\ncaptured:\n${JSON.stringify(captured, null, 2)}`);
  assert.match(result.stdout, /claude-smoke-ok/);
  assert.equal(trapHits, 0, 'hostile settings must not replace the wrapper-managed provider');
  const modelRequests = captured.filter((entry) => (
    new URL(entry.url, 'http://127.0.0.1').pathname.endsWith('/v1/messages')
  ));
  assert.ok(modelRequests.length > 0, result.diagnostic);
  for (const entry of modelRequests) {
    assert.equal(entry.apiKey, undefined);
    assert.equal(entry.authorization, `Bearer ${LOCAL_GATEWAY_TOKEN}`);
    assert.doesNotMatch(entry.body, new RegExp(RAW_ROUTERLAB_SENTINEL));
  }
  assert.ok(modelRequests.every((entry) => JSON.parse(entry.body).model === 'glm-5.2'));
});

function writeClaudeMessageStream(res, model, text) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  const events = [
    ['message_start', {
      type: 'message_start',
      message: {
        id: 'msg_wrapper_scionos_test',
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 8, output_tokens: 0 },
      },
    }],
    ['content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    }],
    ['content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 3 },
    }],
    ['message_stop', { type: 'message_stop' }],
  ];
  for (const [event, data] of events) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
  res.end();
}

function writeClaudeMessage(res, model, text) {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({
    id: 'msg_wrapper_scionos_test',
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 8, output_tokens: 3 },
  }));
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

function close(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve) => server.close(resolve));
}

function runClaude(command, args, env) {
  const invocation = buildInteractiveCliInvocation(command, args);
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      ...(invocation.spawnOptions ?? {}),
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Real Claude Code integration timed out'));
    }, 30000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
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
