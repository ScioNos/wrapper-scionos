import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import width from 'fast-string-width';
import { stripVTControlCharacters } from 'node:util';
import { createConsoleState, initializeSelection, runStructuredConsole, selectFamily } from '../src/cli/console/controller.js';
import { normalizePreferences, loadPreferences, savePreferences, rememberSelection, sanitizeSelection, preferencesPath } from '../src/cli/console/preferences.js';
import { buildConsoleView, canLaunch, clientStatus, tokenLabel } from '../src/cli/console/view.js';
import { renderConsole, fitText, cleanText, consoleLayout } from '../src/cli/console/render.js';
import { consolePrompt, moveCursor, supportsStructuredConsole } from '../src/cli/console/prompt.js';
import { collectInspection, desktopSnapshot, startInspection } from '../src/cli/console/inspect.js';
import { UI_TEXT_KEYS, uiText } from '../src/cli/console/i18n.js';
import { removeTestDirectory } from './support/lifecycle.mjs';
import { createConsoleInput } from '../src/cli/console/input.js';

const EMPTY = () => normalizePreferences(null);
const CODE_MODEL = 'aws-claude-haiku-4-5';
const catalogue = (client = 'claude-code') => client === 'claude-code' ? {
  models: [CODE_MODEL], tokenSource: 'secure-storage',
  families: [{ value: 'aws', name: 'AWS Claude', defaultSubagent: CODE_MODEL },
    { value: 'trial', name: 'Trial', fixedSubagent: CODE_MODEL, defaultSubagent: CODE_MODEL },
    { value: 'default', name: 'Claude Native', disabled: 'not authorized' }],
  subagents: [CODE_MODEL, 'gpt-6-luna'],
} : {
  models: ['gpt-6.1-sol', 'kimi-k3'], tokenSource: 'secure-storage', defaultModel: 'gpt-6.1-sol',
  families: [{ value: 'claude-gpt', name: 'OpenAI GPT', defaultModel: 'gpt-6.1-sol', models: [{ model: 'gpt-6.1-sol' }] },
    { value: 'open-source', name: 'Open Source', defaultModel: 'missing-preferred', models: [{ model: 'kimi-k3' }] }],
};
const makeState = (language = 'fr') => createConsoleState({ service: 'routerlab', language }, EMPTY(), '8.0.0');
const desktop = () => ({ supported: true, applied: true, healthy: true, service: 'routerlab', profileExists: true,
  families: ['default', 'aws'], routes: [{ routeId: 'opus-aws', upstreamModel: 'aws-claude-opus-5-5' }] });

async function fixture(actions, overrides = {}) {
  const calls = { prepared: [], launched: [], saved: [], starts: [], stops: 0, restores: 0, logins: 0, logouts: 0, inspections: 0 };
  const signals = new EventEmitter();
  const output = Object.assign(new PassThrough(), { isTTY: true, columns: 120, rows: 35 });
  output.resume();
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false,
    setRawMode(value) { this.isRaw = value; } });
  const processState = {};
  let profile = desktop();
  const services = {
    async prepare(client) {
      calls.prepared.push(client);
      return { ...catalogue(client), execute: async (selection, hooks) => {
        calls.launched.push({ client, ...selection });
        hooks.onSpawn();
        return overrides.childCode ?? 0;
      } };
    },
    async login() { calls.logins++; },
    logout() { calls.logouts++; },
    tokenStatus: () => ({ stored: true, env: true, supported: true, backend: 'fixture' }),
    verify: async () => {},
    desktopStatus: () => ({ ...profile }),
    planDesktop: () => ({ requiresConfirmation: true }),
    async startDesktop(configuration, logger) {
      calls.starts.push(configuration);
      profile = { ...profile, applied: true, healthy: true, families: configuration.strategyValues ?? profile.families };
      const server = new EventEmitter();
      logger.log('proxy ready');
      const session = { server, active: true, async stop() { calls.stops++; session.active = false; } };
      overrides.onSession?.(session);
      return session;
    },
    restoreDesktop() { calls.restores++; profile = { ...profile, applied: false, families: [], routes: [] }; },
    ...overrides.services,
  };
  const queue = actions.flatMap((action) => action.action === 'launch'
    ? [action, (state) => { assert.equal(state.dialog.kind, 'launch'); return { action: 'confirm' }; }]
    : [action]);
  const state = await runStructuredConsole({ service: overrides.service ?? 'routerlab', language: 'fr', ...overrides.options }, {
    output, input, signalSource: signals, processState, services, version: '8.0.0',
    loadPreferences: () => ({ value: overrides.preferences ?? EMPTY(), warning: overrides.warning ?? null }),
    savePreferences: (value) => { calls.saved.push(structuredClone(value)); return overrides.saveResult ?? { ok: true }; },
    startInspection: (_service, notify) => {
      calls.inspections++;
      notify({ clients: { codex: { installed: true, versionSupported: true, version: '1.0' } },
        token: { stored: true, supported: true }, desktop: profile });
      return { done: Promise.resolve({ error: overrides.inspectionError ?? null }), stop: async () => {} };
    },
    prompt: async ({ state, events }, context) => {
      assert.ok(events instanceof EventEmitter);
      assert.ok(context.clearPromptOnDone);
      assert.ok(queue.length, 'The controller should have returned to an actionable screen');
      const entry = queue.shift();
      return typeof entry === 'function' ? entry(state, { signals, calls, services, output, input }) : entry;
    },
  });
  assert.equal(signals.listenerCount('SIGINT'), 0);
  assert.equal(signals.listenerCount('SIGTERM'), 0);
  assert.equal(input.isRaw, false);
  input.destroy(); output.destroy();
  return { state, calls, processState, queue };
}

