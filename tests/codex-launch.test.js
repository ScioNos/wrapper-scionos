import test from 'node:test';
import assert from 'node:assert/strict';
import { launchCodexForService } from '../src/cli/commands/codex.js';

const NATIVE_TEST_TOKEN = 'native-codex-token-with-enough-length';

function launchDependencies(modelResult) {
  const calls = { launches: [], fetches: [] };
  return {
    calls,
    dependencies: {
      assertCodexCliAvailable: () => ({ installed: true, cliPath: 'fake-codex' }),
      fetchModels: async (token, options) => {
        calls.fetches.push({ token, options });
        return modelResult;
      },
      launchCodex: async (options) => {
        calls.launches.push(options);
        return 0;
      },
      resolveTokenWithSource: async () => {
        throw new Error('explicit token should avoid token resolution');
      },
      selectModel: async () => {
        throw new Error('selection should not be needed');
      },
    },
  };
}

test('Codex launch is direct, native, and forwards the original RouterLab token', async () => {
  const fixture = launchDependencies({
    valid: true,
    models: ['not-allowed', 'MiniMax-M3', 'gpt-5.6-sol'],
    modelMetadata: [],
  });
  await launchCodexForService({
    service: 'llm',
    model: 'MiniMax-M3',
    token: NATIVE_TEST_TOKEN,
    noPrompt: true,
    forwarded: ['--sandbox', 'workspace-write'],
    updateProcessExitCode: false,
  }, fixture.dependencies);

  assert.equal(fixture.calls.fetches.length, 1);
  assert.deepEqual(fixture.calls.fetches[0], {
    token: NATIVE_TEST_TOKEN,
    options: {
      serviceValue: 'llm',
      baseUrl: 'https://llm-api.routerlab.ch',
      timeoutMs: 10000,
    },
  });
  assert.equal(fixture.calls.launches.length, 1);
  const launch = fixture.calls.launches[0];
  assert.equal(launch.apiKey, NATIVE_TEST_TOKEN);
  assert.equal(launch.updateProcessExitCode, false);
  assert.equal(launch.codexArgs.filter((value) => value === '-c').length, 6);
  assert.deepEqual(launch.codexArgs.slice(-2), ['--sandbox', 'workspace-write']);
  assert.ok(launch.codexArgs.includes('model="MiniMax-M3"'));
  assert.ok(launch.codexArgs.includes('model_providers.custom.base_url="https://llm-api.routerlab.ch/v1"'));
  assert.equal(launch.codexArgs.some((value) => value.includes('model_catalog_json')), false);
  assert.equal(launch.codexArgs.some((value) => /^http:\/\/127\.0\.0\.1/.test(value)), false);
});

test('Codex rejects routing overrides before CLI detection, token use, or model discovery', async () => {
  const forbiddenDependencies = {
    assertCodexCliAvailable: () => {
      throw new Error('Codex detection must not run');
    },
    fetchModels: async () => {
      throw new Error('Model discovery must not run');
    },
    launchCodex: async () => {
      throw new Error('Codex must not launch');
    },
    resolveTokenWithSource: async () => {
      throw new Error('Token resolution must not run');
    },
  };

  await assert.rejects(
    launchCodexForService({
      service: 'routerlab',
      token: NATIVE_TEST_TOKEN,
      forwarded: ['--config', 'model_providers.custom.base_url="https://example.test/v1"'],
    }, forbiddenDependencies),
    (error) => error.exitCode === 2 && /cannot be forwarded/.test(error.message),
  );
});

test('Codex no-prompt launches the default only when discovered', async () => {
  const fixture = launchDependencies({
    valid: true,
    models: ['glm-5.2', 'gpt-5.6-sol'],
    modelMetadata: [],
  });
  await launchCodexForService({
    service: 'routerlab',
    token: NATIVE_TEST_TOKEN,
    noPrompt: true,
  }, fixture.dependencies);
  assert.ok(fixture.calls.launches[0].codexArgs.includes('model="gpt-5.6-sol"'));

  const missingDefault = launchDependencies({
    valid: true,
    models: ['glm-5.2'],
    modelMetadata: [],
  });
  await assert.rejects(
    launchCodexForService({
      service: 'routerlab',
      token: NATIVE_TEST_TOKEN,
      noPrompt: true,
    }, missingDefault.dependencies),
    /gpt-5\.6-sol.*not available/,
  );
  assert.equal(missingDefault.calls.launches.length, 0);
});

test('Codex refuses every model discovery failure without launching', async () => {
  const failures = [
    { valid: false, reason: 'network_error', message: 'network down' },
    { valid: false, reason: 'timeout', message: 'request timed out' },
    { valid: false, reason: 'invalid_response', message: 'invalid JSON' },
    { valid: false, reason: 'redirect_not_allowed', status: 302 },
    { valid: false, reason: 'auth_failed', status: 401 },
    { valid: false, reason: 'auth_failed', status: 403 },
    { valid: false, reason: 'server_error', status: 500 },
    { valid: true, models: ['not-allowed'], modelMetadata: [] },
  ];

  await Promise.all(failures.map(async (result) => {
    const fixture = launchDependencies(result);
    await assert.rejects(launchCodexForService({
      service: 'routerlab',
      token: NATIVE_TEST_TOKEN,
      noPrompt: true,
    }, fixture.dependencies));
    assert.equal(fixture.calls.launches.length, 0);
  }));
});

test('Codex does not silently substitute an unavailable explicit model', async () => {
  const fixture = launchDependencies({
    valid: true,
    models: ['gpt-5.6-sol', 'glm-5.2'],
    modelMetadata: [],
  });
  await assert.rejects(
    launchCodexForService({
      service: 'routerlab',
      model: 'gpt-5.6-terra',
      token: NATIVE_TEST_TOKEN,
      noPrompt: true,
    }, fixture.dependencies),
    /gpt-5\.6-terra.*not available/,
  );
  assert.equal(fixture.calls.launches.length, 0);
});
