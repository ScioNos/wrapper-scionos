import test from 'node:test';
import assert from 'node:assert/strict';
import { selectTokenCandidate } from '../src/apps/claude-code.js';

test('token resolution keeps environment precedence by default', () => {
  assert.deepEqual(selectTokenCandidate({
    envToken: 'env-token-with-enough-length',
    storedToken: 'stored-token-with-enough-length',
  }), {
    token: 'env-token-with-enough-length',
    source: 'env',
  });
});

test('token resolution can prefer stored tokens for Codex launches', () => {
  assert.deepEqual(selectTokenCandidate({
    envToken: 'env-token-with-enough-length',
    storedToken: 'stored-token-with-enough-length',
    preferStored: true,
  }), {
    token: 'stored-token-with-enough-length',
    source: 'secure-storage',
  });
});

test('token resolution falls back to environment when no stored token exists', () => {
  assert.deepEqual(selectTokenCandidate({
    envToken: 'env-token-with-enough-length',
    storedToken: null,
    preferStored: true,
  }), {
    token: 'env-token-with-enough-length',
    source: 'env',
  });
});
