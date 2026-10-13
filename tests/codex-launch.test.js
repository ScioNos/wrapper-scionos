import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launchCodexForService } from '../src/cli/commands/codex.js';

const NATIVE_TEST_TOKEN = 'native-codex-token-with-enough-length';

function launchDependencies(modelResult, { launchError = null } = {}) {
  const calls = { launches: [], fetches: [], catalogPath: null };
  return {
    calls,
    dependencies: {
      isInteractive: () => true,
      assertCodexCliAvailable: () => ({ installed: true, cliPath: 'fake-codex' }),
      fetchModels: async (token, options) => {
        calls.fetches.push({ token, options });
        return modelResult;
      },
      launchCodex: async (options) => {
        calls.launches.push(options);
        const catalogOverride = options.codexArgs.find(
          (value) => value.startsWith('model_catalog_json='),
        );
        calls.catalogPath = JSON.parse(catalogOverride.slice('model_catalog_json='.length));
        assert.equal(fs.existsSync(calls.catalogPath), true);
        calls.catalog = JSON.parse(fs.readFileSync(calls.catalogPath, 'utf8'));
        if (launchError) throw launchError;
        return 0;
      },
      resolveTokenWithSource: async () => {
        throw new Error('explicit token should avoid token resolution');
      },
      selectFamily: async () => {
        throw new Error('family selection should not be needed');
      },
      selectModel: async () => {
        throw new Error('selection should not be needed');
      },
    },
  };
}

test('Codex Trial selects the new default and exposes only its five verified models', async () => {
  const models = ['deepseek-v4.1-flash-trial', 'glm-5.3-flash-trial', 'qwen3.8-flash-trial', 'gpt-6-luna-trial', 'MiniMax-M3-trial'];
  const fixture = launchDependencies({ valid: true, models: ['gpt-6.1-sol', 'glm-5.3', ...models], modelMetadata: [] });
  await launchCodexForService({
    service: 'routerlab', strategy: 'trial', token: NATIVE_TEST_TOKEN, noPrompt: true,
  }, fixture.dependencies);
  assert.ok(fixture.calls.launches[0].codexArgs.includes('model="deepseek-v4.1-flash-trial"'));
  assert.deepEqual(fixture.calls.catalog.models.map(({ slug }) => slug), models);
  assert.equal(fs.existsSync(fixture.calls.catalogPath), false);
});

