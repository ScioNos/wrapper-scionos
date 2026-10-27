import { AbortPromptError, createPrompt, useEffect, useKeypress, useRef, useState } from '@inquirer/core';
import { buildConsoleView } from './view.js';
import { renderConsoleFrame } from './render.js';
import { containsCell, createConsoleMouse, hitTest, supportsConsoleMouse } from './mouse.js';

export function supportsStructuredConsole(input = process.stdin, output = process.stdout, env = process.env) {
  return Boolean(input.isTTY && output.isTTY && env.TERM !== 'dumb' && (output.columns ?? 80) >= 60 && (output.rows ?? 24) >= 18);
}

const selectable = entry => !entry.disabled && entry.action !== 'noop';
export function moveCursor(entries, current, offset) {
  if (!entries.length) return 0;
  let next = current;
  for (let count = 0; count < entries.length; count++) {
    next = (next + offset + entries.length) % entries.length;
    if (!entries[next].disabled) return next;
  }
  return current;
}

export function scrollCursor(entries, current, offset) {
  const direction = Math.sign(offset);
  let next = current;
  for (let index = 0; index < Math.abs(offset); index++) {
    let candidate = next + direction;
    while (candidate >= 0 && candidate < entries.length && entries[candidate].disabled) candidate += direction;
    if (candidate < 0 || candidate >= entries.length) break;
    next = candidate;
  }
  return next;
}

const interactivePrompt = createPrompt((config, done) => {
  // Inquirer can schedule its first render after an early abort/close. A stale
  // frame must never repaint a terminal already handed to a native client.
  if (config.lifecycle.closed) throw new AbortPromptError();
  const [focus, setFocus] = useState(() => {
    const initial = config.state.focus ?? { pane: 'content', index: 0 };
    const view = buildConsoleView(config.state);
    const pane = view.modal ? 'content' : initial.pane;
    const entries = pane === 'nav' ? view.navigation : view.entries;
    const index = Math.min(initial.index, Math.max(0, entries.length - 1));
    return { pane, index: entries[index]?.disabled ? moveCursor(entries, index, 1) : index };
  });
  const [, setRevision] = useState(0);
  const finished = useRef(false);
  const mouseHandler = useRef(null);
  const output = config.output ?? process.stdout;
  useEffect(() => {
    const update = () => setRevision((revision) => revision + 1);
    const mouse = event => mouseHandler.current?.(event);
    config.events.on('change', update);
    output.on('resize', update);
    config.mouse?.events.on('mouse', mouse);
    config.mouse?.enable();
    return () => {
      finished.current = true;
      config.lifecycle.closed = true;
      config.mouse?.disable(); config.mouse?.events.off('mouse', mouse);
      config.inputSource?.pause();
      config.events.off('change', update); output.off('resize', update);
    };
  }, []);
  const frame = renderConsoleFrame(config.state, focus, { columns: output.columns, rows: output.rows });
  const view = frame.view;
  const entries = focus.pane === 'nav' ? view.navigation : view.entries;
  const index = Math.min(focus.index, Math.max(0, entries.length - 1));
  const finish = (action, selectedFocus = { ...focus, index }) => {
    if (finished.current) return;
    finished.current = true; config.lifecycle.closed = true;
    config.mouse?.disable(); config.inputSource?.pause(); config.state.focus = selectedFocus; done(action);
  };
  mouseHandler.current = event => {
    if (finished.current || config.state.busy) return;
    if (event.type === 'wheel') {
      const region = frame.regions.find(rect => containsCell(rect, event.x, event.y));
      if (!region) return;
      const choices = region.pane === 'nav' ? view.navigation : view.entries;
      setFocus({ pane: region.pane, index: scrollCursor(choices, region.pane === focus.pane ? index : 0, event.delta * 3) });
      return;
    }
    const target = hitTest(frame, event.x, event.y);
    if (!target) return;
    if (target.kind === 'page') { setFocus({ pane: 'content', index: scrollCursor(view.entries, index, target.direction * target.step) }); return; }
    finish(target.entry, target.kind === 'entry' ? { pane: target.pane, index: target.index } : { ...focus, index });
  };
  useKeypress((key, rl) => {
    if (finished.current) return;
    rl.clearLine(0);
    if (key.name === 'escape') return finish({ action: 'back' });
    if (key.ctrl || key.meta) return;
    if ((key.name === 'q' || key.sequence === '0') && !config.state.dialog) return finish({ action: 'quit' });
    if (key.name === 'l' && !view.modal) return finish({ action: 'chooseLanguage' });
    if (key.name === 'tab' && !view.modal) return setFocus({ pane: focus.pane === 'nav' ? 'content' : 'nav', index: 0 });
    if (key.name === 'up' || key.name === 'down') return setFocus({ ...focus, index: moveCursor(entries, index, key.name === 'up' ? -1 : 1) });
    if (key.name === 'home') return setFocus({ ...focus, index: moveCursor(entries, entries.length - 1, 1) });
    if (key.name === 'end') return setFocus({ ...focus, index: moveCursor(entries, 0, -1) });
    if (config.state.page === 'home' && !view.modal && /^[1-6]$/.test(key.sequence ?? '')) {
      return finish({ action: 'tool', value: ['claude-code', 'desktop', 'codex', 'opencode', 'cowork', 'codex-app'][Number(key.sequence) - 1] });
    }
    if (key.name === 'return' || key.name === 'enter' || key.name === 'space') {
      const entry = entries[index];
      if (!entry || !selectable(entry)) return;
      if (key.name === 'space' && !['remember', 'toggleFamily'].includes(entry.action)) return;
      finish(entry);
    }
  });
  return frame.text;
});

export function consolePrompt(config, context = {}) {
  const input = context.input ?? process.stdin;
  const output = context.output ?? config.output ?? process.stdout;
  if (context.signal?.aborted) {
    config.state.mouseEnabled = false;
    return Object.assign(Promise.reject(new AbortPromptError({ cause: context.signal.reason })), { cancel() {} });
  }
  const enabled = supportsConsoleMouse(input, output, config.env ?? process.env);
  config.state.mouseEnabled = enabled;
  const lifecycle = { closed: false };
  if (!enabled) {
    const pending = interactivePrompt({ ...config, lifecycle, inputSource: input }, context);
    return Object.assign(pending.finally(() => { lifecycle.closed = true; }), { cancel: () => pending.cancel() });
  }
  const mouse = createConsoleMouse(input, output);
  const abort = new AbortController();
  let inputError;
  const onAbort = () => mouse.disable();
  const signal = context.signal ? AbortSignal.any([context.signal, abort.signal]) : abort.signal;
  signal.addEventListener('abort', onAbort);
  mouse.events.on('inputError', error => { inputError = error; abort.abort(); });
  mouse.events.on('inputEnd', () => abort.abort());
  let pending;
  try {
    pending = interactivePrompt({ ...config, lifecycle, mouse, inputSource: input }, { ...context, input: mouse.input, output, signal });
    mouse.start();
  } catch (error) { signal.removeEventListener('abort', onAbort); mouse.stop(); config.state.mouseEnabled = false; throw error; }
  return Object.assign(pending.catch(error => { throw inputError ?? error; }).finally(() => {
    lifecycle.closed = true;
    signal.removeEventListener('abort', onAbort);
    mouse.stop(); config.state.mouseEnabled = false;
  }), { cancel() { mouse.disable(); pending.cancel(); } });
}
