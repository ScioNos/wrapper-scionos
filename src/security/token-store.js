import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { requireServiceConfig } from '../routerlab/services.js';

export const SECURE_STORAGE_SERVICE = 'wrapper-scionos';
const LEGACY_SECURE_STORAGE_SERVICE = 'claude-scionos';
const WINDOWS_POWERSHELL_MODULE_PATHS = [
  'C:\\Program Files\\WindowsPowerShell\\Modules',
  'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\Modules',
];

export function getSecureStorageBackend() {
  return currentTokenBackend().status();
}

function commandExists(command) {
  const result = spawnSync(command, ['--help'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return !result.error;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    input: options.input,
    env: options.env,
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

function runPowerShell(command, options = {}) {
  const powershell = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';
  const env = {
    ...process.env,
    PSModulePath: WINDOWS_POWERSHELL_MODULE_PATHS.join(';'),
    ...(options.env ?? {}),
  };
  const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8',
    input: options.input,
    env,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'PowerShell command failed').trim());
  }
  return result.stdout.trim();
}

function getWindowsTokenFile(serviceValue, namespace = SECURE_STORAGE_SERVICE) {
  const service = requireServiceConfig(serviceValue);
  return path.join(os.homedir(), `.${namespace}`, service.secureStorageFileName);
}

function hasNonEmptyFile(filePath) {
  try {
    return fs.statSync(filePath).size > 0;
  } catch {
    return false;
  }
}

export function storeToken(token, serviceValue) {
  const service = requireServiceConfig(serviceValue);
  const storage = getSecureStorageBackend();
  if (!storage.supported) {
    throw new Error(storage.reason || 'Secure storage is not available.');
  }

  currentTokenBackend().store(token, service);
  return storage;
}

export function getStoredToken(serviceValue) {
  const service = requireServiceConfig(serviceValue);
  const storage = getSecureStorageBackend();
  if (!storage.supported) {
    return null;
  }

  try {
    return currentTokenBackend().get(service);
  } catch {
    return null;
  }
}

function readWindowsTokenFile(tokenFile) {
  if (!hasNonEmptyFile(tokenFile)) {
    return null;
  }
  const encrypted = fs.readFileSync(tokenFile, 'utf8').trim();
  if (!encrypted) {
    return null;
  }
  return runPowerShell(
    '$encrypted = [Console]::In.ReadToEnd(); if ([string]::IsNullOrWhiteSpace($encrypted)) { throw "Encrypted token input is empty" }; $secure = $encrypted | ConvertTo-SecureString; $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); try { [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }',
    { input: encrypted },
  ) || null;
}

function readMacOSToken(account, namespace) {
  const result = runCommand('security', ['find-generic-password', '-a', account, '-s', namespace, '-w']);
  return result.status === 0 ? result.stdout.trim() || null : null;
}

function readLinuxToken(account, namespace) {
  const result = runCommand('secret-tool', ['lookup', 'service', namespace, 'account', account]);
  return result.status === 0 ? result.stdout.trim() || null : null;
}

export function deleteStoredToken(serviceValue) {
  const service = requireServiceConfig(serviceValue);
  const storage = getSecureStorageBackend();
  if (!storage.supported) {
    return false;
  }

  return currentTokenBackend().delete(service);
}

export function getStoredTokenStatus(serviceValue) {
  const storage = getSecureStorageBackend();
  return {
    ...storage,
    stored: Boolean(getStoredToken(serviceValue)),
  };
}

function currentTokenBackend() {
  return TOKEN_BACKENDS[process.platform] ?? UNSUPPORTED_BACKEND;
}

const TOKEN_BACKENDS = {
  win32: {
    status: () => ({ supported: true, backend: 'Windows DPAPI' }),
    store: storeWindowsToken,
    get: getWindowsToken,
    delete: deleteWindowsToken,
  },
  darwin: {
    status: () => ({ supported: true, backend: 'macOS Keychain' }),
    store: storeMacOSToken,
    get: getMacOSToken,
    delete: deleteMacOSToken,
  },
  linux: {
    status: () => (
      commandExists('secret-tool')
        ? { supported: true, backend: 'Linux Secret Service' }
        : { supported: false, backend: 'Linux Secret Service', reason: '`secret-tool` not found' }
    ),
    store: storeLinuxToken,
    get: getLinuxToken,
    delete: deleteLinuxToken,
  },
};

const UNSUPPORTED_BACKEND = {
  status: () => ({ supported: false, backend: 'Unknown', reason: 'Unsupported operating system' }),
  store: () => {},
  get: () => null,
  delete: () => false,
};

function storeWindowsToken(token, service) {
  const tokenFile = getWindowsTokenFile(service.value);
  fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
  const encrypted = runPowerShell(
    '$token = [Console]::In.ReadToEnd(); if ([string]::IsNullOrEmpty($token)) { throw "Token input is empty" }; $secure = ConvertTo-SecureString $token -AsPlainText -Force; ConvertFrom-SecureString $secure',
    { input: token },
  );
  fs.writeFileSync(tokenFile, encrypted, 'utf8');
  if (!hasNonEmptyFile(tokenFile)) {
    throw new Error('Secure token file was created but no encrypted content was written.');
  }
}

function getWindowsToken(service) {
  const token = readWindowsTokenFile(getWindowsTokenFile(service.value));
  return token ?? readWindowsTokenFile(getWindowsTokenFile(service.value, LEGACY_SECURE_STORAGE_SERVICE));
}

function deleteWindowsToken(service) {
  const tokenFile = getWindowsTokenFile(service.value);
  if (!fs.existsSync(tokenFile)) {
    return false;
  }
  fs.unlinkSync(tokenFile);
  return true;
}

function storeMacOSToken(token, service) {
  const result = runCommand('security', [
    'add-generic-password',
    '-U',
    '-a',
    service.secureStorageAccount,
    '-s',
    SECURE_STORAGE_SERVICE,
    '-w',
    token,
  ]);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'Unable to store token in Keychain').trim());
  }
}

function getMacOSToken(service) {
  return readMacOSToken(service.secureStorageAccount, SECURE_STORAGE_SERVICE)
    ?? readMacOSToken(service.secureStorageAccount, LEGACY_SECURE_STORAGE_SERVICE);
}

function deleteMacOSToken(service) {
  return runCommand('security', [
    'delete-generic-password',
    '-a',
    service.secureStorageAccount,
    '-s',
    SECURE_STORAGE_SERVICE,
  ]).status === 0;
}

function storeLinuxToken(token, service) {
  const result = runCommand('secret-tool', [
    'store',
    `--label=${service.secureStorageLabel}`,
    'service',
    SECURE_STORAGE_SERVICE,
    'account',
    service.secureStorageAccount,
  ], { input: token });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'Unable to store token in Secret Service').trim());
  }
}

function getLinuxToken(service) {
  return readLinuxToken(service.secureStorageAccount, SECURE_STORAGE_SERVICE)
    ?? readLinuxToken(service.secureStorageAccount, LEGACY_SECURE_STORAGE_SERVICE);
}

function deleteLinuxToken(service) {
  return runCommand('secret-tool', [
    'clear',
    'service',
    SECURE_STORAGE_SERVICE,
    'account',
    service.secureStorageAccount,
  ]).status === 0;
}
