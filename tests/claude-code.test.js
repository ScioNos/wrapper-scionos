import test from 'node:test';
import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import {
  buildClaudeCodeEnvironment,
  buildGuidedStrategyPromptChoices,
  chooseStrategy,
  claudeCodeAuthenticationError,
  describeClaudeCodeTokenSource,
  formatClaudeCodeChoiceMenu,
  formatClaudeCodeIntro,
  formatClaudeCodeTokenConflictWarning,
  formatLaunchSummary,
  getStrategyIndicator,
  launchClaudeCode,
  resolveToken,
  resolveTokenWithSource,
  warnClaudeCodeTokenConflict,
  withSeparators,
} from '../src/apps/claude-code.js';
import { parseOptions } from '../src/cli/args.js';
import { requireServiceConfig } from '../src/routerlab/services.js';

test('Claude Code launch environment is sanitized without changing native tool variables', () => {
  const service = {
    ...requireServiceConfig('llm'),
    baseUrl: 'http://127.0.0.1:43123',
  };
  const sourceEnv = {
    PATH: 'native-path',
    HTTPS_PROXY: 'http://corporate-proxy.example',
    NO_PROXY: 'Existing.Example',
    no_proxy: 'second.example',
    ROUTERLAB_API_KEY: 'raw-routerlab-secret',
    routerlab_llm_api_key: 'raw-llm-secret',
    WRAPPER_SCIONOS_LLM_TOKEN: 'raw-wrapper-secret',
    ANTHROPIC_AUTH_TOKEN: 'raw-anthropic-secret',
    ANTHROPIC_API_KEY: 'raw-api-secret',
    ANTHROPIC_BASE_URL: 'https://untrusted.example',
    ANTHROPIC_MODEL: 'unapproved-model',
    ANTHROPIC_CUSTOM_HEADERS: 'x-secret: raw-header-secret',
    ANTHROPIC_CUSTOM_MODEL_OPTION: 'unapproved-custom-model',
    ANTHROPIC_DEFAULT_OPUS_MODEL_NAME: 'hostile-label',
    ANTHROPIC_BEDROCK_BASE_URL: 'https://bedrock.example',
    CLAUDE_CODE_USE_BEDROCK: '1',
    CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '0',
    CLAUDE_CODE_SUBAGENT_MODEL: 'unapproved-subagent',
    MCP_NATIVE_SETTING: 'preserved',
  };
  const env = buildClaudeCodeEnvironment(
    'generated-local-token-with-enough-length',
    service,
    'glm-5.2',
    { env: sourceEnv },
  );

  assert.equal(env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS, '1');
  assert.equal(env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST, '1');
  assert.equal(env.CLAUDE_CODE_SUBAGENT_MODEL, 'claude-sonnet-5');
  assert.equal(env.ANTHROPIC_BASE_URL, service.baseUrl);
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'generated-local-token-with-enough-length');
  assert.equal(env.ANTHROPIC_API_KEY, '');
  assert.equal(env.PATH, 'native-path');
  assert.equal(env.HTTPS_PROXY, 'http://corporate-proxy.example');
  assert.equal(env.MCP_NATIVE_SETTING, 'preserved');
  assert.equal(env.CLAUDE_CODE_USE_BEDROCK, undefined);
  assert.equal(env.ANTHROPIC_MODEL, undefined);
  assert.equal(env.ANTHROPIC_CUSTOM_HEADERS, undefined);
  assert.equal(env.ANTHROPIC_CUSTOM_MODEL_OPTION, undefined);
  assert.equal(env.ANTHROPIC_DEFAULT_OPUS_MODEL_NAME, undefined);
  assert.equal(env.ANTHROPIC_BEDROCK_BASE_URL, undefined);
  assert.equal(env.ROUTERLAB_API_KEY, undefined);
  assert.equal(env.routerlab_llm_api_key, undefined);
  assert.equal(env.WRAPPER_SCIONOS_LLM_TOKEN, undefined);
  assert.equal(env.NO_PROXY, 'existing.example,second.example,127.0.0.1,localhost,::1');
  assert.equal(env.no_proxy, env.NO_PROXY);
});

