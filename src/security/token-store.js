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

export function getSecureStorageBackend(backend = currentTokenBackend(), service = null) {
  return backend.status(service);
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

function getTokenFile(serviceValue, namespace = SECURE_STORAGE_SERVICE) {
  const service = requireServiceConfig(serviceValue);
  const overrideDir = process.env.WRAPPER_SCIONOS_TOKEN_DIR?.trim();
  if (overrideDir) {
    return path.join(overrideDir, namespace, service.secureStorageFileName);
  }
  return path.join(os.homedir(), `.${namespace}`, service.secureStorageFileName);
}

function hasNonEmptyFile(filePath, fileSystem = fs) {
  try {
    return fileSystem.statSync(filePath).size > 0;
  } catch {
    return false;
  }
}

function deletePlainTokenFile(tokenFile) {
  if (!fs.existsSync(tokenFile)) {
    return false;
  }
  fs.unlinkSync(tokenFile);
  return true;
}

export function storeToken(token, serviceValue, { backend = currentTokenBackend() } = {}) {
  const service = requireServiceConfig(serviceValue);
  const storage = backend.status();
  if (!storage.supported) {
    throw new Error(storage.reason || 'Secure storage is not available.');
  }

  return backend.store(token, service) ?? storage;
}

export function getStoredToken(serviceValue, { backend = currentTokenBackend() } = {}) {
  const service = requireServiceConfig(serviceValue);
  const storage = getSecureStorageBackend(backend, service);
  if (!storage.supported) {
    return null;
  }

  try {
    return backend.get(service);
  } catch {
    return null;
  }
}

function readWindowsTokenFile(tokenFile, {
  fileSystem = fs,
  powerShellCommand = runPowerShell,
} = {}) {
  if (!hasNonEmptyFile(tokenFile, fileSystem)) {
    return null;
  }
  const encrypted = fileSystem.readFileSync(tokenFile, 'utf8').trim();
  if (!encrypted) {
    return null;
  }
  return powerShellCommand(
    '$encrypted = [Console]::In.ReadToEnd(); if ([string]::IsNullOrWhiteSpace($encrypted)) { throw "Encrypted token input is empty" }; $secure = $encrypted | ConvertTo-SecureString; $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); try { [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }',
    { input: encrypted },
  ) || null;
}

function readMacOSToken(account, namespace, runCommandFn = runCommand) {
  const result = runCommandFn('security', ['find-generic-password', '-a', account, '-s', namespace, '-w']);
  return result.status === 0 ? result.stdout.trim() || null : null;
}

function readLinuxSecretServiceToken(account, namespace, runCommandFn = runCommand) {
  const result = runCommandFn('secret-tool', ['lookup', 'service', namespace, 'account', account]);
  return result.status === 0 ? result.stdout.trim() || null : null;
}

export function deleteStoredToken(serviceValue, { backend = currentTokenBackend() } = {}) {
  const service = requireServiceConfig(serviceValue);
  const storage = getSecureStorageBackend(backend, service);
  if (!storage.supported && !backend.deleteWhenUnsupported) {
    return false;
  }
  return backend.delete(service);
}

export function getStoredTokenStatus(serviceValue, { backend = currentTokenBackend() } = {}) {
  const service = requireServiceConfig(serviceValue);
  const storage = getSecureStorageBackend(backend, service);
  return {
    ...storage,
    stored: Boolean(getStoredToken(serviceValue, { backend })),
  };
}

function currentTokenBackend() {
  return getTokenBackend(process.platform);
}

export function getTokenBackend(platform = process.platform) {
  return TOKEN_BACKENDS[platform] ?? UNSUPPORTED_BACKEND;
}

function hasSecretTool() {
  return commandExists('secret-tool');
}

function linuxSecretServiceStatus() {
  return { supported: true, backend: 'Linux Secret Service' };
}

function linuxSecretServiceUnavailableStatus() {
  return {
    supported: false,
    backend: 'Linux Secret Service',
    reason: '`secret-tool` and an available Linux Secret Service are required; plaintext token-file fallback is disabled.',
  };
}

function linuxPlainTokenPaths(service) {
  return [SECURE_STORAGE_SERVICE, LEGACY_SECURE_STORAGE_SERVICE]
    .map((namespace) => getTokenFile(service.value, namespace));
}

function hasLinuxPlainToken(service) {
  return linuxPlainTokenPaths(service).some((tokenFile) => hasNonEmptyFile(tokenFile));
}

function deleteLinuxPlainTokens(service) {
  return linuxPlainTokenPaths(service)
    .map((tokenFile) => deletePlainTokenFile(tokenFile))
    .some(Boolean);
}

export function createLinuxTokenBackend({
  hasSecretToolCommand = hasSecretTool,
  runCommandFn = runCommand,
} = {}) {
  return {
    deleteWhenUnsupported: true,
    status: (service = null) => ({
      ...(hasSecretToolCommand() ? linuxSecretServiceStatus() : linuxSecretServiceUnavailableStatus()),
      ...(service && hasLinuxPlainToken(service) ? { migrationRequired: true } : {}),
    }),
    store: (token, service) => storeLinuxToken(token, service, hasSecretToolCommand(), runCommandFn),
    get: (service) => getLinuxToken(service, hasSecretToolCommand(), runCommandFn),
    delete: (service) => deleteLinuxToken(service, hasSecretToolCommand(), runCommandFn),
  };
}

export function createWindowsTokenBackend({
  fileSystem = fs,
  powerShellCommand = runPowerShell,
  tokenFileForService = getTokenFile,
} = {}) {
  const dependencies = { fileSystem, powerShellCommand, tokenFileForService };
  return {
    status: () => ({ supported: true, backend: 'Windows DPAPI' }),
    store: (token, service) => storeWindowsToken(token, service, dependencies),
    get: (service) => getWindowsToken(service, dependencies),
    delete: (service) => deleteWindowsToken(service, dependencies),
  };
}

export function createMacOSTokenBackend({ runCommandFn = runCommand } = {}) {
  return {
    status: () => ({ supported: true, backend: 'macOS Keychain' }),
    store: (token, service) => storeMacOSToken(token, service, runCommandFn),
    get: (service) => getMacOSToken(service, runCommandFn),
    delete: (service) => deleteMacOSToken(service, runCommandFn),
  };
}

const TOKEN_BACKENDS = {
  win32: createWindowsTokenBackend(),
  darwin: createMacOSTokenBackend(),
  linux: createLinuxTokenBackend(),
};

const UNSUPPORTED_BACKEND = {
  status: () => ({ supported: false, backend: 'Unknown', reason: 'Unsupported operating system' }),
  store: () => {},
  get: () => null,
  delete: () => false,
};

function storeWindowsToken(token, service, {
  fileSystem = fs,
  powerShellCommand = runPowerShell,
  tokenFileForService = getTokenFile,
} = {}) {
  const tokenFile = tokenFileForService(service.value);
  fileSystem.mkdirSync(path.dirname(tokenFile), { recursive: true });
  const encrypted = powerShellCommand(
    '$token = [Console]::In.ReadToEnd(); if ([string]::IsNullOrEmpty($token)) { throw "Token input is empty" }; $secure = ConvertTo-SecureString $token -AsPlainText -Force; ConvertFrom-SecureString $secure',
    { input: token },
  );
  fileSystem.writeFileSync(tokenFile, encrypted, 'utf8');
  if (!hasNonEmptyFile(tokenFile, fileSystem)) {
    throw new Error('Secure token file was created but no encrypted content was written.');
  }
}

function getWindowsToken(service, dependencies = {}) {
  const tokenFileForService = dependencies.tokenFileForService ?? getTokenFile;
  const token = readWindowsTokenFile(tokenFileForService(service.value), dependencies);
  return token ?? readWindowsTokenFile(
    tokenFileForService(service.value, LEGACY_SECURE_STORAGE_SERVICE),
    dependencies,
  );
}

function deleteWindowsToken(service, {
  fileSystem = fs,
  tokenFileForService = getTokenFile,
} = {}) {
  return [SECURE_STORAGE_SERVICE, LEGACY_SECURE_STORAGE_SERVICE]
    .map((namespace) => tokenFileForService(service.value, namespace))
    .map((tokenFile) => {
      if (!fileSystem.existsSync(tokenFile)) return false;
      fileSystem.unlinkSync(tokenFile);
      return true;
    })
    .some(Boolean);
}

function storeMacOSToken(token, service, runCommandFn = runCommand) {
  const result = runCommandFn('security', [
    'add-generic-password',
    '-U',
    '-a',
    service.secureStorageAccount,
    '-s',
    SECURE_STORAGE_SERVICE,
    '-w',
  ], { input: token });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'Unable to store token in Keychain').trim());
  }
}

