import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendOpenCodeApiPath,
  buildOpenCodeConfigContent,
  buildOpenCodeEnvironment,
  getOpenCodeAuthorizedModels,
  getOpenCodeModelFamilies,
} from '../src/apps/opencode.js';

test('OpenCode authorized models follow the service strategy catalog', () => {
  const routerlab = getOpenCodeAuthorizedModels('routerlab');
  assert.deepEqual(routerlab, [
    'claude-fable-5-1',
    'claude-opus-5-5',
    'claude-sonnet-5',
    'claude-haiku-4-5',
    'aws-claude-haiku-4-5',
    'aws-claude-sonnet-5',
    'aws-claude-opus-5',
    'gpt-6-astra',
    'gpt-5.6-luna',
    'gpt-5.6-terra',
    'gpt-5.6-sol',
    'deepseek-v4.1-flash',
    'glm-5.3',
    'glm-5.3-flash',
    'hy4-preview',
    'kimi-k3',
    'minimax-m3',
    'qwen3.8-max',
    'deepseek-v4.1-trial',
    'gemini-3.8-flash-trial',
    'glm-5.3-flash-trial',
    'MiniMax-M3-trial',
    'qwen3.8-max-trial',
  ]);
  assert.deepEqual(getOpenCodeAuthorizedModels('llm'), [
    'claude-fable-5',
    'claude-haiku-4-5',
    'claude-opus-5',
    'claude-sonnet-5',
    'gpt-6-astra',
    'gpt-5.6-luna',
    'gpt-5.6-terra',
    'gpt-5.6-sol',
    'deepseek-v4.1-flash',
    'gemini-3.8-flash',
    'glm-5.3',
    'glm-5.3-flash',
  ]);
  assert.deepEqual(getOpenCodeModelFamilies('llm', ['gpt-6-astra', 'glm-5.3']), [
    {
      value: 'claude-gpt',
      name: 'OpenAI GPT',
      description: 'Fable => GPT 6 Astra, Haiku => GPT 5.6 Luna, Sonnet => GPT 5.6 Terra, Opus => GPT 5.6 Sol. Select a subagent model at launch.',
      models: [{ model: 'gpt-6-astra', role: 'fable' }],
    },
    {
      value: 'divers',
      name: 'Divers',
      description: 'Fable => DeepSeek V4.1 Flash, Haiku => Gemini 3.8 Flash, Sonnet => GLM 5.3, Opus => GLM 5.3 Flash. Select a subagent model at launch.',
      models: [{ model: 'glm-5.3', role: 'sonnet' }],
    },
  ]);
  assert.deepEqual(getOpenCodeModelFamilies('routerlab').map((family) => family.name), [
    'Claude', 'AWS Claude', 'OpenAI GPT', 'Open Source', 'Trial',
  ]);
  assert.deepEqual(getOpenCodeModelFamilies('llm').map((family) => family.name), [
    'Claude', 'OpenAI GPT', 'Divers',
  ]);
  assert.deepEqual(getOpenCodeModelFamilies('llm', ['unknown']), []);
});

test('OpenCode config uses the OpenAI-compatible local provider without a RouterLab secret', () => {
  const config = JSON.parse(buildOpenCodeConfigContent({
    baseUrl: 'http://127.0.0.1:45678',
    model: 'gpt-6-astra',
    models: ['gpt-6-astra', 'gpt-5.6-sol'],
  }));

  assert.equal(config.model, 'scionos/gpt-6-astra');
  assert.deepEqual(config.enabled_providers, ['scionos']);
  assert.equal(config.provider.scionos.npm, '@ai-sdk/openai-compatible');
  assert.equal(config.provider.scionos.options.baseURL, 'http://127.0.0.1:45678/v1');
  assert.equal(config.provider.scionos.options.apiKey, '{env:WRAPPER_SCIONOS_OPENCODE_GATEWAY_TOKEN}');
  assert.deepEqual(Object.keys(config.provider.scionos.models), ['gpt-6-astra', 'gpt-5.6-sol']);
  assert.doesNotMatch(JSON.stringify(config), /routerlab-token|real-routerlab-token/);
  assert.equal(appendOpenCodeApiPath('https://llm-api.routerlab.ch/v1'), 'https://llm-api.routerlab.ch/v1');
});

test('OpenCode child environment strips RouterLab credentials and keeps native variables', () => {
  const environment = buildOpenCodeEnvironment({
    sourceEnv: {
      PATH: 'native-path',
      ROUTERLAB_API_KEY: 'routerlab-secret',
      ROUTERLAB_LLM_API_KEY: 'llm-secret',
      ANTHROPIC_AUTH_TOKEN: 'legacy-secret',
      NO_PROXY: 'internal.example',
      OPENCODE_CONFIG_CONTENT: 'user-config',
    },
    proxyBaseUrl: 'http://127.0.0.1:45678',
    gatewayToken: 'local-gateway-token',
    model: 'gpt-6-astra',
    models: ['gpt-6-astra'],
  });

  assert.equal(environment.PATH, 'native-path');
  assert.equal(environment.ROUTERLAB_API_KEY, undefined);
  assert.equal(environment.ROUTERLAB_LLM_API_KEY, undefined);
  assert.equal(environment.ANTHROPIC_AUTH_TOKEN, undefined);
  assert.equal(environment.OPENCODE_CONFIG_CONTENT.includes('user-config'), false);
  assert.equal(environment.WRAPPER_SCIONOS_OPENCODE_GATEWAY_TOKEN, 'local-gateway-token');
  assert.match(environment.NO_PROXY, /internal\.example/);
  assert.match(environment.NO_PROXY, /127\.0\.0\.1/);
});
