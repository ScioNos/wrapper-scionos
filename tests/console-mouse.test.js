import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import width from 'fast-string-width';
import { createConsoleState, runStructuredConsole } from '../src/cli/console/controller.js';
import { normalizePreferences } from '../src/cli/console/preferences.js';
import { renderConsoleFrame } from '../src/cli/console/render.js';
import { consolePrompt, scrollCursor } from '../src/cli/console/prompt.js';
import { createMouseDecoder, createConsoleMouse, supportsConsoleMouse, hitTest, MOUSE_ENABLE, MOUSE_DISABLE } from '../src/cli/console/mouse.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const packet = (x, y, button = 0, end = 'M') => `\x1b[<${button};${x};${y}${end}`;
const stateFor = (language = 'fr') => createConsoleState({ service: 'routerlab', language }, normalizePreferences(null), '8.0.0');

function harness(state = stateFor(), size = { columns: 120, rows: 35 }, env = { TERM: 'xterm-256color', SSH_CONNECTION: 'ssh-fixture' }) {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode(value) {
    if (!value) assert.equal(this.isPaused(), true, 'Raw reads must stop before restoring cooked input.');
    this.isRaw = value;
  } });
  const output = Object.assign(new PassThrough(), { isTTY: true, ...size });
  const events = new EventEmitter();
  const abort = new AbortController();
  let rendered = '';
  output.on('data', bytes => { rendered += bytes; });
  const pending = consolePrompt({ state, events, output, env }, { input, output, signal: abort.signal, clearPromptOnDone: true });
  return { state, input, output, events, abort, pending, get rendered() { return rendered; },
    frame: () => renderConsoleFrame(state, state.focus, output),
    async stop() { abort.abort(); await pending.catch(() => {}); input.destroy(); output.destroy(); },
  };
}

test('SGR and legacy mouse input is decoded across every byte boundary without becoming keyboard shortcuts', () => {
  const report = packet(312, 29);
  for (let index = 0; index <= Buffer.byteLength(report); index++) {
    const keyboard = []; const mouse = [];
    const decoder = createMouseDecoder({ onKeyboard: data => keyboard.push(data), onMouse: event => mouse.push(event) });
    decoder.write(Buffer.from(report).subarray(0, index)); decoder.write(Buffer.from(report).subarray(index));
    decoder.write(packet(312, 29, 0, 'm'));
    decoder.write(packet(4, 6, 32)); decoder.write(packet(4, 6, 2)); decoder.write(packet(4, 6, 4));
    decoder.write(packet(4, 6, 64)); decoder.write(packet(4, 6, 65));
    decoder.write(Buffer.from([27, 91, 77, 32, 232, 42]));
    const keys = Buffer.from('é🧑‍💻\t\x1b[Aq');
    for (const byte of keys) decoder.write(Buffer.from([byte]));
    decoder.stop();
    assert.equal(Buffer.concat(keyboard).toString(), keys.toString());
    assert.deepEqual(mouse, [{ type: 'click', x: 312, y: 29 }, { type: 'wheel', delta: -1, x: 4, y: 6 },
      { type: 'wheel', delta: 1, x: 4, y: 6 }, { type: 'click', x: 200, y: 10 }]);
  }
});

test('incomplete and malformed reports remain bounded and cannot trigger quit or language keys', async () => {
  const keyboard = []; const mouse = [];
  const decoder = createMouseDecoder({ onKeyboard: data => keyboard.push(data), onMouse: event => mouse.push(event), escapeTimeoutMs: 3, packetTimeoutMs: 3 });
  decoder.write('\x1b');
  await new Promise(resolve => setTimeout(resolve, 8));
  assert.equal(Buffer.concat(keyboard).toString(), '\x1b'); keyboard.length = 0;
  decoder.write('\x1b[<0;');
  await new Promise(resolve => setTimeout(resolve, 8));
  decoder.write('0;4M');
  decoder.write('\x1b[<malformed0;lM');
  decoder.write('q0l');
  decoder.write('\x1b[<' + '0'.repeat(200));
  decoder.write(';1;1M');
  decoder.write(packet(0, 2)); decoder.write(packet(2, 2, 999));
  decoder.write(packet(2, 2));
  decoder.write('\x1b[A'); decoder.stop();
  assert.equal(Buffer.concat(keyboard).toString(), '\x1b[A');
  assert.deepEqual(mouse, [{ type: 'click', x: 2, y: 2 }]);
  decoder.write('q'); assert.equal(Buffer.concat(keyboard).toString(), '\x1b[A');
});