test('preferences persist only permitted selections, isolate services, and recover from damaged files', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scionos-ui-'));
  const file = path.join(directory, 'ui-state.json');
  try {
    assert.equal(loadPreferences(file).warning, null);
    assert.ok(preferencesPath().endsWith(path.join('.wrapper-scionos', 'ui-state.json')));
    let preferences = rememberSelection(EMPTY(), 'routerlab', 'claude-code', { family: 'aws', subagent: CODE_MODEL, token: 'secret', journal: ['secret'] });
    preferences = rememberSelection(preferences, 'llm', 'codex', { family: 'claude-gpt', model: 'gpt-5.6-sol' });
    assert.equal(savePreferences(preferences, file).ok, true);
    const saved = loadPreferences(file).value;
    assert.equal(saved.services.routerlab.lastClient, 'claude-code');
    assert.equal(saved.services.llm.clients.codex.model, 'gpt-5.6-sol');
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /secret|token|journal/);
    assert.deepEqual(rememberSelection(saved, 'other', 'codex', { family: 'aws' }), saved);
    assert.deepEqual(rememberSelection(saved, 'routerlab', 'other', { family: 'aws' }), saved);
    assert.equal(sanitizeSelection({ family: '\x1b[31msecret' }), null);
    assert.equal(sanitizeSelection({ family: 'x'.repeat(300) }), null);
    assert.equal(sanitizeSelection(null), null);
    fs.writeFileSync(file, '{');
    assert.equal(loadPreferences(file).warning, 'preferencesInvalid');
    fs.writeFileSync(file, '{"version":9}');
    assert.equal(loadPreferences(file).warning, 'preferencesInvalid');
    assert.equal(loadPreferences(file, { readFileSync() { throw Object.assign(new Error(), { code: 'EACCES' }); } }).warning, 'preferencesInvalid');
    assert.equal(savePreferences(saved, file, { mkdirSync() { throw new Error('denied'); }, unlinkSync() {} }).warning, 'preferencesWriteFailed');
    const calls = [];
    assert.equal(savePreferences(saved, file, { mkdirSync() {}, writeFileSync() {}, renameSync() { throw new Error(); }, unlinkSync(value) { calls.push(value); } }).ok, false);
    assert.equal(calls.length, 1);
    assert.deepEqual(normalizePreferences({ version: 1, services: { routerlab: {}, llm: { clients: { codex: { model: 'x' } } } } }).services.llm.clients, {});
  } finally { await removeTestDirectory(directory); }
});

