import { removeTestDirectory } from './support/lifecycle.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { buildInteractiveCliInvocation, isWindowsExecutableShim, quoteWindowsCmdArg, resolveNpmShimNodeScript, runInteractiveCli } from '../src/platform/process.js';
import { mergeNoProxyValues } from '../src/platform/no-proxy.js';
import { resolveNpmShimExecutable } from '../src/platform/process.js';
import {
  checkGitBashOnWindows,
  claudeCodeCandidates,
  codexCliCandidates,
  detectClaudeCode,
  detectCli,
  detectCodexCli,
  detectOpenCodeCli,
  detectOS,
  findExecutable,
  findWindowsExecutable,
  isClaudeCodeVersionSupported,
  isCodexVersionSupported,
  opencodeCliCandidates,
} from '../src/platform/detect.js';

test('Windows command shims resolve npm entry points without a shell and reject unknown unsafe shims', () => {
  const nodeScript = 'C:\\tools\\node_modules\\@openai\\codex\\bin\\codex.js';
  const argumentsWithTomlQuotes = ['-c', 'model_provider="custom"', '-c', 'model_providers.custom.base_url="https://api.routerlab.ch/v1"'];
  const resolved = buildInteractiveCliInvocation('C:\\tools\\codex.cmd', argumentsWithTomlQuotes, {
    platform: 'win32',
    nodePath: 'C:\\Program Files\\nodejs\\node.exe',
    resolveNpmShimFn: () => nodeScript,
  });
  assert.equal(resolved.command, 'C:\\Program Files\\nodejs\\node.exe');
  assert.deepEqual(resolved.args, [nodeScript, ...argumentsWithTomlQuotes]);
  assert.deepEqual(resolved.spawnOptions, {});

  assert.throws(
    () => buildInteractiveCliInvocation('C:\\tools\\codex.cmd', ['-c', 'model_provider="custom"'], {
      platform: 'win32',
      comSpec: 'C:\\Windows\\System32\\cmd.exe',
    }),
    /Refusing to pass argument through cmd\.exe/,
  );
  const shimContents = [
    '@ECHO off',
    '\"%_prog%\" \"%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js\" %*',
  ].join('\n');
  assert.equal(
    resolveNpmShimNodeScript('C:\\tools\\codex.cmd', {
      readFileSync: () => shimContents,
      existsSync: () => true,
    }),
    'C:\\tools\\node_modules\\@openai\\codex\\bin\\codex.js',
  );
  const invocation = buildInteractiveCliInvocation('C:\\tools\\codex.cmd', [
    '-c',
    'model_provider=custom',
  ], {
    platform: 'win32',
    comSpec: 'C:\\Windows\\System32\\cmd.exe',
  });

  assert.equal(invocation.command, 'C:\\Windows\\System32\\cmd.exe');
  assert.deepEqual(invocation.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.match(invocation.args[3], /^""C:\\tools\\codex\.cmd"/);
  assert.match(invocation.args[3], /model_provider=custom/);
  assert.deepEqual(invocation.spawnOptions, { windowsVerbatimArguments: true });
});

test('native executable npm shims preserve quoted argv without cmd.exe', () => {
  const resolve = (source) => resolveNpmShimExecutable('C:\\tools\\node_modules\\.bin\\codex.cmd', { readFileSync: () => source, existsSync: () => true });
  assert.equal(resolve('"%dp0%\\..\\@openai\\codex\\bin\\codex.exe" %*'), 'C:\\tools\\node_modules\\@openai\\codex\\bin\\codex.exe');
  assert.equal(resolve('"%dp0%\\..\\@openai\\codex\\bin\\codex.exe" %* & echo injected'), null);
  assert.equal(resolve('"%dp0%\\..\\..\\outside.exe" %*'), null);
  const argv = ['-c', 'model="gpt-6.1-sol"'];
  assert.deepEqual(buildInteractiveCliInvocation('C:\\tools\\codex.cmd', argv, { platform: 'win32', resolveNpmShimFn: () => null, resolveNpmExecutableFn: () => 'C:\\tools\\node_modules\\codex.exe' }), { command: 'C:\\tools\\node_modules\\codex.exe', args: argv, spawnOptions: {} });
});

test('local node_modules/.bin npm shims resolve one safe parent hop', () => {
  const resolve = (target) => resolveNpmShimNodeScript('C:\\tools\\node_modules\\.bin\\codex.cmd', { readFileSync: () => `"%_prog%" "%dp0%\\${target}" %*`, existsSync: () => true });
  assert.equal(resolve('..\\@openai\\codex\\bin\\codex.js'), 'C:\\tools\\node_modules\\@openai\\codex\\bin\\codex.js');
  assert.equal(resolve('..\\..\\outside.js'), null);
});

test('npm shim resolution accepts generated formats and refuses ambiguous targets', () => {
  const resolve = (invocation, exists = true) => resolveNpmShimNodeScript('C:\\tools\\codex.cmd', {
    readFileSync: () => '@ECHO off\r\n' + invocation + '\r\n',
    existsSync: () => exists,
  });
  const target = '"%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*';
  const scriptPath = 'C:\\tools\\node_modules\\@openai\\codex\\bin\\codex.js';
  assert.equal(resolve(target), scriptPath);
  assert.equal(resolve('endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & ' + target), scriptPath);
  assert.equal(resolve(target, false), null);
  assert.equal(resolve(target.replace('node_modules\\', '..\\node_modules\\')), null);
  assert.equal(resolve(target + ' & exit 99'), null);
  assert.equal(resolve('echo arbitrary-prefix & ' + target), null);
});

test('a modern npm Windows shim forwards quoted Codex overrides without shell expansion', (t) => {
  if (process.platform !== 'win32') {
    t.skip('Windows-only integration test');
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapper-scionos-npm-cmd-'));
  t.after(() => removeTestDirectory(tempDir));
  const scriptDir = path.join(tempDir, 'node_modules', 'capture', 'bin');
  fs.mkdirSync(scriptDir, { recursive: true });
  const scriptPath = path.join(scriptDir, 'capture.js');
  const capturePath = path.join(tempDir, 'capture.json');
  const shimPath = path.join(tempDir, 'capture.cmd');
  fs.writeFileSync(scriptPath, [
    "const fs = require('node:fs');",
    "fs.writeFileSync(process.env.SCIONOS_TEST_CAPTURE, JSON.stringify(process.argv.slice(2)));",
  ].join('\n'));
  fs.writeFileSync(shimPath, [
    '@ECHO off',
    'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\capture\\bin\\capture.js" %*',
  ].join('\r\n'));
  const expectedArgs = [
    '-c', 'model_provider="custom"',
    '-c', 'model_providers.custom.base_url="https://api.routerlab.ch/v1"',
    'literal=%SCIONOS_TEST_CAPTURE%',
    'literal=" & exit 99 & rem "',
    'multi\nline',
    '',
  ];
  const invocation = buildInteractiveCliInvocation(shimPath, expectedArgs);
  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(invocation.args, [scriptPath, ...expectedArgs]);
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    env: { ...process.env, SCIONOS_TEST_CAPTURE: capturePath },
    ...invocation.spawnOptions,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(capturePath, 'utf8')), expectedArgs);
});

test('unrecognized Windows cmd shims forward plain arguments and reject unsafe overrides', (t) => {
  if (process.platform !== 'win32') {
    t.skip('Windows-only integration test');
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapper-scionos-cmd-'));
  t.after(() => removeTestDirectory(tempDir));
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
    'model_provider=custom',
    '-c',
    'model=gpt-5.5',
    '-c',
    'model_providers.custom.base_url=https://api.routerlab.ch/v1',
    'literal=plain',
  ];
  assert.throws(() => buildInteractiveCliInvocation(shimPath, ['-c', 'model_provider="custom"']), /Refusing to pass argument through cmd\.exe/);
  assert.throws(() => buildInteractiveCliInvocation(shimPath, ['literal=100%']), /Refusing to pass argument through cmd\.exe/);
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

test('Windows command quoting refuses cmd.exe metacharacters', () => {
  assert.equal(quoteWindowsCmdArg(''), '""');
  assert.equal(quoteWindowsCmdArg('plain'), '"plain"');
  assert.equal(quoteWindowsCmdArg('C:\\tools\\claude.cmd'), '"C:\\tools\\claude.cmd"');
  assert.throws(() => quoteWindowsCmdArg('100%'), /Refusing to pass argument through cmd\.exe/);
  assert.throws(() => quoteWindowsCmdArg('model="custom"'), /Refusing to pass argument through cmd\.exe/);
  assert.throws(() => quoteWindowsCmdArg('evil" & calc.exe & rem "'), /Refusing to pass argument through cmd\.exe/);
  assert.throws(() => quoteWindowsCmdArg('line1\r\nline2'), /Refusing to pass argument through cmd\.exe/);
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

test('NO_PROXY merging preserves existing hosts and adds all loopback forms once', () => {
  assert.equal(
    mergeNoProxyValues({ no_proxy: 'example.test,localhost', NO_PROXY: 'router.test' }, '127.0.0.1'),
    'example.test,localhost,router.test,127.0.0.1,::1',
  );
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

  const windowsOpenCode = opencodeCliCandidates('win32', 'C:\\Users\\tester', 'C:\\AppData', {
    getNpmGlobalBinPathFn: () => null,
  });
  assert.ok(windowsOpenCode.length >= 3);
  assert.match(windowsOpenCode[0], /opencode$/);
  const darwinOpenCode = opencodeCliCandidates('darwin', '/Users/tester', '/unused', {
    getNpmGlobalBinPathFn: () => null,
  });
  assert.ok(darwinOpenCode.includes(path.join('/Users/tester', '.local', 'bin', 'opencode')));
  assert.ok(darwinOpenCode.includes('/opt/homebrew/bin/opencode'));
  assert.ok(darwinOpenCode.includes('/usr/local/bin/opencode'));
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
  assert.equal(claude.minimumVersion, '2.1.220');
  assert.equal(claude.versionSupported, false);
  assert.equal(claudeOptions.command, 'claude');
  assert.equal(claudeOptions.configPath, path.join('/home/tester', '.claude', 'settings.json'));
  assert.deepEqual(claudeOptions.candidates, claudeCodeCandidates('linux', '/home/tester'));

  const supportedClaude = detectClaudeCode({
    platform: 'darwin',
    home: '/Users/tester',
    detectCliFn: () => ({
      installed: true,
      cliPath: '/opt/homebrew/bin/claude',
      version: '2.1.220 (Claude Code)',
    }),
  });
  assert.equal(supportedClaude.versionSupported, true);

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
  assert.equal('resolvedCliPath' in windowsCodex, false);

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

  let openCodeOptions = null;
  const openCode = detectOpenCodeCli({
    platform: 'win32',
    home: 'C:\\Users\\tester',
    appData: 'C:\\AppData',
    getNpmGlobalBinPathFn: () => null,
    detectCliFn: (options) => {
      openCodeOptions = options;
      return { installed: true, cliPath: 'C:\\AppData\\npm\\opencode.cmd', version: '1.18.30' };
    },
  });
  assert.equal(openCode.versionSupported, true);
  assert.equal(openCodeOptions.command, 'opencode');
  assert.equal(openCodeOptions.preferWindowsShim, true);
  assert.match(openCodeOptions.env.XDG_CONFIG_HOME, /wrapper-scionos-opencode-detect-/);
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
  t.after(() => removeTestDirectory(tempDir));
  const broken = path.join(tempDir, process.platform === 'win32' ? 'broken.cmd' : 'broken');
  fs.writeFileSync(broken, process.platform === 'win32' ? '@exit /b 9\r\n' : '#!/bin/sh\nexit 9\n');
  if (process.platform !== 'win32') fs.chmodSync(broken, 0o755);

  const detected = detectCli({ command: 'definitely-missing-cli', candidates: [broken, process.execPath] });
  assert.equal(detected.installed, true);
  assert.equal(detected.cliPath, process.execPath);
});
test('platform detection skips a version command that exceeds its timeout', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapper-scionos-detect-timeout-'));
  t.after(() => removeTestDirectory(tempDir));
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

test('Claude Code version policy accepts only 2.1.220 or newer semantic versions', () => {
  assert.equal(isClaudeCodeVersionSupported('2.1.219 (Claude Code)'), false);
  assert.equal(isClaudeCodeVersionSupported('2.1.220 (Claude Code)'), true);
  assert.equal(isClaudeCodeVersionSupported('2.2.0'), true);
  assert.equal(isClaudeCodeVersionSupported('unknown'), false);
});
test('interactive child startup errors are surfaced', { timeout: 10000 }, async () => {
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
test('interactive child exits and SIGINT terminates its process tree with code 130', { timeout: 15000 }, async () => {
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
