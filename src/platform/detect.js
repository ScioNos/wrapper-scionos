import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildInteractiveCliInvocation } from './process.js';

export function detectOS() {
  const platform = os.platform();
  const type = platform === 'win32'
    ? 'Windows'
    : platform === 'darwin'
      ? 'macOS'
      : platform === 'linux'
        ? 'Linux'
        : platform;

  return {
    platform,
    type,
    arch: os.arch(),
    shell: process.platform === 'win32'
      ? (process.env.PSModulePath ? 'PowerShell' : 'Windows Shell')
      : path.basename(process.env.SHELL || 'default shell'),
  };
}

export function findExecutable(command, candidates = []) {
  for (const candidate of candidates.filter(Boolean)) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const lookup = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(lookup, [command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).find((line) => line && fs.existsSync(line)) ?? null;
}

export function findWindowsExecutable(command, candidates = []) {
  if (process.platform !== 'win32') {
    return findExecutable(command, candidates);
  }

  const expandedCandidates = candidates.flatMap((candidate) => expandWindowsExecutableCandidate(candidate));
  const fromCandidates = expandedCandidates.find((candidate) => fs.existsSync(candidate));
  if (fromCandidates) {
    return fromCandidates;
  }

  const result = spawnSync('where.exe', [command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (result.status !== 0) {
    return null;
  }

  const matches = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && fs.existsSync(line));
  return matches.find(isWindowsExecutableShim) ?? matches[0] ?? null;
}

function expandWindowsExecutableCandidate(candidate) {
  if (!candidate) {
    return [];
  }
  if (path.extname(candidate)) {
    return [candidate];
  }
  return ['.cmd', '.bat', '.exe', ''].map((extension) => `${candidate}${extension}`);
}

function isWindowsExecutableShim(filePath) {
  return /\.(cmd|bat|exe)$/i.test(filePath);
}

export function detectCli({
  command,
  candidates = [],
  configPath = null,
  preferWindowsShim = false,
} = {}) {
  const find = preferWindowsShim ? findWindowsExecutable : findExecutable;
  const cliPath = find(command, candidates);
  let version = null;
  if (cliPath) {
    const invocation = buildInteractiveCliInvocation(cliPath, ['--version']);
    const result = spawnSync(invocation.command, invocation.args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (result.status === 0) {
      version = result.stdout.trim();
    }
  }

  const detected = {
    installed: Boolean(cliPath),
    cliPath,
    version,
  };
  if (configPath) {
    detected.configPath = fs.existsSync(configPath) ? configPath : null;
  }
  return detected;
}

export function detectClaudeCode() {
  const home = os.homedir();
  const candidates = process.platform === 'win32'
    ? [
        path.join(home, '.local', 'bin', 'claude.exe'),
        path.join(home, 'AppData', 'Local', 'Microsoft', 'WindowsApps', 'claude.exe'),
      ]
    : [
        path.join(home, '.local', 'bin', 'claude'),
        '/opt/homebrew/bin/claude',
        '/usr/local/bin/claude',
      ];

  return detectCli({
    command: 'claude',
    candidates,
    configPath: path.join(home, '.claude', 'settings.json'),
  });
}

export function detectCodexCli() {
  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const candidates = process.platform === 'win32'
    ? [
        path.join(appData, 'npm', 'codex'),
        path.join(home, '.local', 'bin', 'codex.exe'),
        path.join(home, 'AppData', 'Local', 'Microsoft', 'WindowsApps', 'codex.exe'),
      ]
    : [
        path.join(home, '.local', 'bin', 'codex'),
        '/opt/homebrew/bin/codex',
        '/usr/local/bin/codex',
      ];

  const detected = detectCli({
    command: 'codex',
    candidates,
    preferWindowsShim: true,
  });
  if (process.platform === 'win32' && detected.installed) {
    return {
      ...detected,
      cliPath: 'codex',
      resolvedCliPath: detected.cliPath,
    };
  }
  return detected;
}

export function checkGitBashOnWindows() {
  if (process.platform !== 'win32') {
    return { available: true, path: null, message: 'Not required on non-Windows systems.' };
  }

  const candidates = [
    process.env.CLAUDE_CODE_GIT_BASH_PATH,
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  ].filter(Boolean);

  const bashPath = candidates.find((candidate) => fs.existsSync(candidate));
  return bashPath
    ? { available: true, path: bashPath, message: `Git Bash found at ${bashPath}.` }
    : { available: false, path: null, message: 'Git Bash not found. Claude Code requires Git Bash on Windows.' };
}