test('every console label exists in three languages and rendering fits narrow and wide terminals', () => {
  for (const language of ['en', 'fr', 'de']) for (const key of UI_TEXT_KEYS) {
    if (language === 'en' && key === 'default') continue;
    assert.notEqual(uiText(language, key), key, `${language}/${key}`);
  }
  assert.equal(uiText('unknown', 'home'), 'Home');
  assert.equal(uiText('fr', 'unknown-key'), 'unknown-key');
  assert.equal(cleanText('\x1b[31mHello\nworld\x00'), 'Hello world ');
  for (const columns of [0, 1, 2, 12]) assert.equal(width(fitText('你好 é 🧑‍💻 monde très long', columns)), columns);
  assert.equal(consoleLayout().sidebar, 0);
  const state = makeState();
  for (const page of ['home', 'launch', 'desktop', 'access', 'diagnostic']) {
    state.page = page;
    state.inspection = { clients: { codex: { installed: true, versionSupported: true } }, token: { stored: true }, desktop: desktop() };
    state.catalogues['claude-code'] = catalogue();
    initializeSelection(state, 'claude-code', catalogue());
    if (page === 'launch') {
      assert.equal(buildConsoleView(state).entries.find(entry => entry.action === 'chooseFamily').label, 'Famille de modèles : 💸 Claude via AWS');
      assert.ok(buildConsoleView(state).summary.includes('💸 Claude via AWS'));
    }
    for (const size of [{ columns: 120, rows: 35 }, { columns: 120, rows: 18 }, { columns: 100, rows: 24 }, { columns: 80, rows: 24 }, { columns: 60, rows: 18 }]) {
      for (const pane of ['nav', 'content']) {
        const rendered = stripVTControlCharacters(renderConsole(state, { pane, index: 4 }, size));
        assert.match(rendered, /Q\/0/);
        assert.ok(rendered.split('\n').length <= size.rows);
        for (const line of rendered.split('\n')) assert.ok(width(line) <= size.columns, `${page}/${size.columns}: ${line}`);
      }
    }
  }
  state.page = 'launch'; state.selections['claude-code'].family = 'removed-family';
  assert.doesNotThrow(() => renderConsole(state));
  state.page = 'desktop'; state.inspection.desktop = { supported: false };
  assert.match(renderConsole(state), /Indisponible/);
  state.inspection.desktop = { applied: true, healthy: false };
  assert.match(renderConsole(state), /Profil à vérifier/);
  state.proxyActive = true;
  assert.match(renderConsole(state), /Actif dans cette console/);
  state.proxyActive = false; state.proxyStopped = true;
  assert.match(renderConsole(state), /Arrêté dans cette console/);
});

test('availability never substitutes a missing saved model, subagent or family', () => {
  const state = makeState();
  state.client = 'codex'; state.catalogues.codex = catalogue('codex');
  assert.equal(initializeSelection(state, 'codex', state.catalogues.codex), true);
  assert.equal(canLaunch(state), true);
  selectFamily(state, 'open-source');
  assert.equal(state.selections.codex.model, null);
  assert.equal(canLaunch(state), false);
  state.selections.codex.model = 'kimi-k3';
  assert.equal(canLaunch(state), true);
  state.selections.codex = { family: 'claude-gpt', model: 'removed' };
  assert.equal(initializeSelection(state, 'codex', state.catalogues.codex), false);
  assert.equal(state.selections.codex.model, 'removed');
  assert.equal(initializeSelection(state, 'codex', state.catalogues.codex, { strategy: 'open-source', model: 'kimi-k3' }), true);
  state.client = 'claude-code'; state.catalogues['claude-code'] = catalogue();
  state.selections['claude-code'] = { family: 'deleted', subagent: CODE_MODEL };
  assert.equal(initializeSelection(state, 'claude-code', catalogue()), false);
  selectFamily(state, 'trial');
  assert.equal(canLaunch(state), true);
  state.selections['claude-code'].subagent = 'gpt-6-luna';
  assert.equal(canLaunch(state), false);
  selectFamily(state, 'default');
  assert.equal(state.selections['claude-code'].family, 'trial');
  assert.equal(initializeSelection(state, 'claude-code', catalogue(), { strategy: 'aws', subagentModel: CODE_MODEL }), true);
  state.page = 'launch';
  state.selections['claude-code'] = { family: 'claude-gpt', subagent: 'gpt-6-luna' };
  const mapping = buildConsoleView(state).summary.join('\n');
  assert.match(mapping, /Opus: gpt-6.1-sol/); assert.match(mapping, /Sonnet: gpt-6.1-sol/);
  assert.match(mapping, /sous-agent: gpt-6-luna/);
  state.inspection.token = { error: 'storageFailed' }; assert.match(tokenLabel(state), /inaccessible/);
  state.inspection.token = { env: true }; assert.match(tokenLabel(state), /environnement/);
  state.inspection.token = {}; assert.match(tokenLabel(state), /Aucun/);
  state.inspection.clients.codex = { installed: false }; assert.equal(clientStatus(state, 'codex'), 'Non détecté');
  state.inspection.clients.codex = { installed: true, versionSupported: false }; assert.equal(clientStatus(state, 'codex'), 'Version incompatible');
  state.inspection.clients.codex = { error: true }; assert.match(clientStatus(state, 'codex'), /Échec/);
});

test('console returns home after all child outcomes and persists after spawn only when enabled', async () => {
  for (const code of [0, 7, 130]) {
    const result = await fixture([{ action: 'tool', value: 'claude-code' }, { action: 'launch' }, (state) => {
      assert.equal(state.page, 'home'); assert.match(state.notice, new RegExp(`\\(${code}\\)`));
      return { action: 'quit' };
    }], { childCode: code });
    assert.equal(result.calls.saved.length, 1);
    assert.equal(result.processState.exitCode, 0);
  }
  const result = await fixture([{ action: 'tool', value: 'codex' }, { action: 'remember' }, { action: 'launch' }, { action: 'quit' }]);
  assert.equal(result.calls.saved.length, 0);
  const failedSave = await fixture([{ action: 'tool', value: 'codex' }, { action: 'launch' }, { action: 'quit' }], { saveResult: { ok: false, warning: 'preferencesWriteFailed' } });
  assert.equal(failedSave.state.warning, 'preferencesWriteFailed');
});

