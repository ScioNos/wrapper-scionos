import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSubagentModel } from '../src/apps/claude-code.js';
import { requireServiceConfig } from '../src/routerlab/services.js';
import { allowsSubagentModelOverride, assessStrategyLaunch, getClaudeCodeStrategyEnvironment, getStrategyDisplayName, getStrategyEnvironment, getStrategyChoices } from '../src/routerlab/strategies.js';
import { extractModelIds, validateTokenFormat } from '../src/routerlab/models.js';

test('RouterLab services expose the expected endpoints', () => {
  assert.equal(requireServiceConfig('routerlab').baseUrl, 'https://api.routerlab.ch');
  assert.equal(requireServiceConfig('llm').baseUrl, 'https://llm-api.routerlab.ch');
});

test('Claude Code strategy mapping is service-aware', () => {
  assert.deepEqual(getStrategyEnvironment('claude-gpt', 'routerlab'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-gpt-5.5',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-gpt-5.4',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-gpt-5.4-mini',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-gpt-5.4-mini',
  });
  assert.deepEqual(getStrategyEnvironment('claude', 'llm', { subagentModel: 'haiku' }), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-8',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-haiku-4-5-20251001',
  });

  assert.deepEqual(getClaudeCodeStrategyEnvironment('claude', 'llm'), {});
  assert.deepEqual(getClaudeCodeStrategyEnvironment('claude', 'llm', { subagentModel: 'haiku' }), {
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-haiku-4-5-20251001',
  });
  assert.deepEqual(getStrategyEnvironment('claude-MiniMax-M3', 'llm'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-MiniMax-M3',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-MiniMax-M3',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-MiniMax-M3',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-MiniMax-M3',
  });
  assert.deepEqual(getStrategyEnvironment('claude-qwen3.7-max', 'llm'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-qwen3.7-max',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-qwen3.7-max',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-qwen3.7-max',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-qwen3.6-flash',
  });
  assert.deepEqual(getClaudeCodeStrategyEnvironment('claude-MiniMax-M3', 'llm', { subagentModel: 'haiku' }), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-MiniMax-M3',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-MiniMax-M3',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-MiniMax-M3',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-MiniMax-M3',
  });
  assert.deepEqual(getClaudeCodeStrategyEnvironment('claude-qwen3.7-max', 'llm', { subagentModel: 'haiku' }), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-qwen3.7-max',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-qwen3.7-max',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-qwen3.7-max',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-qwen3.6-flash',
  });
  assert.deepEqual(getClaudeCodeStrategyEnvironment('claude-gpt-special', 'llm', { subagentModel: 'haiku' }), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-gpt-5.5-sp',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-gpt-5.5-sp',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-gpt-5.4-mini-sp',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-gpt-5.4-mini-sp',
  });
  assert.equal(allowsSubagentModelOverride('claude-gpt-special', 'llm'), false);
  assert.equal(allowsSubagentModelOverride('claude-MiniMax-M3', 'llm'), false);
  assert.equal(allowsSubagentModelOverride('claude-qwen3.7-max', 'llm'), false);
  assert.throws(() => getStrategyEnvironment('minimax-m2.7', 'llm'), /Unknown strategy/);
});

test('fixed-subagent strategies do not prompt for subagent overrides', async () => {
  assert.equal(await chooseSubagentModel({
    serviceValue: 'llm',
    strategyValue: 'claude-MiniMax-M3',
    preferredSubagentModel: 'haiku',
  }), 'strategy default');
  assert.equal(await chooseSubagentModel({
    serviceValue: 'llm',
    strategyValue: 'claude-qwen3.7-max',
    preferredSubagentModel: 'haiku',
  }), 'strategy default');
  assert.equal(await chooseSubagentModel({
    serviceValue: 'llm',
    strategyValue: 'claude-gpt-special',
    preferredSubagentModel: 'haiku',
  }), 'strategy default');
});

test('service strategy lists stay scoped', () => {
  assert.deepEqual(getStrategyChoices([], 'routerlab').map((choice) => choice.value), [
    'default',
    'aws',
    'claude-gpt',
    'deepseek-v4-beta',
    'claude-kimi-k2.6',
    'glm-5.1',
  ]);
  assert.deepEqual(getStrategyChoices([], 'llm').map((choice) => choice.value), [
    'claude',
    'claude-gpt',
    'claude-gpt-special',
    'deepseek-v4-beta',
    'claude-MiniMax-M3',
    'claude-qwen3.7-max',
    'glm-5.1',
  ]);
});

test('Claude Code strategy choices match guided launcher labels and readiness', () => {
  const choices = getStrategyChoices([], 'routerlab');
  assert.equal(choices.find((choice) => choice.value === 'aws').name, '💸 Claude via AWS (-50%)');
  assert.equal(choices.some((choice) => choice.value === 'deepseek-v4'), false);
  assert.equal(choices.find((choice) => choice.value === 'deepseek-v4-beta').name, 'deepseek-v4 beta');
  assert.throws(() => getStrategyEnvironment('deepseek-v4', 'routerlab'), /Unknown strategy/);
  assert.throws(() => getStrategyEnvironment('claude-fable-5', 'routerlab'), /Unknown strategy/);
  assert.equal(choices.find((choice) => choice.value === 'default').description, 'Standard behavior. Claude decides which model to use.');
  assert.equal(choices.some((choice) => choice.value === 'claude-fable-5'), false);
  assert.equal(choices.find((choice) => choice.value === 'claude-gpt').name, 'OpenAI GPT');
  assert.equal(choices.find((choice) => choice.value === 'claude-gpt').description, 'Opus => GPT 5.5, Sonnet => GPT 5.4, Haiku/subagents => GPT 5.4 mini.');
  assert.equal(getStrategyChoices([], 'llm').find((choice) => choice.value === 'claude-MiniMax-M3').name, 'MiniMax-M3 beta');
  assert.equal(getStrategyChoices([], 'llm').find((choice) => choice.value === 'claude-qwen3.7-max').name, 'qwen3.7-max');
  assert.equal(getStrategyDisplayName('claude-qwen3.7-max', 'llm'), 'qwen3.7-max');
  assert.equal(getStrategyChoices([], 'llm').find((choice) => choice.value === 'claude-qwen3.7-max').description, 'Uses claude-qwen3.7-max for main model aliases and claude-qwen3.6-flash for subagents.');

  assert.equal(assessStrategyLaunch('aws', [
    'aws-claude-haiku-4-5-20251001',
    'aws-claude-sonnet-4-6',
    'aws-claude-opus-4-8',
  ], 'routerlab').ready, true);
  assert.equal(assessStrategyLaunch('aws', [
    'aws-claude-sonnet-4-6',
  ], 'routerlab').ready, false);
  assert.equal(assessStrategyLaunch('claude', [
    'claude-sonnet-4-6',
  ], 'llm').ready, true);
  assert.deepEqual(assessStrategyLaunch('claude', [
    'claude-sonnet-4-6',
  ], 'llm').missingModels, []);
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
