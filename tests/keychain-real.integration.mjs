import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createMacOSTokenBackend } from '../src/security/token-store.js';
import { withCleanup } from './support/lifecycle.mjs';

test('real macOS Keychain stores, updates, verifies, reads legacy, and deletes only a temporary test account', { skip: process.platform !== 'darwin', timeout: 60000 }, async (t) => {
  const account = `wrapper-scionos-test-${randomUUID()}`;
  const oldAccount = `${account}-stdin-probe`;
  const service = { secureStorageAccount: account };
  const backend = createMacOSTokenBackend({ runCommandFn: (command, args, options) => {
    const result = spawnSync(command, args, { ...options, encoding: 'utf8', killSignal: 'SIGKILL' });
    if (result.status !== 0) {
      t.diagnostic(`Keychain helper failure: operation=${JSON.parse(options.input).operation}, exit=${result.status}, signal=${result.signal ?? 'none'}, error=${result.error?.code ?? 'none'}`);
    }
    return result;
  } });
  const probe = spawnSync('/usr/bin/osascript', ['-l', 'JavaScript', fileURLToPath(new URL('./support/keychain-probe.jxa.js', import.meta.url))], { encoding: 'utf8', timeout: 15000, killSignal: 'SIGKILL' });
  t.diagnostic(`Native Keychain parameter probe: exit=${probe.status}, statuses=${probe.stdout?.trim() || 'unavailable'}`);
  await withCleanup(async () => {
    // Record the old command's real non-TTY behavior, with a strict deadline.
    const old = spawnSync('/usr/bin/security', ['add-generic-password', '-a', oldAccount, '-s', 'claude-scionos', '-w'], { input: 'fake-old-token\n', encoding: 'utf8', timeout: 2000, killSignal: 'SIGKILL' });
    const oldRead = spawnSync('/usr/bin/security', ['find-generic-password', '-a', oldAccount, '-s', 'claude-scionos', '-w'], { encoding: 'utf8', timeout: 2000, killSignal: 'SIGKILL' });
    t.diagnostic(`Legacy security -w stdin probe: exit=${old.status}, error=${old.error?.code ?? 'none'}, roundTripMatches=${oldRead.status === 0 && oldRead.stdout.trim() === 'fake-old-token'} (no secret output retained)`);
    // Create an entry with the old executable's access controls. Its command
    // receives the fixed fake value through stdin, never process arguments.
    const legacy = spawnSync('/usr/bin/security', ['-i'], { input: `add-generic-password -a ${account} -s claude-scionos -w fake-legacy-token\n`, encoding: 'utf8', timeout: 15000, killSignal: 'SIGKILL' });
    assert.equal(legacy.status, 0, 'Legacy security helper must complete non-interactively');
    assert.equal(backend.get(service), 'fake-legacy-token');
    backend.store('fake-first-token', service);
    assert.equal(backend.get(service), 'fake-first-token');
    backend.store('fake-updated-token', service);
    assert.equal(backend.get(service), 'fake-updated-token');
    assert.equal(backend.delete(service), true);
    assert.equal(backend.get(service), null);
    assert.equal(backend.delete(service), false);
  }, [() => backend.delete(service), () => {
    const cleanup = spawnSync('/usr/bin/security', ['delete-generic-password', '-a', oldAccount, '-s', 'claude-scionos'], { encoding: 'utf8', timeout: 2000, killSignal: 'SIGKILL' });
    assert.ok(!cleanup.error && (cleanup.status === 0 || cleanup.status === 44), 'Legacy probe cleanup must complete or report an absent item');
  }]);
});
