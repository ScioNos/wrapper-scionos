import test from 'node:test';
import assert from 'node:assert/strict';
import { createClaudeDesktopProxy } from '../src/apps/claude-desktop-proxy.js';
import { DESKTOP_MAPPING_STRATEGIES } from '../src/apps/claude-desktop.js';

test('Claude Desktop proxy exposes mapped model list', async () => {
  const { server } = createClaudeDesktopProxy({
    serviceValue: 'routerlab',
    strategyValue: 'claude-gpt',
    strategyValues: DESKTOP_MAPPING_STRATEGIES.routerlab,
    routerlabToken: 'valid-token-with-enough-length',
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/models`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.data.some((model) => model.id === 'claude-opus-4-8'), true);
    assert.equal(payload.data.some((model) => model.id === 'claude-sonnet-4-6'), true);
    assert.equal(payload.data.some((model) => model.id === 'claude-haiku-4-5' && !model.supports1m), true);
    assert.equal(payload.data.some((model) => model.id === 'claude-fable-5' && !model.supports1m), true);
    assert.equal(payload.data.some((model) => model.id === 'aws-claude-haiku-4-5' && !model.supports1m), true);
    assert.equal(payload.data.some((model) => model.id === 'claude-5.4-mini'), true);
    assert.equal(payload.data.some((model) => model.id === 'claude-kim2.6' && !model.supports1m), true);
    assert.equal(payload.data.some((model) => model.id === 'claude-lm5.1' && !model.supports1m), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
