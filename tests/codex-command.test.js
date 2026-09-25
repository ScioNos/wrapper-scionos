import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendCodexApiPath,
  availableCodexModelFamilies,
  availableCodexModels,
  codexAuthenticationError,
  codexModelDiscoveryError,
  codexModelUnavailableError,
  handleCodex,
  resolveCodexLaunchFamily,
  resolveCodexLaunchModel,
  validateCodexForwardedArgs,
} from '../src/cli/commands/codex.js';
import { requireServiceConfig } from '../src/routerlab/services.js';

test('Codex availability is the allowlist/discovery intersection in allowlist order', () => {
  assert.deepEqual(
    availableCodexModels('routerlab', [
      'unknown',
      'deepseek-v4-pro-0813',
      'deepseek-v4-flash-0731',
      'gemini-3.7-flash',
      'gpt-6-astra',
      'gpt-6-sol',
      'gpt-6-luna',
      'deepseek-v4.1-flash',
      'gemini-3.8-flash',
      'minimax-m3',
      'kimi-k3',
      'qwen3.8-max',
    ]),
    ['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna', 'deepseek-v4.1-flash', 'kimi-k3', 'minimax-m3', 'qwen3.8-max'],
  );
  assert.deepEqual(
    availableCodexModels('llm', [
      'deepseek-v4.1-flash',
      'gemini-3.8-flash',
      'glm-5.3-flash',
      'glm-5.3',
      'gpt-5.6-sol',
      'gpt-6-astra',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
    ]),
    [
      'gpt-5.6-sol',
      'gpt-6-astra',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'gemini-3.8-flash',
      'deepseek-v4.1-flash',
      'glm-5.3',
      'glm-5.3-flash',
    ],
  );
  assert.deepEqual(availableCodexModelFamilies('routerlab', [
    'gpt-6-astra', 'gpt-5.6-sol', 'deepseek-v4.1-flash', 'glm-5.3', 'glm-5.3-flash', 'qwen3.8-max', 'kimi-k3',
  ]).map((family) => [family.value, family.models.map(({ model }) => model)]), [
    ['claude-gpt', ['gpt-6-astra']],
    ['open-source', ['deepseek-v4.1-flash', 'glm-5.3', 'glm-5.3-flash', 'kimi-k3', 'qwen3.8-max']],
  ]);
});

test('Codex forwarded arguments preserve native options but cannot replace RouterLab routing', () => {
  const allowed = ['exec', '--sandbox', 'workspace-write', '--enable', 'feature-a', 'prompt'];
  assert.deepEqual(validateCodexForwardedArgs(allowed), allowed);

  for (const blocked of [
    ['-c', 'model="other"'],
    ['-cmodel="other"'],
    ['--config', 'model="other"'],
    ['--config=model="other"'],
    ['-m', 'other'],
    ['-mother'],
    ['--model', 'other'],
    ['--model=other'],
    ['--oss'],
    ['--oss=true'],
    ['--local-provider', 'ollama'],
    ['--local-provider=ollama'],
    ['-p', 'other'],
    ['-pother'],
    ['--profile', 'other'],
    ['--profile=other'],
    ['--remote', 'wss://example.test'],
    ['--remote=wss://example.test'],
    ['--remote-auth-token-env', 'OPENAI_API_KEY'],
    ['--remote-auth-token-env=OPENAI_API_KEY'],
  ]) {
    assert.throws(
      () => validateCodexForwardedArgs(blocked),
      (error) => error.exitCode === 2 && /cannot be forwarded/.test(error.message),
    );
  }
});

test('Codex exact requested model is preserved and never substituted', async () => {
  const service = requireServiceConfig('llm');
  assert.equal(await resolveCodexLaunchModel({
    requestedModel: 'gemini-3.8-flash',
    availableModels: ['gpt-5.6-sol', 'gemini-3.8-flash'],
    service,
  }), 'gemini-3.8-flash');
  await assert.rejects(resolveCodexLaunchModel({
    requestedModel: 'gemini-3.7-flash',
    availableModels: ['gemini-3.8-flash'],
    service,
  }), /not available/);
});

