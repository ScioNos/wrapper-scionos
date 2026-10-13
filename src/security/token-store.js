import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { requireServiceConfig } from '../routerlab/services.js';

export const SECURE_STORAGE_SERVICE = 'wrapper-scionos';
export const TOKEN_COMMAND_TIMEOUT_MS = 15_000;
const LEGACY_SECURE_STORAGE_SERVICE = 'claude-scionos';
const WINDOWS_POWERSHELL_MODULE_PATHS = [
  'C:\\Program Files\\WindowsPowerShell\\Modules',
  'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\Modules',
];
const WINDOWS_SYSTEM_ROOT_FALLBACK = 'C:\\Windows';
let secretToolAvailabilityKnown = false;
let secretToolAvailable = false;

export function getSecureStorageBackend(backend = currentTokenBackend(), service = null) {
  return backend.status(service);
}

function commandExists(command) {
  const result = spawnSync(command, ['--help'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: TOKEN_COMMAND_TIMEOUT_MS, killSignal: 'SIGKILL' });
  return !result.error;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    input: options.input,
    env: options.env,
    timeout: TOKEN_COMMAND_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

function runPowerShell(command, options = {}) {
  const powershell = resolveWindowsPowerShellPath(process.env.SystemRoot);
  const env = {
    ...process.env,
    PSModulePath: WINDOWS_POWERSHELL_MODULE_PATHS.join(';'),
    ...(options.env ?? {}),
  };
  const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8',
    input: options.input,
    env,
    timeout: TOKEN_COMMAND_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'PowerShell command failed').trim());
  }
  return result.stdout.trim();
}

export function resolveWindowsPowerShellPath(value = process.env.SystemRoot) {
  const candidate = String(value ?? '').trim().replace(/[\\/]+$/, '');
  const systemRoot = /^C:\\Windows$/i.test(candidate)
    ? candidate
    : WINDOWS_SYSTEM_ROOT_FALLBACK;
  return path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
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
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
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

  // Backends represent a genuinely absent token as null. Propagate failures
  // such as a missing keychain executable or DPAPI decryption errors so they
  // cannot be mistaken for an empty store.
  return backend.get(service);
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
  const result = runKeychain('get', account, namespace, undefined, runCommandFn);
  if (result.status === 0) return result.token || null;
  if (result.status === -25300) return null;
  throw keychainError('read', result.status);
}

function keychainError(operation, status) {
  const error = new Error(`macOS Keychain ${operation} failed (OSStatus ${status}); unlock/authorize the Keychain and retry. No plaintext fallback is used.`);
  error.code = 'keychain_operation_failed';
  error.status = status;
  return error;
}

function runKeychain(operation, account, namespace, token, runCommandFn) {
  let result;
  try {
    result = runCommandFn('/usr/bin/osascript', [
      '-l', 'JavaScript', fileURLToPath(new URL('./keychain.jxa.js', import.meta.url)),
    ], { input: JSON.stringify({ operation, account, namespace, token }), timeout: TOKEN_COMMAND_TIMEOUT_MS });
  } catch (error) {
    throw keychainError(operation, error.code === 'ETIMEDOUT' ? 'timeout' : 'system-command-error');
  }
  // Never include helper stdout/stderr in errors: a read carries the secret.
  if (result.status !== 0) throw keychainError(operation, result.error?.code ?? 'helper-failed');
  try {
    const payload = JSON.parse(result.stdout);
    if (!Number.isInteger(payload.status)) throw new Error('invalid status');
    return payload;
  } catch {
    throw keychainError(operation, 'invalid-helper-response');
  }
}

function readLinuxSecretServiceToken(account, namespace, runCommandFn = runCommand) {
  const result = runCommandFn('secret-tool', ['lookup', 'service', namespace, 'account', account]);
  if (result.status === 0) return result.stdout.trim() || null;
  if (result.status === 1
    && (!String(result.stderr ?? '').trim()
      || /(?:no such secret|secret not found|no matching secret)/i.test(String(result.stderr)))) {
    return null;
  }
  throw tokenBackendReadError('Linux Secret Service', result);
}

function tokenBackendReadError(backend, result) {
  const details = String(result.stderr || result.stdout || '').trim();
  const error = new Error(`${backend} token read failed${details ? `: ${details}` : '.'}`);
  error.code = 'token_backend_read_failed';
  error.status = result.status;
  return error;
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
  if (!secretToolAvailabilityKnown) {
    secretToolAvailable = commandExists('secret-tool');
    secretToolAvailabilityKnown = true;
  }
  return secretToolAvailable;
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
  fileSystem.mkdirSync(path.dirname(tokenFile), { recursive: true, mode: 0o700 });
  const encrypted = powerShellCommand(
    '$token = [Console]::In.ReadToEnd(); if ([string]::IsNullOrEmpty($token)) { throw "Token input is empty" }; $secure = ConvertTo-SecureString $token -AsPlainText -Force; ConvertFrom-SecureString $secure',
    { input: token },
  );
  fileSystem.writeFileSync(tokenFile, encrypted, { encoding: 'utf8', mode: 0o600 });
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
  const result = runKeychain('store', service.secureStorageAccount, SECURE_STORAGE_SERVICE, token, runCommandFn);
  if (result.status !== 0) {
    throw keychainError('write', result.status);
  }
  if (readMacOSToken(service.secureStorageAccount, SECURE_STORAGE_SERVICE, runCommandFn) !== token) {
    throw keychainError('write verification', 'value-mismatch');
  }
}

function getMacOSToken(service, runCommandFn = runCommand) {
  return readMacOSToken(service.secureStorageAccount, SECURE_STORAGE_SERVICE, runCommandFn)
    ?? readMacOSToken(service.secureStorageAccount, LEGACY_SECURE_STORAGE_SERVICE, runCommandFn);
}

function deleteMacOSToken(service, runCommandFn = runCommand) {
  return [SECURE_STORAGE_SERVICE, LEGACY_SECURE_STORAGE_SERVICE]
    .map((namespace) => {
      const result = runKeychain('delete', service.secureStorageAccount, namespace, undefined, runCommandFn);
      if (result.status !== 0 && result.status !== -25300) throw keychainError('delete', result.status);
      return result.status === 0;
    })
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