test('mouse frames keep hit targets aligned with painted rows across languages, modals, pagination and resizing', () => {
  for (const language of ['en', 'fr', 'de']) for (const [columns, rows] of [[206, 35], [120, 35], [80, 24], [60, 18], [50, 12]]) {
    const state = stateFor(language); state.mouseEnabled = true;
    for (const page of ['home', 'launch', 'desktop', 'access', 'diagnostic']) {
      state.page = page;
      const frame = renderConsoleFrame(state, state.focus, { columns, rows });
      const lines = stripVTControlCharacters(frame.text).split('\n');
      assert.ok(lines.length <= rows); assert.ok(lines.every(line => width(line) <= columns));
      assert.match(frame.text, /Q\/0/);
      for (const target of frame.targets) {
        assert.ok(target.x >= 1 && target.y >= 1 && target.y <= rows && target.x + target.width - 1 <= columns);
        assert.equal(hitTest(frame, target.x, target.y), target);
        assert.ok(lines[target.y - 1].trim());
      }
    }
    state.page = 'home'; state.dialog = { kind: 'confirm', title: 'Confirmation', entries: [
      { action: 'noop', label: 'Read-only summary' }, { action: 'confirm', label: 'Confirm', disabled: true }, { action: 'back', label: 'Cancel' },
    ] };
    const frame = renderConsoleFrame(state, { pane: 'content', index: 0 }, { columns, rows });
    assert.deepEqual(frame.targets.map(target => target.entry?.action), ['back']);
  }
});

test('clicks activate all six home tools, navigation and header language in wide and narrow SSH-style terminals', async () => {
  for (const size of [{ columns: 120, rows: 35 }, { columns: 80, rows: 24 }]) {
    for (const client of ['claude-code', 'desktop', 'codex', 'opencode', 'cowork', 'codex-app']) {
      const h = harness(stateFor(), size);
      try {
        await tick();
        let frame = h.frame();
        if (!frame.targets.some(target => target.entry?.value === client)) {
          h.input.write(packet(40, 12, 65)); await tick();
          frame = renderConsoleFrame(h.state, { pane: 'content', index: 3 }, h.output);
        }
        const target = frame.targets.find(target => target.entry?.action === 'tool' && target.entry.value === client);
        assert.ok(target, client);
        h.input.write(packet(target.x + 2, target.y) + packet(target.x + 2, target.y, 0, 'm'));
        assert.deepEqual(await h.pending, target.entry);
        assert.ok(h.rendered.includes(MOUSE_ENABLE)); assert.ok(h.rendered.includes(MOUSE_DISABLE));
        assert.equal(h.input.listenerCount('data'), 0); assert.equal(h.events.listenerCount('change'), 0);
        assert.equal(h.output.listenerCount('resize'), 0); assert.equal(h.input.isRaw, false);
      } finally { await h.stop(); }
    }
    for (const action of ['navigate', 'chooseLanguage']) {
      const h = harness(stateFor(), size);
      try {
        await tick();
        const target = h.frame().targets.find(target => target.entry?.action === action && (action !== 'navigate' || target.entry.value === 'desktop'));
        h.input.write(packet(target.x, target.y)); assert.deepEqual(await h.pending, target.entry);
      } finally { await h.stop(); }
    }
  }
});