test('launch selectors, missing defaults, remembered invalid choices and relaunch behave explicitly', async () => {
  const saved = rememberSelection(EMPTY(), 'routerlab', 'codex', { family: 'open-source', model: 'removed' });
  const result = await fixture([
    { action: 'relaunch', value: 'codex' }, (state, { calls }) => {
      assert.match(state.notice, /indisponible/); assert.equal(calls.launched.length, 0);
      return { action: 'chooseModel' };
    }, { action: 'pick', value: 'kimi-k3' }, { action: 'launch' },
    { action: 'resume', value: 'codex' }, { action: 'chooseClient' }, { action: 'pick', value: 'opencode' },
    { action: 'chooseFamily' }, { action: 'pick', value: 'open-source' }, (state) => {
      assert.equal(canLaunch(state), false); return { action: 'chooseModel' };
    }, { action: 'pick', value: 'kimi-k3' }, { action: 'launch' },
    { action: 'tool', value: 'claude-code' }, { action: 'chooseSubagent' }, { action: 'pick', value: 'gpt-6-luna' },
    { action: 'chooseFamily' }, { action: 'pick', value: 'trial' }, { action: 'back' }, { action: 'quit' },
  ], { preferences: saved });
  assert.equal(result.calls.launched.length, 2);
  assert.equal(result.calls.launched[0].model, 'kimi-k3');
  assert.equal(result.state.page, 'home');
});

test('Desktop proxy stays owned during navigation, cancellation preserves mappings and exit cleans it', async () => {
  const result = await fixture([
    { action: 'tool', value: 'desktop' }, { action: 'startProxy' }, { action: 'back' },
    { action: 'startProxy' }, { action: 'confirm' },
    { action: 'navigate', value: 'home' }, (state) => { assert.equal(state.proxyActive, true); return { action: 'navigate', value: 'desktop' }; },
    { action: 'routes' }, { action: 'noop' }, { action: 'back' }, { action: 'journal' }, { action: 'back' },
    { action: 'desktopFamilies' }, { action: 'toggleFamily', value: 'aws' }, { action: 'back' },
    { action: 'desktopFamilies' }, (state) => { assert.deepEqual(state.dialog.selected, ['default', 'aws']); return { action: 'toggleFamily', value: 'default' }; },
    { action: 'applyFamilies' }, { action: 'confirm' }, { action: 'stopProxy' }, (state) => {
      assert.equal(state.inspection.desktop.applied, true); assert.equal(state.proxyActive, false); return { action: 'startProxy' };
    }, { action: 'confirm' }, { action: 'restore' }, { action: 'back' }, { action: 'restore' }, { action: 'confirm' },
    { action: 'startProxy' }, { action: 'confirm' }, { action: 'quit' },
  ]);
  assert.equal(result.calls.restores, 1);
  assert.equal(result.calls.starts.length, 4);
  assert.equal(result.calls.stops, 4);
  assert.deepEqual(result.calls.starts[1].strategyValues, ['aws']);
});

test('auth changes invalidate prepared credentials and inspection failures remain recoverable', async () => {
  const result = await fixture([
    { action: 'tool', value: 'codex' }, { action: 'navigate', value: 'access' }, { action: 'login' }, (state) => {
      assert.deepEqual(state.catalogues, {}); assert.deepEqual(state.accessStatus, {}); return { action: 'testAccess' };
    }, { action: 'logout' }, { action: 'back' }, { action: 'logout' }, { action: 'confirm' },
    { action: 'navigate', value: 'diagnostic' }, { action: 'strategies' }, { action: 'noop' }, { action: 'back' },
    { action: 'refreshInspection' }, { action: 'quit' },
  ], { warning: 'preferencesInvalid', inspectionError: 'inspectionFailed' });
  assert.equal(result.calls.logins, 1); assert.equal(result.calls.logouts, 1); assert.equal(result.calls.inspections, 2);
  assert.equal(result.state.warning, 'inspectionFailed');
});

