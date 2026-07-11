import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { buildInteractiveCliInvocation, isWindowsExecutableShim, quoteWindowsCmdArg, runInteractiveCli } from '../src/platform/process.js';
import { checkGitBashOnWindows, detectCli, detectOS, findExecutable, findWindowsExecutable, isCodexVersionSupported } from '../src/platform/detect.js';

test('Windows command shims preserve TOML quotes without caret leakage', () => {
  const invocation = buildInteractiveCliInvocation('C:\\tools\\codex.cmd', [
    '-c',
    'model_provider="custom"',
    '-c',
    'model_providers.custom={name="routerlab",base_url="https://api.routerlab.ch/v1",wire_api="responses",env_key="OPENAI_API_KEY"}',
  ], {
    platform: 'win32',
    comSpec: 'C:\\Windows\\System32\\cmd.exe',
  });

  assert.equal(invocation.command, 'C:\\Windows\\System32\\cmd.exe');
  assert.deepEqual(invocation.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.match(invocation.args[3], /^""C:\\tools\\codex\.cmd"/);
  assert.match(invocation.args[3], /"model_provider="custom""/);
  assert.match(invocation.args[3], /wire_api="responses"/);
  assert.doesNotMatch(invocation.args[3], /\^custom|\^responses/);
  assert.deepEqual(invocation.spawnOptions, { windowsVerbatimArguments: true });
});

test('a real Windows cmd shim receives Codex overrides without carets', (t) => {
  if (process.platform !== 'win32') {
    t.skip('Windows-only integration test');
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapper-scionos-cmd-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const shimPath = path.join(tempDir, 'capture.cmd');
  fs.writeFileSync(shimPath, [
    '@echo off',
    'echo [%~1]',
    'echo [%~2]',
    'echo [%~3]',
    'echo [%~4]',
  ].join('\r\n'));

  const invocation = buildInteractiveCliInvocation(shimPath, [
    '-c',
    'model_provider="custom"',
    '-c',
    'model="gpt-5.5"',
  ]);
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    ...invocation.spawnOptions,
  });
  if (result.error?.code === 'EPERM') {
    t.skip('The local sandbox blocks nested cmd.exe execution');
    return;
  }

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[model_provider="custom"\]/);
  assert.match(result.stdout, /\[model="gpt-5\.5"\]/);
  assert.doesNotMatch(result.stdout, /\^/);
});

test('Windows command quoting handles empty and percent-containing arguments', () => {
  assert.equal(quoteWindowsCmdArg(''), '""');
  assert.equal(quoteWindowsCmdArg('100%'), '"100%%"');
  assert.equal(isWindowsExecutableShim('codex.cmd', 'win32'), true);
  assert.equal(isWindowsExecutableShim('codex.exe', 'win32'), false);
  assert.equal(isWindowsExecutableShim('codex.cmd', 'linux'), false);
});
test('Windows bare commands are launched directly through PATH', () => {
  const invocation = buildInteractiveCliInvocation('codex', [
    '-c',
    'model_provider="custom"',
    '--help',
  ], {
    platform: 'win32',
  });

  assert.equal(invocation.command, 'codex');
  assert.deepEqual(invocation.args, ['-c', 'model_provider="custom"', '--help']);
  assert.deepEqual(invocation.spawnOptions, {});
});

test('Non-Windows executables keep direct argv spawning', () => {
  const invocation = buildInteractiveCliInvocation('/usr/local/bin/codex', ['-c', 'model="gpt-5.5"'], {
    platform: 'linux',
  });

  assert.deepEqual(invocation, {
    command: '/usr/local/bin/codex',
    spawnOptions: {},
    args: ['-c', 'model="gpt-5.5"'],
  });
});

test('platform detection covers explicit candidates, version parsing, and config reporting', () => {
  assert.equal(findExecutable('definitely-missing', [null, process.execPath]), process.execPath);
  assert.equal(findWindowsExecutable('definitely-missing', [process.execPath]), process.execPath);
  const detected = detectCli({ command: 'node', candidates: [process.execPath], configPath: path.resolve('package.json') });
  assert.equal(detected.installed, true);
  assert.equal(detected.cliPath, process.execPath);
  if (detected.version !== null) assert.match(detected.version, /\d+\.\d+\.\d+/);
  assert.equal(detected.configPath, path.resolve('package.json'));
  const missingConfig = detectCli({ command: 'node', candidates: [process.execPath], configPath: path.resolve('missing.json') });
  assert.equal(missingConfig.configPath, null);
  assert.equal(typeof detectOS().type, 'string');
  assert.equal(typeof checkGitBashOnWindows().available, 'boolean');
  assert.equal(isCodexVersionSupported(null), false);
  assert.equal(isCodexVersionSupported('0.144.1', 'invalid'), false);
  assert.equal(isCodexVersionSupported('0.145.0'), true);
  assert.equal(isCodexVersionSupported('0.143.9'), false);
  assert.equal(isCodexVersionSupported('0.144.1'), true);
});
test('platform detection skips an executable whose version command fails', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapper-scionos-detect-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const broken = path.join(tempDir, process.platform === 'win32' ? 'broken.cmd' : 'broken');
  fs.writeFileSync(broken, process.platform === 'win32' ? '@exit /b 9\r\n' : '#!/bin/sh\nexit 9\n');
  if (process.platform !== 'win32') fs.chmodSync(broken, 0o755);

  const detected = detectCli({ command: 'definitely-missing-cli', candidates: [broken, process.execPath] });
  assert.equal(detected.installed, true);
  assert.equal(detected.cliPath, process.execPath);
});
test('interactive child startup errors are surfaced', async () => {
  await assert.rejects(
    () => runInteractiveCli('definitely-missing-wrapper-scionos-executable'),
    /ENOENT|spawn/,
  );
});
test('interactive child exits and SIGINT terminates its process tree with code 130', async () => {
  const previousExitCode = process.exitCode;
  const normalExit = await runInteractiveCli(process.execPath, ['-e', 'process.exit(7)']);
  assert.equal(normalExit, 7);

  const signals = new EventEmitter();
  const interrupted = runInteractiveCli(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    signalGraceMs: 100,
    signalSource: signals,
  });
  setTimeout(() => signals.emit('SIGINT'), 30);
  assert.equal(await interrupted, 130);

  const terminated = runInteractiveCli(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    signalGraceMs: 100,
    signalSource: signals,
  });
  setTimeout(() => signals.emit('SIGTERM'), 30);
  assert.equal(await terminated, 143);
  if (previousExitCode === undefined) process.exitCode = 0;
  else process.exitCode = previousExitCode;
});