import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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

  const lookup = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(lookup, [command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (result.status !== 0) {
    return null;
  }
  const first = result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return first && fs.existsSync(first) ? first : null;
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

  const cliPath = findExecutable('claude', candidates);
  let version = null;
  if (cliPath) {
    const result = spawnSync(cliPath, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (result.status === 0) {
      version = result.stdout.trim();
    }
  }

  const configPath = path.join(home, '.claude', 'settings.json');
  return {
    installed: Boolean(cliPath),
    cliPath,
    version,
    configPath: fs.existsSync(configPath) ? configPath : null,
  };
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
