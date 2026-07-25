import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { buildInteractiveCliInvocation, isWindowsExecutableShim, quoteWindowsCmdArg, runInteractiveCli } from '../src/platform/process.js';
import {
  checkGitBashOnWindows,
  claudeCodeCandidates,
  codexCliCandidates,
  detectClaudeCode,
  detectCli,
  detectCodexCli,
  detectOS,
  findExecutable,
  findWindowsExecutable,
  isCodexVersionSupported,
} from '../src/platform/detect.js';

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
  assert.match(invocation.args[3], /model_provider=\\"custom\\"/);
  assert.match(invocation.args[3], /wire_api=\\"responses\\"/);
  assert.doesNotMatch(invocation.args[3], /\^custom|\^responses/);
  assert.deepEqual(invocation.spawnOptions, { windowsVerbatimArguments: true });
});

test('a real npm-style Windows cmd shim forwards Codex overrides exactly', (t) => {
  if (process.platform !== 'win32') {
    t.skip('Windows-only integration test');
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapper-scionos-cmd-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const capturePath = path.join(tempDir, 'capture.json');
  const scriptPath = path.join(tempDir, 'capture.mjs');
  const shimPath = path.join(tempDir, 'capture.cmd');
  fs.writeFileSync(scriptPath, [
    "import fs from 'node:fs';",
    "fs.writeFileSync(process.env.SCIONOS_TEST_CAPTURE, JSON.stringify(process.argv.slice(2)));",
  ].join('\n'));
  fs.writeFileSync(shimPath, [
    '@echo off',
    '"%SCIONOS_TEST_NODE%" "%SCIONOS_TEST_SCRIPT%" %*',
  ].join('\r\n'));

  const expectedArgs = [
    '-c',
    'model_provider="custom"',
    '-c',
    'model="gpt-5.5"',
    '-c',
    'model_providers.custom.base_url="https://api.routerlab.ch/v1"',
    'literal=100%',
  ];
  const invocation = buildInteractiveCliInvocation(shimPath, expectedArgs);
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      SCIONOS_TEST_NODE: process.execPath,
      SCIONOS_TEST_SCRIPT: scriptPath,
      SCIONOS_TEST_CAPTURE: capturePath,
    },
    ...invocation.spawnOptions,
  });
  if (result.error?.code === 'EPERM') {
    t.skip('The local sandbox blocks nested cmd.exe execution');
    return;
  }

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(capturePath), true, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(capturePath, 'utf8')), expectedArgs);
});

