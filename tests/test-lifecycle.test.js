import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withCleanup, removeTestDirectory, runTestProcess } from './support/lifecycle.mjs';
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
