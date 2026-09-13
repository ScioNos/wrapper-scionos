import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStrategyPromptChoices, chooseStrategy, chooseSubagentModel } from '../src/apps/claude-code.js';
import { requireServiceConfig, resolveServiceBaseUrlWithSource, resolveServiceEnvToken, SERVICES, validateServiceBaseUrl } from '../src/routerlab/services.js';
import {
  allowsSubagentModelOverride,
  applySubagentModelOverride,
  assessStrategy,
  assessStrategyLaunch,
  getAuthorizedClaudeCodeModels,
  getClaudeCodeStrategyEnvironment,
  getServiceStrategies,
  getStrategyDisplayName,
  getStrategyEnvironment,
  getStrategyChoices,
  getSubagentModelOverride,
  hasExploitableModelIds,
  normalizeStrategyValue,
  STRATEGIES,
} from '../src/routerlab/strategies.js';
import { extractModelIds, validateTokenFormat } from '../src/routerlab/models.js';
import { codexModelDisplayName, codexModelFromClaudeCodeModel, codexModelsFromClaudeCodeStrategies, desktopLabelForDesktopMapping, desktopLabelForStrategyModel, desktopRouteIdForStrategyModel, getStrategyModels, isClaudeFamilyModel, sortDesktopRoutes, supportsOneMillionContext } from '../src/routerlab/strategy-models.js';
import { resetDeprecationWarningsForTests } from '../src/cli/deprecations.js';

test('RouterLab services expose the expected endpoints', () => {
  assert.equal(requireServiceConfig('routerlab').baseUrl, 'https://api.routerlab.ch');
  assert.equal(requireServiceConfig('llm').baseUrl, 'https://llm-api.routerlab.ch');
  assert.equal(validateServiceBaseUrl('https://api.routerlab.ch/', 'routerlab'), 'https://api.routerlab.ch');
  assert.equal(validateServiceBaseUrl('https://llm-api.routerlab.ch', 'llm'), 'https://llm-api.routerlab.ch');
  for (const value of [
    'https://example.test/gateway/v1',
    'http://api.routerlab.ch',
    'https://api.routerlab.ch:444',
    'https://api.routerlab.ch/v1',
    'not-a-valid-url',
  ]) {
    assert.throws(() => validateServiceBaseUrl(value, 'routerlab'), /must be https:\/\/api\.routerlab\.ch/);
  }
});

test('service environment tokens prefer RouterLab names with Anthropic legacy fallback', () => {
  assert.deepEqual(resolveServiceEnvToken('routerlab', {
    ROUTERLAB_API_KEY: 'routerlab-token',
    ANTHROPIC_AUTH_TOKEN: 'legacy-token',
  }), {
    token: 'routerlab-token',
    source: 'env',
    envKey: 'ROUTERLAB_API_KEY',
  });
  assert.deepEqual(resolveServiceEnvToken('llm', {
    ROUTERLAB_LLM_API_KEY: 'llm-token',
    ROUTERLAB_API_KEY: 'routerlab-token',
    ANTHROPIC_AUTH_TOKEN: 'legacy-token',
  }), {
    token: 'llm-token',
    source: 'env',
    envKey: 'ROUTERLAB_LLM_API_KEY',
  });
  assert.deepEqual(resolveServiceEnvToken('routerlab', {
    ANTHROPIC_AUTH_TOKEN: 'legacy-token',
  }), {
    token: 'legacy-token',
    source: 'legacy-env',
    envKey: 'ANTHROPIC_AUTH_TOKEN',
  });
});

