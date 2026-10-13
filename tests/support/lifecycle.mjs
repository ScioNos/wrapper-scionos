import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildInteractiveCliInvocation, terminateChildTree } from '../../src/platform/process.js';

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
  return spawn(invocation.command, invocation.args, {
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    detached: process.platform !== 'win32', ...options, ...(invocation.spawnOptions ?? {}),
  });
}

export async function waitForTestChild(child, timeoutMs = 5000) {
  if (child.exitCode !== null && child.stdout?.readableEnded && child.stderr?.readableEnded) return;
  await new Promise((resolve, reject) => {
    const done = () => { clearTimeout(timer); child.off('close', done); resolve(); };
    const timer = setTimeout(() => {
      child.off('close', done);
      child.stdout?.destroy(); child.stderr?.destroy(); child.stdin?.destroy();
      reject(new Error('Process tree did not close within cleanup deadline'));
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
