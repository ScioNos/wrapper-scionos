import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendCodexApiPath,
  availableCodexModels,
  codexAuthenticationError,
  codexModelDiscoveryError,
  codexModelUnavailableError,
  handleCodex,
  resolveCodexLaunchModel,
  validateCodexForwardedArgs,
} from '../src/cli/commands/codex.js';
import { requireServiceConfig } from '../src/routerlab/services.js';

test('Codex availability is the allowlist/discovery intersection in allowlist order', () => {
  assert.deepEqual(
    availableCodexModels('routerlab', ['unknown', 'minimax-m3', 'glm-5.2', 'gpt-5.6-sol']),
    ['gpt-5.6-sol', 'glm-5.2', 'minimax-m3'],
  );
  assert.deepEqual(
    availableCodexModels('llm', ['MiniMax-M3', 'gpt-5.6-luna']),
    ['gpt-5.6-luna', 'MiniMax-M3'],
  );
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
    requestedModel: 'MiniMax-M3',
    availableModels: ['gpt-5.6-sol', 'MiniMax-M3'],
    service,
  }), 'MiniMax-M3');
  await assert.rejects(resolveCodexLaunchModel({
    requestedModel: 'minimax-m3',
    availableModels: ['MiniMax-M3'],
    service,
  }), /not available/);
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
      assert.deepEqual(choices.map((choice) => choice.value), ['gpt-5.6-sol', 'glm-5.2']);
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