test('service base URL overrides are ignored and official destinations remain fixed', () => {
  assert.deepEqual(resolveServiceBaseUrlWithSource('routerlab', {
    ROUTERLAB_BASE_URL: 'https://custom-routerlab.example',
    ANTHROPIC_BASE_URL: 'https://legacy.example',
  }), {
    baseUrl: 'https://api.routerlab.ch',
    source: 'fixed',
    envKey: null,
    ignoredEnvKeys: ['ROUTERLAB_BASE_URL', 'ANTHROPIC_BASE_URL'],
  });
  assert.deepEqual(resolveServiceBaseUrlWithSource('llm', {
    ROUTERLAB_LLM_BASE_URL: 'https://custom-llm.example',
    ROUTERLAB_BASE_URL: 'https://custom-routerlab.example',
    ANTHROPIC_BASE_URL: 'https://legacy.example',
  }), {
    baseUrl: 'https://llm-api.routerlab.ch',
    source: 'fixed',
    envKey: null,
    ignoredEnvKeys: ['ROUTERLAB_BASE_URL', 'ROUTERLAB_LLM_BASE_URL', 'ANTHROPIC_BASE_URL'],
  });
  assert.deepEqual(resolveServiceBaseUrlWithSource('llm', {
    ANTHROPIC_BASE_URL: 'https://legacy.example',
  }), {
    baseUrl: 'https://llm-api.routerlab.ch',
    source: 'fixed',
    envKey: null,
    ignoredEnvKeys: ['ANTHROPIC_BASE_URL'],
  });
});

test('user URL variables emit warnings while remaining ignored', () => {
  const previous = process.env.WRAPPER_SCIONOS_ROUTERLAB_BASE_URL;
  const originalError = console.error;
  const warnings = [];
  process.env.WRAPPER_SCIONOS_ROUTERLAB_BASE_URL = 'https://untrusted.example';
  resetDeprecationWarningsForTests();
  console.error = (...values) => warnings.push(values.join(' '));
  try {
    const resolution = resolveServiceBaseUrlWithSource('routerlab', process.env);
    assert.equal(resolution.baseUrl, 'https://api.routerlab.ch');
  } finally {
    console.error = originalError;
    if (previous === undefined) delete process.env.WRAPPER_SCIONOS_ROUTERLAB_BASE_URL;
    else process.env.WRAPPER_SCIONOS_ROUTERLAB_BASE_URL = previous;
    resetDeprecationWarningsForTests();
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /WRAPPER_SCIONOS_ROUTERLAB_BASE_URL is ignored/);
  assert.match(warnings[0], /https:\/\/api\.routerlab\.ch/);
});

