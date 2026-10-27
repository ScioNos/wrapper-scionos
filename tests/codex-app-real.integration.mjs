import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { detectCodexApp } from '../src/platform/codex-app-desktop.js';
import { CodexAppConfigSession, codexAppPaths } from '../src/platform/codex-app-config.js';
import { installCodexAppRuntime } from '../src/platform/codex-app-runtime.js';
import { runTestProcess, spawnTestProcess, waitForTestChild, removeTestDirectory, closeTestServer } from './support/lifecycle.mjs';
import { terminateChildTree } from '../src/platform/process.js';

const MODEL = 'gpt-6.1-sol';
const TOKEN = 'scionos-local-app-test-credential-only';

test('embedded App engine loads the preserved TOML, command auth and catalogue, runs a tool and a follow-up over Responses', { timeout: 60000 }, async t => {
  const app = detectCodexApp();
  if (!app.supported || !app.installed) { t.skip('Codex App is unavailable on this host; embedded-engine validation requires an installed Windows/macOS app.'); return; }
  assert.equal(app.installed, true, 'Install Codex App to run its native integration check.');
  assert.equal(app.versionSupported, true);
  t.diagnostic(`App ${app.version}; engine ${app.engineVersion}; isolated CODEX_HOME, loopback only`);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scionos-native-app-'));
  const paths = codexAppPaths({ env: { CODEX_HOME: path.join(directory, 'home') }, root: path.join(directory, 'state') });
  const credentials = path.join(directory, 'credentials');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(OPENAI_|ROUTERLAB_|WRAPPER_SCIONOS_|ANTHROPIC_)/i.test(key)));
  Object.assign(env, { CODEX_HOME: path.dirname(paths.configPath), NO_COLOR: '1' });
  const requests = [];
  const server = http.createServer((req, res) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      if (req.url !== '/v1/responses' || req.method !== 'POST') { res.writeHead(404); res.end(); return; }
      const body = JSON.parse(data);
      requests.push({ body, auth: req.headers.authorization });
      const tool = requests.length === 1;
      const item = tool ? { type: 'function_call', id: 'fc_app_test', call_id: 'call_app_test', name: 'shell_command',
        arguments: JSON.stringify({ command: 'echo scionos-app-tool-ok', workdir: directory, timeout_ms: 1000 }), status: 'completed' }
        : { type: 'message', id: 'msg_app_' + requests.length, role: 'assistant', status: 'completed',
          content: [{ type: 'output_text', text: 'scionos-app-response-ok', annotations: [], logprobs: [] }] };
      const response = { id: 'resp_app_' + requests.length, object: 'response', created_at: Math.floor(Date.now() / 1000),
        status: 'completed', model: MODEL, output: [item], error: null, incomplete_details: null,
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } };
      res.writeHead(200, { 'content-type': 'text/event-stream', connection: 'close' });
      for (const [event, fields] of [['response.created', { response: { ...response, status: 'in_progress', output: [] } }],
        ['response.output_item.done', { output_index: 0, item }], ['response.completed', { response }]]) {
        res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...fields })}\n\n`);
      }
      res.end('data: [DONE]\n\n');
    });
  });
  let child;
  const session = new CodexAppConfigSession(paths);
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    fs.mkdirSync(path.dirname(paths.configPath), { recursive: true });
    const original = '# preserved native test\n[features]\napps = false\n';
    fs.writeFileSync(paths.configPath, original);
    const runtime = installCodexAppRuntime(paths, { models: [MODEL, 'gpt-6-luna'], tokenDirectory: credentials });
    if (process.platform === 'win32') {
      const moduleUrl = new URL('../src/security/token-store.js', import.meta.url).href;
      const stored = await runTestProcess(process.execPath, ['--input-type=module', '-e',
        `import {storeToken} from ${JSON.stringify(moduleUrl)}; storeToken(${JSON.stringify(TOKEN)},'routerlab');`],
      { env: { ...env, WRAPPER_SCIONOS_TOKEN_DIR: credentials } });
      assert.equal(stored.code, 0, stored.stderr);
      const helper = await runTestProcess(process.execPath, [runtime.helperPath, 'routerlab'], { env });
      assert.equal(helper.code, 0, helper.stderr);
      assert.equal(helper.stdout.trim(), TOKEN);
    } else {
      // macOS secure-store behavior is covered by test:keychain-real; never replace a personal keychain entry.
      fs.writeFileSync(runtime.helperPath, `process.stdout.write(${JSON.stringify(TOKEN)});\n`);
    }
    session.activate({ providerId: 'scionos_routerlab', service: 'routerlab', model: MODEL,
      cataloguePath: runtime.cataloguePath, nodePath: process.execPath, helperPath: runtime.helperPath,
      baseUrl: `http://127.0.0.1:${server.address().port}/v1` });
    assert.ok(!fs.readFileSync(paths.configPath, 'utf8').includes(TOKEN));
    assert.ok(!fs.readFileSync(paths.journalPath, 'utf8').includes(TOKEN));
    child = spawnTestProcess(app.enginePath, ['app-server'], { env, cwd: directory, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = ''; let stderr = ''; let next = 0;
    const pending = new Map(); const completions = []; const turns = [];
    const failPending = error => { for (const item of pending.values()) item.reject(error); pending.clear(); };
    child.once('error', failPending);
    child.once('exit', () => failPending(new Error('Embedded app-server stopped: ' + stderr)));
    child.stderr.on('data', value => { stderr += value; });
    child.stdout.on('data', chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        if (!line.trim()) continue;
        const message = JSON.parse(line);
        if (pending.has(message.id)) {
          const { resolve, reject } = pending.get(message.id); pending.delete(message.id);
          if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result);
        }
        if (message.method === 'turn/completed') { turns.push(message.params.turn); completions.shift()?.(message.params.turn); }
      }
    });
    const rpc = (method, params) => new Promise((resolve, reject) => {
      const id = next++;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out: ' + stderr)); }, 10000);
      timer.unref();
      pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
    const completed = async () => {
      const turn = await Promise.race([new Promise(resolve => { completions.push(resolve); }),
        new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('App turn timed out: ' + stderr)), 25000); timer.unref(); })]);
      assert.equal(turn.status, 'completed', JSON.stringify(turn.error) + stderr);
    };
    await rpc('initialize', { clientInfo: { name: 'scionos-app-test', version: '8.0.0' }, capabilities: { experimentalApi: true } });
    child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
    const list = await rpc('model/list', { limit: 100, includeHidden: false });
    assert.deepEqual(list.data.map(item => item.model), [MODEL, 'gpt-6-luna']);
    const thread = await rpc('thread/start', { model: MODEL, modelProvider: 'scionos_routerlab', cwd: directory,
      approvalPolicy: 'never', sandbox: 'read-only', experimentalRawEvents: false, persistExtendedHistory: false });
    let done = completed();
    done.catch(() => {});
    await rpc('turn/start', { threadId: thread.thread.id, input: [{ type: 'text', text: 'Run echo scionos-app-tool-ok, then reply.' }] });
    await done;
    done = completed();
    done.catch(() => {});
    await rpc('turn/start', { threadId: thread.thread.id, input: [{ type: 'text', text: 'Reply again using the previous conversation.' }] });
    await done;
    assert.equal(requests.length, 3);
    assert.ok(requests.every(item => item.auth === 'Bearer ' + TOKEN && item.body.model === MODEL));
    assert.ok(requests[1].body.input.some(item => item.type === 'function_call_output' && item.call_id === 'call_app_test'));
    assert.ok(requests[2].body.input.some(item => item.type === 'message' && JSON.stringify(item).includes('previous conversation')));
    assert.equal(turns.length, 2);
    session.restore();
    assert.equal(fs.readFileSync(paths.configPath, 'utf8'), original);
  } finally {
    if (child) { child.stdin.end(); terminateChildTree(child); await waitForTestChild(child); }
    await closeTestServer(server);
    await removeTestDirectory(directory);
  }
});
