import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createLinuxTokenBackend,
  createMacOSTokenBackend,
  createWindowsTokenBackend,
  deleteStoredToken,
  getSecureStorageBackend,
  getStoredToken,
  getStoredTokenStatus,
  getTokenBackend,
  SECURE_STORAGE_SERVICE,
  storeToken,
} from '../src/security/token-store.js';
import { requireServiceConfig } from '../src/routerlab/services.js';

function withTokenDirectory(t, prefix) {
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), prefix));
  const previous = process.env.WRAPPER_SCIONOS_TOKEN_DIR;
  process.env.WRAPPER_SCIONOS_TOKEN_DIR = tempDir;
  t.after(() => {
    if (previous === undefined) delete process.env.WRAPPER_SCIONOS_TOKEN_DIR;
    else process.env.WRAPPER_SCIONOS_TOKEN_DIR = previous;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  return tempDir;
}

test('Linux token backend falls back to a user-only file without secret-tool', (t) => {
  const tempDir = withTokenDirectory(t, '.test-linux-token-');

  const service = requireServiceConfig('routerlab');
  const backend = createLinuxTokenBackend({ hasSecretToolCommand: () => false });
  assert.deepEqual(backend.status(), {
    supported: true,
    backend: 'Linux user-only file',
    reason: '`secret-tool` not found; using user-only file storage',
  });

  const token = 'valid-token-with-enough-length';
  const tokenPath = path.join(tempDir, SECURE_STORAGE_SERVICE, service.secureStorageFileName);
  if (process.platform !== 'win32') {
    fs.mkdirSync(path.dirname(tokenPath), { recursive: true, mode: 0o777 });
    fs.chmodSync(path.dirname(tokenPath), 0o777);
    fs.writeFileSync(tokenPath, 'old-token', { mode: 0o666 });
    fs.chmodSync(tokenPath, 0o666);
  }
  const stored = backend.store(token, service);
  assert.equal(stored.backend, 'Linux user-only file');
  assert.equal(backend.get(service), token);

  assert.equal(fs.readFileSync(tokenPath, 'utf8'), token);
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(tokenPath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(tokenPath)).mode & 0o777, 0o700);
  }

  assert.equal(backend.delete(service), true);
  assert.equal(backend.get(service), null);
});

test('token backends expose unsupported behavior and Linux Secret Service fallback', (t) => {
  const unsupported = getTokenBackend('freebsd');
  assert.equal(unsupported.status().supported, false);
  assert.equal(unsupported.store('x', {}), undefined);
  assert.equal(unsupported.get({}), null);
  assert.equal(unsupported.delete({}), false);

  withTokenDirectory(t, '.test-linux-token-fallback-');
  const service = requireServiceConfig('llm');
  const fallback = createLinuxTokenBackend({ hasSecretToolCommand: () => true });
  assert.equal(fallback.status().backend, 'Linux Secret Service');
  const stored = fallback.store('fallback-token-with-enough-length', service);
  assert.equal(stored.backend, 'Linux user-only file');
  assert.match(stored.reason, /Secret Service failed/);
  const files = createLinuxTokenBackend({ hasSecretToolCommand: () => false });
  assert.equal(files.get(service), 'fallback-token-with-enough-length');
  assert.equal(files.delete(service), true);
  assert.equal(files.delete(service), false);
});

test('public token storage APIs handle supported, unsupported, and failing backends', () => {
  const calls = [];
  const backend = {
    status: () => ({ supported: true, backend: 'Test vault' }),
    store: (token, service) => {
      calls.push(['store', token, service.value]);
      return undefined;
    },
    get: (service) => {
      calls.push(['get', service.value]);
      return 'stored-token';
    },
    delete: (service) => {
      calls.push(['delete', service.value]);
      return true;
    },
  };

  assert.deepEqual(getSecureStorageBackend(backend), { supported: true, backend: 'Test vault' });
  assert.deepEqual(storeToken('new-token', 'routerlab', { backend }), {
    supported: true,
    backend: 'Test vault',
  });
  assert.equal(getStoredToken('routerlab', { backend }), 'stored-token');
  assert.deepEqual(getStoredTokenStatus('routerlab', { backend }), {
    supported: true,
    backend: 'Test vault',
    stored: true,
  });
  assert.equal(deleteStoredToken('routerlab', { backend }), true);
  assert.deepEqual(calls, [
    ['store', 'new-token', 'routerlab'],
    ['get', 'routerlab'],
    ['get', 'routerlab'],
    ['delete', 'routerlab'],
  ]);

  const unsupported = {
    status: () => ({ supported: false, backend: 'None', reason: 'disabled for test' }),
    store: () => assert.fail('unsupported store must not run'),
    get: () => assert.fail('unsupported get must not run'),
    delete: () => assert.fail('unsupported delete must not run'),
  };
  assert.throws(
    () => storeToken('new-token', 'llm', { backend: unsupported }),
    /disabled for test/,
  );
  assert.equal(getStoredToken('llm', { backend: unsupported }), null);
  assert.equal(deleteStoredToken('llm', { backend: unsupported }), false);

  const failingRead = {
    status: () => ({ supported: true, backend: 'Failing vault' }),
    get: () => {
      throw new Error('vault unavailable');
    },
  };
  assert.equal(getStoredToken('routerlab', { backend: failingRead }), null);
  assert.equal(getStoredTokenStatus('routerlab', { backend: failingRead }).stored, false);
});