test('Claude Code strategy mapping is service-aware', () => {
  assert.deepEqual(getStrategyEnvironment('default', 'routerlab'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-5',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-5',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-fable-5.1',
  });
  assert.deepEqual(getClaudeCodeStrategyEnvironment('default', 'routerlab'), {
    ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5.1',
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-5',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-5',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-haiku-4-5',
  });
  assert.deepEqual(getStrategyEnvironment('claude-gpt', 'routerlab'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.6-sol',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.6-terra',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5.6-luna',
  });
  assert.deepEqual(getClaudeCodeStrategyEnvironment('claude-gpt', 'routerlab'), {
    ANTHROPIC_DEFAULT_FABLE_MODEL: 'gpt-6-astra',
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.6-sol',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.6-terra',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5.6-luna',
    CLAUDE_CODE_SUBAGENT_MODEL: 'gpt-5.6-luna',
  });
  assert.deepEqual(getStrategyEnvironment('open-source', 'routerlab'), {
    ANTHROPIC_DEFAULT_FABLE_MODEL: 'deepseek-v4.1-flash',
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'qwen3.8-max',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-5.3',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-5.3-flash',
  });
  assert.deepEqual(getClaudeCodeStrategyEnvironment('open-source', 'routerlab'), {
    ANTHROPIC_DEFAULT_FABLE_MODEL: 'deepseek-v4.1-flash',
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'qwen3.8-max',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-5.3',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-5.3-flash',
    CLAUDE_CODE_SUBAGENT_MODEL: 'kimi-k3',
  });
  for (const removedStrategy of [
    'deepseek',
    'deepseek-v4',
    'deepseek-v4-flash-0731',
    'kimi-k3',
    'minimax-m3',
    'qwen3.8-max',
    'glm-5.3-flash',
    'grok-4.6',
    'gemini-3.7-flash',
  ]) {
    assert.throws(() => getStrategyEnvironment(removedStrategy, 'routerlab'), /Unknown strategy/);
  }
  assert.deepEqual(getStrategyEnvironment('claude', 'llm', { subagentModel: 'haiku' }), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-5',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-5',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-fable-5',
  });

  assert.deepEqual(getClaudeCodeStrategyEnvironment('claude', 'llm'), {
    ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5',
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-5',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-5',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-haiku-4-5',
  });
  assert.deepEqual(getClaudeCodeStrategyEnvironment('claude', 'llm', { subagentModel: 'haiku' }), {
    ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5',
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-5',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-5',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-haiku-4-5',
  });
  assert.deepEqual(getStrategyEnvironment('claude-gpt', 'llm'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.6-sol',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.6-terra',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5.6-luna',
  });
  assert.deepEqual(getClaudeCodeStrategyEnvironment('claude-gpt', 'llm'), {
    ANTHROPIC_DEFAULT_FABLE_MODEL: 'gpt-6-astra',
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.6-sol',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.6-terra',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5.6-luna',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-haiku-4-5',
  });
  assert.deepEqual(getStrategyEnvironment('divers', 'llm'), {
    ANTHROPIC_DEFAULT_FABLE_MODEL: 'deepseek-v4.1-flash',
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-5.3-flash',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-5.3',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gemini-3.8-flash',
  });
  assert.deepEqual(getClaudeCodeStrategyEnvironment('divers', 'llm'), {
    ANTHROPIC_DEFAULT_FABLE_MODEL: 'deepseek-v4.1-flash',
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-5.3-flash',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-5.3',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gemini-3.8-flash',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-haiku-4-5',
  });
  assert.equal(allowsSubagentModelOverride('divers', 'llm'), false);
  assert.throws(() => getStrategyEnvironment('glm-5.3-flash', 'llm'), /Unknown strategy/);
  assert.throws(() => getStrategyEnvironment('deepseek', 'llm'), /Unknown strategy/);
  assert.throws(() => getClaudeCodeStrategyEnvironment('deepseek', 'llm'), /Unknown strategy/);
  assert.throws(() => getStrategyEnvironment('deepseek-v4', 'llm'), /Unknown strategy/);
  assert.throws(() => getStrategyEnvironment('glm-5.2', 'llm'), /Unknown strategy/);
  for (const removedStrategy of ['glm-5.3', 'qwen3.8-max', 'minimax-m3', 'kimi-k3']) {
    assert.throws(() => getStrategyEnvironment(removedStrategy, 'llm'), /Unknown strategy/);
  }
  assert.equal(allowsSubagentModelOverride('default', 'routerlab'), false);
  assert.equal(allowsSubagentModelOverride('claude-gpt', 'routerlab'), false);
  assert.throws(() => getStrategyEnvironment('claude-gpt-special', 'llm'), /Unknown strategy/);
  assert.throws(() => getStrategyEnvironment('minimax-m2.7', 'llm'), /Unknown strategy/);
  assert.throws(() => getStrategyEnvironment('grok-4.5', 'llm'), /Unknown strategy/);
});

test('Claude Code lets both RouterLab and LLM services choose an available subagent model', async () => {
  assert.equal(await chooseSubagentModel({
    serviceValue: 'routerlab',
    strategyValue: 'default',
    noPrompt: true,
  }), 'claude-haiku-4-5');
  assert.equal(await chooseSubagentModel({
    serviceValue: 'routerlab',
    strategyValue: 'claude-gpt',
    noPrompt: true,
  }), 'gpt-5.6-luna');
  await assert.rejects(chooseSubagentModel({
    serviceValue: 'routerlab',
    strategyValue: 'default',
    preferredSubagentModel: 'deepseek-v4-flash-0731',
    modelIds: ['deepseek-v4-flash-0731'],
  }), /not supported/);
  assert.equal(await chooseSubagentModel({
    serviceValue: 'routerlab',
    strategyValue: 'default',
    modelIds: ['claude-haiku-4-5', 'aws-claude-haiku-4-5'],
    selectFn: async ({ choices }) => {
      assert.deepEqual(choices.map((choice) => choice.value), [
        'claude-haiku-4-5',
        'aws-claude-haiku-4-5',
      ]);
      return 'aws-claude-haiku-4-5';
    },
  }), 'aws-claude-haiku-4-5');
  assert.equal(await chooseSubagentModel({
    serviceValue: 'llm',
    strategyValue: 'divers',
    noPrompt: true,
    modelIds: ['deepseek-v4.1-flash', 'gemini-3.8-flash', 'glm-5.3', 'glm-5.3-flash', 'claude-haiku-4-5'],
  }), 'claude-haiku-4-5');
  assert.equal(await chooseSubagentModel({
    serviceValue: 'llm',
    strategyValue: 'divers',
    preferredSubagentModel: 'deepseek-v4.1-flash',
    modelIds: ['deepseek-v4.1-flash'],
  }), 'deepseek-v4.1-flash');
  assert.equal(await chooseSubagentModel({
    serviceValue: 'llm',
    strategyValue: 'divers',
    modelIds: ['deepseek-v4.1-flash', 'gpt-5.6-luna'],
    selectFn: async ({ choices }) => {
      assert.deepEqual(choices.map((choice) => choice.value), [
        'deepseek-v4.1-flash',
        'gpt-5.6-luna',
      ]);
      return 'gpt-5.6-luna';
    },
  }), 'gpt-5.6-luna');
  await assert.rejects(chooseSubagentModel({
    serviceValue: 'llm',
    strategyValue: 'divers',
    preferredSubagentModel: 'gpt-5.6-luna',
    modelIds: ['deepseek-v4.1-flash'],
  }), /not available/);
  assert.throws(() => allowsSubagentModelOverride('claude-gpt-special', 'llm'), /Unknown strategy/);
});

