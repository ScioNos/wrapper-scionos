import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { handleCodexApp, selectCodexAppConfiguration, launchCodexAppFromMenu } from '../src/cli/commands/codex-app.js';
import { createLinearAppSession } from '../src/cli/console/linear-app.js';
import { handleInteractiveMenu, main } from '../src/cli/main.js';
import { parseOptions } from '../src/cli/args.js';
import { removeTestDirectory, waitForTestChild } from './support/lifecycle.mjs';
import { terminateChildTree } from '../src/platform/process.js';

const selection = { family: 'claude-gpt', model: 'gpt-6.1-sol' };
const catalogue = { defaultModel: selection.model, families: [{ value: selection.family, name: 'GPT', defaultModel: selection.model, models: [{ model: selection.model }] }] };
function fixture() {
  const calls = { launches: 0, restores: [], closes: 0, shutdowns: 0 };
  let active = false;
  const integration = {
    prepare: async () => catalogue, preview: async value => ({ dryRun: true, ...value }),
    launch: async () => { calls.launches++; active = true; return { opened: true, requiresRestart: true }; },
    status: () => ({ running: true, configured: active }),
    restore: value => { calls.restores.push(value); return { restored: !value?.dryRun }; },
    hasSession: () => active,
    shutdown: () => { calls.shutdowns++; active = false; return { restored: true }; },
    close: () => { calls.closes++; return { requested: false }; },
  };
  return { integration, calls };
}
async function captured(operation) {
  const original = console.log;
  const lines = [];
  console.log = value => lines.push(value);
  try { await operation(); return lines; } finally { console.log = original; }
}

test('Codex App selectors honor explicit choices and reject unavailable families or models', async () => {
  const { integration, calls } = fixture();
  assert.deepEqual(await selectCodexAppConfiguration(integration, { noPrompt: true }), selection);
  assert.deepEqual(await selectCodexAppConfiguration(integration, {}, { select: async (_message, choices) => choices[0].value }), selection);
  assert.deepEqual(await selectCodexAppConfiguration(integration, { model: selection.model, noPrompt: true }), selection);
  await assert.rejects(selectCodexAppConfiguration(integration, { strategy: 'open-source', model: selection.model, noPrompt: true }), { code: 'model_unavailable' });
  await assert.rejects(selectCodexAppConfiguration(integration, { model: 'removed', noPrompt: true }), { code: 'model_unavailable' });
  const options = { noPrompt: true, language: 'fr' };
  assert.ok((await launchCodexAppFromMenu({ ...options, dryRun: true }, { integration })).preview);
  assert.ok((await launchCodexAppFromMenu(options, { integration, confirm: async () => false })).cancelled);
  await launchCodexAppFromMenu({ ...options, yes: true }, { integration });
  assert.equal(calls.launches, 1);
});

test('Codex App command keeps JSON envelopes, requires explicit mutation and preserves usage errors', async () => {
  const { integration, calls } = fixture();
  const options = { json: true, command: 'codex-app:status' };
  const lines = await captured(async () => {
    await handleCodexApp('status', options, { integration });
    await handleCodexApp('restore', options, { integration });
    await handleCodexApp('restore', { ...options, yes: true }, { integration });
    await handleCodexApp('launch', { ...options, noPrompt: true, dryRun: true }, { integration });
    await handleCodexApp('launch', { ...options, dryRun: true }, { integration, interactive: true, select: async () => { throw new Error('JSON must not prompt'); } });
  });
  assert.ok(lines.every(line => JSON.parse(line).ok));
  assert.deepEqual(calls.restores, [{ dryRun: true, recover: true }, { recover: true }]);
  assert.equal(calls.launches, 0);
  await assert.rejects(handleCodexApp('launch', options, { integration }), { exitCode: 2 });
  await assert.rejects(handleCodexApp('launch', { noPrompt: true }, { integration, interactive: false }), { exitCode: 2 });
  await assert.rejects(handleCodexApp('oops', options, { integration }), { exitCode: 2 });
  for (const args of [['codex-app', 'launch', '--token', 'forbidden'], ['codex-app', 'status', '--yes'], ['codex-app', 'restore', 'extra'], ['codex-app', 'launch', '--', 'exec']]) {
    await assert.rejects(main(args), { exitCode: 2 });
  }
  await assert.rejects(handleCodexApp('restore', { language: 'fr', yes: true }, { integration: { restore() { throw Object.assign(new Error('private detail'), { code: 'restore_conflict' }); } } }), /modifications sont conservées/);
});

