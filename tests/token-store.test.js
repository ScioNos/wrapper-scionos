import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createLinuxTokenBackend, SECURE_STORAGE_SERVICE } from '../src/security/token-store.js';
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
    backend: 'Linux file (0600)',
    reason: '`secret-tool` not found; using user-only file storage',
  });

  const token = 'valid-token-with-enough-length';
  const stored = backend.store(token, service);
  assert.equal(stored.backend, 'Linux file (0600)');
  assert.equal(backend.get(service), token);

  const tokenPath = path.join(tempDir, SECURE_STORAGE_SERVICE, service.secureStorageFileName);
  assert.equal(fs.readFileSync(tokenPath, 'utf8'), token);
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(tokenPath).mode & 0o777, 0o600);
  }

  assert.equal(backend.delete(service), true);
  assert.equal(backend.get(service), null);
});