test('errors and SIGTERM restore the terminal and close owned resources', async () => {
  let result = await fixture([{ action: 'tool', value: 'codex' }, (state) => {
    assert.match(state.notice, /network/); return { action: 'launch' };
  }, { action: 'quit' }], { services: { prepare: async () => { throw Object.assign(new Error('network failure'), { code: 'network_error' }); } } });
  assert.equal(result.calls.saved.length, 0);
  result = await fixture([{ action: 'startProxy' }, { action: 'confirm' }, (state) => {
    assert.match(state.notice, /port/); return { action: 'quit' };
  }], { services: { startDesktop: async () => { throw Object.assign(new Error('occupied'), { code: 'EADDRINUSE' }); } } });
  assert.equal(result.calls.restores, 0);
  result = await fixture([{ action: 'tool', value: 'codex' }, { action: 'launch' }, { action: 'quit' }], {
    services: { prepare: async () => ({ ...catalogue('codex'), execute: async () => { throw new Error('spawn failed'); } }) },
  });
  assert.equal(result.state.page, 'home'); assert.equal(result.calls.saved.length, 0);
  result = await fixture([(_state, { signals }) => { signals.emit('SIGTERM'); return { action: 'quit' }; }]);
  assert.equal(result.processState.exitCode, 143);
  result = await fixture([(_state, { signals }) => { signals.emit('SIGINT'); return { action: 'quit' }; }]);
  assert.equal(result.processState.exitCode, 130);
});

test('launch review cancels without spawning and signals clean up during login or a client', async () => {
  let result = await fixture([{ action: 'tool', value: 'codex' }, () => ({ action: 'launch' }), (state) => {
    assert.equal(state.dialog.kind, 'launch');
    assert.match(state.dialog.entries.map(entry => entry.label).join(' '), /gpt-6.1-sol/);
    return { action: 'back' };
  }, { action: 'quit' }]);
  assert.equal(result.calls.launched.length, 0); assert.equal(result.calls.saved.length, 0);
  result = await fixture([(_state, { services, signals }) => {
    services.login = async ({ signal }) => {
      signals.emit('SIGTERM'); assert.equal(signal.aborted, true);
      throw Object.assign(new Error('aborted'), { name: 'AbortPromptError' });
    };
    return { action: 'login' };
  }]);
  assert.equal(result.processState.exitCode, 143);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    result = await fixture([{ action: 'startProxy' }, { action: 'confirm' }, (_state, { services, signals }) => {
      services.prepare = async () => ({ ...catalogue('codex'), execute: async () => {
        signals.emit(signal); return signal === 'SIGINT' ? 130 : 143;
      } });
      return { action: 'tool', value: 'codex' };
    }, { action: 'launch' }, ...(signal === 'SIGINT' ? [{ action: 'quit' }] : [])]);
    assert.equal(result.calls.stops, 1);
    assert.equal(result.processState.exitCode, signal === 'SIGTERM' ? 143 : 0);
    assert.equal(result.state.page, 'home');
  }
});

test('local inspection exposes public state without credentials and handles partial failures', async () => {
  const snapshots = [];
  const result = collectInspection('routerlab', {
    detectors: { codex: () => ({ installed: true, versionSupported: true, cliPath: 'private-path', version: '1.0' }), opencode: () => { throw new Error('failed'); } },
    tokenStatus: () => ({ stored: true, backend: 'fixture', supported: true }), envToken: () => ({ token: 'secret' }),
    desktopStatus: () => ({ ...desktop(), wrapperScionos: { service: 'routerlab', strategy: 'aws', routes: [{ routeId: 'opus', upstreamModel: 'model', token: 'secret' }] }, profile: { inferenceGatewayApiKey: 'secret' } }),
  }, (value) => snapshots.push(value));
  assert.equal(result.clients.opencode.error, 'inspectionFailed');
  assert.equal(result.token.env, true);
  assert.doesNotMatch(JSON.stringify(result), /secret|private-path|inferenceGatewayApiKey/);
  assert.equal(snapshots.length, 4);
  const failed = collectInspection('llm', { detectors: {}, tokenStatus() { throw new Error(); }, desktopStatus() { throw new Error(); } });
  assert.equal(failed.token.error, 'storageFailed'); assert.equal(failed.desktop.error, 'inspectionFailed');
  assert.deepEqual(desktopSnapshot({ supported: false }).families, []);
  class FakeWorker extends EventEmitter { terminate() { this.emit('exit', 0); return Promise.resolve(); } }
  let worker;
  class WorkerClass extends FakeWorker { constructor() { super(); worker = this; } }
  const messages = [];
  let inspection = startInspection('routerlab', (snapshot) => messages.push(snapshot), { WorkerClass });
  worker.emit('message', { token: {} }); worker.emit('exit', 0);
  assert.equal((await inspection.done).error, null); assert.equal(messages.length, 1); await inspection.stop();
  inspection = startInspection('routerlab', () => {}, { WorkerClass }); worker.emit('error', new Error());
  assert.equal((await inspection.done).error, 'inspectionFailed'); await inspection.stop();
  inspection = startInspection('routerlab', () => {}, { WorkerClass, timeoutMs: 1 });
  assert.equal((await inspection.done).error, 'inspectionFailed'); await inspection.stop();
});

