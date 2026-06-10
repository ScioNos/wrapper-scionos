import { spawn } from 'node:child_process';

export async function runInteractiveCli(command, args = [], { env = process.env } = {}) {
  const invocation = buildInteractiveCliInvocation(command, args);
  const child = spawn(invocation.command, invocation.args, {
    stdio: 'inherit',
    env,
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (typeof code === 'number') {
        resolve(code);
      } else {
        resolve(signal === 'SIGINT' ? 130 : 1);
      }
    });
  });

  process.exitCode = exitCode;
  return exitCode;
}

export function buildInteractiveCliInvocation(command, args = [], {
  platform = process.platform,
  comSpec = process.env.ComSpec,
} = {}) {
  if (shouldUseWindowsPowerShell(command, platform)) {
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command', buildWindowsPowerShellCommandLine(command, args)],
    };
  }

  if (shouldUseWindowsCommandShell(command, platform)) {
    return {
      command: comSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', buildWindowsCommandLine(command, args)],
    };
  }

  return { command, args };
}

export function buildWindowsPowerShellCommandLine(command, args = []) {
  return `& ${[command, ...args].map(quotePowerShellLiteral).join(' ')}`;
}

export function quotePowerShellLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function buildWindowsCommandLine(command, args = []) {
  return `"${[command, ...args].map(quoteWindowsCmdArg).join(' ')}"`;
}

export function quoteWindowsCmdArg(value) {
  const text = String(value);
  if (text.length === 0) {
    return '""';
  }

  const escaped = text
    .replace(/%/g, '%%')
    .replace(/(["^&|<>()])/g, '^$1');
  return `"${escaped}"`;
}

export function isWindowsExecutableShim(filePath, platform = process.platform) {
  return platform === 'win32' && /\.(cmd|bat)$/i.test(filePath);
}

function shouldUseWindowsCommandShell(command, platform) {
  if (platform !== 'win32') {
    return false;
  }
  return isWindowsExecutableShim(command, platform);
}

function shouldUseWindowsPowerShell(command, platform) {
  return platform === 'win32' && !hasExecutableExtension(command);
}

function hasExecutableExtension(command) {
  return /\.[a-z0-9]+$/i.test(command);
}