test('LLM Claude strategy is active and selects the requested native models', async () => {
  const claudeChoice = getStrategyChoices([], 'llm').find((choice) => choice.value === 'claude');
  assert.equal(claudeChoice.name, 'Claude');
  assert.equal(claudeChoice.availability.level, 'unknown');
  assert.equal(claudeChoice.description, 'Fable => Claude Fable 5, Haiku => Claude Haiku 4.5, Opus => Claude Opus 5, Sonnet => Claude Sonnet 5. Select a subagent model at launch.');
  assert.equal(getAuthorizedClaudeCodeModels('llm').includes('claude-fable-5'), true);
  assert.equal(getAuthorizedClaudeCodeModels('llm').includes('gpt-6-astra'), true);
  assert.equal(await chooseStrategy({
    serviceValue: 'llm',
    preferredStrategy: 'claude',
    noPrompt: true,
    modelIds: [],
  }), 'claude');
  assert.equal(await chooseStrategy({
    serviceValue: 'llm',
    noPrompt: true,
    modelIds: [],
  }), 'claude');
  assert.equal(await chooseStrategy({
    serviceValue: 'llm',
    noPrompt: true,
    modelIds: ['deepseek-v4.1-flash', 'gemini-3.8-flash', 'glm-5.3', 'glm-5.3-flash'],
  }), 'divers');
  assert.equal(await chooseStrategy({
    serviceValue: 'llm',
    noPrompt: true,
    modelIds: ['claude-fable-5', 'claude-haiku-4-5', 'claude-opus-5', 'claude-sonnet-5'],
  }), 'claude');
  assert.equal(await chooseStrategy({
    serviceValue: 'llm',
    noPrompt: true,
    modelIds: ['glm-5.2', 'deepseek-v4-pro-0813', 'deepseek-v4-flash-0731'],
  }), 'claude');
  await assert.rejects(chooseStrategy({
    serviceValue: 'llm',
    preferredStrategy: 'glm-5.2',
    modelIds: ['glm-5.2'],
  }), /Unknown strategy/);
  await assert.rejects(chooseStrategy({
    serviceValue: 'llm',
    preferredStrategy: 'deepseek',
    modelIds: ['deepseek-v4-pro-0813', 'deepseek-v4-flash-0731'],
  }), /Unknown strategy/);
});

test('service strategy lists stay scoped', () => {
  assert.deepEqual(getStrategyChoices([], 'routerlab').map((choice) => choice.value), [
    'default',
    'aws',
    'claude-gpt',
    'open-source',
  ]);
  assert.deepEqual(getStrategyChoices([], 'llm').map((choice) => choice.value), [
    'claude',
    'claude-gpt',
    'divers',
  ]);
});

