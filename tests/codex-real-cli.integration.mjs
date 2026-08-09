import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import {
  buildCodexRuntimeArgs,
  cleanupCodexRuntimeModelCatalog,
  writeCodexRuntimeModelCatalog,
} from '../src/apps/codex.js';
import { detectCodexCli } from '../src/platform/detect.js';
import { buildInteractiveCliInvocation } from '../src/platform/process.js';

const MODEL = 'gpt-5.6-sol';
const CATALOG_MODELS = [MODEL, 'qwen3.8-max'];
const CATALOG_LABELS = ['GPT 5.6 Sol', 'Qwen 3.8 Max'];
const LOCAL_API_KEY = 'local-codex-smoke-token-with-enough-length';

test('installed Codex uses the temporary RouterLab catalog and direct Responses transport', {
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
  let catalog = null;
  let catalogPath = null;

  try {
    server = createResponsesServer(requests);
    await listenOnLoopback(server);
    const address = server.address();
    assert.equal(typeof address, 'object');
    assert.equal(address.address, '127.0.0.1');
    const baseUrl = `http://127.0.0.1:${address.port}/v1`;
    catalog = writeCodexRuntimeModelCatalog({
      models: CATALOG_MODELS,
      modelMetadata: [
        { id: MODEL, displayName: CATALOG_LABELS[0] },
        { id: 'qwen3.8-max', displayName: CATALOG_LABELS[1] },
      ],
      tmpDir: tempDir,
    });
    catalogPath = catalog.path;
    assert.equal(fs.existsSync(catalogPath), true);

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
        modelCatalogPath: catalogPath,
      }),
      'Reply with exactly codex-smoke-ok and do not call tools.',
    ];
    const catalogOverride = `model_catalog_json=${JSON.stringify(catalogPath)}`;
    assert.equal(args.includes(catalogOverride), true);

    const listedModels = await listCodexModels(
      codex.cliPath,
      [
        ...buildCodexRuntimeArgs({
          providerName: 'routerlab-local-smoke',
          baseUrl,
          model: MODEL,
          modelCatalogPath: catalogPath,
        }),
        'app-server',
      ],
      {
        ...process.env,
        CODEX_HOME: codexHome,
        OPENAI_API_KEY: LOCAL_API_KEY,
        NO_COLOR: '1',
      },
    );
    assert.deepEqual(listedModels.data.map((entry) => entry.model), CATALOG_MODELS);
    assert.deepEqual(listedModels.data.map((entry) => entry.displayName), CATALOG_LABELS);
    assert.deepEqual(
      listedModels.data.map((entry) => entry.isDefault),
      [true, false],
    );
    assert.equal(fs.existsSync(catalogPath), true);

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
    assert.equal(fs.existsSync(catalogPath), true);
  } finally {
    await closeServer(server);
    cleanupCodexRuntimeModelCatalog(catalog);
    if (catalogPath) assert.equal(fs.existsSync(catalogPath), false);
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

async function listCodexModels(command, args, env) {
  const invocation = buildInteractiveCliInvocation(command, args);
  const child = spawn(invocation.command, invocation.args, {
    cwd: process.cwd(),
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    ...(invocation.spawnOptions ?? {}),
  });
  let stdout = '';
  let stderr = '';
  let buffer = '';
  let initialized = false;
  let settled = false;
  let timer = null;

  try {
    return await new Promise((resolve, reject) => {
      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const succeed = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const diagnostic = () => `stdout:\n${stdout}\nstderr:\n${stderr}`;

      child.once('error', fail);
      child.once('exit', (code, signal) => {
        fail(new Error(`Codex app-server exited before model/list completed (${code ?? signal}).\n${diagnostic()}`));
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        stdout += text;
        buffer += text;
        let newline;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;

          let message;
          try {
            message = JSON.parse(line);
          } catch {
            continue;
          }
          if (message.id === 0 && !initialized) {
            initialized = true;
            child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`);
            child.stdin.write(`${JSON.stringify({
              method: 'model/list',
              id: 1,
              params: { limit: 100, includeHidden: false },
            })}\n`);
          } else if (message.id === 1) {
            if (message.error) {
              fail(new Error(`Codex model/list failed: ${JSON.stringify(message.error)}\n${diagnostic()}`));
            } else {
              succeed(message.result);
            }
          }
        }
      });

      timer = setTimeout(() => {
        fail(new Error(`Codex app-server model/list timed out.\n${diagnostic()}`));
      }, 30000);
      timer.unref?.();

      child.stdin.write(`${JSON.stringify({
        method: 'initialize',
        id: 0,
        params: {
          clientInfo: {
            name: 'wrapper-scionos-smoke',
            title: 'wrapper-scionos smoke test',
            version: '5.0.0',
          },
          capabilities: null,
        },
      })}\n`);
    });
  } finally {
    if (timer) clearTimeout(timer);
    child.stdin.end();
    terminateChildTree(child);
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