function getMacOSToken(service, runCommandFn = runCommand) {
  return readMacOSToken(service.secureStorageAccount, SECURE_STORAGE_SERVICE, runCommandFn)
    ?? readMacOSToken(service.secureStorageAccount, LEGACY_SECURE_STORAGE_SERVICE, runCommandFn);
}

function deleteMacOSToken(service, runCommandFn = runCommand) {
  return [SECURE_STORAGE_SERVICE, LEGACY_SECURE_STORAGE_SERVICE]
    .map((namespace) => runCommandFn('security', [
      'delete-generic-password', '-a', service.secureStorageAccount, '-s', namespace,
    ]).status === 0)
    .some(Boolean);
}

function storeLinuxSecretServiceToken(token, service, runCommandFn = runCommand) {
  const result = runCommandFn('secret-tool', [
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

function storeLinuxToken(token, service, secretToolAvailable, runCommandFn = runCommand) {
  if (!secretToolAvailable) {
    throw new Error(linuxSecretServiceUnavailableStatus().reason);
  }

  storeLinuxSecretServiceToken(token, service, runCommandFn);
  const verified = readLinuxSecretServiceToken(
    service.secureStorageAccount,
    SECURE_STORAGE_SERVICE,
    runCommandFn,
  );
  if (verified !== token) {
    throw new Error('Linux Secret Service did not return the token after storing it; legacy plaintext files were preserved.');
  }
  const migratedLegacyFiles = deleteLinuxPlainTokens(service);
  return { ...linuxSecretServiceStatus(), migratedLegacyFiles };
}

function getLinuxToken(service, secretToolAvailable, runCommandFn = runCommand) {
  if (!secretToolAvailable) return null;
  return readLinuxSecretServiceToken(service.secureStorageAccount, SECURE_STORAGE_SERVICE, runCommandFn)
    ?? readLinuxSecretServiceToken(service.secureStorageAccount, LEGACY_SECURE_STORAGE_SERVICE, runCommandFn);
}

function deleteLinuxToken(service, secretToolAvailable, runCommandFn = runCommand) {
  const secretDeleted = secretToolAvailable && [SECURE_STORAGE_SERVICE, LEGACY_SECURE_STORAGE_SERVICE]
    .map((namespace) => runCommandFn('secret-tool', [
      'clear', 'service', namespace, 'account', service.secureStorageAccount,
    ]).status === 0)
    .some(Boolean);
  const fileDeleted = deleteLinuxPlainTokens(service);
  return Boolean(secretDeleted || fileDeleted);
}