test('Claude Code launch screens use wrapper-branded guided layout', () => {
  const intro = formatClaudeCodeIntro('1.0.0');
  const plainIntro = stripVTControlCharacters(intro);
  assert.match(plainIntro, /ScioNos Wrapper/);
  assert.match(plainIntro, /Quick commands/);
  assert.doesNotMatch(plainIntro, /ScioNos\s+✕\s+Claude Code/);

  const menu = formatClaudeCodeChoiceMenu('Select Model Strategy:', [
    {
      name: 'Claude',
      value: 'claude',
      description: 'Opus => Claude Opus 4.8, Sonnet => Claude Sonnet 5, Haiku => Claude Haiku 4.5, subagents => Claude Sonnet 5.',
    },
    {
      name: 'OpenAI GPT',
      value: 'claude-gpt',
      description: 'Opus => GPT 5.6 Sol Pro, Sonnet => GPT 5.6 Sol, Haiku => GPT 5.6 Terra Pro, subagents => Claude Sonnet 5.',
    },
  ]);
  assert.match(menu, /Select Model Strategy:/);
  assert.match(menu, /1\. Claude/);
  assert.match(menu, /Opus => Claude Opus 4\.8, Sonnet => Claude Sonnet 5/);
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

test('Claude Code reports environment precedence without exposing either token', () => {
  const warning = formatClaudeCodeTokenConflictWarning(requireServiceConfig('llm'), {
    token: 'environment-token-with-enough-length',
    source: 'env',
    envTokenPresent: true,
    envTokenKey: 'ROUTERLAB_LLM_API_KEY',
    storedTokenPresent: true,
  });
  assert.match(warning, /ROUTERLAB_LLM_API_KEY/);
  assert.match(warning, /stored RouterLab LLM token is present and ignored/);
  assert.match(warning, /Update or unset ROUTERLAB_LLM_API_KEY/);
  assert.doesNotMatch(warning, /--token/);
  assert.doesNotMatch(warning, /environment-token-with-enough-length/);
  assert.equal(formatClaudeCodeTokenConflictWarning(requireServiceConfig('llm'), {
    source: 'secure-storage',
    envTokenPresent: true,
    storedTokenPresent: true,
  }), undefined);
});

test('Claude Code token resolution covers invalid resolved values and interactive prompts', async () => {
  const noTokens = {
    getStoredTokenFn: () => null,
    resolveServiceEnvTokenFn: () => ({ token: null, source: null, envKey: null }),
  };
  const prompted = await resolveTokenWithSource({
    serviceValue: 'routerlab',
  }, {
    ...noTokens,
    passwordFn: async ({ message }) => {
      assert.equal(message, 'RouterLab token:');
      return '  prompted-token-with-enough-length  ';
    },
  });
  assert.deepEqual(prompted, {
    token: 'prompted-token-with-enough-length',
    source: 'prompt',
    envTokenPresent: false,
    envTokenKey: null,
    storedTokenPresent: false,
  });

  assert.equal(await resolveToken({ serviceValue: 'llm' }, {
    ...noTokens,
    passwordFn: async () => 'resolved-token-with-enough-length',
  }), 'resolved-token-with-enough-length');

  await assert.rejects(
    () => resolveTokenWithSource({ serviceValue: 'routerlab' }, {
      ...noTokens,
      passwordFn: async () => 'short',
    }),
    /too short/,
  );
  await assert.rejects(
    () => resolveTokenWithSource({ serviceValue: 'routerlab', noPrompt: true }, {
      getStoredTokenFn: () => null,
      resolveServiceEnvTokenFn: () => ({
        token: 'short',
        source: 'env',
        envKey: 'ROUTERLAB_API_KEY',
      }),
    }),
    /Resolved token is invalid/,
  );
});

test('Claude Code diagnostics cover endpoint warnings and every token source', () => {
  const service = requireServiceConfig('llm');
  assert.equal(describeClaudeCodeTokenSource({ source: 'option' }), '--token');
  assert.equal(describeClaudeCodeTokenSource({ source: 'secure-storage' }), 'secure storage');
  assert.equal(describeClaudeCodeTokenSource({ source: 'prompt' }), 'the interactive prompt');
  assert.equal(
    describeClaudeCodeTokenSource({ source: 'env', envTokenKey: 'ROUTERLAB_LLM_API_KEY' }),
    'environment variable ROUTERLAB_LLM_API_KEY',
  );
  assert.equal(describeClaudeCodeTokenSource({ source: 'legacy-env', envTokenKey: null }), 'the environment');
  assert.equal(describeClaudeCodeTokenSource({ source: 'unknown' }), 'the configured token source');

  const authError = claudeCodeAuthenticationError({ status: 403 }, service, { source: 'prompt' });
  assert.equal(authError.code, 'auth_failed');
  assert.equal(authError.statusCode, 403);
  assert.match(authError.message, /interactive prompt/);
  assert.match(authError.message, /auth login --service llm/);
  assert.doesNotMatch(authError.message, /--token/);
  const envAuthError = claudeCodeAuthenticationError({ status: 401 }, service, {
    source: 'env',
    envTokenKey: 'ROUTERLAB_LLM_API_KEY',
  });
  assert.match(envAuthError.message, /Update or unset ROUTERLAB_LLM_API_KEY/);
  assert.doesNotMatch(envAuthError.message, /--token/);
  assert.equal(
    claudeCodeAuthenticationError({}, service, { source: 'unknown' }).statusCode,
    401,
  );

  const originalError = console.error;
  const warnings = [];
  console.error = (...values) => warnings.push(stripVTControlCharacters(values.join(' ')));
  try {
    warnClaudeCodeTokenConflict(service, {
      source: 'secure-storage',
      envTokenPresent: true,
      storedTokenPresent: true,
    });
    warnClaudeCodeTokenConflict(service, {
      source: 'env',
      envTokenPresent: true,
      envTokenKey: 'ROUTERLAB_LLM_API_KEY',
      storedTokenPresent: true,
    });
  } finally {
    console.error = originalError;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /stored RouterLab LLM token/);
});

test('interactive Claude strategy selection covers separators, Back, and selected choices', async () => {
  let prompt = null;
  const back = await chooseStrategy({
    serviceValue: 'routerlab',
    modelIds: [],
    allowBack: true,
    selectFn: async (options) => {
      prompt = options;
      return 'back';
    },
  });
  assert.equal(back, null);
  assert.equal(prompt.message, 'Select Model Strategy:');
  assert.ok(prompt.choices.length > 6);
  assert.ok(prompt.pageSize > 6);

  assert.equal(await chooseStrategy({
    serviceValue: 'routerlab',
    modelIds: [],
    selectFn: async () => 'default',
  }), 'default');

  await assert.rejects(
    () => chooseStrategy({
      serviceValue: 'routerlab',
      modelIds: ['claude-opus-4-8'],
      selectFn: async () => assert.fail('all-disabled choices must not prompt'),
    }),
    /No launchable strategy/,
  );

  const separated = withSeparators([{ value: 'a' }, { value: 'b' }]);
  assert.equal(separated.length, 3);
  assert.deepEqual(withSeparators([{ value: 'only' }]), [{ value: 'only' }]);
  assert.deepEqual(withSeparators([]), []);
});

test('Claude Code summaries, indicators, and missing CLI failures are covered', async () => {
  const summary = stripVTControlCharacters(formatLaunchSummary({
    service: requireServiceConfig('routerlab'),
    strategy: 'Claude Native',
    subagentModel: 'aws-claude-haiku',
    endpoint: 'http://127.0.0.1 -> https://api.routerlab.ch',
  }));
  assert.match(summary, /Launch Summary/);
  assert.match(summary, /Claude Native/);

  assert.match(stripVTControlCharacters(getStrategyIndicator('default', [], 'routerlab')), /●/);
  assert.match(stripVTControlCharacters(getStrategyIndicator(
    'default',
    ['claude-opus-4-8', 'claude-sonnet-5', 'claude-fable-5', 'aws-claude-haiku-4-5-20251001'],
    'routerlab',
  )), /●/);
  assert.match(stripVTControlCharacters(getStrategyIndicator(
    'aws',
    ['claude-opus-4-8'],
    'routerlab',
  )), /●/);

  await assert.rejects(
    () => launchClaudeCode({
      serviceValue: 'routerlab',
      strategyValue: 'default',
      noPrompt: true,
      claudeArgs: [],
    }, {
      detectClaudeCodeFn: () => ({ installed: false, cliPath: null, version: null }),
    }),
    /Claude Code CLI not found/,
  );
});