test('wheel and pager clicks scroll long read-only lists without activating actions or wrapping at the ends', async () => {
  const state = stateFor();
  state.dialog = { kind: 'journal', title: 'Journal', entries: [
    ...Array.from({ length: 30 }, (_, index) => ({ action: 'noop', label: 'Entry ' + index })),
    { action: 'back', label: 'Back' },
  ] };
  const h = harness(state, { columns: 80, rows: 24 });
  try {
    await tick();
    const frame = h.frame(); const next = frame.targets.find(target => target.kind === 'page');
    h.input.write(packet(next.x, next.y)); await tick();
    assert.match(stripVTControlCharacters(h.rendered), /Entry 1[0-9]/);
    h.input.write(packet(20, 10, 65).repeat(20)); await tick();
    h.input.write('\r'); assert.equal((await h.pending).action, 'back');
    assert.equal(scrollCursor([{ disabled: true }, {}, { action: 'noop' }], 1, -3), 1);
    assert.equal(scrollCursor([{}, {}, {}], 2, 3), 2);
  } finally { await h.stop(); }
});

test('modal background clicks, disabled actions and releases are ignored; resize updates live coordinates', async () => {
  const state = stateFor();
  state.dialog = { kind: 'confirm', title: 'Confirm', entries: [
    { action: 'confirm', label: 'Disabled', disabled: true }, { action: 'back', label: 'Cancel' },
  ] };
  const h = harness(state);
  try {
    await tick();
    let resolved = false; h.pending.then(() => { resolved = true; });
    h.input.write(packet(1, 5) + packet(120, 1) + packet(30, 7, 0, 'm'));
    await tick(); assert.equal(resolved, false);
    h.output.columns = 80; h.output.rows = 24; h.output.emit('resize'); await tick();
    const target = renderConsoleFrame(state, { pane: 'content', index: 1 }, h.output).targets.find(target => target.entry?.action === 'back');
    h.input.write(packet(target.x + 2, target.y)); assert.equal((await h.pending).action, 'back');
  } finally { await h.stop(); }
});

test('mouse is disabled before abort, cancellation, Ctrl+C, EOF and source errors; opt-out preserves the keyboard', async () => {
  for (const end of ['abort', 'cancel', 'ctrl-c', 'eof', 'error']) {
    const h = harness();
    try {
      await tick();
      if (end === 'abort') h.abort.abort();
      if (end === 'cancel') h.pending.cancel();
      if (end === 'ctrl-c') h.input.write('\x03');
      if (end === 'eof') h.input.end();
      if (end === 'error') h.input.emit('error', new Error('input disconnected'));
      await assert.rejects(h.pending);
      assert.ok(h.rendered.includes(MOUSE_DISABLE), end);
      assert.equal(h.input.listenerCount('data'), 0); assert.equal(h.input.listenerCount('error'), 0);
      assert.equal(h.input.isRaw, false);
    } finally { await h.stop(); }
  }
  for (const env of [{ TERM: 'dumb' }, { TERM: 'linux' }, { TERM: 'xterm', SCIONOS_MOUSE: '0' }]) {
    const h = harness(stateFor(), undefined, env);
    try { await tick(); h.input.write('q'); assert.equal((await h.pending).action, 'quit'); assert.ok(!h.rendered.includes(MOUSE_ENABLE)); }
    finally { await h.stop(); }
  }
  assert.equal(supportsConsoleMouse({ isTTY: false }, { isTTY: true }, {}), false);
  const early = harness();
  try {
    early.abort.abort(); await assert.rejects(early.pending); await tick();
    assert.equal(early.events.listenerCount('change'), 0); assert.equal(early.output.listenerCount('resize'), 0);
    assert.ok(!early.rendered.includes(MOUSE_ENABLE), 'A deferred render must not reactivate mouse after an early close.');
  } finally { await early.stop(); }
  const abort = new AbortController(); abort.abort();
  const input = new PassThrough(); const output = new PassThrough();
  await assert.rejects(consolePrompt({ state: stateFor(), events: new EventEmitter(), output }, { input, output, signal: abort.signal }), { name: 'AbortPromptError' });
  assert.equal(input.listenerCount('data'), 0); input.destroy(); output.destroy();
});

