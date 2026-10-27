import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

// Xterm normal button tracking + SGR cell coordinates. No motion flood over SSH.
export const MOUSE_ENABLE = '\x1b[?1006h\x1b[?1000h';
export const MOUSE_DISABLE = '\x1b[?1000l\x1b[?1006l';

export function supportsConsoleMouse(input, output, env = process.env) {
  return Boolean(input.isTTY && output.isTTY && !['dumb', 'linux'].includes(env.TERM)
    && !['0', 'false', 'off'].includes(String(env.SCIONOS_MOUSE ?? '').toLowerCase()));
}

function mouseEvent(button, x, y, released) {
  if (!Number.isInteger(button) || button < 0 || button > 255 || x < 1 || y < 1 || x > 1000000 || y > 1000000) return null;
  if (released || (button & 32) || (button & 28)) return null;
  if (button === 64 || button === 65) return { type: 'wheel', delta: button === 64 ? -1 : 1, x, y };
  return button === 0 ? { type: 'click', x, y } : null;
}

// Decode before readline: mouse packet digits must never become keyboard shortcuts.
// Keep bytes intact so split UTF-8 keyboard input still uses readline's decoder.
export function createMouseDecoder({ onKeyboard, onMouse, escapeTimeoutMs = 40, packetTimeoutMs = 500 }) {
  let pending = Buffer.alloc(0);
  let timer;
  let discarding = false;
  let stopped = false;
  const clear = () => { clearTimeout(timer); timer = undefined; };
  function arm(packet) {
    clear();
    timer = setTimeout(() => {
      const bytes = pending; pending = Buffer.alloc(0);
      if (packet) discarding = true; else onKeyboard(bytes);
    }, packet ? packetTimeoutMs : escapeTimeoutMs);
  }
  function drain() {
    while (pending.length) {
      if (discarding) {
        const end = pending.findIndex(byte => byte === 27 || (discarding !== 'escape' && (byte === 77 || byte === 109)));
        if (end < 0) { pending = Buffer.alloc(0); return; }
        const freshEscape = pending[end] === 27;
        pending = pending.subarray(end + (freshEscape ? 0 : 1)); discarding = false;
        continue;
      }
      const escape = pending.indexOf(27);
      if (escape !== 0) {
        const count = escape < 0 ? pending.length : escape;
        onKeyboard(pending.subarray(0, count)); pending = pending.subarray(count); continue;
      }
      if (pending.length < 2 || (pending[1] === 91 && pending.length < 3)) { arm(false); return; }
      if (pending[1] !== 91 || ![60, 77].includes(pending[2])) {
        onKeyboard(pending.subarray(0, 1)); pending = pending.subarray(1); continue;
      }
      if (pending[2] === 77) {
        if (pending.length < 6) { arm(true); return; }
        const button = pending[3] - 32;
        const event = mouseEvent(button, pending[4] - 32, pending[5] - 32, (button & 3) === 3);
        pending = pending.subarray(6); if (event) onMouse(event); continue;
      }
      const end = pending.findIndex((byte, index) => index >= 3 && (byte === 77 || byte === 109));
      if (end < 0) {
        if (pending.length > 128) { discarding = true; pending = pending.subarray(3); continue; }
        arm(true); return;
      }
      const packet = pending.subarray(0, end + 1).toString('latin1');
      pending = pending.subarray(end + 1);
      const match = packet.length <= 128 && /^\x1b\[<(\d{1,3});(\d{1,6});(\d{1,6})([Mm])$/.exec(packet);
      if (match) {
        const event = mouseEvent(Number(match[1]), Number(match[2]), Number(match[3]), match[4] === 'm');
        if (event) onMouse(event);
      } else discarding = 'escape';
    }
  }
  return {
    write(chunk) {
      if (stopped) return;
      clear(); pending = Buffer.concat([pending, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]); drain();
    },
    stop() { stopped = true; clear(); pending = Buffer.alloc(0); },
  };
}

export function createConsoleMouse(source, output) {
  const input = new PassThrough();
  const events = new EventEmitter();
  let active = false;
  let started = false;
  let stopped = false;
  Object.defineProperties(input, {
    isTTY: { get: () => source.isTTY }, isRaw: { get: () => source.isRaw },
  });
  input.setRawMode = value => { source.setRawMode?.(value); return input; };
  const disable = () => {
    if (active) { active = false; output.write(MOUSE_DISABLE); }
    // Stop raw reads before readline restores cooked mode. On Windows, doing
    // this afterwards can start a blocking ReadConsole and break the handoff.
    if (started) source.pause();
  };
  const decoder = createMouseDecoder({
    onKeyboard(bytes) { if (bytes.includes(3)) disable(); input.write(bytes); },
    onMouse(event) { if (active) events.emit('mouse', event); },
  });
  const onData = chunk => decoder.write(chunk);
  const onError = error => { disable(); events.emit('inputError', error); };
  const onEnd = () => { disable(); events.emit('inputEnd'); };
  return {
    input, events,
    start() {
      if (started || stopped) return;
      started = true; source.on('data', onData); source.on('error', onError); source.on('end', onEnd); source.resume();
    },
    enable() { if (!active && !stopped) { active = true; output.write(MOUSE_ENABLE); } },
    disable,
    stop() {
      if (stopped) return;
      stopped = true;
      try { disable(); } finally {
        decoder.stop(); source.off('data', onData); source.off('error', onError); source.off('end', onEnd);
        if (started) source.pause();
        input.destroy(); events.removeAllListeners();
      }
    },
  };
}

export function containsCell(rectangle, x, y) {
  return x >= rectangle.x && y >= rectangle.y && x < rectangle.x + rectangle.width && y < rectangle.y + rectangle.height;
}

export function hitTest(frame, x, y) {
  return frame.targets.find(target => containsCell(target, x, y)) ?? null;
}
