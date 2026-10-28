import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildInteractiveCliInvocation, terminateChildTree } from '../../src/platform/process.js';

const childCloseStates = new WeakMap();

export async function removeTestDirectory(directory, root = os.tmpdir()) {
  const absolute = path.resolve(directory);
  const assertChild = (parent, target) => {
    const relative = path.relative(parent, target);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
      throw new Error(`Refusing recursive cleanup outside test root: ${target}`);
    }
  };
  assertChild(path.resolve(root), absolute);
  if (!fs.existsSync(absolute)) return;
  assertChild(fs.realpathSync(root), fs.realpathSync(absolute));
  await fs.promises.rm(absolute, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

export async function withCleanup(body, cleanups) {
  let primary = null;
  let result;
  try { result = await body(); } catch (error) { primary = error; }
  const errors = [];
  for (const cleanup of cleanups) {
    try { await cleanup(); } catch (error) { errors.push(error); }
  }
  if (primary) {
    if (errors.length) primary.cleanupErrors = errors;
    throw primary;
  }
  if (errors.length) throw new AggregateError(errors, 'Test cleanup failed');
  return result;
}

export async function closeTestServer(server) {
  if (!server?.listening) return;
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

export function spawnTestProcess(command, args, options = {}) {
  const invocation = buildInteractiveCliInvocation(command, args);
  const child = spawn(invocation.command, invocation.args, {
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    detached: process.platform !== 'win32', ...options, ...(invocation.spawnOptions ?? {}),
  });
  // Record close before returning: cleanup may start after it has already fired.
  childCloseStates.set(child, false);
  child.once('close', () => childCloseStates.set(child, true));
  return child;
}

export async function waitForTestChild(child, timeoutMs = 5000) {
  const closeObserved = childCloseStates.get(child);
  if (closeObserved === true) return;
  // Callers using spawn directly have no recorded event. A signal is also an
  // exit, but output pipes must be closed (descendants can keep them open).
  if (closeObserved === undefined
    && (child.exitCode !== null || child.signalCode != null)
    && [child.stdout, child.stderr].every(stream => !stream || stream.closed)) return;
  await new Promise((resolve, reject) => {
    const done = () => {
      childCloseStates.set(child, true);
      clearTimeout(timer); child.off('close', done); resolve();
    };
    const timer = setTimeout(() => {
      child.off('close', done);
      const streamState = stream => stream ? {
        readableEnded: stream.readableEnded, closed: stream.closed, destroyed: stream.destroyed,
      } : null;
      const cleanupState = {
        pid: child.pid ?? null, exitCode: child.exitCode, signalCode: child.signalCode,
        closeObserved: childCloseStates.get(child) === true,
        stdout: streamState(child.stdout), stderr: streamState(child.stderr),
      };
      child.stdout?.destroy(); child.stderr?.destroy(); child.stdin?.destroy();
      reject(Object.assign(new Error(`Child process close was not observed within cleanup deadline (${timeoutMs}ms).\nChild state: ${JSON.stringify(cleanupState)}`), { cleanupState }));
    }, timeoutMs);
    child.once('close', done);
  });
}

export async function runTestProcess(command, args, { timeoutMs = 45000, readyText = null, startupTimeoutMs = 5000, ...options } = {}) {
  const child = spawnTestProcess(command, args, options);
  let stdout = '';
  let stderr = '';
  let waitingForReady = readyText !== null;
  let armTimeout;
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    if (waitingForReady && stdout.includes(readyText)) {
      waitingForReady = false;
      armTimeout(timeoutMs, false);
    }
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  let timer;
  return withCleanup(async () => {
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
      armTimeout = (duration, startup) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          reject(new Error(`Client test ${startup ? 'startup ' : ''}timed out after ${duration}ms.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
        }, duration);
      };
      armTimeout(waitingForReady ? startupTimeoutMs : timeoutMs, waitingForReady);
    });
    return { ...result, stdout, stderr, diagnostic: `exit=${result.code} signal=${result.signal ?? 'none'}\nstdout:\n${stdout}\nstderr:\n${stderr}` };
  }, [() => clearTimeout(timer), () => terminateChildTree(child), () => waitForTestChild(child)]);
}
