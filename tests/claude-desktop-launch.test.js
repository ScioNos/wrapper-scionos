import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveValidatedDesktopService } from '../src/cli/commands/claude-desktop.js';

test('Claude Desktop proxy resolution ignores user URL overrides', () => {
  const previousRouterlabBaseUrl = process.env.ROUTERLAB_LLM_BASE_URL;
  const previousAnthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
  process.env.ROUTERLAB_LLM_BASE_URL = 'http://127.0.0.1:1';
  process.env.ANTHROPIC_BASE_URL = 'https://untrusted.example';
  try {
    assert.equal(resolveValidatedDesktopService('llm').baseUrl, 'https://llm-api.routerlab.ch');
  } finally {
    if (previousRouterlabBaseUrl === undefined) delete process.env.ROUTERLAB_LLM_BASE_URL;
    else process.env.ROUTERLAB_LLM_BASE_URL = previousRouterlabBaseUrl;
    if (previousAnthropicBaseUrl === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = previousAnthropicBaseUrl;
  }
});
