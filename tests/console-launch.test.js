import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { launchClaudeCode } from '../src/apps/claude-code.js';
import { launchCodexForService } from '../src/cli/commands/codex.js';
import { launchOpenCodeForService } from '../src/cli/commands/opencode.js';
import { getAuthorizedClaudeCodeModels } from '../src/routerlab/strategies.js';
import { startManagedClaudeDesktopProxy } from '../src/cli/commands/claude-desktop.js';
import { getClaudeDesktopPaths, modelRoutesForDesktopMapping, readClaudeDesktopStatus } from '../src/apps/claude-desktop.js';
import { createConsoleServices } from '../src/cli/console/services.js';
import { createConsoleState, initializeSelection } from '../src/cli/console/controller.js';
import { canLaunch } from '../src/cli/console/view.js';
import { normalizePreferences } from '../src/cli/console/preferences.js';
import { runInteractiveCli } from '../src/platform/process.js';
import { removeTestDirectory, closeTestServer } from './support/lifecycle.mjs';

const TOKEN = 'console-preparation-fixture-token';

test('Claude preparation exposes no credentials, starts no proxy, and revalidates before execution', async () => {
  let starts = 0, stops = 0, spawns = 0, fetches = 0, resolutions = 0;
  const allModels = getAuthorizedClaudeCodeModels('routerlab');
  const dependencies = {
    detectClaudeCodeFn: () => ({ installed: true, versionSupported: true, version: '2.1.296', cliPath: 'fixture' }),
    resolveTokenWithSourceFn: async () => ({ token: TOKEN + ++resolutions, source: 'secure-storage' }),
    fetchModelsFn: async (token) => { fetches++; assert.equal(token, TOKEN + resolutions); return { valid: true, models: allModels }; },
    startLongRunningLlmProxyFn: async () => { starts++; return { baseUrl: 'http://127.0.0.1:12345', gatewayToken: 'local-credential' }; },
    stopLongRunningLlmProxyFn: async () => { stops++; },
    runInteractiveCliFn: async (_command, _args, options) => { assert.equal(options.updateProcessExitCode, false); options.onSpawn(); return 130; },
  };
  const prepared = await launchClaudeCode({ serviceValue: 'routerlab', noPrompt: true, quiet: true, prepareOnly: true }, dependencies);
  assert.equal(starts, 0);
  assert.doesNotMatch(JSON.stringify(prepared), new RegExp(TOKEN));
  assert.equal(prepared.families.find((family) => family.value === 'aws').name, '💸 Claude via AWS');
  assert.equal(prepared.families.find((family) => family.value === 'trial').fixedSubagent, 'deepseek-v4.1-flash-trial');
  const state = createConsoleState({ service: 'routerlab' }, normalizePreferences(null), '8.0.0');
  state.catalogues['claude-code'] = prepared;
  state.selections['claude-code'] = { family: 'trial', subagent: 'deepseek-v4.1-flash-trial' };
  assert.equal(initializeSelection(state, 'claude-code', prepared), true);
  assert.equal(canLaunch(state), true);
  const result = await prepared.execute({ family: 'trial', subagent: 'deepseek-v4.1-flash-trial' }, { onSpawn: () => { spawns++; } });
  assert.equal(result.exitCode, 130); assert.equal(starts, 1); assert.equal(stops, 1);
  assert.equal(spawns, 1); assert.equal(fetches, 2); assert.equal(resolutions, 2);
  dependencies.fetchModelsFn = async () => ({ valid: false, reason: 'auth_failed', status: 401 });
  await assert.rejects(prepared.execute({ family: 'aws', subagent: 'aws-claude-haiku-4-5' }), /401/);
  assert.equal(starts, 1);
});

test('prepared Claude families reflect minimum client versions and retain explicit ephemeral credentials', async () => {
  let seen;
  const dependencies = {
    detectClaudeCodeFn: () => ({ installed: true, versionSupported: true, version: '2.1.283', cliPath: 'fixture' }),
    fetchModelsFn: async (token) => { seen = token; return { valid: true, models: getAuthorizedClaudeCodeModels('routerlab') }; },
    runInteractiveCliFn: async () => 0,
    startLongRunningLlmProxyFn: async () => ({ baseUrl: 'http://127.0.0.1:12345', gatewayToken: 'local-credential' }),
    stopLongRunningLlmProxyFn: async () => {},
  };
  const prepared = await launchClaudeCode({ serviceValue: 'routerlab', token: TOKEN, noPrompt: true, prepareOnly: true }, dependencies);
  assert.match(prepared.families.find((family) => family.value === 'aws').disabled, /2.1.284/);
  await prepared.execute({ family: 'claude-gpt', subagent: 'gpt-6-luna' });
  assert.equal(seen, TOKEN);
});

