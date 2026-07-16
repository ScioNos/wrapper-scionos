import { spawn } from 'node:child_process';

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
} = {}) {
  if (isWindowsExecutableShim(command, platform)) {
    return {
      command: comSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', buildWindowsCommandLine(command, args)],
      spawnOptions: { windowsVerbatimArguments: true },
    };
  }
  return { command, args, spawnOptions: {} };
}

export function buildWindowsCommandLine(command, args = []) {
  return `"${[command, ...args].map(quoteWindowsCmdArg).join(' ')}"`;
}

export function quoteWindowsCmdArg(value) {
  const text = String(value);
  if (text.length === 0) return '""';
  const escaped = text
    .replace(/(\\*)"/g, (_match, backslashes) => `${backslashes}${backslashes}\\"`)
    .replace(/(\\+)$/, '$1$1');
  return `"${escaped}"`;
}

export function isWindowsExecutableShim(filePath, platform = process.platform) {
  return platform === 'win32' && /\.(cmd|bat)$/i.test(filePath);
}
