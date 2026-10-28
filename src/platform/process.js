import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export async function runInteractiveCli(command, args = [], {
  env = process.env,
  signalGraceMs = 5000,
  signalSource = process,
  updateProcessExitCode = true,
  onSpawn = null,
  signal = null,
} = {}) {
  signal?.throwIfAborted();
  const invocation = buildInteractiveCliInvocation(command, args);
  signal?.throwIfAborted();
  const child = spawn(invocation.command, invocation.args, {
    stdio: 'inherit',
    env,
    detached: process.platform !== 'win32',
    ...(invocation.spawnOptions ?? {}),
  });

  let receivedSignal = null;
  let forceTimer = null;
  const forwardSignal = (signal) => {
    if (receivedSignal || child.exitCode !== null) return;
    receivedSignal = signal;
    terminateChildTree(child, signal);
    forceTimer = setTimeout(() => terminateChildTree(child, 'SIGKILL'), signalGraceMs);
    forceTimer.unref?.();
  };
  const onSigint = () => forwardSignal('SIGINT');
  const onSigterm = () => forwardSignal('SIGTERM');
  const onAbort = () => forwardSignal(signal.reason?.signal === 'SIGTERM' ? 'SIGTERM' : 'SIGINT');
  signalSource.on('SIGINT', onSigint);
  signalSource.on('SIGTERM', onSigterm);

  let exitCode;
  try {
    try {
      exitCode = await new Promise((resolve, reject) => {
        if (onSpawn) child.once('spawn', onSpawn);
        child.once('error', reject);
        child.once('exit', (code, signal) => {
          if (typeof code === 'number') resolve(code === 0xC000013A || code === -1073741510 ? 130 : code);
          else resolve(signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1);
        });
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
      });
    } catch (error) {
      if (!receivedSignal) throw error;
    }
    if (receivedSignal === 'SIGINT') exitCode = 130;
    if (receivedSignal === 'SIGTERM') exitCode = 143;
  } finally {
    if (forceTimer) clearTimeout(forceTimer);
    signalSource.off('SIGINT', onSigint);
    signalSource.off('SIGTERM', onSigterm);
    signal?.removeEventListener('abort', onAbort);
  }

  if (updateProcessExitCode) {
    process.exitCode = exitCode;
  }
  return exitCode;
}

export function terminateChildTree(child, signal = 'SIGKILL') {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 5000,
      killSignal: 'SIGKILL',
    });
    // A blocked/unavailable taskkill must not leave a signal wait hanging.
    if (result.error || result.status !== 0) child.kill('SIGKILL');
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The process may already have exited.
    }
  }
}
export function buildInteractiveCliInvocation(command, args = [], {
  platform = process.platform,
  comSpec = process.env.ComSpec,
  nodePath = process.execPath,
  resolveNpmShimFn = resolveNpmShimNodeScript,
  resolveNpmExecutableFn = resolveNpmShimExecutable,
} = {}) {
  if (isWindowsExecutableShim(command, platform)) {
    const nodeScript = resolveNpmShimFn(command);
    if (nodeScript) {
      return {
        command: nodePath,
        args: [nodeScript, ...args],
        spawnOptions: {},
      };
    }
    const executable = resolveNpmExecutableFn(command);
    if (executable) return { command: executable, args: [...args], spawnOptions: {} };
    return {
      command: comSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', buildWindowsCommandLine(command, args)],
      spawnOptions: { windowsVerbatimArguments: true },
    };
  }
  return { command, args, spawnOptions: {} };
}

export function resolveNpmShimExecutable(command, {
  readFileSync = fs.readFileSync,
  existsSync = fs.existsSync,
} = {}) {
  if (!/\.cmd$/i.test(String(command))) return null;
  let contents;
  try { contents = readFileSync(command, 'utf8'); } catch { return null; }
  const target = String(contents).match(/^[ \t]*"(%dp0%[^"\r\n]+\.exe)"[ \t]+%\*[ \t]*$/im)?.[1];
  if (!target) return null;
  const executable = path.win32.resolve(path.win32.dirname(command), target.replace(/^%dp0%[\\/]/i, ''));
  if (!/[\\/]node_modules[\\/]/i.test(executable) || !existsSync(executable)) return null;
  return executable;
}

export function resolveNpmShimNodeScript(command, {
  readFileSync = fs.readFileSync,
  existsSync = fs.existsSync,
} = {}) {
  if (!/\.cmd$/i.test(String(command))) return null;
  let contents;
  try {
    contents = readFileSync(command, 'utf8');
  } catch {
    return null;
  }
  // npm's newer cmd-shim format prefixes the Node invocation with an
  // endLocal/goto/title sequence. Recognize that exact generated form as well
  // as the legacy form so quoted arguments can still bypass cmd.exe safely.
  const match = String(contents).match(/^[ \t]*(?:endLocal[ \t]+&[ \t]+goto[ \t]+#_undefined_#[ \t]+2>NUL[ \t]+\|\|[ \t]+title[ \t]+%COMSPEC%[ \t]+&[ \t]+)?"%_prog%"[ \t]+"([^"\r\n]+\.js)"[ \t]+%\*[ \t]*$/im);
  if (!match) return null;

  const target = match[1].replace(/\//g, '\\');
  let scriptPath;
  if (/^%dp0%\\/i.test(target)) {
    const relativePath = target.slice('%dp0%'.length + 1);
    const shimDirectory = path.win32.dirname(command);
    const segments = relativePath.split('\\');
    const localBinShim = path.win32.basename(shimDirectory).toLowerCase() === '.bin'
      && path.win32.basename(path.win32.dirname(shimDirectory)).toLowerCase() === 'node_modules'
      && segments[0] === '..' && !segments.slice(1).includes('..');
    if (!localBinShim && (segments.includes('..') || !/\\node_modules\\/i.test('\\' + relativePath))) return null;
    scriptPath = path.win32.resolve(shimDirectory, relativePath);
  } else if (path.win32.isAbsolute(target) && /\\node_modules\\/i.test(target)) {
    scriptPath = path.win32.resolve(target);
  } else {
    return null;
  }
  return existsSync(scriptPath) ? scriptPath : null;
}

export function buildWindowsCommandLine(command, args = []) {
  return `"${[command, ...args].map(quoteWindowsCmdArg).join(' ')}"`;
}

export function quoteWindowsCmdArg(value) {
  const text = String(value);
  // cmd.exe parses the command line before the CRT: a double quote always
  // toggles quoting (backslashes are NOT escapes for cmd.exe) and %NAME%
  // is expanded even inside quotes. MSVC-style quoting alone cannot make
  // these safe, so refuse them loudly instead of building an injectable line.
  if (/["%\r\n]/.test(text)) {
    throw new Error(
      `Refusing to pass argument through cmd.exe: it contains characters that cmd.exe interprets even inside quotes: ${JSON.stringify(text.slice(0, 64))}. ` +
      'Avoid `"`, `%`, and line breaks in arguments forwarded to Windows .cmd/.bat shims.',
    );
  }
  if (text.length === 0) return '""';
  const escaped = text
    .replace(/(\\*)"/g, (_match, backslashes) => `${backslashes}${backslashes}\\"`)
    .replace(/(\\+)$/, '$1$1');
  return `"${escaped}"`;
}

export function isWindowsExecutableShim(filePath, platform = process.platform) {
  return platform === 'win32' && /\.(cmd|bat)$/i.test(filePath);
}
