import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter, once } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { withCleanup, removeTestDirectory, runTestProcess, spawnTestProcess, waitForTestChild } from './support/lifecycle.mjs';
import { removeTemporaryDirectorySync } from '../src/platform/temp-directory.js';

test('cleanup retains the original failure and attempts every cleanup', async () => {
  const original = new Error('original failure');
  let lastRan = false;
  await assert.rejects(withCleanup(() => { throw original; }, [() => { throw new Error('locked file'); }, () => { lastRan = true; }]), (error) => error === original && error.cleanupErrors[0].message === 'locked file');
  assert.equal(lastRan, true);
  await assert.rejects(withCleanup(() => 0, [() => { throw new Error('cleanup only'); }]), AggregateError);
});

test('recursive cleanup rejects the root and escaped paths and removes test children', async () => {
  assert.throws(() => removeTemporaryDirectorySync(os.tmpdir(), os.tmpdir()), /Refusing/);
  assert.throws(() => removeTemporaryDirectorySync(path.resolve(os.tmpdir(), '..'), os.tmpdir()), /Refusing/);
  await assert.rejects(removeTestDirectory(os.tmpdir()), /Refusing/);
  await assert.rejects(removeTestDirectory(path.resolve(os.tmpdir(), '..')), /Refusing/);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapper-scionos-cleanup-'));
  const child = path.join(root, 'child');
  fs.mkdirSync(child);
  await removeTestDirectory(child, root);
  assert.equal(fs.existsSync(child), false);
  await removeTestDirectory(root);
});

test('a redirected timed-out test process tree is killed and diagnostics survive', { timeout: 20000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapper-scionos-tree-'));
  const marker = path.join(root, 'grandchild.txt');
  const childCode = `import fs from 'node:fs'; fs.appendFileSync(${JSON.stringify(marker)}, 'x'); console.log('tree-started'); setInterval(() => fs.appendFileSync(${JSON.stringify(marker)}, 'x'), 20);`;
  const parentCode = `import {spawn} from 'node:child_process'; spawn(process.execPath, ['--input-type=module','-e',${JSON.stringify(childCode)}], {stdio:'inherit'}); setInterval(()=>{},1000);`;
  await withCleanup(async () => {
    await assert.rejects(runTestProcess(process.execPath, ['--input-type=module', '-e', parentCode], { timeoutMs: 300, readyText: 'tree-started' }), /timed out.*\nstdout:\ntree-started/);
    const size = fs.existsSync(marker) ? fs.statSync(marker).size : 0;
    assert.ok(size > 0, 'The grandchild must have started writing before the timeout');
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(fs.existsSync(marker) ? fs.statSync(marker).size : 0, size, 'The grandchild must stop writing after tree cleanup');
  }, [() => removeTestDirectory(root)]);
});

test('a redirected process that never becomes ready has a bounded startup deadline', { timeout: 15000 }, async () => {
  await assert.rejects(runTestProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { readyText: 'never-ready', startupTimeoutMs: 100 }), /startup timed out after 100ms/);
});

test('cleanup recognizes a signal termination whose close event already fired', { timeout: 10000 }, async (t) => {
  const child = spawnTestProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)']);
  t.after(async () => { child.kill('SIGKILL'); await waitForTestChild(child); });
  child.stdout.resume(); child.stderr.resume();
  await once(child, 'spawn');
  const closed = once(child, 'close');
  child.kill('SIGKILL');
  await closed;
  assert.equal(child.exitCode, null);
  assert.equal(child.signalCode, 'SIGKILL');
  assert.equal(child.stdout.readableEnded, true);
  assert.equal(child.stderr.readableEnded, true);
  await waitForTestChild(child, 50);
  await waitForTestChild(child, 50);
});

test('cleanup remembers close when captured streams were destroyed before ending', { timeout: 10000 }, async () => {
  const child = spawnTestProcess(process.execPath, ['-e', '']);
  const closed = once(child, 'close');
  child.stdout.destroy(); child.stderr.destroy();
  await closed;
  assert.equal(child.stdout.readableEnded, false);
  assert.equal(child.stderr.readableEnded, false);
  await waitForTestChild(child, 50);
});

