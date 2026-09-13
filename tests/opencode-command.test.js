import test from 'node:test';
import assert from 'node:assert/strict';
import {
  launchOpenCodeForService,
  availableOpenCodeModelFamilies,
  openCodeAuthenticationError,
  openCodeModelDiscoveryError,
  resolveOpenCodeLaunchModel,
  resolveOpenCodeLaunchFamily,
  validateOpenCodeForwardedArgs,
} from '../src/cli/commands/opencode.js';
import { requireServiceConfig } from '../src/routerlab/services.js';

const TOKEN = 'routerlab-token-with-enough-length';

function launchDependencies(modelResult, overrides = {}) {
  const calls = { launches: [], proxies: [], stops: [] };
  const dependencies = {
    assertOpenCodeCliAvailable: () => ({ installed: true, cliPath: 'opencode.cmd', version: '1.18.30' }),
    fetchModels: async () => modelResult,
    resolveTokenWithSource: async () => ({ token: TOKEN, source: 'secure-storage' }),
    startLongRunningLlmProxy: async (options) => {
      calls.proxies.push(options);
      return { baseUrl: 'http://127.0.0.1:45678', gatewayToken: 'local-gateway-token', server: { listening: true } };
    },
    stopLongRunningLlmProxy: async (proxy) => {
      calls.stops.push(proxy);
    },
    launchOpenCode: async (options) => {
      calls.launches.push(options);
      return 0;
    },
    ...overrides,
  };
  return { calls, dependencies };
}

test('OpenCode launches through a local OpenAI-compatible proxy and passes the selected model', async () => {
  const fixture = launchDependencies({
    valid: true,
    models: ['gpt-6-astra', 'gpt-5.6-sol', 'glm-5.3'],
    modelMetadata: [],
  });
  const exitCode = await launchOpenCodeForService({
    service: 'llm',
    model: 'gpt-6-astra',
    token: TOKEN,
    noPrompt: true,
    passthrough: ['run', 'hello'],
    updateProcessExitCode: false,
  }, fixture.dependencies);

  assert.equal(exitCode, 0);
  assert.deepEqual(fixture.calls.launches[0].openCodeArgs, ['run', 'hello']);
  assert.equal(fixture.calls.proxies[0].upstreamAuth, 'openai');
  assert.deepEqual(fixture.calls.proxies[0].allowedModels, [
    'gpt-6-astra',
    'gpt-5.6-sol',
    'glm-5.3',
  ]);
  const childConfig = JSON.parse(fixture.calls.launches[0].env.OPENCODE_CONFIG_CONTENT);
  assert.equal(childConfig.model, 'scionos/gpt-6-astra');
  assert.equal(childConfig.provider.scionos.options.baseURL, 'http://127.0.0.1:45678/v1');
  assert.equal(fixture.calls.stops.length, 1);
});

test('OpenCode strategy selection narrows the child catalog', async () => {
  const fixture = launchDependencies({
    valid: true,
    models: ['gpt-6-astra', 'gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'glm-5.3'],
    modelMetadata: [],
  });
  await launchOpenCodeForService({
    service: 'routerlab',
    strategy: 'claude-gpt',
    token: TOKEN,
    noPrompt: true,
    passthrough: [],
    updateProcessExitCode: false,
  }, fixture.dependencies);

  assert.equal(fixture.calls.proxies[0].allowedModels.includes('gpt-6-astra'), true);
  assert.equal(fixture.calls.proxies[0].allowedModels.includes('glm-5.3'), false);
  const childConfig = JSON.parse(fixture.calls.launches[0].env.OPENCODE_CONFIG_CONTENT);
  assert.equal(childConfig.model, 'scionos/gpt-5.6-sol');
});

test('OpenCode rejects provider and model overrides before discovery', () => {
  for (const blocked of [
    ['--model', 'other'],
    ['--model=other'],
    ['-m', 'other'],
    ['-mother'],
    ['--config', 'other.json'],
    ['--config=other.json'],
    ['--config-dir', 'other'],
    ['--config-content', '{}'],
  ]) {
    assert.throws(
      () => validateOpenCodeForwardedArgs(blocked),
      (error) => error.exitCode === 2 && /cannot be forwarded/.test(error.message),
    );
  }
});

test('OpenCode model selection never substitutes an unavailable explicit model', async () => {
  const service = requireServiceConfig('llm');
  assert.equal(await resolveOpenCodeLaunchModel({
    requestedModel: 'gpt-6-astra',
    availableModels: ['gpt-6-astra', 'gpt-5.6-sol'],
    service,
  }), 'gpt-6-astra');
  await assert.rejects(
    resolveOpenCodeLaunchModel({
      requestedModel: 'gemini-3.7-flash',
      availableModels: ['gpt-6-astra'],
      service,
    }),
    /not available/,
  );
});

test('OpenCode no-prompt requires gpt-5.6-sol and interactive launch selects a family first', async () => {
  const service = requireServiceConfig('llm');
  await assert.rejects(resolveOpenCodeLaunchModel({
    availableModels: ['glm-5.3'],
    service,
    noPrompt: true,
  }), /gpt-5\.6-sol.*not available/);

  const families = availableOpenCodeModelFamilies('llm', [
    'gpt-6-astra', 'gpt-5.6-sol', 'deepseek-v4.1-flash', 'glm-5.3',
  ]);
  let modelChoices;
  const family = await resolveOpenCodeLaunchFamily({
    availableFamilies: families,
    service,
    selectFamily: async ({ choices }) => {
      assert.deepEqual(choices.map((choice) => choice.key), ['1', '2', '0']);
      return 'divers';
    },
  });
  assert.equal(family.value, 'divers');
  await resolveOpenCodeLaunchModel({
    availableModels: family.models.map(({ model }) => model),
    service,
    selectModel: async ({ choices }) => {
      modelChoices = choices;
      return 'glm-5.3';
    },
  });
  assert.deepEqual(modelChoices.map((choice) => choice.value), ['deepseek-v4.1-flash', 'glm-5.3', 'back']);
});

test('OpenCode discovery and authentication errors are explicit', () => {
  const service = requireServiceConfig('routerlab');
  const auth = openCodeAuthenticationError({ status: 403 }, service, {
    source: 'secure-storage',
    envTokenKey: null,
  });
  assert.equal(auth.code, 'auth_failed');
  assert.equal(auth.statusCode, 403);
  assert.match(auth.message, /HTTP 403/);
  const discovery = openCodeModelDiscoveryError({ reason: 'timeout', message: 'timed out' }, service);
  assert.equal(discovery.code, 'timeout');
  assert.match(discovery.message, /OpenCode was not launched/);
});
