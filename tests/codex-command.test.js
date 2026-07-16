import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  appendCodexApiPath,
  codexAuthenticationError,
  codexModelUnavailableError,
  describeCodexTokenSource,
  explicitCodexToken,
  handleCodex,
  warnCodexBaseUrlOverride,
  warnCodexModelFallback,
  warnStoredCodexTokenPrecedence,
} from '../src/cli/commands/codex.js';
import { requireServiceConfig } from '../src/routerlab/services.js';

test('Codex command helpers describe token sources and diagnostics', () => {
  assert.equal(describeCodexTokenSource({ source: 'option' }), '--token');
  assert.equal(describeCodexTokenSource({ source: 'secure-storage' }), 'secure storage');
  assert.equal(describeCodexTokenSource({ source: 'prompt' }), 'the interactive prompt');
  assert.equal(
    describeCodexTokenSource({ source: 'env', envTokenKey: 'ROUTERLAB_API_KEY' }),
    'environment variable ROUTERLAB_API_KEY',
  );
  assert.equal(describeCodexTokenSource({ source: 'legacy-env', envTokenKey: null }), 'the environment');
  assert.equal(describeCodexTokenSource({ source: 'unknown' }), 'the configured token source');

  const service = requireServiceConfig('llm');
  const authError = codexAuthenticationError(
    { status: 403 },
    service,
    { source: 'prompt' },
  );
  assert.equal(authError.code, 'auth_failed');
  assert.equal(authError.statusCode, 403);
  assert.match(authError.message, /interactive prompt/);
  assert.match(authError.message, /auth status --service llm/);

  const defaultStatus = codexAuthenticationError({}, service, { source: 'unknown' });
  assert.equal(defaultStatus.statusCode, 401);
  assert.match(defaultStatus.message, /configured token source/);

  const unavailable = codexModelUnavailableError('missing-model', service, ['gpt-5.6-sol']);
  assert.equal(unavailable.code, 'model_unavailable');
  assert.match(unavailable.message, /gpt-5\.6-sol/);
  assert.match(codexModelUnavailableError('missing-model', service, []).message, /Available Codex models: none/);
});

test('Codex command warnings cover overrides, stored precedence, and fallback details', () => {
  const originalError = console.error;
  const warnings = [];
  console.error = (...values) => warnings.push(values.join(' '));
  const service = requireServiceConfig('routerlab');
  try {
    warnCodexBaseUrlOverride(service, {
      source: 'default',
      envKey: null,
      baseUrl: service.baseUrl,
    });
    warnCodexBaseUrlOverride(service, {
      source: 'env',
      envKey: 'ROUTERLAB_BASE_URL',
      baseUrl: 'https://example.test/gateway',
    });
    warnCodexBaseUrlOverride(service, {
      source: 'legacy-env',
      envKey: 'ANTHROPIC_BASE_URL',
      baseUrl: 'https://legacy.example.test',
    });

    warnStoredCodexTokenPrecedence(
      { noPrompt: false },
      {
        source: 'secure-storage',
        envTokenPresent: true,
        envTokenKey: 'ROUTERLAB_API_KEY',
      },
      service,
    );
    warnStoredCodexTokenPrecedence(
      { noPrompt: true },
      {
        source: 'secure-storage',
        envTokenPresent: true,
        envTokenKey: 'ROUTERLAB_API_KEY',
      },
      service,
    );
    warnStoredCodexTokenPrecedence(
      { noPrompt: false },
      { source: 'env', envTokenPresent: true, envTokenKey: 'ROUTERLAB_API_KEY' },
      service,
    );

    warnCodexModelFallback({ reason: 'network_error', message: 'connection refused' });
    warnCodexModelFallback({});
  } finally {
    console.error = originalError;
  }

  assert.equal(warnings.length, 5);
  assert.match(warnings[0], /ROUTERLAB_BASE_URL/);
  assert.match(warnings[1], /deprecated ANTHROPIC_BASE_URL/);
  assert.match(warnings[2], /stored RouterLab token/);
  assert.match(warnings[3], /network_error: connection refused/);
  assert.match(warnings[4], /unknown/);
});

test('Codex token and API path helpers validate and normalize inputs', () => {
  assert.deepEqual(
    explicitCodexToken('  explicit-token-with-enough-length  ', {
      token: 'environment-token',
      envKey: 'ROUTERLAB_API_KEY',
    }),
    {
      token: 'explicit-token-with-enough-length',
      source: 'option',
      envTokenPresent: true,
      envTokenKey: 'ROUTERLAB_API_KEY',
      storedTokenPresent: false,
    },
  );
  assert.throws(() => explicitCodexToken('short', { token: null, envKey: null }), /too short/);

  assert.equal(appendCodexApiPath('https://api.example.test'), 'https://api.example.test/v1');
  assert.equal(appendCodexApiPath('https://api.example.test/'), 'https://api.example.test/v1');
  assert.equal(appendCodexApiPath('https://api.example.test/gateway/'), 'https://api.example.test/gateway/v1');
  assert.equal(appendCodexApiPath('https://api.example.test/gateway/v1/'), 'https://api.example.test/gateway/v1');
});

test('Codex restore handler prints dry-run and applied results', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), '.test-codex-command-restore-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const previousCodexHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = tempDir;
  t.after(() => {
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
  });

  const configPath = path.join(tempDir, 'config.toml');
  const backupPath = configPath + '.wrapper-scionos-backup';
  fs.writeFileSync(configPath, 'wrapper config', 'utf8');
  fs.writeFileSync(backupPath, 'original config', 'utf8');

  const originalLog = console.log;
  const output = [];
  console.log = (line) => output.push(JSON.parse(line));
  try {
    await handleCodex('restore', {
      yes: false,
      json: true,
      command: 'codex:restore',
    });
    assert.equal(fs.readFileSync(configPath, 'utf8'), 'wrapper config');

    await handleCodex('restore', {
      yes: true,
      json: true,
      command: 'codex:restore',
    });
  } finally {
    console.log = originalLog;
  }

  assert.equal(output.length, 2);
  assert.equal(output[0].data.dryRun, true);
  assert.equal(output[1].data.restoredFromBackup, true);
  assert.equal(fs.readFileSync(configPath, 'utf8'), 'original config\n');
  assert.equal(fs.existsSync(backupPath), false);
});