for (const client of ['codex', 'opencode']) test(`${client} prepares without resources and refuses a model removed before launch`, async () => {
  let valid = true, starts = 0, launches = 0, spawns = 0, stops = 0, resolutions = 0;
  const dependencies = {
    assertCodexCliAvailable: () => ({ installed: true, cliPath: 'fixture' }),
    assertOpenCodeCliAvailable: () => ({ installed: true, cliPath: 'fixture', version: '1.18.30' }),
    resolveTokenWithSource: async () => ({ token: TOKEN + ++resolutions, source: 'secure-storage' }),
    fetchModels: async () => ({ valid: true, models: valid ? ['gpt-6.1-sol', 'kimi-k3'] : ['gpt-6.1-sol'] }),
    startLongRunningLlmProxy: async () => { starts++; return { baseUrl: 'http://127.0.0.1:12345', gatewayToken: 'local-credential' }; },
    stopLongRunningLlmProxy: async () => { stops++; },
    launchCodex: async (options) => { launches++; options.onSpawn(); return 0; },
    launchOpenCode: async (options) => { launches++; options.onSpawn(); return 0; },
  };
  const launch = client === 'codex' ? launchCodexForService : launchOpenCodeForService;
  const prepared = await launch({ service: 'routerlab', noPrompt: true, prepareOnly: true }, dependencies);
  assert.equal(starts, 0); assert.equal(launches, 0);
  assert.doesNotMatch(JSON.stringify(prepared), new RegExp(TOKEN));
  assert.equal(await prepared.execute({ family: 'open-source', model: 'kimi-k3' }, { onSpawn: () => { spawns++; } }), 0);
  assert.equal(spawns, 1); assert.equal(resolutions, 2);
  valid = false;
  await assert.rejects(prepared.execute({ family: 'open-source', model: 'kimi-k3' }), /not available|unavailable/);
  assert.equal(launches, 1);
  assert.equal(starts, client === 'opencode' ? 1 : 0);
  assert.equal(stops, starts);
});

test('the real process runner notifies only after spawn and preserves direct child exit behavior', async () => {
  let spawns = 0;
  const previous = process.exitCode;
  try {
    const code = await runInteractiveCli(process.execPath, ['-e', 'process.exit(3)'], { updateProcessExitCode: false, onSpawn: () => { spawns++; } });
    assert.equal(code, 3); assert.equal(spawns, 1); assert.equal(process.exitCode, previous);
    await assert.rejects(runInteractiveCli(path.join(os.tmpdir(), 'scionos-not-an-executable'), [], { updateProcessExitCode: false, onSpawn: () => { spawns++; } }));
    assert.equal(spawns, 1);
  } finally { process.exitCode = previous ?? 0; }
});

test('managed Desktop proxy starts without blocking, preserves multiple families and stops idempotently', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scionos-managed-proxy-'));
  const paths = getClaudeDesktopPaths({ LOCALAPPDATA: directory, HOME: directory, XDG_CONFIG_HOME: directory });
  let session;
  const messages = [];
  try {
    const configuration = { serviceValue: 'routerlab', strategyValue: 'default', strategyValues: ['default', 'aws'], host: '127.0.0.1', port: 15721 };
    const routes = modelRoutesForDesktopMapping('routerlab', configuration.strategyValues);
    const options = { service: 'routerlab', token: TOKEN, noPrompt: true, interactiveDesktopPlan: { action: 'create', config: configuration, credential: null } };
    session = await startManagedClaudeDesktopProxy(options, {
      paths, fetchModels: async () => ({ valid: true, modelsVerified: true, models: routes.map((route) => route.upstreamModel) }),
      startProxy: async (proxyOptions) => {
        const server = http.createServer((_request, response) => response.end('fixture'));
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        return { server, routes: proxyOptions.routes, baseUrl: `http://127.0.0.1:${server.address().port}` };
      },
      logger: { log: (...values) => messages.push(values.join(' ')), error: () => {} },
    });
    assert.equal(session.active, true);
    assert.deepEqual(readClaudeDesktopStatus(paths).wrapperScionos.strategies, ['default', 'aws']);
    await Promise.all([session.stop(), session.stop()]);
    assert.equal(session.active, false); assert.equal(readClaudeDesktopStatus(paths).applied, true);
    assert.doesNotMatch(messages.join('\n'), new RegExp(TOKEN));
  } finally { if (session) await closeTestServer(session.server); await removeTestDirectory(directory); }
});

test('console services use the existing launchers and auth precedence without exposing tokens in status', async () => {
  const calls = [];
  let valid = true;
  const services = createConsoleServices({ service: 'routerlab', language: 'fr' }, {
    launchClaudeCode: (options) => { calls.push(options); return options; },
    launchCodexForService: (options) => { calls.push(options); return options; },
    launchOpenCodeForService: (options) => { calls.push(options); return options; },
    password: async () => valid ? TOKEN : '', storeToken: (token) => { assert.equal(token, TOKEN); },
    deleteStoredToken: () => true,
    getStoredTokenStatus: () => ({ stored: true, supported: true, backend: 'fixture', token: TOKEN }),
    resolveServiceEnvToken: () => ({ token: TOKEN }),
    resolveTokenWithSource: async (options) => { calls.push(options); return { token: TOKEN }; },
    fetchModels: async () => ({ valid, reason: 'auth_failed' }),
    readClaudeDesktopStatus: () => ({ supported: true }),
    planInteractiveClaudeDesktopStart: (options) => options,
    startManagedClaudeDesktopProxy: (options) => options,
    restoreOfficialClaudeDesktop: (options) => options,
  });
  for (const client of ['claude-code', 'codex', 'opencode']) assert.equal(services.prepare(client).prepareOnly, true);
  assert.equal(calls[0].quiet, true);
  assert.doesNotMatch(JSON.stringify(services.tokenStatus()), new RegExp(TOKEN));
  await services.login(); assert.equal(services.logout(), true);
  await services.verify('codex'); assert.equal(calls.at(-1).preferStored, true);
  await services.verify('claude-code'); assert.equal(calls.at(-1).preferStored, false);
  valid = false;
  await assert.rejects(services.login()); await assert.rejects(services.verify('codex'), /auth_failed/);
  assert.equal(services.desktopStatus().supported, true);
  assert.equal(services.planDesktop({ port: 1234 }).port, 1234);
  assert.equal(services.startDesktop({ port: 1234 }).port, 1234);
  assert.equal(services.restoreDesktop().dryRun, false);
  const unsafe = createConsoleServices({ token: TOKEN });
  assert.throws(() => unsafe.prepare('claude-code'), /cannot be used/);
});