test('Windows token backend covers encrypted storage, legacy fallback, and cleanup', (t) => {
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), '.test-windows-token-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const service = requireServiceConfig('routerlab');
  const tokenFileForService = (_serviceValue, namespace = SECURE_STORAGE_SERVICE) => (
    path.join(tempDir, namespace, service.secureStorageFileName)
  );
  const powerShellCommand = (command, options) => (
    command.startsWith('$token =')
      ? `encrypted:${options.input}`
      : options.input.replace(/^encrypted:/, '')
  );
  const backend = createWindowsTokenBackend({ powerShellCommand, tokenFileForService });

  assert.deepEqual(backend.status(), { supported: true, backend: 'Windows DPAPI' });
  backend.store('windows-token', service);
  assert.equal(backend.get(service), 'windows-token');

  const currentPath = tokenFileForService(service.value);
  const legacyPath = tokenFileForService(service.value, 'claude-scionos');
  fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
  fs.renameSync(currentPath, legacyPath);
  assert.equal(backend.get(service), 'windows-token');
  assert.equal(backend.delete(service), true);
  assert.equal(backend.delete(service), false);

  fs.mkdirSync(path.dirname(currentPath), { recursive: true });
  fs.writeFileSync(currentPath, '');
  assert.equal(backend.get(service), null);

  const emptyEncryption = createWindowsTokenBackend({
    powerShellCommand: () => '',
    tokenFileForService,
  });
  assert.throws(() => emptyEncryption.store('token', service), /no encrypted content/);
});

test('macOS token backend covers Keychain success, fallback, deletion, and errors', () => {
  const service = requireServiceConfig('llm');
  const calls = [];
  const backend = createMacOSTokenBackend({
    runCommandFn: (_command, args, options = {}) => {
      calls.push({ args, input: options.input });
      const action = args[0];
      const namespace = args[args.indexOf('-s') + 1];
      if (action === 'add-generic-password') return { status: 0, stdout: '', stderr: '' };
      if (action === 'find-generic-password') {
        return namespace === 'claude-scionos'
          ? { status: 0, stdout: ' legacy-keychain-token \n', stderr: '' }
          : { status: 44, stdout: '', stderr: '' };
      }
      return namespace === 'claude-scionos'
        ? { status: 0, stdout: '', stderr: '' }
        : { status: 44, stdout: '', stderr: '' };
    },
  });

  assert.deepEqual(backend.status(), { supported: true, backend: 'macOS Keychain' });
  backend.store('keychain-token', service);
  assert.equal(backend.get(service), 'legacy-keychain-token');
  assert.equal(backend.delete(service), true);
  assert.equal(calls[0].input, 'keychain-token');

  const failing = createMacOSTokenBackend({
    runCommandFn: () => ({ status: 1, stdout: '', stderr: 'Keychain denied\n' }),
  });
  assert.throws(() => failing.store('token', service), /Keychain denied/);
  assert.equal(failing.get(service), null);
  assert.equal(failing.delete(service), false);
});

test('Linux Secret Service backend covers successful commands and file fallback', (t) => {
  withTokenDirectory(t, '.test-linux-secret-service-');
  const service = requireServiceConfig('routerlab');
  const calls = [];
  const backend = createLinuxTokenBackend({
    hasSecretToolCommand: () => true,
    runCommandFn: (_command, args, options = {}) => {
      calls.push({ args, input: options.input });
      if (args[0] === 'store') return { status: 0, stdout: '', stderr: '' };
      if (args[0] === 'lookup') {
        return args[2] === SECURE_STORAGE_SERVICE
          ? { status: 0, stdout: ' secret-service-token \n', stderr: '' }
          : { status: 1, stdout: '', stderr: '' };
      }
      return args[2] === SECURE_STORAGE_SERVICE
        ? { status: 0, stdout: '', stderr: '' }
        : { status: 1, stdout: '', stderr: '' };
    },
  });

  assert.deepEqual(backend.store('secret-service-token', service), {
    supported: true,
    backend: 'Linux Secret Service',
  });
  assert.equal(backend.get(service), 'secret-service-token');
  assert.equal(backend.delete(service), true);
  assert.equal(calls[0].input, 'secret-service-token');

  const fallback = createLinuxTokenBackend({
    hasSecretToolCommand: () => true,
    runCommandFn: () => ({ status: 1, stdout: '', stderr: 'service unavailable' }),
  });
  const status = fallback.store('file-fallback-token', service);
  assert.equal(status.backend, 'Linux user-only file');
  assert.match(status.reason, /service unavailable/);
  assert.equal(fallback.get(service), 'file-fallback-token');

  const autoDetected = createLinuxTokenBackend();
  assert.equal(typeof autoDetected.status().supported, 'boolean');
});
