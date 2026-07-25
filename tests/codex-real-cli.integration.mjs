import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { buildCodexRuntimeArgs } from '../src/apps/codex.js';
import { detectCodexCli } from '../src/platform/detect.js';
import { buildInteractiveCliInvocation } from '../src/platform/process.js';

const MODEL = 'gpt-5.6-sol';
const LOCAL_API_KEY = 'local-codex-smoke-token-with-enough-length';

test('installed Codex accepts the native RouterLab provider configuration without a catalog', {
  timeout: 45000,
}, async (t) => {
  const codex = detectCodexCli();
  assert.equal(codex.installed, true, 'The official Codex CLI must be installed for this validation');
  assert.equal(codex.versionSupported, true, `Unsupported Codex CLI version: ${codex.version ?? 'unknown'}`);
  t.diagnostic(`Validating ${codex.version}`);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapper-scionos-codex-real-'));
  const codexHome = path.join(tempDir, 'codex-home');
  fs.mkdirSync(codexHome, { recursive: true });
  const requests = [];
  let server = null;

  try {
    server = createResponsesServer(requests);
    await listenOnLoopback(server);
    const address = server.address();
    assert.equal(typeof address, 'object');
    assert.equal(address.address, '127.0.0.1');
    const baseUrl = `http://127.0.0.1:${address.port}/v1`;

    const args = [
      'exec',
      '--ephemeral',
      '--ignore-user-config',
      '--ignore-rules',
      '--skip-git-repo-check',
      '--sandbox',
      'read-only',
      '--color',
      'never',
      '--json',
      '--cd',
      tempDir,
      ...buildCodexRuntimeArgs({
        providerName: 'routerlab-local-smoke',
        baseUrl,
        model: MODEL,
      }),
      'Reply with exactly codex-smoke-ok and do not call tools.',
    ];
    const result = await runCodex(codex.cliPath, args, {
      ...process.env,
      CODEX_HOME: codexHome,
      OPENAI_API_KEY: LOCAL_API_KEY,
      NO_COLOR: '1',
    });

    assert.equal(result.signal, null, result.diagnostic);
    assert.equal(result.code, 0, result.diagnostic);
    assert.match(result.stdout, /codex-smoke-ok/, result.diagnostic);
    assert.equal(requests.length, 1, result.diagnostic);

    const request = requests[0];
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/v1/responses');
    assert.equal(request.authorization, `Bearer ${LOCAL_API_KEY}`);
    assert.equal(request.body.model, MODEL);
    assert.equal(args.some((argument) => argument.includes('model_catalog_json')), false);
  } finally {
    await closeServer(server);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function createResponsesServer(requests) {
  return http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (req.method !== 'POST' || req.url !== '/v1/responses') {
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
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization ?? null,
        body,
      });
      sendCompletedResponse(res, body);
    });
  });
}

function sendCompletedResponse(res, requestBody) {
  const item = {
    id: 'msg_wrapper_scionos_smoke',
    type: 'message',
    status: 'completed',
    role: 'assistant',
    content: [{
      type: 'output_text',
      annotations: [],
      logprobs: [],
      text: 'codex-smoke-ok',
    }],
  };
  const response = {
    id: 'resp_wrapper_scionos_smoke',
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    background: false,
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: null,
    max_tool_calls: null,
    model: requestBody.model,
    output: [item],
    parallel_tool_calls: requestBody.parallel_tool_calls,
    previous_response_id: null,
    prompt_cache_key: null,
    reasoning: requestBody.reasoning ?? { effort: null, summary: null },
    safety_identifier: null,
    service_tier: 'default',
    store: false,
    temperature: null,
    text: { format: { type: 'text' }, verbosity: 'low' },
    tool_choice: 'auto',
    tools: requestBody.tools ?? [],
    top_logprobs: 0,
    top_p: null,
    truncation: 'disabled',
    usage: {
      input_tokens: 10,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 3,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 13,
    },
    user: null,
    metadata: {},
  };

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'close',
  });
  writeSse(res, 'response.output_item.done', {
    type: 'response.output_item.done',
    sequence_number: 1,
    output_index: 0,
    item,
  });
  writeSse(res, 'response.completed', {
    type: 'response.completed',
    sequence_number: 2,
    response,
  });
  res.end('data: [DONE]\n\n');
}

function writeSse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function listenOnLoopback(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

async function closeServer(server) {
  if (!server) return;
  server.closeAllConnections?.();
  if (server.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function runCodex(command, args, env) {
  const invocation = buildInteractiveCliInvocation(command, args);
  const child = spawn(invocation.command, invocation.args, {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    ...(invocation.spawnOptions ?? {}),
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  let timer = null;
  try {
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
      timer = setTimeout(() => {
        terminateChildTree(child);
        reject(new Error(`Codex validation timed out.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
      }, 30000);
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
