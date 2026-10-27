import { ReadStream } from 'node:tty';
import fs from 'node:fs';

// Windows console reads can be cancelled when a foreground client exits.
// Own a separate TTY wrapper while prompting. On Windows libuv duplicates fd 0;
// keep that handle paused across clients, and close it only at final shutdown.
export function createConsoleInput(original, {
  enabled = process.platform === 'win32' && original === process.stdin && original.isTTY,
  ReadStreamClass = ReadStream,
  openInput = () => 0,
  closeInput = (fd) => { try { fs.closeSync(fd); } catch (error) { if (error.code !== 'EBADF') throw error; } },
} = {}) {
  const initialRaw = Boolean(original.isRaw);
  let owned = null;
  return {
    acquire() {
      if (!enabled) return original;
      if (!owned) {
        const fd = openInput();
        try { owned = new ReadStreamClass(fd); } catch (error) { if (fd > 2) closeInput(fd); throw error; }
        const stream = owned;
        // Like Node's process.stdin bootstrap: ReadStream.pause() alone can
        // keep an OS read pending until its buffer fills. That read would steal
        // the foreground client's keys. Stop before restoring cooked mode,
        // and again next tick in case the stream machinery restarted a read.
        const stopReading = () => {
          if (!stream._handle?.readStop || stream.readableFlowing) return;
          stream._readableState.reading = false;
          stream._handle.reading = false;
          stream._handle.readStop();
        };
        stream.on('pause', () => { stopReading(); process.nextTick(stopReading); });
        stopReading();
      }
      owned.ref?.();
      return owned;
    },
    async release() {
      const stream = owned ?? original;
      stream.pause?.();
      if (stream.isTTY && stream.setRawMode && !stream.destroyed) stream.setRawMode(initialRaw);
      // Keep the paused duplicate across clients. Closing a console input
      // handle during a Windows handoff can invalidate the child's console.
      if (owned) { owned.unref?.(); await new Promise(resolve => setImmediate(resolve)); }
    },
    async dispose() {
      const stream = owned;
      owned = null;
      if (stream && !stream.closed) await new Promise(resolve => { stream.once('close', resolve); stream.destroy(); });
    },
  };
}
