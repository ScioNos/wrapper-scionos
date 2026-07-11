import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createLinuxTokenBackend, getTokenBackend, SECURE_STORAGE_SERVICE } from '../src/security/token-store.js';
import { requireServiceConfig } from '../src/routerlab/services.js';

test('Linux token backend falls back to a user-only file without secret-tool', (t) => {
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), '.test-linux-token-'));
  const previousTokenDir = process.env.WRAPPER_SCIONOS_TOKEN_DIR;
  process.env.WRAPPER_SCIONOS_TOKEN_DIR = tempDir;
  t.after(() => {
    if (previousTokenDir === undefined) {
      delete process.env.WRAPPER_SCIONOS_TOKEN_DIR;
    } else {
      process.env.WRAPPER_SCIONOS_TOKEN_DIR = previousTokenDir;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

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

  const tempDir = fs.mkdtempSync(path.join(process.cwd(), '.test-linux-token-fallback-'));
  const previous = process.env.WRAPPER_SCIONOS_TOKEN_DIR;
  process.env.WRAPPER_SCIONOS_TOKEN_DIR = tempDir;
  t.after(() => {
    if (previous === undefined) delete process.env.WRAPPER_SCIONOS_TOKEN_DIR;
    else process.env.WRAPPER_SCIONOS_TOKEN_DIR = previous;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
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
