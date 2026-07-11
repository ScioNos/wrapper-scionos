import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStrategyPromptChoices, chooseStrategy, chooseSubagentModel } from '../src/apps/claude-code.js';
import { requireServiceConfig, resolveServiceBaseUrlWithSource, resolveServiceEnvToken } from '../src/routerlab/services.js';
import { allowsSubagentModelOverride, assessStrategyLaunch, getClaudeCodeStrategyEnvironment, getStrategyDisplayName, getStrategyEnvironment, getStrategyChoices } from '../src/routerlab/strategies.js';
import { extractModelIds, validateTokenFormat } from '../src/routerlab/models.js';
import { codexModelDisplayName, codexModelFromClaudeCodeModel, codexModelsFromClaudeCodeStrategies, desktopLabelForDesktopMapping, desktopLabelForStrategyModel, desktopRouteIdForStrategyModel, getStrategyModels, isClaudeFamilyModel, sortDesktopRoutes, supportsOneMillionContext } from '../src/routerlab/strategy-models.js';

test('RouterLab services expose the expected endpoints', () => {
  assert.equal(requireServiceConfig('routerlab').baseUrl, 'https://api.routerlab.ch');
  assert.equal(requireServiceConfig('llm').baseUrl, 'https://llm-api.routerlab.ch');
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

test('service base URL overrides prefer RouterLab names with Anthropic legacy fallback', () => {
  assert.deepEqual(resolveServiceBaseUrlWithSource('routerlab', {
    ROUTERLAB_BASE_URL: 'https://custom-routerlab.example',
    ANTHROPIC_BASE_URL: 'https://legacy.example',
  }), {
    baseUrl: 'https://custom-routerlab.example',
    source: 'env',
    envKey: 'ROUTERLAB_BASE_URL',
  });
  assert.deepEqual(resolveServiceBaseUrlWithSource('llm', {
    ROUTERLAB_LLM_BASE_URL: 'https://custom-llm.example',
    ROUTERLAB_BASE_URL: 'https://custom-routerlab.example',
    ANTHROPIC_BASE_URL: 'https://legacy.example',
  }), {
    baseUrl: 'https://custom-llm.example',
    source: 'env',
    envKey: 'ROUTERLAB_LLM_BASE_URL',
  });
  assert.deepEqual(resolveServiceBaseUrlWithSource('llm', {
    ANTHROPIC_BASE_URL: 'https://legacy.example',
  }), {
    baseUrl: 'https://legacy.example',
    source: 'legacy-env',
    envKey: 'ANTHROPIC_BASE_URL',
  });
});

test('Claude Code strategy mapping is service-aware', () => {
  assert.deepEqual(getStrategyEnvironment('default', 'routerlab'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-8',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-5',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-fable-5',
  });
  assert.deepEqual(getClaudeCodeStrategyEnvironment('default', 'routerlab'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-8',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-5',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-fable-5',
    CLAUDE_CODE_SUBAGENT_MODEL: 'aws-claude-haiku-4-5-20251001',
  });
  assert.deepEqual(getStrategyEnvironment('claude-gpt', 'routerlab'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.6-sol',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.6-terra',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5.6-luna',
  });
  assert.deepEqual(getStrategyEnvironment('deepseek-v4', 'routerlab'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'deepseek-v4-pro',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'deepseek-v4-pro',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek-v4-pro',
  });
  assert.deepEqual(getStrategyEnvironment('kimi-k2.7', 'routerlab'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'kimi-k2.7',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'kimi-k2.7',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'kimi-k2.7',
  });
  assert.deepEqual(getStrategyEnvironment('glm-5.2', 'routerlab'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-5.2',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-5.2',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-5.2',
  });
  assert.deepEqual(getStrategyEnvironment('claude', 'llm', { subagentModel: 'haiku' }), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-8',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
  });

  assert.deepEqual(getClaudeCodeStrategyEnvironment('claude', 'llm'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-8',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-sonnet-4-6',
  });
  assert.deepEqual(getClaudeCodeStrategyEnvironment('claude', 'llm', { subagentModel: 'haiku' }), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-8',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-sonnet-4-6',
  });
  assert.deepEqual(getStrategyEnvironment('claude-gpt', 'llm'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.6-sol-pro',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.6-sol',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5.6-terra-pro',
  });
  assert.deepEqual(getStrategyEnvironment('claude-MiniMax-M3', 'llm'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'MiniMax-M3',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'MiniMax-M3',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'MiniMax-M3',
  });
  assert.deepEqual(getStrategyEnvironment('claude-qwen3.7-max', 'llm'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'qwen3.7-max',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'qwen3.7-max',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'qwen3.7-max',
  });
  assert.deepEqual(getClaudeCodeStrategyEnvironment('claude-MiniMax-M3', 'llm', { subagentModel: 'haiku' }), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'MiniMax-M3',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'MiniMax-M3',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'MiniMax-M3',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-sonnet-4-6',
  });
  assert.deepEqual(getClaudeCodeStrategyEnvironment('claude-qwen3.7-max', 'llm', { subagentModel: 'haiku' }), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'qwen3.7-max',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'qwen3.7-max',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'qwen3.7-max',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-sonnet-4-6',
  });
  assert.deepEqual(getStrategyEnvironment('glm-5.2', 'llm'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-5.2',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-5.2',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-5.2',
  });
  assert.deepEqual(getStrategyEnvironment('deepseek-v4', 'llm'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'deepseek-v4-pro',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'deepseek-v4-pro',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek-v4-flash',
  });
  assert.equal(allowsSubagentModelOverride('claude-MiniMax-M3', 'llm'), false);
  assert.equal(allowsSubagentModelOverride('claude-qwen3.7-max', 'llm'), false);
  assert.equal(allowsSubagentModelOverride('default', 'routerlab'), false);
  assert.equal(allowsSubagentModelOverride('claude-gpt', 'routerlab'), false);
  assert.throws(() => getStrategyEnvironment('claude-gpt-special', 'llm'), /Unknown strategy/);
  assert.throws(() => getStrategyEnvironment('minimax-m2.7', 'llm'), /Unknown strategy/);
});

