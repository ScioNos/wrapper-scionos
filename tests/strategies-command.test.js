import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { handleStrategies } from '../src/cli/commands/strategies.js';

test('strategies command covers missing, invalid, and unavailable token/model paths', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), '.test-strategies-command-'));
  const envKeys = [
    'WRAPPER_SCIONOS_TOKEN_DIR',
    'ROUTERLAB_API_KEY',
    'WRAPPER_SCIONOS_ROUTERLAB_TOKEN',
    'ANTHROPIC_AUTH_TOKEN',
    'ROUTERLAB_BASE_URL',
    'ANTHROPIC_BASE_URL',
  ];
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.WRAPPER_SCIONOS_TOKEN_DIR = tempDir;
  for (const key of envKeys.slice(1)) delete process.env[key];
  t.after(() => {
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const originalLog = console.log;
  const output = [];
  console.log = (line) => output.push(JSON.parse(line));
  try {
    await handleStrategies({
      service: 'routerlab',
      noPrompt: false,
      json: true,
      command: 'strategies',
    });
  } finally {
    console.log = originalLog;
  }
  assert.equal(output[0].data.tokenSource, 'none');
  assert.equal(output[0].data.validation, null);
  assert.ok(output[0].data.strategies.length > 0);

  await assert.rejects(
    () => handleStrategies({
      service: 'routerlab',
      noPrompt: true,
      json: true,
      command: 'strategies',
    }),
    /token is required/i,
  );
  await assert.rejects(
    () => handleStrategies({
      service: 'routerlab',
      token: 'short',
      noPrompt: true,
      json: true,
      command: 'strategies',
    }),
    /too short/i,
  );

  const server = http.createServer((_req, res) => {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end('{"error":{"message":"temporarily unavailable"}}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  process.env.ROUTERLAB_BASE_URL = `http://127.0.0.1:${server.address().port}`;

  const fallbackOutput = [];
  console.log = (line) => fallbackOutput.push(JSON.parse(line));
  try {
    await handleStrategies({
      service: 'routerlab',
      token: 'explicit-token-with-enough-length',
      noPrompt: true,
      json: true,
      command: 'strategies',
    });
  } finally {
    console.log = originalLog;
  }
  assert.equal(fallbackOutput[0].data.tokenSource, 'option');
  assert.equal(fallbackOutput[0].data.validation.valid, false);
  assert.deepEqual(
    fallbackOutput[0].data.strategies.map((choice) => choice.availability.level),
    fallbackOutput[0].data.strategies.map(() => 'unknown'),
  );
});