test('Codex launch is direct, native, and forwards the original RouterLab token', async () => {
  const fixture = launchDependencies({
    valid: true,
    models: ['not-allowed', 'deepseek-v4.1-flash', 'gpt-5.6-sol'],
    modelMetadata: [],
  });
  await launchCodexForService({
    service: 'llm',
    model: 'deepseek-v4.1-flash',
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
  assert.equal(launch.codexArgs.filter((value) => value === '-c').length, 7);
  assert.deepEqual(launch.codexArgs.slice(-2), ['--sandbox', 'workspace-write']);
  assert.ok(launch.codexArgs.includes('model="deepseek-v4.1-flash"'));
  assert.ok(launch.codexArgs.includes('model_providers.custom.base_url="https://llm-api.routerlab.ch/v1"'));
  assert.equal(launch.codexArgs.some((value) => value.includes('model_catalog_json')), true);
  assert.equal(launch.codexArgs.some((value) => /^http:\/\/127\.0\.0\.1/.test(value)), false);
  assert.equal(fs.existsSync(fixture.calls.catalogPath), false);
});

test('Codex interactive menu launches native model selection without wrapper prompts', async () => {
  const fixture = launchDependencies({
    valid: true,
    models: ['gpt-6-astra', 'gpt-5.6-sol', 'glm-5.3'],
    modelMetadata: [],
  });

  await launchCodexForService({
    service: 'llm',
    token: NATIVE_TEST_TOKEN,
    interactiveMenu: true,
    updateProcessExitCode: false,
  }, fixture.dependencies);

  assert.equal(fixture.calls.launches.length, 1);
  assert.ok(fixture.calls.launches[0].codexArgs.includes('model="gpt-5.6-sol"'));
});

test('Codex removes the temporary model catalog when launch fails', async () => {
  const fixture = launchDependencies({
    valid: true,
    models: ['gpt-6.1-sol'],
    modelMetadata: [],
  }, {
    launchError: new Error('simulated Codex startup failure'),
  });

  await assert.rejects(
    launchCodexForService({
      service: 'routerlab',
      token: NATIVE_TEST_TOKEN,
      noPrompt: true,
    }, fixture.dependencies),
    /simulated Codex startup failure/,
  );

  assert.equal(fixture.calls.launches.length, 1);
  assert.ok(fixture.calls.catalogPath);
  assert.equal(fs.existsSync(fixture.calls.catalogPath), false);
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
    models: ['kimi-k3', 'gpt-6.1-sol'],
    modelMetadata: [],
  });
  await launchCodexForService({
    service: 'routerlab',
    token: NATIVE_TEST_TOKEN,
    noPrompt: true,
  }, fixture.dependencies);
  assert.ok(fixture.calls.launches[0].codexArgs.includes('model="gpt-6.1-sol"'));

  const missingDefault = launchDependencies({
    valid: true,
    models: ['kimi-k3'],
    modelMetadata: [],
  });
  await assert.rejects(
    launchCodexForService({
      service: 'routerlab',
      token: NATIVE_TEST_TOKEN,
      noPrompt: true,
    }, missingDefault.dependencies),
    /gpt-6\.1-sol.*not available/,
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
    models: ['gpt-5.6-sol', 'kimi-k3'],
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

test('Codex missing family preferred model requires an explicit interactive choice, even for one model', async () => {
  for (const models of [['gpt-6-astra'], ['gpt-6-astra', 'gpt-6-luna', 'glm-5.3']]) {
    const fixture = launchDependencies({ valid: true, models });
    let prompts = 0;
    fixture.dependencies.selectModel = async ({ choices }) => {
      prompts++;
      assert.deepEqual(choices.filter(({ value }) => value !== 'back').map(({ value }) => value), models.filter((model) => model.startsWith('gpt-')));
      return 'gpt-6-astra';
    };
    await launchCodexForService({ service: 'routerlab', strategy: 'claude-gpt', token: NATIVE_TEST_TOKEN }, fixture.dependencies);
    assert.equal(prompts, 1);
    assert.ok(fixture.calls.launches[0].codexArgs.includes('model="gpt-6-astra"'));
    assert.deepEqual(fixture.calls.catalog.models.map(({ slug }) => slug), models.filter((model) => model.startsWith('gpt-')));
  }
});

test('Codex missing family preferred model fails non-interactively with --model guidance', async () => {
  const fixture = launchDependencies({ valid: true, models: ['gpt-6-astra', 'glm-5.3'] });
  await assert.rejects(launchCodexForService({ service: 'routerlab', strategy: 'claude-gpt', noPrompt: true, token: NATIVE_TEST_TOKEN }, fixture.dependencies), /gpt-6\.1-sol.*unavailable.*--model/);
  assert.equal(fixture.calls.launches.length, 0);
  await assert.rejects(launchCodexForService({ service: 'routerlab', strategy: 'claude-gpt', token: NATIVE_TEST_TOKEN }, { ...fixture.dependencies, isInteractive: () => false }), /--model/);
  await launchCodexForService({ service: 'routerlab', strategy: 'claude-gpt', model: 'gpt-6-astra', noPrompt: true, token: NATIVE_TEST_TOKEN }, fixture.dependencies);
  assert.deepEqual(fixture.calls.catalog.models.map(({ slug }) => slug), ['gpt-6-astra']);
});

test('Codex explicit missing model never opens a replacement picker', async () => {
  const fixture = launchDependencies({ valid: true, models: ['gpt-6-astra'] });
  await assert.rejects(launchCodexForService({ service: 'routerlab', strategy: 'claude-gpt', model: 'gpt-6.1-sol', token: NATIVE_TEST_TOKEN }, fixture.dependencies), /not available/);
  assert.equal(fixture.calls.launches.length, 0);
});

test('Codex explicitly selected LLM family also limits the native catalog', async () => {
  const fixture = launchDependencies({ valid: true, models: ['gpt-5.6-sol', 'deepseek-v4.1-flash', 'glm-5.3'] });
  await launchCodexForService({ service: 'llm', strategy: 'divers', model: 'glm-5.3', noPrompt: true, token: NATIVE_TEST_TOKEN }, fixture.dependencies);
  assert.deepEqual(fixture.calls.catalog.models.map(({ slug }) => slug), ['deepseek-v4.1-flash', 'glm-5.3']);
});

test('Codex catalog cleanup failure cannot mask an earlier client failure', async () => {
  const original = new Error('client failed');
  const fixture = launchDependencies({ valid: true, models: ['gpt-6.1-sol'] }, { launchError: original });
  fixture.dependencies.writeCodexRuntimeModelCatalog = () => ({ path: 'test-catalog' });
  fixture.dependencies.launchCodex = async () => { throw original; };
  fixture.dependencies.cleanupCodexRuntimeModelCatalog = () => { throw new Error('catalog locked'); };
  await assert.rejects(launchCodexForService({ service: 'routerlab', noPrompt: true, token: NATIVE_TEST_TOKEN }, fixture.dependencies), (error) => error === original && error.cleanupError.message === 'catalog locked');
});