test('Claude Code strategy choices match guided launcher labels and readiness', () => {
  const choices = getStrategyChoices([], 'routerlab');
  assert.equal(choices.find((choice) => choice.value === 'aws').name, '💸 Claude via AWS (-50%)');
  assert.equal(choices.some((choice) => choice.value === 'glm-5.2'), false);
  assert.equal(choices.find((choice) => choice.value === 'open-source').name, 'Open Source');
  assert.throws(() => getStrategyEnvironment('kimi-k2.7-code', 'routerlab'), /Unknown strategy/);
  assert.throws(() => getStrategyEnvironment('claude-fable-5', 'routerlab'), /Unknown strategy/);
  assert.equal(choices.find((choice) => choice.value === 'default').description, 'Fable => Claude Fable 5.1, Opus => Claude Opus 5, Sonnet => Claude Sonnet 5, Haiku and subagents => Claude Haiku 4.5.');
  assert.equal(choices.some((choice) => choice.value === 'claude-fable-5'), false);
  assert.equal(choices.find((choice) => choice.value === 'claude-gpt').name, 'OpenAI GPT');
  assert.equal(choices.find((choice) => choice.value === 'claude-gpt').description, 'Fable => GPT 6 Astra, Haiku => GPT 5.6 Luna, Sonnet => GPT 5.6 Terra, Opus => GPT 5.6 Sol.');
  assert.equal(choices.find((choice) => choice.value === 'open-source').description, 'Fable => DeepSeek V4.1 Flash, Haiku => GLM 5.3 Flash, Sonnet => GLM 5.3, Opus => Qwen 3.8 Max, subagent => Kimi K3.');
  for (const removedStrategy of ['deepseek', 'kimi-k3', 'minimax-m3', 'qwen3.8-max', 'glm-5.3-flash', 'grok-4.6', 'gemini-3.7-flash']) {
    assert.equal(choices.some((choice) => choice.value === removedStrategy), false);
  }
  const llmGptChoice = getStrategyChoices([], 'llm').find((choice) => choice.value === 'claude-gpt');
  assert.equal(llmGptChoice.description, 'Fable => GPT 6 Astra, Haiku => GPT 5.6 Luna, Sonnet => GPT 5.6 Terra, Opus => GPT 5.6 Sol. Select a subagent model at launch.');
  const diversChoice = getStrategyChoices([], 'llm').find((choice) => choice.value === 'divers');
  assert.equal(diversChoice.name, 'Divers');
  assert.equal(diversChoice.description, 'Fable => DeepSeek V4.1 Flash, Haiku => Gemini 3.8 Flash, Sonnet => GLM 5.3, Opus => GLM 5.3 Flash. Select a subagent model at launch.');
  for (const removedStrategy of ['glm-5.3', 'qwen3.8-max', 'minimax-m3', 'kimi-k3']) {
    assert.equal(getStrategyChoices([], 'llm').some((choice) => choice.value === removedStrategy), false);
  }
  assert.equal(getStrategyChoices([], 'llm').some((choice) => choice.value === 'grok-4.6'), false);
  assert.equal(getStrategyChoices([], 'llm').some((choice) => choice.value === 'deepseek'), false);
  assert.equal(getStrategyChoices([], 'llm').some((choice) => choice.value === 'glm-5.2'), false);
  assert.equal(getStrategyDisplayName('qwen3.8-max', 'llm'), 'qwen3.8-max');

  assert.equal(assessStrategyLaunch('aws', [
    'aws-claude-haiku-4-5',
    'aws-claude-sonnet-5',
    'aws-claude-opus-5',
  ], 'routerlab').ready, true);
  assert.equal(assessStrategyLaunch('aws', [
    'aws-claude-sonnet-5',
  ], 'routerlab').ready, false);
  assert.equal(assessStrategyLaunch('default', [
    'claude-fable-5.1',
    'claude-opus-5',
    'claude-sonnet-5',
    'claude-haiku-4-5',
  ], 'routerlab').ready, true);
  assert.equal(assessStrategyLaunch('claude', [
    'claude-fable-5',
    'claude-haiku-4-5',
    'claude-opus-5',
    'claude-sonnet-5',
  ], 'llm').ready, true);
  assert.deepEqual(assessStrategyLaunch('claude', [
    'claude-sonnet-5',
  ], 'llm').missingModels, ['claude-fable-5', 'claude-haiku-4-5', 'claude-opus-5']);
  assert.equal(assessStrategyLaunch('divers', [
    'deepseek-v4.1-flash',
    'gemini-3.8-flash',
    'glm-5.3',
    'glm-5.3-flash',
  ], 'llm').ready, true);
  assert.equal(assessStrategyLaunch('divers', [
    'glm-5.3',
  ], 'llm').ready, false);
  assert.equal(assessStrategyLaunch('claude-gpt', [
    'gpt-6-astra',
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'claude-haiku-4-5',
  ], 'llm').ready, true);
  assert.equal(assessStrategyLaunch('claude-gpt', [
    'gpt-5.6-sol',
    'gpt-5.6-terra',
  ], 'llm').ready, false);
});

