import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClaudeCodeEnvironment, formatClaudeCodeChoiceMenu, formatClaudeCodeIntro } from '../src/apps/claude-code.js';
import { requireServiceConfig } from '../src/routerlab/services.js';

test('Claude Code launch environment disables experimental betas only for the child process', () => {
  const original = process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS;
  delete process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS;
  try {
    const env = buildClaudeCodeEnvironment('valid-token-with-enough-length', requireServiceConfig('llm'), 'claude');
    assert.equal(env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS, '1');
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
      name: 'Claude Native',
      value: 'default',
      description: 'Standard behavior. Claude decides which model to use.',
    },
    {
      name: 'OpenAI GPT',
      value: 'claude-gpt',
      description: 'Opus => GPT 5.5, Sonnet => GPT 5.4, Haiku/subagents => GPT 5.4 mini.',
    },
  ]);
  assert.match(menu, /Select Model Strategy:/);
  assert.match(menu, /1\. Claude Native/);
  assert.match(menu, /Standard behavior\. Claude decides which model to use\./);
  assert.match(menu, /2\. OpenAI GPT/);
});