test('Claude Code strategies force service-defined subagents and disable selection', async () => {
  assert.equal(await chooseSubagentModel({
    serviceValue: 'routerlab',
    strategyValue: 'default',
    preferredSubagentModel: 'haiku',
  }), 'aws-claude-haiku-4-5-20251001');
  assert.equal(await chooseSubagentModel({
    serviceValue: 'routerlab',
    strategyValue: 'claude-gpt',
    preferredSubagentModel: 'haiku',
  }), 'aws-claude-haiku-4-5-20251001');
  assert.equal(await chooseSubagentModel({
    serviceValue: 'llm',
    strategyValue: 'claude-MiniMax-M3',
    preferredSubagentModel: 'haiku',
  }), 'claude-sonnet-4-6');
  assert.equal(await chooseSubagentModel({
    serviceValue: 'llm',
    strategyValue: 'claude-qwen3.7-max',
    preferredSubagentModel: 'haiku',
  }), 'claude-sonnet-4-6');
  assert.throws(() => allowsSubagentModelOverride('claude-gpt-special', 'llm'), /Unknown strategy/);
});

test('LLM Claude strategy is in maintenance and cannot be selected', async () => {
  const claudeChoice = getStrategyChoices([], 'llm').find((choice) => choice.value === 'claude');
  assert.equal(claudeChoice.name, 'Claude — Maintenance');
  assert.equal(claudeChoice.availability.level, 'unavailable');
  assert.match(claudeChoice.description, /Maintenance/);
  await assert.rejects(chooseStrategy({
    serviceValue: 'llm',
    preferredStrategy: 'claude',
    noPrompt: true,
    modelIds: [],
  }), /Maintenance/);
  assert.equal(await chooseStrategy({
    serviceValue: 'llm',
    noPrompt: true,
    modelIds: [],
  }), 'claude-gpt');
  assert.equal(await chooseStrategy({
    serviceValue: 'llm',
    noPrompt: true,
    modelIds: ['glm-5.2', 'claude-sonnet-4-6'],
  }), 'glm-5.2');
  await assert.rejects(chooseStrategy({
    serviceValue: 'llm',
    noPrompt: true,
    modelIds: ['glm-5.2', 'sonnet-4-6'],
  }), /No launchable strategy/);
});

