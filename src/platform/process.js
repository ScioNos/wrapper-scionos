import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export async function runInteractiveCli(command, args = [], {
  env = process.env,
  signalGraceMs = 5000,
  signalSource = process,
  updateProcessExitCode = true,
} = {}) {
  const invocation = buildInteractiveCliInvocation(command, args);
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
  signalSource.on('SIGINT', onSigint);
  signalSource.on('SIGTERM', onSigterm);

  let exitCode;
  try {
    try {
      exitCode = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code, signal) => {
          if (typeof code === 'number') resolve(code);
          else resolve(signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1);
        });
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
  }

  if (updateProcessExitCode) {
    process.exitCode = exitCode;
  }
  return exitCode;
}

function terminateChildTree(child, signal) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    killer.on('error', () => {});
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
    return {
      command: comSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', buildWindowsCommandLine(command, args)],
      spawnOptions: { windowsVerbatimArguments: true },
    };
  }
  return { command, args, spawnOptions: {} };
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
    if (relativePath.split('\\').includes('..') || !/\\node_modules\\/i.test('\\' + relativePath)) {
      return null;
    }
    scriptPath = path.win32.resolve(path.win32.dirname(command), relativePath);
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
