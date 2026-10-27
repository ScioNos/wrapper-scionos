import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { isCodexVersionSupported } from './detect.js';
import { appConfigError } from './codex-app-toml.js';

export const MINIMUM_CODEX_APP_ENGINE = '0.164.0';
const powershell = env => path.win32.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const windowsInventory = String.raw`
$ErrorActionPreference='Stop'
$p=Get-AppxPackage -Name OpenAI.Codex -ErrorAction SilentlyContinue | Sort-Object Version -Descending | Select-Object -First 1
if ($p) {
  @{ root=$p.InstallLocation; version=[string]$p.Version; packageId=($p.PackageFamilyName+'!App') } | ConvertTo-Json -Compress
} else {
  $exe=Get-Process -Name ChatGPT,Codex -ErrorAction SilentlyContinue | Where-Object { $_.Path -match '\\WindowsApps\\OpenAI\.Codex_[^\\]+\\app\\[^\\]+\.exe$' } | Select-Object -First 1 -ExpandProperty Path
  if ($exe -and $exe -match 'OpenAI\.Codex_([\d.]+)_[^_]+__([^\\]+)') {
    @{root=(Split-Path (Split-Path $exe));version=$Matches[1];packageId=('OpenAI.Codex_'+$Matches[2]+'!App')} | ConvertTo-Json -Compress
  }
}`;

function systemRead(run, command, args, env) {
  const result = run(command, args, { env, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 });
  return result.status === 0 ? String(result.stdout ?? '').trim() : '';
}

export function detectCodexApp({ platform = process.platform, env = process.env, home = os.homedir(), fileSystem = fs, run = spawnSync } = {}) {
  const result = { supported: ['win32', 'darwin'].includes(platform), installed: false, running: false,
    version: null, engineVersion: null, versionSupported: false, minimumVersion: MINIMUM_CODEX_APP_ENGINE, platform };
  if (!result.supported) return result;
  if (platform === 'win32') {
    let installed;
    try { installed = JSON.parse(systemRead(run, powershell(env), ['-NoProfile', '-NonInteractive', '-Command', windowsInventory], env) || 'null'); } catch { /* Try an ordinary app installation below. */ }
    const candidates = installed ? [{ ...installed, appPath: path.win32.join(installed.root, 'app', 'ChatGPT.exe'), enginePath: path.win32.join(installed.root, 'app', 'resources', 'codex.exe') }] : [];
    for (const appName of ['Codex', 'ChatGPT']) {
      const root = path.win32.join(env.LOCALAPPDATA || path.win32.join(home, 'AppData', 'Local'), 'Programs', appName);
      candidates.push({ appPath: path.win32.join(root, appName + '.exe'), enginePath: path.win32.join(root, 'resources', 'codex.exe'), version: null });
    }
    Object.assign(result, candidates.find(candidate => fileSystem.existsSync(candidate.appPath) && fileSystem.existsSync(candidate.enginePath)) ?? {});
  } else {
    for (const directory of ['/Applications', path.posix.join(home, 'Applications')]) for (const name of ['Codex.app', 'ChatGPT.app']) {
      if (result.appPath) break;
      const bundle = path.posix.join(directory, name);
      const enginePath = path.posix.join(bundle, 'Contents', 'Resources', 'codex');
      if (!fileSystem.existsSync(enginePath)) continue;
      const info = path.posix.join(bundle, 'Contents', 'Info.plist');
      const read = key => systemRead(run, '/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', info], env);
      const executable = read('CFBundleExecutable');
      if (!executable || executable.includes('/') || executable.includes('\\')) continue;
      Object.assign(result, { appPath: bundle, executablePath: path.posix.join(bundle, 'Contents', 'MacOS', executable),
        enginePath, version: read('CFBundleShortVersionString') || null });
    }
  }
  result.installed = Boolean(result.appPath);
  if (result.installed) {
    result.engineVersion = systemRead(run, result.enginePath, ['--version'], env) || null;
    result.versionSupported = isCodexVersionSupported(result.engineVersion, MINIMUM_CODEX_APP_ENGINE);
    result.running = isCodexAppRunning(result, { run, env });
  }
  return result;
}

export function isCodexAppRunning(app, { run = spawnSync, env = process.env } = {}) {
  if (!app.installed) return false;
  if (app.platform === 'win32') {
    const value = systemRead(run, powershell(env), ['-NoProfile', '-NonInteractive', '-Command',
      "if (Get-Process -Name ChatGPT,Codex -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $env:SCIONOS_APP_EXE } | Select-Object -First 1) { 'running' }"], { ...env, SCIONOS_APP_EXE: app.appPath });
    return value === 'running';
  }
  const processes = systemRead(run, '/bin/ps', ['-axo', 'comm='], env).split('\n').map(value => value.trim());
  return processes.includes(app.executablePath);
}

export async function openCodexApp(app, { spawnFn = spawn } = {}) {
  if (!app.supported) throw appConfigError('codex_app_unsupported', 'Codex App integration is supported on Windows and macOS.');
  if (!app.installed) throw appConfigError('codex_app_not_found', 'Codex App is not installed.');
  if (!app.versionSupported) throw appConfigError('codex_app_version', `Codex App requires an embedded Codex engine >= ${MINIMUM_CODEX_APP_ENGINE}.`);
  const command = app.platform === 'darwin' ? '/usr/bin/open' : app.packageId ? 'explorer.exe' : app.appPath;
  const args = app.platform === 'darwin' ? ['-a', app.appPath] : app.packageId ? ['shell:AppsFolder\\' + app.packageId] : [];
  await new Promise((resolve, reject) => {
    const child = spawnFn(command, args, { stdio: 'ignore', detached: true, windowsHide: true });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
  return { opened: true, requiresRestart: Boolean(app.running) };
}

export function requestCodexAppClose(app, { run = spawnSync, env = process.env } = {}) {
  if (!app.installed) return { requested: false };
  if (app.platform === 'win32') {
    const result = run(powershell(env), ['-NoProfile', '-NonInteractive', '-Command',
      "Get-Process -Name ChatGPT,Codex -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $env:SCIONOS_APP_EXE -and $_.MainWindowHandle -ne 0 } | ForEach-Object { $null=$_.CloseMainWindow() }"],
    { env: { ...env, SCIONOS_APP_EXE: app.appPath }, stdio: 'ignore', timeout: 10000, windowsHide: true });
    return { requested: result.status === 0 };
  }
  const result = run('/usr/bin/osascript', ['-e', 'on run argv', '-e', 'tell application (item 1 of argv) to quit', '-e', 'end run', app.appPath],
    { stdio: 'ignore', timeout: 10000 });
  return { requested: result.status === 0 };
}

export function codexAppSnapshot(app) {
  return { platform: app.platform, supported: app.supported, installed: app.installed, running: app.running,
    version: app.version, engineVersion: app.engineVersion, versionSupported: app.versionSupported, minimumVersion: app.minimumVersion };
}