test('direct App launch remains active and restores on SIGTERM or SIGINT; interactive exit can be cancelled', async () => {
  for (const [signal, interactive] of [['SIGTERM', false], ['SIGINT', false], ['SIGINT', true]]) {
    const { integration, calls } = fixture();
    const signals = new EventEmitter(); const exitState = {};
    const launch = integration.launch;
    integration.launch = async () => { const result = await launch(); setImmediate(() => signals.emit(signal)); return result; };
    await captured(() => handleCodexApp('launch', { noPrompt: true, yes: true }, { integration, signalSource: signals, exitState, interactive }));
    assert.equal(calls.shutdowns, 1); assert.equal(calls.closes, 0);
    assert.equal(exitState.exitCode, signal === 'SIGTERM' ? 143 : 130);
    assert.equal(signals.listenerCount(signal), 0);
  }
  const { integration, calls } = fixture();
  const signals = new EventEmitter();
  const launch = integration.launch;
  integration.launch = async () => { const result = await launch(); setImmediate(() => signals.emit('SIGINT')); return result; };
  let dialogs = 0;
  await captured(() => handleCodexApp('launch', { strategy: selection.family, model: selection.model, yes: true }, { integration, signalSource: signals, exitState: {}, interactive: true,
    select: async () => { if (++dialogs === 1) { setImmediate(() => signals.emit('SIGINT')); return 'cancel'; } return 'close'; },
  }));
  assert.equal(dialogs, 2); assert.equal(calls.closes, 1); assert.equal(calls.shutdowns, 1);
  const broken = fixture();
  broken.integration.launch = async () => { throw new Error('opening failed'); };
  await assert.rejects(handleCodexApp('launch', { noPrompt: true, yes: true }, { integration: broken.integration }), /opening failed/);
});

test('linear App menu keeps navigation available and uses graceful closure, cancellation and signal cleanup', async () => {
  const { integration, calls } = fixture();
  const signals = new EventEmitter(); const processState = {};
  const choices = ['cancel', 'close'];
  const app = createLinearAppSession(parseOptions(['--no-prompt', '--yes']), { askMenu: async () => 'back' }, {
    integration, signals, processState, select: async () => choices.shift(), confirm: async () => true,
  });
  await captured(async () => {
    await app.action('launch');
    assert.equal(await app.menu('Home', [], {}), 'back');
    assert.equal(await app.exit(), false); assert.equal(await app.exit(), true);
    await app.action('status'); await app.action('restore');
    await app.native(async () => { signals.emit('SIGINT'); assert.equal(app.signal().aborted, false); });
    signals.emit('SIGTERM'); assert.equal(app.terminating(), true);
    await app.shutdown();
  });
  assert.equal(calls.closes, 1); assert.equal(processState.exitCode, 143);
  assert.equal(signals.listenerCount('SIGTERM'), 0);
});

test('linear home routes Codex App separately and restores before returning from the wrapper', async () => {
  const { integration, calls } = fixture();
  const signals = new EventEmitter();
  const actions = ['claude-cowork', 'back', 'codex-app', 'launch', 'back', 'quit'];
  await captured(() => handleInteractiveMenu(parseOptions(['--yes', '--no-prompt']), {
    askMenu: async (_title, _items, options) => { assert.ok(options.signal); return actions.shift(); },
    linearAppDependencies: { integration, signals, processState: {}, select: async () => 'keep' },
  }));
  assert.equal(actions.length, 0); assert.equal(calls.launches, 1); assert.equal(calls.shutdowns, 1);
  assert.equal(signals.listenerCount('SIGINT'), 0);
  const interrupted = fixture();
  let menus = 0;
  await captured(() => handleInteractiveMenu(parseOptions([]), {
    askMenu: async () => { if (++menus === 1) return 'auth'; return 'login'; },
    handleAuth: async () => { throw Object.assign(new Error(), { name: 'ExitPromptError' }); },
    linearAppDependencies: { integration: interrupted.integration, signals, processState: {}, select: async () => 'keep' },
  }));
  assert.equal(interrupted.calls.shutdowns, 1);
});

test('redirected direct App launch stays alive without a foreground client and restores on shutdown', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scionos-direct-app-'));
  const configPath = path.join(directory, 'home', 'config.toml');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, '# personal configuration\n');
  const child = spawn(process.execPath, [fileURLToPath(new URL('./support/codex-app-direct.mjs', import.meta.url)), directory], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
  });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', value => { stdout += value; }); child.stderr.on('data', value => { stderr += value; });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('App fixture did not start: ' + stderr)), 5000);
      const ready = () => { if (stdout.includes('Keep ScioNos open')) { clearTimeout(timer); child.stdout.off('data', ready); resolve(); } };
      child.stdout.on('data', ready); ready();
    });
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(child.exitCode, null, 'A detached GUI must not let the wrapper exit before restoration.');
    assert.match(fs.readFileSync(configPath, 'utf8'), /scionos_routerlab/);
    child.send('SIGTERM');
    await waitForTestChild(child);
    assert.equal(child.exitCode, 143, stderr);
    assert.equal(fs.readFileSync(configPath, 'utf8'), '# personal configuration\n');
  } finally {
    terminateChildTree(child); await waitForTestChild(child); await removeTestDirectory(directory);
  }
});