test('a mouse-only console journey selects models, cancels a review and restores mouse ownership after a native session', async () => {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode(value) { this.isRaw = value; } });
  const output = Object.assign(new PassThrough(), { isTTY: true, columns: 120, rows: 35 });
  // Like process.stdout, this sink outlives each individual Inquirer prompt.
  output.end = function () { this.emit('finish'); return this; };
  const signals = new EventEmitter(); const processState = {};
  let rendered = ''; output.on('data', value => { rendered += value; });
  let launches = 0; let saves = 0;
  const queue = [
    ['tool', 'codex'], ['chooseFamily'], ['pick', 'open-source'], ['chooseModel'], ['pick', 'kimi-k3'],
    ['chooseLanguage'], ['pick', 'de'], ['remember'], ['launch'], ['back'], ['launch'], ['confirm'],
    ['navigate', 'desktop'], ['chooseDesktopApp'], ['pick', 'cowork'], ['navigate', 'home'], ['quit'],
  ];
  const services = {
    prepare: async () => ({ models: ['gpt-6.1-sol', 'kimi-k3'], defaultModel: 'gpt-6.1-sol',
      families: [{ value: 'claude-gpt', name: 'GPT', defaultModel: 'gpt-6.1-sol', models: [{ model: 'gpt-6.1-sol' }] },
        { value: 'open-source', name: 'Open Source', defaultModel: 'kimi-k3', models: [{ model: 'kimi-k3' }] }],
      execute: async (selection, hooks) => {
        launches++; assert.deepEqual(selection, { family: 'open-source', model: 'kimi-k3' });
        assert.equal(hooks.language, 'de'); assert.equal(input.listenerCount('data'), 0);
        assert.ok(rendered.lastIndexOf(MOUSE_DISABLE) > rendered.lastIndexOf(MOUSE_ENABLE));
        hooks.onSpawn(); return 130;
      } }),
    desktopStatus: () => ({ supported: true, applied: false }),
  };
  try {
    const result = await runStructuredConsole({ service: 'routerlab', language: 'fr' }, {
      input, output, signalSource: signals, processState, services,
      loadPreferences: () => ({ value: normalizePreferences(null) }), savePreferences: () => { saves++; return { ok: true }; },
      startInspection: () => ({ done: Promise.resolve({}), stop: async () => {} }),
      prompt(config, context) {
        const pending = consolePrompt({ ...config, env: { TERM: 'xterm-256color', SSH_CONNECTION: 'ssh-fixture' } }, context);
        const [action, value] = queue.shift() ?? [];
        assert.ok(action, 'The mouse journey must return to a usable console');
        setImmediate(() => {
          const frame = renderConsoleFrame(config.state, config.state.focus, output);
          const target = frame.targets.find(item => item.entry?.action === action && (value === undefined || item.entry.value === value));
          if (!target) { context.signal.throwIfAborted(); pending.cancel(); return; }
          input.write(packet(target.x + Math.min(1, target.width - 1), target.y) + packet(target.x, target.y, 0, 'm'));
        });
        return pending;
      },
    });
    assert.equal(queue.length, 0); assert.equal(launches, 1); assert.equal(saves, 0);
    assert.equal(result.language, 'de'); assert.equal(processState.exitCode, 0);
    assert.equal(input.listenerCount('data'), 0); assert.equal(input.isRaw, false);
    assert.equal(signals.listenerCount('SIGTERM'), 0);
    assert.ok(rendered.lastIndexOf(MOUSE_DISABLE) > rendered.lastIndexOf(MOUSE_ENABLE));
  } finally { input.destroy(); output.destroy(); }
});