for (const stdio of ['ignore', 'inherit']) {
  test(`cleanup remembers close with ${stdio} stdio`, { timeout: 10000 }, async () => {
    const child = spawnTestProcess(process.execPath, ['-e', ''], { stdio });
    await once(child, 'close');
    await waitForTestChild(child, 50);
  });
}

test('cleanup supports concurrent waiters before close and repeated waits afterwards', { timeout: 10000 }, async (t) => {
  const child = spawnTestProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)']);
  t.after(async () => { child.kill('SIGKILL'); await waitForTestChild(child); });
  child.stdout.resume(); child.stderr.resume();
  await once(child, 'spawn');
  const waits = [waitForTestChild(child), waitForTestChild(child)];
  child.kill('SIGKILL');
  await Promise.all(waits);
  assert.equal(child.listenerCount('close'), 0);
  await waitForTestChild(child, 50);
});

test('cleanup recognizes an already closed signal-terminated child created outside the helper', { timeout: 10000 }, async (t) => {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true });
  t.after(async () => { child.kill('SIGKILL'); await waitForTestChild(child); });
  child.stdout.resume(); child.stderr.resume();
  await once(child, 'spawn');
  const closed = once(child, 'close');
  child.kill('SIGKILL');
  await closed;
  await waitForTestChild(child, 50);
});

test('cleanup waits for output pipes after a signal exit until close is observed', async () => {
  const child = Object.assign(new EventEmitter(), {
    exitCode: null, signalCode: 'SIGKILL', stdout: new PassThrough(), stderr: new PassThrough(),
  });
  let completed = false;
  const waiting = waitForTestChild(child).then(() => { completed = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, false, 'Signal exit must not bypass open output pipes');
  child.stdout.destroy();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, false, 'One closed output pipe must not bypass the other');
  const stderrClosed = once(child.stderr, 'close');
  child.stderr.destroy();
  await stderrClosed;
  child.emit('close', null, 'SIGKILL');
  await waiting;
  assert.equal(child.stdout.closed, true);
  assert.equal(child.stderr.closed, true);
});

test('cleanup timeout reports process and stream state before destroying the pipes', { timeout: 10000 }, async (t) => {
  const child = spawnTestProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)']);
  t.after(async () => { child.kill('SIGKILL'); await waitForTestChild(child); });
  await once(child, 'spawn');
  const closeListeners = child.listenerCount('close');
  await assert.rejects(waitForTestChild(child, 50), (error) => {
    assert.match(error.message, /cleanup deadline.*50ms/);
    assert.equal(error.cleanupState.pid, child.pid);
    assert.equal(error.cleanupState.exitCode, null);
    assert.equal(error.cleanupState.signalCode, null);
    assert.equal(error.cleanupState.closeObserved, false);
    assert.equal(error.cleanupState.stdout.readableEnded, false);
    assert.equal(error.cleanupState.stdout.closed, false);
    assert.equal(error.cleanupState.stdout.destroyed, false);
    assert.equal(error.cleanupState.stderr.closed, false);
    return true;
  });
  assert.equal(child.listenerCount('close'), closeListeners);
  assert.equal(child.stdout.destroyed, true);
  const closed = once(child, 'close');
  child.kill('SIGKILL');
  await closed;
  await waitForTestChild(child, 50);
});

test('temporary cleanup rejects a junction or symlink pointing outside its intended parent', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapper-scionos-link-root-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapper-scionos-link-outside-'));
  const link = path.join(root, 'link');
  await withCleanup(async () => {
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(removeTestDirectory(link, root), /Refusing/);
    assert.throws(() => removeTemporaryDirectorySync(link, root), /Refusing/);
    assert.equal(fs.existsSync(outside), true);
  }, [() => removeTestDirectory(root), () => removeTestDirectory(outside)]);
});