test('service strategy lists stay scoped', () => {
  assert.deepEqual(getStrategyChoices([], 'routerlab').map((choice) => choice.value), [
    'default',
    'aws',
    'claude-gpt',
    'deepseek-v4',
    'claude-kimi-k2.7-code',
    'glm-5.2',
  ]);
  assert.deepEqual(getStrategyChoices([], 'llm').map((choice) => choice.value), [
    'claude',
    'claude-gpt',
    'glm-5.2',
    'claude-qwen3.7-max',
    'claude-MiniMax-M3',
    'deepseek-v4',
  ]);
});

test('Claude Code strategy choices match guided launcher labels and readiness', () => {
  const choices = getStrategyChoices([], 'routerlab');
  assert.equal(choices.find((choice) => choice.value === 'aws').name, '💸 Claude via AWS (-50%)');
  assert.equal(choices.some((choice) => choice.value === 'deepseek-v4-beta'), false);
  assert.equal(choices.find((choice) => choice.value === 'deepseek-v4').name, 'deepseek-v4');
  assert.deepEqual(getStrategyEnvironment('deepseek-v4-beta', 'routerlab'), getStrategyEnvironment('deepseek-v4', 'routerlab'));
  assert.equal(choices.find((choice) => choice.value === 'claude-kimi-k2.7-code').name, 'kimi-k2.7');
  assert.deepEqual(getStrategyEnvironment('kimi-k2.7', 'routerlab'), getStrategyEnvironment('claude-kimi-k2.7-code', 'routerlab'));
  assert.deepEqual(getStrategyEnvironment('kimi-k2.7-code', 'routerlab'), getStrategyEnvironment('claude-kimi-k2.7-code', 'routerlab'));
  assert.throws(() => getStrategyEnvironment('claude-kimi-k2.6', 'routerlab'), /Unknown strategy/);
  assert.throws(() => getStrategyEnvironment('claude-fable-5', 'routerlab'), /Unknown strategy/);
  assert.equal(choices.find((choice) => choice.value === 'default').description, 'Haiku => Claude Fable 5, Sonnet => Claude Sonnet 5, Opus => Claude Opus 4.8.');
  assert.equal(choices.some((choice) => choice.value === 'claude-fable-5'), false);
  assert.equal(choices.find((choice) => choice.value === 'claude-gpt').name, 'OpenAI GPT');
  assert.equal(choices.find((choice) => choice.value === 'claude-gpt').description, 'Opus => GPT 5.6 Sol, Sonnet => GPT 5.6 Terra, Haiku => GPT 5.6 Luna.');
  assert.equal(getStrategyChoices([], 'llm').find((choice) => choice.value === 'claude-MiniMax-M3').name, 'MiniMax-M3');
  assert.equal(getStrategyChoices([], 'llm').find((choice) => choice.value === 'claude-qwen3.7-max').name, 'qwen3.7-max');
  assert.equal(getStrategyChoices([], 'llm').find((choice) => choice.value === 'glm-5.2').description, 'Uses glm-5.2 for all main model aliases and Claude Sonnet 4.6 for subagents.');
  assert.equal(getStrategyDisplayName('claude-qwen3.7-max', 'llm'), 'qwen3.7-max');
  assert.equal(getStrategyChoices([], 'llm').find((choice) => choice.value === 'claude-qwen3.7-max').description, 'Uses qwen3.7-max for all main model aliases and Claude Sonnet 4.6 for subagents.');

  assert.equal(assessStrategyLaunch('aws', [
    'aws-claude-haiku-4-5-20251001',
    'aws-claude-sonnet-4-6',
    'aws-claude-opus-4-8',
  ], 'routerlab').ready, true);
  assert.equal(assessStrategyLaunch('aws', [
    'aws-claude-sonnet-4-6',
  ], 'routerlab').ready, false);
  assert.equal(assessStrategyLaunch('default', [
    'claude-fable-5',
    'claude-sonnet-5',
    'claude-opus-4-8',
    'aws-claude-haiku-4-5-20251001',
  ], 'routerlab').ready, true);
  assert.equal(assessStrategyLaunch('claude', [
    'claude-sonnet-4-6',
  ], 'llm').ready, false);
  assert.deepEqual(assessStrategyLaunch('claude', [
    'claude-sonnet-4-6',
  ], 'llm').missingModels, []);
  assert.equal(assessStrategyLaunch('claude-gpt', [
    'gpt-5.6-sol-pro',
    'gpt-5.6-sol',
    'gpt-5.6-terra-pro',
    'claude-sonnet-4-6',
  ], 'llm').ready, true);
  assert.equal(assessStrategyLaunch('claude-gpt', [
    'gpt-5.6-sol-pro',
    'gpt-5.6-sol',
    'gpt-5.6-terra-pro',
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
  assert.deepEqual(getStrategyModels('default', 'routerlab').map((entry) => entry.role), ['haiku', 'sonnet', 'opus']);
  assert.deepEqual(getStrategyModels('glm-5.2', 'routerlab'), [{ role: 'haiku', model: 'glm-5.2' }]);
  const routerlabCodex = codexModelsFromClaudeCodeStrategies('routerlab');
  assert.equal(routerlabCodex.includes('gpt-5.6-sol'), true);
  assert.equal(routerlabCodex.includes('glm-5.2'), true);
  assert.equal(new Set(routerlabCodex).size, routerlabCodex.length);
  assert.equal(codexModelFromClaudeCodeModel('claude-sonnet-5'), null);
  assert.equal(codexModelFromClaudeCodeModel('claude-glm-5.2'), 'glm-5.2');
  assert.equal(codexModelFromClaudeCodeModel('claude-unknown-model'), 'unknown-model');
  assert.equal(codexModelFromClaudeCodeModel('  '), null);
  assert.equal(codexModelDisplayName('gpt-5.6-sol'), 'GPT 5.6 Sol');
  assert.equal(codexModelDisplayName('unknown'), 'unknown');
  assert.equal(supportsOneMillionContext('unknown'), true);
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
  const completeDefault = ['claude-opus-4-8', 'claude-sonnet-5', 'claude-fable-5', 'aws-claude-haiku-4-5-20251001'];
  assert.equal(await chooseStrategy({ serviceValue: 'routerlab', preferredStrategy: 'default', modelIds: completeDefault }), 'default');
  await assert.rejects(chooseStrategy({ serviceValue: 'routerlab', preferredStrategy: 'missing', modelIds: [] }), /Unknown strategy/);
  await assert.rejects(chooseStrategy({ serviceValue: 'routerlab', preferredStrategy: 'default', modelIds: ['claude-opus-4-8'] }), /requires all/);
  await assert.rejects(chooseStrategy({ serviceValue: 'routerlab', noPrompt: true, modelIds: ['claude-opus-4-8'] }), /No launchable strategy/);
  const unknownChoices = buildStrategyPromptChoices([], 'routerlab');
  assert.equal(unknownChoices.every((choice) => choice.disabled === false), true);
  const verifiedChoices = buildStrategyPromptChoices(['claude-opus-4-8'], 'routerlab');
  assert.equal(verifiedChoices.some((choice) => typeof choice.disabled === 'string'), true);
  assert.equal(verifiedChoices.some((choice) => choice.name.includes('●')), true);
});