test('terminal suitability and cursor traversal preserve keyboard access', () => {
  assert.equal(supportsStructuredConsole({ isTTY: true }, { isTTY: true, columns: 120, rows: 35 }, {}), true);
  assert.equal(supportsStructuredConsole({ isTTY: true }, { isTTY: true }, {}), true);
  for (const output of [{ isTTY: false }, { isTTY: true, columns: 59 }, { isTTY: true, rows: 17 }]) assert.equal(supportsStructuredConsole({ isTTY: true }, output, {}), false);
  assert.equal(supportsStructuredConsole({ isTTY: true }, { isTTY: true }, { TERM: 'dumb' }), false);
  const entries = [{}, { disabled: true }, {}];
  assert.equal(moveCursor(entries, 0, 1), 2); assert.equal(moveCursor(entries, 2, 1), 0);
  assert.equal(moveCursor([{ disabled: true }], 0, 1), 0); assert.equal(moveCursor([], 0, 1), 0);
});

test('real prompt consumes keyboard input, paginates, resizes and releases listeners', async () => {
  const input = new PassThrough();
  const output = Object.assign(new PassThrough(), { columns: 80, rows: 24 });
  let rendered = '';
  output.on('data', (chunk) => { rendered += chunk; });
  const events = new EventEmitter();
  const state = makeState();
  const pending = consolePrompt({ state, events, output }, { input, output, clearPromptOnDone: true });
  await new Promise((resolve) => setImmediate(resolve));
  output.columns = 120; output.emit('resize'); events.emit('change');
  input.write('\t'); input.write('\x1b[B'); input.write('\r');
  const action = await pending;
  assert.equal(action.action, 'navigate'); assert.equal(action.value, 'launch');
  assert.match(stripVTControlCharacters(rendered), /Démarrer une session/);
  assert.equal(events.listenerCount('change'), 0); assert.equal(output.listenerCount('resize'), 0);
  input.destroy(); output.destroy();
});

test('Windows console input pauses OS reads across native sessions and closes only at shutdown', async () => {
  const streams = [];
  let stops = 0;
  class FakeTTY extends PassThrough {
    constructor(fd) { super(); assert.equal(fd, 0); this.isTTY = true; this._handle = { reading: true, readStop() { stops++; } }; streams.push(this); }
    setRawMode(value) { this.isRaw = value; }
    ref() { this.referenced = true; }
    unref() { this.referenced = false; }
  }
  const original = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode(value) { this.isRaw = value; } });
  const closed = [];
  const manager = createConsoleInput(original, { enabled: true, ReadStreamClass: FakeTTY, closeInput: fd => closed.push(fd) });
  const first = manager.acquire(); first.setRawMode(true);
  assert.equal(first._handle.reading, false); assert.equal(first._readableState.reading, false);
  assert.equal(first.referenced, true);
  assert.equal(manager.acquire(), first);
  first.resume(); first._handle.reading = true;
  await manager.release();
  assert.equal(first.destroyed, false); assert.equal(first.isRaw, false); assert.equal(original.destroyed, false);
  assert.equal(first._handle.reading, false); assert.equal(first._readableState.reading, false);
  assert.equal(first.referenced, false); assert.ok(stops >= 2);
  assert.equal(manager.acquire(), first); assert.equal(first.referenced, true);
  await manager.release(); await manager.release();
  assert.equal(streams.length, 1);
  await manager.dispose(); await manager.dispose();
  assert.equal(first.destroyed, true); assert.equal(original.destroyed, false);
  assert.deepEqual(closed, []);
  const failed = createConsoleInput(original, { enabled: true, ReadStreamClass: class { constructor() { throw new Error('unavailable'); } }, openInput: () => 43, closeInput: fd => closed.push(fd) });
  assert.throws(() => failed.acquire(), /unavailable/); assert.deepEqual(closed, [43]);
  const failedStdin = createConsoleInput(original, { enabled: true, ReadStreamClass: class { constructor() { throw new Error('unavailable'); } }, closeInput: fd => closed.push(fd) });
  assert.throws(() => failedStdin.acquire(), /unavailable/); assert.deepEqual(closed, [43]);
  const plain = createConsoleInput(original, { enabled: false });
  assert.equal(plain.acquire(), original); await plain.release(); await plain.dispose();
  original.destroy();
});