test('model payload extraction supports common response shapes', () => {
  assert.deepEqual(extractModelIds({ data: [{ id: 'a' }, { name: 'b' }] }), ['a', 'b']);
  assert.deepEqual(extractModelIds({ models: ['c'] }), ['c']);
});

test('token format validation catches obvious mistakes', () => {
  assert.equal(validateTokenFormat('').valid, false);
  assert.equal(validateTokenFormat('short').valid, false);
  assert.equal(validateTokenFormat('valid-token-with-enough-length').valid, true);
});

test('strategy model normalization covers native, mapped, fallback, labels, and ordering', () => {
  assert.deepEqual(getStrategyModels('default', 'routerlab').map((entry) => entry.role), ['haiku', 'sonnet', 'opus', 'subagent']);
  assert.deepEqual(getStrategyModels('open-source', 'routerlab'), [
    { role: 'fable', model: 'deepseek-v4.1-flash' },
    { role: 'haiku', model: 'glm-5.3-flash' },
    { role: 'sonnet', model: 'glm-5.3' },
    { role: 'opus', model: 'qwen3.8-max' },
  ]);
  const routerlabCodex = codexModelsFromClaudeCodeStrategies('routerlab');
  assert.equal(routerlabCodex.includes('gpt-5.6-sol'), true);
  assert.equal(routerlabCodex.includes('glm-5.2'), false);
  for (const model of ['deepseek-v4.1-flash', 'glm-5.3', 'glm-5.3-flash', 'qwen3.8-max']) {
    assert.equal(routerlabCodex.includes(model), true);
  }
  assert.equal(new Set(routerlabCodex).size, routerlabCodex.length);
  assert.equal(codexModelFromClaudeCodeModel('claude-sonnet-5'), null);
  assert.equal(codexModelFromClaudeCodeModel('claude-glm-5.2'), 'glm-5.2');
  assert.equal(codexModelFromClaudeCodeModel('claude-unknown-model'), 'unknown-model');
  assert.equal(codexModelFromClaudeCodeModel('  '), null);
  assert.equal(codexModelDisplayName('gpt-5.6-sol'), 'GPT 5.6 Sol');
  assert.equal(codexModelDisplayName('minimax-m3'), 'MiniMax M3');
  assert.equal(codexModelDisplayName('unknown'), 'unknown');
  assert.equal(supportsOneMillionContext('unknown'), true);
  assert.equal(supportsOneMillionContext('kimi-k3'), true);
  assert.equal(desktopRouteIdForStrategyModel('unknown', 'unknown', 'suffix'), 'claude-sonnet-4-6-suffix');
  assert.equal(desktopRouteIdForStrategyModel('haiku', 'unknown'), 'claude-haiku-4-5');
  assert.equal(desktopLabelForStrategyModel('unknown'), 'unknown');
  assert.equal(desktopLabelForDesktopMapping('Test', 'unknown'), 'Test - unknown');
  assert.deepEqual(sortDesktopRoutes([{ routeId: 'unknown' }, { routeId: 'claude-opus-4-8' }]).map((item) => item.routeId), ['claude-opus-4-8', 'unknown']);
  for (const model of ['claude-fable-5', 'claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-4-8', 'aws-claude-x', 'anthropic/claude-x', 'cursor-aws-x']) {
    assert.equal(isClaudeFamilyModel(model), true);
  }
  assert.equal(isClaudeFamilyModel('gpt-5.6-sol'), false);
});

