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
  return findExecutables(command, candidates)[0] ?? null;
}

export function findWindowsExecutable(command, candidates = []) {
  return findExecutables(command, candidates, { preferWindowsShim: true })[0] ?? null;
}

function findExecutables(command, candidates = [], { preferWindowsShim = false } = {}) {
  const values = [];
  const add = (candidate) => {
    if (!candidate) return;
    const key = process.platform === 'win32' ? candidate.toLowerCase() : candidate;
    if (!values.some((entry) => entry.key === key) && isExecutableFile(candidate)) {
      values.push({ key, path: candidate });
    }
  };

  for (const candidate of candidates.filter(Boolean)) {
    for (const expanded of expandExecutableCandidate(candidate, preferWindowsShim)) add(expanded);
  }

  const pathEntries = String(process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const pathCandidates = path.isAbsolute(command)
    ? expandExecutableCandidate(command, preferWindowsShim)
    : pathEntries.flatMap((directory) => expandExecutableCandidate(path.join(directory, command), preferWindowsShim));
  for (const candidate of pathCandidates) add(candidate);
  return values.map((entry) => entry.path);
}

function expandExecutableCandidate(candidate, preferWindowsShim) {
  if (process.platform !== 'win32' || path.extname(candidate)) return [candidate];
  const pathExt = String(process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((extension) => extension.trim().toLowerCase())
    .filter(Boolean);
  const preferred = preferWindowsShim
    ? ['.cmd', '.bat', '.exe', ...pathExt, '']
    : [...pathExt, ''];
  return [...new Set(preferred)].map((extension) => candidate + extension);
}

function isExecutableFile(filePath) {
  try {
    if (!fs.statSync(filePath).isFile()) return false;
    if (process.platform !== 'win32') fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function detectCli({
  command,
  candidates = [],
  configPath = null,
  preferWindowsShim = false,
} = {}) {
  const cliCandidates = findExecutables(command, candidates, { preferWindowsShim });
  let cliPath = null;
  let version = null;
  for (const candidate of cliCandidates) {
    const invocation = buildInteractiveCliInvocation(candidate, ['--version']);
    const result = spawnSync(invocation.command, invocation.args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(invocation.spawnOptions ?? {}),
    });
    if (result.status === 0) {
      cliPath = candidate;
      version = (result.stdout || result.stderr || '').trim() || null;
      break;
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

export const MINIMUM_CODEX_VERSION = '0.144.1';

export function isCodexVersionSupported(version, minimum = MINIMUM_CODEX_VERSION) {
  const actual = String(version ?? '').match(/(\d+)\.(\d+)\.(\d+)/);
  const required = String(minimum).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!actual || !required) {
    return false;
  }
  for (let index = 1; index <= 3; index += 1) {
    const delta = Number(actual[index]) - Number(required[index]);
    if (delta !== 0) {
      return delta > 0;
    }
  }
  return true;
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
  detected.minimumVersion = MINIMUM_CODEX_VERSION;
  detected.versionSupported = detected.installed && isCodexVersionSupported(detected.version);
  if (process.platform === 'win32' && detected.installed) {
    return {
      ...detected,
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