test('Windows command quoting handles empty and percent-containing arguments', () => {
  assert.equal(quoteWindowsCmdArg(''), '""');
  assert.equal(quoteWindowsCmdArg('100%'), '"100%"');
  assert.equal(quoteWindowsCmdArg('model="custom"'), '"model=\\"custom\\""');
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

test('platform metadata and client candidates cover Windows, macOS, Linux, and other systems', () => {
  assert.deepEqual(detectOS({
    platform: 'win32',
    processPlatform: 'win32',
    arch: 'x64',
    env: { PSModulePath: 'modules' },
  }), {
    platform: 'win32',
    type: 'Windows',
    arch: 'x64',
    shell: 'PowerShell',
  });
  assert.equal(detectOS({
    platform: 'win32',
    processPlatform: 'win32',
    env: {},
  }).shell, 'Windows Shell');
  assert.deepEqual(detectOS({
    platform: 'darwin',
    processPlatform: 'darwin',
    arch: 'arm64',
    env: { SHELL: '/bin/zsh' },
  }), {
    platform: 'darwin',
    type: 'macOS',
    arch: 'arm64',
    shell: 'zsh',
  });
  assert.equal(detectOS({
    platform: 'linux',
    processPlatform: 'linux',
    env: { SHELL: '/bin/bash' },
  }).type, 'Linux');
  assert.equal(detectOS({
    platform: 'freebsd',
    processPlatform: 'freebsd',
    env: {},
  }).type, 'freebsd');
  assert.equal(detectOS({
    platform: 'freebsd',
    processPlatform: 'freebsd',
    env: {},
  }).shell, 'default shell');

  const windowsClaude = claudeCodeCandidates('win32', 'C:\\Users\\tester');
  assert.equal(windowsClaude.length, 2);
  assert.match(windowsClaude[0], /claude\.exe$/);
  assert.deepEqual(claudeCodeCandidates('linux', '/home/tester'), [
    path.join('/home/tester', '.local', 'bin', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ]);

  let npmBinDetections = 0;
  const windowsCodex = codexCliCandidates('win32', 'C:\\Users\\tester', 'C:\\AppData', {
    getNpmGlobalBinPathFn: () => {
      npmBinDetections += 1;
      return null;
    },
  });
  assert.ok(windowsCodex.length >= 3, `Expected at least 3 Windows candidates, got ${windowsCodex.length}`);
  assert.match(windowsCodex[0], /codex$/);
  assert.equal(npmBinDetections, 1);
  const darwinCodex = codexCliCandidates('darwin', '/Users/tester', '/unused', {
    getNpmGlobalBinPathFn: () => null,
  });
  assert.ok(darwinCodex.length >= 3, `Expected at least 3 macOS candidates, got ${darwinCodex.length}`);
  assert.ok(darwinCodex.includes(path.join('/Users/tester', '.local', 'bin', 'codex')));
  assert.ok(darwinCodex.includes('/opt/homebrew/bin/codex'));
  assert.ok(darwinCodex.includes('/usr/local/bin/codex'));
});

test('Claude and Codex detection factories preserve platform-specific results', () => {
  let claudeOptions = null;
  const claude = detectClaudeCode({
    platform: 'linux',
    home: '/home/tester',
    detectCliFn: (options) => {
      claudeOptions = options;
      return { installed: false, cliPath: null, version: null };
    },
  });
  assert.equal(claude.installed, false);
  assert.equal(claudeOptions.command, 'claude');
  assert.equal(claudeOptions.configPath, path.join('/home/tester', '.claude', 'settings.json'));
  assert.deepEqual(claudeOptions.candidates, claudeCodeCandidates('linux', '/home/tester'));

  let codexOptions = null;
  const windowsCodex = detectCodexCli({
    platform: 'win32',
    home: 'C:\\Users\\tester',
    appData: 'C:\\AppData',
    detectCliFn: (options) => {
      codexOptions = options;
      return { installed: true, cliPath: 'C:\\AppData\\npm\\codex.cmd', version: 'codex 0.144.1' };
    },
  });
  assert.equal(codexOptions.preferWindowsShim, true);
  assert.equal(windowsCodex.versionSupported, true);
  assert.equal(windowsCodex.resolvedCliPath, windowsCodex.cliPath);

  const linuxCodex = detectCodexCli({
    platform: 'linux',
    home: '/home/tester',
    detectCliFn: () => ({
      installed: true,
      cliPath: '/usr/local/bin/codex',
      version: 'codex 0.144.0',
    }),
  });
  assert.equal(linuxCodex.versionSupported, false);
  assert.equal('resolvedCliPath' in linuxCodex, false);

  const missingCodex = detectCodexCli({
    platform: 'linux',
    detectCliFn: () => ({ installed: false, cliPath: null, version: null }),
  });
  assert.equal(missingCodex.versionSupported, false);
});

test('Git Bash detection covers non-Windows, configured, and missing paths', () => {
  assert.deepEqual(checkGitBashOnWindows({ platform: 'linux' }), {
    available: true,
    path: null,
    message: 'Not required on non-Windows systems.',
  });

  const configuredPath = 'C:\\tools\\bash.exe';
  assert.deepEqual(checkGitBashOnWindows({
    platform: 'win32',
    env: { CLAUDE_CODE_GIT_BASH_PATH: configuredPath },
    existsSync: (candidate) => candidate === configuredPath,
  }), {
    available: true,
    path: configuredPath,
    message: `Git Bash found at ${configuredPath}.`,
  });

  const missing = checkGitBashOnWindows({
    platform: 'win32',
    env: {},
    existsSync: () => false,
  });
  assert.equal(missing.available, false);
  assert.match(missing.message, /Git Bash not found/);
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
test('platform detection skips a version command that exceeds its timeout', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapper-scionos-detect-timeout-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const hanging = path.join(tempDir, process.platform === 'win32' ? 'hanging.cmd' : 'hanging');
  const working = path.join(tempDir, process.platform === 'win32' ? 'working.cmd' : 'working');
  fs.writeFileSync(hanging, '');
  fs.writeFileSync(working, '');
  if (process.platform !== 'win32') {
    fs.chmodSync(hanging, 0o755);
    fs.chmodSync(working, 0o755);
  }

  let calls = 0;
  const detected = detectCli({
    command: 'definitely-missing-cli',
    candidates: [hanging, working],
    versionTimeoutMs: 500,
    spawnSyncFn: () => {
      calls += 1;
      return calls === 1
        ? { status: null, error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }) }
        : { status: 0, stdout: 'wrapper-test 1.0.0\n', stderr: '' };
    },
  });

  assert.equal(detected.installed, true);
  assert.equal(detected.cliPath, working);
  assert.equal(detected.version, 'wrapper-test 1.0.0');
  assert.equal(calls, 2);
});
test('interactive child startup errors are surfaced', async () => {
  await assert.rejects(
    () => runInteractiveCli('definitely-missing-wrapper-scionos-executable'),
    /ENOENT|spawn/,
  );
});
test('interactive child can return its code without updating the parent exit state', async () => {
  const previousExitCode = process.exitCode;
  process.exitCode = 17;
  try {
    const exitCode = await runInteractiveCli(process.execPath, ['-e', 'process.exit(9)'], {
      updateProcessExitCode: false,
    });
    assert.equal(exitCode, 9);
    assert.equal(process.exitCode, 17);
  } finally {
    if (previousExitCode === undefined) process.exitCode = 0;
    else process.exitCode = previousExitCode;
  }
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