test('Codex interactive selection starts with a discovered model family', async () => {
  const service = requireServiceConfig('routerlab');
  const families = availableCodexModelFamilies('routerlab', [
    'gpt-6-astra', 'gpt-5.6-sol', 'deepseek-v4.1-flash', 'glm-5.3',
  ]);
  let choicesSeen;
  const selected = await resolveCodexLaunchFamily({
    availableFamilies: families,
    service,
    selectFamily: async ({ choices }) => {
      choicesSeen = choices;
      return 'open-source';
    },
  });
  assert.deepEqual(choicesSeen.map((choice) => choice.key), ['1', '2', '0']);
  assert.equal(selected.value, 'open-source');
});

test('Codex no-prompt requires the default model', async () => {
  const service = requireServiceConfig('routerlab');
  assert.equal(await resolveCodexLaunchModel({
    availableModels: ['gpt-5.6-sol', 'glm-5.2'],
    service,
    noPrompt: true,
  }), 'gpt-5.6-sol');
  await assert.rejects(resolveCodexLaunchModel({
    availableModels: ['glm-5.2'],
    service,
    noPrompt: true,
  }), /gpt-5\.6-sol.*not available/);
});

test('Codex interactive selection auto-selects one model and prompts for several', async () => {
  const service = requireServiceConfig('routerlab');
  let promptCalls = 0;
  assert.equal(await resolveCodexLaunchModel({
    availableModels: ['glm-5.2'],
    service,
    selectModel: async () => {
      promptCalls += 1;
      return 'unexpected';
    },
  }), 'glm-5.2');
  assert.equal(promptCalls, 0);

  assert.equal(await resolveCodexLaunchModel({
    availableModels: ['gpt-5.6-sol', 'glm-5.2'],
    service,
    selectModel: async ({ choices }) => {
      promptCalls += 1;
      assert.deepEqual(choices.map((choice) => choice.value), ['gpt-5.6-sol', 'glm-5.2', 'back']);
      return 'glm-5.2';
    },
  }), 'glm-5.2');
  assert.equal(promptCalls, 1);
});

test('Codex discovery and authentication errors are explicit', () => {
  const service = requireServiceConfig('llm');
  const auth = codexAuthenticationError({ status: 403 }, service, { source: 'option' });
  assert.equal(auth.code, 'auth_failed');
  assert.equal(auth.statusCode, 403);
  assert.match(auth.message, /HTTP 403/);

  for (const failure of [
    { reason: 'network_error', message: 'connection refused' },
    { reason: 'timeout', message: 'timed out' },
    { reason: 'invalid_response', message: 'invalid JSON' },
    { reason: 'redirect_not_allowed', status: 302, message: 'redirect refused' },
    { reason: 'server_error', status: 500, statusText: 'Internal Server Error' },
    { reason: 'models_unavailable', message: 'No allowed Codex model is currently available' },
  ]) {
    const error = codexModelDiscoveryError(failure, service);
    assert.equal(error.code, failure.reason);
    assert.match(error.message, /Codex was not launched/);
  }

  assert.equal(codexModelUnavailableError('missing', service, []).code, 'model_unavailable');
  assert.equal(appendCodexApiPath(service.baseUrl), 'https://llm-api.routerlab.ch/v1');
});

test('codex template prints only native provider configuration', async () => {
  const originalLog = console.log;
  const output = [];
  console.log = (line) => output.push(JSON.parse(line));
  try {
    await handleCodex('template', {
      service: 'routerlab',
      model: 'gpt-5.6-sol',
      json: true,
      command: 'codex:template',
    });
  } finally {
    console.log = originalLog;
  }
  assert.deepEqual(Object.keys(output[0].data), ['config']);
  assert.doesNotMatch(output[0].data.config, /model_catalog_json/);
});