test('all console shortcuts activate their action and keep narrow-terminal help visible', async () => {
  async function keyAction(keys, state = makeState()) {
    const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode(value) { this.isRaw = value; } });
    const output = Object.assign(new PassThrough(), { isTTY: true, columns: 60, rows: 18 });
    output.resume();
    try {
      const pending = consolePrompt({ state, events: new EventEmitter(), output }, { input, output, clearPromptOnDone: true });
      await new Promise((resolve) => setImmediate(resolve));
      for (const key of keys) { input.write(key); await new Promise((resolve) => setImmediate(resolve)); }
      return await pending;
    } finally { input.destroy(); output.destroy(); }
  }
  for (const [key, value] of [['1', 'claude-code'], ['2', 'desktop'], ['3', 'codex'], ['4', 'opencode'], ['5', 'cowork'], ['6', 'codex-app']]) {
    assert.deepEqual(await keyAction([key]), { action: 'tool', value });
  }
  for (const key of ['q', '0']) assert.equal((await keyAction([key])).action, 'quit');
  for (const page of ['home', 'launch', 'desktop', 'access', 'diagnostic']) {
    const languageState = makeState(); languageState.page = page;
    assert.equal((await keyAction(['l'], languageState)).action, 'chooseLanguage');
  }
  assert.equal((await keyAction(['\x1b'])).action, 'back');
  assert.equal((await keyAction(['\x1b[F', '\r'])).action, 'quit');
  assert.equal((await keyAction(['\x1b[F', '\x1b[H', '\r'])).value, 'claude-code');
  const state = makeState(); state.page = 'launch'; state.catalogues['claude-code'] = catalogue();
  initializeSelection(state, 'claude-code', catalogue()); state.focus = { pane: 'content', index: 3 };
  assert.equal((await keyAction([' '], state)).action, 'remember');
  state.dialog = { title: 'Familles', entries: [{ action: 'toggleFamily', value: 'aws', label: 'AWS' }] };
  state.focus.index = 0;
  assert.equal((await keyAction([' '], state)).action, 'toggleFamily');
  for (const language of ['en', 'fr', 'de']) {
    state.language = language; state.dialog = null;
    for (const page of ['home', 'launch', 'desktop', 'access', 'diagnostic']) {
      state.page = page;
      const rendered = stripVTControlCharacters(renderConsole(state, { pane: 'content', index: 0 }, { columns: 60, rows: 18 }));
      assert.match(rendered, /Q\/0/); assert.ok(rendered.split('\n').length <= 18);
      assert.match(rendered.split('\n')[0], /\[L\]/);
    }
  }
  const compact = stripVTControlCharacters(renderConsole(state, { pane: 'nav', index: 4 }, { columns: 50, rows: 12 }));
  assert.match(compact, /Navigation/); assert.match(compact, /Diagnose/);
  assert.ok(compact.split('\n').length <= 12);
});

test('console language selection changes all screens and prepared launches without extra discovery', async () => {
  let preparations = 0;
  const languages = [];
  const services = { prepare: async client => {
    preparations++;
    return { ...catalogue(client), execute: async (_selection, hooks) => { languages.push(hooks.language); hooks.onSpawn(); return 0; } };
  } };
  const result = await fixture([
    { action: 'chooseLanguage' }, state => {
      assert.deepEqual(state.dialog.entries.slice(0, 3).map(entry => entry.label), ['English', 'Français', 'Deutsch']);
      return { action: 'back' };
    }, state => { assert.equal(state.language, 'fr'); return { action: 'tool', value: 'codex' }; },
    { action: 'chooseLanguage' }, { action: 'pick', value: 'en' }, state => {
      assert.equal(state.language, 'en'); assert.equal(preparations, 1);
      assert.equal(buildConsoleView(state).navigation[0].label, 'Home'); return { action: 'noop' };
    }, { action: 'launch' },
    { action: 'chooseLanguage' }, { action: 'pick', value: 'de' }, state => {
      assert.equal(state.language, 'de'); assert.equal(state.service, 'routerlab');
      assert.equal(buildConsoleView(state).navigation[0].label, 'Start'); return { action: 'navigate', value: 'launch' };
    }, { action: 'launch' }, { action: 'quit' },
  ], { services });
  assert.deepEqual(languages, ['en', 'de']); assert.equal(preparations, 1);
  assert.doesNotMatch(JSON.stringify(result.calls.saved), /"language"/);
});