test('Claude strategy selection covers verified choices, aliases, invalid preferences, and disabled prompts', async () => {
  const completeDefault = ['claude-fable-5.1', 'claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'];
  assert.equal(await chooseStrategy({ serviceValue: 'routerlab', preferredStrategy: 'default', modelIds: completeDefault }), 'default');
  await assert.rejects(chooseStrategy({ serviceValue: 'routerlab', preferredStrategy: 'missing', modelIds: [] }), /Unknown strategy/);
  await assert.rejects(chooseStrategy({ serviceValue: 'routerlab', preferredStrategy: 'default', modelIds: ['claude-opus-5'] }), /requires all/);
  await assert.rejects(chooseStrategy({ serviceValue: 'routerlab', noPrompt: true, modelIds: ['claude-opus-5'] }), /No launchable strategy/);
  const unknownChoices = buildStrategyPromptChoices([], 'routerlab');
  assert.equal(unknownChoices.every((choice) => choice.disabled === false), true);
  const verifiedChoices = buildStrategyPromptChoices(['claude-opus-5'], 'routerlab');
  assert.equal(verifiedChoices.some((choice) => typeof choice.disabled === 'string'), true);
  assert.equal(verifiedChoices.some((choice) => choice.name.includes('●')), true);
});

test('strategy helpers cover legacy aliases, invalid overrides, unknown strategies, and empty catalogs', () => {
  assert.equal(normalizeStrategyValue('claude-gpt-5.4'), 'claude-gpt');
  assert.equal(normalizeStrategyValue('default'), 'default');
  assert.equal(getSubagentModelOverride(), null);
  assert.equal(getSubagentModelOverride('default'), null);
  assert.throws(() => getSubagentModelOverride('unknown'), /Unknown subagent model/);
  assert.throws(
    () => getClaudeCodeStrategyEnvironment('missing', 'routerlab'),
    /Unknown strategy/,
  );
  assert.equal(getStrategyDisplayName('missing', 'routerlab'), 'missing');
  assert.deepEqual(assessStrategy('missing', [], 'routerlab'), {
    available: false,
    level: 'unavailable',
    note: 'Unknown strategy.',
    strategy: null,
  });
  assert.equal(assessStrategyLaunch('missing', [], 'routerlab').ready, false);
  assert.deepEqual(assessStrategyLaunch('missing', [], 'routerlab').requiredModels, []);

  const originalValues = SERVICES.routerlab.strategyValues;
  SERVICES.routerlab.strategyValues = [];
  try {
    assert.deepEqual(getServiceStrategies('routerlab'), []);
    assert.equal(hasExploitableModelIds(['model'], 'routerlab'), false);
  } finally {
    SERVICES.routerlab.strategyValues = originalValues;
  }
});

test('strategy helpers cover always-available routes and subagent override application', () => {
  const syntheticValue = 'test-always-available';
  STRATEGIES.push({
    value: syntheticValue,
    name: 'Test always available',
    environment: {},
    allowSubagentOverride: true,
  });
  SERVICES.routerlab.strategyValues.push(syntheticValue);
  try {
    const availability = assessStrategy(syntheticValue, ['unrelated-model'], 'routerlab');
    assert.equal(availability.available, true);
    assert.equal(availability.level, 'ready');
    assert.equal(availability.note, 'Always available.');
    const launch = assessStrategyLaunch(syntheticValue, ['unrelated-model'], 'routerlab');
    assert.equal(launch.ready, true);
    assert.deepEqual(launch.requiredModels, []);
  } finally {
    SERVICES.routerlab.strategyValues.pop();
    STRATEGIES.pop();
  }

  const unchanged = { EXISTING: 'value' };
  assert.equal(
    applySubagentModelOverride({ allowSubagentOverride: false }, unchanged, { subagentModel: 'haiku' }),
    unchanged,
  );
  assert.deepEqual(
    applySubagentModelOverride(
      { allowSubagentOverride: true },
      { EXISTING: 'value' },
      { subagentModel: 'haiku' },
    ),
    {
      EXISTING: 'value',
      CLAUDE_CODE_SUBAGENT_MODEL: 'claude-haiku-4-5',
    },
  );
  assert.deepEqual(
    applySubagentModelOverride(
      { allowSubagentOverride: true },
      { EXISTING: 'value' },
      { subagentModel: 'default' },
    ),
    { EXISTING: 'value' },
  );
});
