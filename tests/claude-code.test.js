import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClaudeCodeEnvironment, buildGuidedStrategyPromptChoices, formatClaudeCodeChoiceMenu, formatClaudeCodeIntro } from '../src/apps/claude-code.js';
import { parseOptions } from '../src/cli/args.js';
import { requireServiceConfig } from '../src/routerlab/services.js';

test('Claude Code launch environment disables experimental betas only for the child process', () => {
  const original = process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS;
  delete process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS;
  try {
    const env = buildClaudeCodeEnvironment('valid-token-with-enough-length', requireServiceConfig('llm'), 'glm-5.2');
    assert.equal(env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS, '1');
    assert.equal(env.CLAUDE_CODE_SUBAGENT_MODEL, 'claude-sonnet-4-6');
    assert.equal(process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS, undefined);
  } finally {
    if (original === undefined) {
      delete process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS;
    } else {
      process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS = original;
    }
  }
});

test('Claude Code launch screens use wrapper-branded guided layout', () => {
  const intro = formatClaudeCodeIntro('1.0.0');
  assert.match(intro, /ScioNos Wrapper/);
  assert.match(intro, /Quick commands/);
  assert.doesNotMatch(intro, /ScioNos\s+✕\s+Claude Code/);

  const menu = formatClaudeCodeChoiceMenu('Select Model Strategy:', [
    {
      name: 'Claude — Maintenance',
      value: 'claude',
      description: 'Maintenance — this strategy cannot be selected in Claude Code.',
    },
    {
      name: 'OpenAI GPT',
      value: 'claude-gpt',
      description: 'Opus => GPT 5.6 Sol Pro, Sonnet => GPT 5.6 Sol, Haiku => GPT 5.6 Terra Pro, subagents => Claude Sonnet 4.6.',
    },
  ]);
  assert.match(menu, /Select Model Strategy:/);
  assert.match(menu, /1\. Claude — Maintenance/);
  assert.match(menu, /Maintenance — this strategy cannot be selected in Claude Code\./);
  assert.match(menu, /2\. OpenAI GPT/);
});

test('Claude Code exposes Back only when launched from the interactive menu', () => {
  const directChoices = buildGuidedStrategyPromptChoices([], 'llm', false);
  const guidedChoices = buildGuidedStrategyPromptChoices([], 'llm', true);
  assert.equal(directChoices.some((choice) => choice.value === 'back'), false);
  assert.equal(guidedChoices.at(-1).value, 'back');
  assert.equal(guidedChoices.at(-1).name, '← Back to home');
});
test('Claude Code subagent overrides are removed from the CLI', () => {
  assert.throws(() => parseOptions([
    '--subagent-model',
    'haiku',
  ]), /has been removed/);
});