test('App preferences remain separate from CLI choices and render all six tools in three languages', () => {
  let preferences = rememberSelection(EMPTY(), 'routerlab', 'codex', { family: 'claude-gpt', model: 'gpt-6-luna' });
  preferences = rememberSelection(preferences, 'routerlab', 'codex-app', { family: 'claude-gpt', model: 'gpt-6.1-sol' });
  preferences = rememberSelection(preferences, 'llm', 'codex-app', { family: 'claude', model: 'gpt-5.6-sol' });
  assert.equal(preferences.services.routerlab.clients.codex.model, 'gpt-6-luna');
  assert.equal(preferences.services.routerlab.clients['codex-app'].model, 'gpt-6.1-sol');
  assert.equal(preferences.services.llm.clients['codex-app'].model, 'gpt-5.6-sol');
  for (const language of ['en', 'fr', 'de']) {
    const state = createConsoleState({ service: 'routerlab', language }, preferences, '8.0.0');
    assert.equal(buildConsoleView(state).entries.filter(entry => entry.action === 'tool').length, 6);
    state.page = 'desktop'; state.desktopClient = 'codex-app';
    for (const app of [{ configured: false }, { configured: true, recoveryRequired: true }, { configured: true, restoreConflict: true }]) {
      state.inspection.codexApp = { ...app, running: true, model: 'gpt-6.1-sol' };
      state.inspection.clients['codex-app'] = { supported: true, installed: true, versionSupported: true };
      const view = buildConsoleView(state);
      assert.equal(view.entries.find(entry => entry.action === 'restoreApp').disabled, !app.configured);
      for (const [columns, rows] of [[120, 35], [80, 24]]) {
        const lines = stripVTControlCharacters(renderConsole(state, { pane: 'content', index: 0 }, { columns, rows })).split('\n');
        assert.ok(lines.length <= rows); assert.ok(lines.every(line => width(line) <= columns));
      }
    }
    state.inspection.clients['codex-app'] = { supported: false };
    assert.match(clientStatus(state, 'codex-app'), /Linux/);
  }
});

test('App stays active during console navigation and exit offers cancel, leave open or graceful closure', async () => {
  for (const decision of ['closeAppQuit', 'keepAppQuit', 'SIGTERM']) {
    let active = false; let closed = 0; let shutdowns = 0;
    const services = {
      prepare: async () => ({ ...catalogue('codex-app'), execute: async (_selection, hooks) => {
        active = true; hooks.onSpawn(); return { desktop: true, exitCode: 0, requiresRestart: true };
      } }),
      appStatus: () => ({ configured: active, owned: active, installed: true, versionSupported: true, running: true }),
      hasAppSession: () => active, closeApp: () => { closed++; return { requested: false }; },
      shutdownApp: () => { shutdowns++; const restored = active; active = false; return { restored }; },
    };
    const actions = [{ action: 'tool', value: 'codex-app' }, { action: 'launch' }, state => {
      assert.equal(active, true); assert.equal(state.page, 'home'); assert.match(state.notice, /Redémarre/);
      assert.equal(state.preferences.services.routerlab.lastClient, 'codex-app');
      return { action: 'navigate', value: 'diagnostic' };
    }];
    if (decision === 'SIGTERM') actions.push((_state, { signals }) => { signals.emit('SIGTERM'); return { action: 'noop' }; });
    else actions.push({ action: 'quit' }, state => {
      assert.equal(state.dialog.kind, 'exitApp'); return { action: 'back' };
    }, { action: 'quit' }, { action: decision });
    const result = await fixture(actions, { services });
    assert.equal(shutdowns, 1); assert.equal(active, false);
    assert.equal(closed, decision === 'closeAppQuit' ? 1 : 0);
    assert.equal(result.processState.exitCode, decision === 'SIGTERM' ? 143 : 0);
  }
});

test('App recovery is explicit and Ctrl+C offers the exit choice before restoring', async () => {
  let abandoned = true; let active = false; let restored = 0;
  const services = {
    appStatus: () => ({ installed: true, versionSupported: true, running: true, configured: abandoned || active, recoveryRequired: abandoned }),
    restoreApp: () => { abandoned = false; restored++; }, hasAppSession: () => active,
    shutdownApp: () => { const result = { restored: active }; active = false; return result; },
    prepare: async () => ({ ...catalogue('codex-app'), execute: async (_selection, hooks) => { active = true; hooks.onSpawn(); return { exitCode: 0 }; } }),
  };
  const result = await fixture([
    { action: 'navigate', value: 'desktop' }, { action: 'chooseDesktopApp' }, { action: 'pick', value: 'codex-app' },
    state => { assert.equal(state.inspection.codexApp.recoveryRequired, true); return { action: 'restoreApp' }; },
    { action: 'back' }, { action: 'restoreApp' }, { action: 'confirm' },
    { action: 'tool', value: 'codex-app' }, { action: 'launch' },
    (_state, { signals }) => { signals.emit('SIGINT'); throw Object.assign(new Error(), { name: 'AbortPromptError' }); },
    state => { assert.equal(state.dialog.kind, 'exitApp'); return { action: 'keepAppQuit' }; },
  ], { services });
  assert.equal(restored, 1); assert.equal(abandoned, false); assert.equal(result.processState.exitCode, 130);
});
