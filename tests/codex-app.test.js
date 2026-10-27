import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { planAppConfig, restoreAppConfig, parseAppConfig } from '../src/platform/codex-app-toml.js';
import { CodexAppConfigSession, codexAppPaths, configHash } from '../src/platform/codex-app-config.js';
import { installCodexAppRuntime, removeCodexAppRuntime } from '../src/platform/codex-app-runtime.js';
import { detectCodexApp, openCodexApp, requestCodexAppClose, isCodexAppRunning } from '../src/platform/codex-app-desktop.js';
import { readCodexAppCredential } from '../src/security/codex-app-credential.js';
import { createCodexAppIntegration } from '../src/apps/codex-app.js';

const CONFIG = { id: randomUUID(), providerId: 'scionos_routerlab', service: 'routerlab', model: 'gpt-6.1-sol',
  cataloguePath: 'C:\\test\\models.json', nodePath: process.execPath, helperPath: 'C:\\test\\credential.mjs', baseUrl: 'https://api.routerlab.ch/v1' };
const ORIGINAL = '# mes réglages\n"model" = "old" # choix personnel\nmodel_reasoning_effort="high"\n[mcp_servers.test]\ncommand="node"\nargs=["server.js"]\n[features]\napps=true';
function temporary() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scionos-codex-app-'));
  const paths = codexAppPaths({ env: { CODEX_HOME: path.join(directory, 'home') }, root: path.join(directory, 'integration') });
  fs.mkdirSync(path.dirname(paths.configPath), { recursive: true });
  return { directory, paths, cleanup() {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('scionos-codex-app-'));
    fs.rmSync(directory, { recursive: true, force: true });
  } };
}

test('TOML patches preserve original bytes, comments, quoted keys, nested tables, BOM and line endings', () => {
  for (const original of ['', '\uFEFF', ORIGINAL, ORIGINAL.replaceAll('\n', '\r\n'), '\uFEFF' + ORIGINAL,
    '\uFEFF[mcp_servers.a]\ncommand="x"\n', 'model = """old\nmodel"""\nmodel_provider="other"\nmodel_catalog_json=\'old.json\'\n',
    'model_providers.old.base_url="https://example.com"\n[projects."C:\\\\My Project"]\ntrust_level="trusted"\n',
    Array.from({ length: 6 }, (_, index) => `[mcp_servers.server_${index}]\ncommand="node"\nargs=["mcp.js", "${index}"]\n`).join('')]) {
    const plan = planAppConfig(original, CONFIG);
    assert.equal(parseAppConfig(plan.text).value.model_provider, 'scionos_routerlab');
    assert.equal(restoreAppConfig(plan.text, plan), original);
    assert.ok(plan.text.includes('command="node"') || !original.includes('command="node"'));
  }
  assert.throws(() => planAppConfig('[broken', CONFIG), { code: 'config_invalid' });
  assert.throws(() => planAppConfig('[model_providers.scionos_routerlab]\nname="mine"', CONFIG), { code: 'provider_conflict' });
  assert.throws(() => planAppConfig('model_providers={old={name="mine"}}', CONFIG), { code: 'config_invalid' });
  const plan = planAppConfig(ORIGINAL, CONFIG);
  assert.equal(restoreAppConfig(plan.text + '\n# new personal note\n', plan), ORIGINAL + '\n# new personal note\n');
  assert.throws(() => restoreAppConfig(plan.text.replace('gpt-6.1-sol', 'personal-model'), plan), { code: 'restore_conflict' });
  assert.throws(() => restoreAppConfig(plan.text.replace('wire_api = "responses"', 'wire_api = "chat"'), plan), { code: 'restore_conflict' });
  assert.throws(() => restoreAppConfig(plan.text + '\npersonal_auth_key="changed"\n', plan), { code: 'restore_conflict' });
});

test('recovery also handles interruption after configuration restoration but before journal deletion', () => {
  const t = temporary();
  try {
    fs.writeFileSync(t.paths.configPath, ORIGINAL);
    const owner = new CodexAppConfigSession(t.paths);
    owner.activate(CONFIG);
    const journal = JSON.parse(fs.readFileSync(t.paths.journalPath));
    fs.writeFileSync(t.paths.journalPath, JSON.stringify({ ...journal, phase: 'restoring', restoreHash: configHash(ORIGINAL) }));
    fs.writeFileSync(t.paths.configPath, ORIGINAL);
    fs.unlinkSync(t.paths.lockPath);
    const recovered = new CodexAppConfigSession(t.paths);
    assert.equal(recovered.status().restoreConflict, false);
    assert.equal(recovered.restore({ recover: true }).restored, false);
    assert.equal(fs.existsSync(t.paths.journalPath), false);
    assert.equal(fs.readFileSync(t.paths.configPath, 'utf8'), ORIGINAL);
    assert.throws(() => readCodexAppCredential('routerlab', { readToken() { throw new Error('private keychain details'); } }), error => error.code === 'credential_unavailable' && !error.message.includes('private keychain'));
  } finally { t.cleanup(); }
});

test('configuration session saves once, updates idempotently, blocks competing owners and restores only its changes', () => {
  const t = temporary();
  try {
    fs.writeFileSync(t.paths.configPath, ORIGINAL);
    const manager = new CodexAppConfigSession(t.paths);
    assert.equal(manager.status().configured, false);
    assert.equal(manager.preview(CONFIG).text.includes('scionos_routerlab'), true);
    assert.equal(fs.existsSync(t.paths.directory), false);
    manager.activate(CONFIG);
    const applied = fs.readFileSync(t.paths.configPath, 'utf8');
    assert.equal(manager.status().owned, true);
    assert.throws(() => new CodexAppConfigSession(t.paths).activate(CONFIG), { code: 'recovery_required' });
    assert.throws(() => new CodexAppConfigSession(t.paths).restore({ recover: true }), { code: 'config_busy' });
    manager.activate(CONFIG);
    assert.equal(fs.readFileSync(t.paths.configPath, 'utf8'), applied);
    assert.equal(fs.readdirSync(t.paths.backupsPath).length, 1);
    manager.activate({ ...CONFIG, model: 'gpt-6-luna' });
    fs.appendFileSync(t.paths.configPath, '\n# another user change\n');
    assert.equal(manager.restore({ dryRun: true }).changed, true);
    assert.equal(manager.status().configured, true);
    assert.equal(manager.restore().restored, true);
    assert.equal(fs.readFileSync(t.paths.configPath, 'utf8'), ORIGINAL + '\n# another user change\n');
    assert.equal(fs.existsSync(t.paths.lockPath), false);
    assert.equal(manager.restore().restored, false);
  } finally { t.cleanup(); }
});

test('recovery handles prepared journals, absent files, personal conflicts and invalid journals without clobbering data', () => {
  const t = temporary();
  try {
    const manager = new CodexAppConfigSession(t.paths, { pid: 100001, isAlive: () => false });
    manager.activate(CONFIG);
    const journal = JSON.parse(fs.readFileSync(t.paths.journalPath));
    fs.writeFileSync(t.paths.journalPath, JSON.stringify({ ...journal, phase: 'prepared' }));
    const recovery = new CodexAppConfigSession(t.paths, { isAlive: () => false });
    assert.equal(recovery.status().recoveryRequired, true);
    recovery.restore({ recover: true });
    assert.equal(fs.existsSync(t.paths.configPath), false);
    manager.activate(CONFIG);
    const modified = fs.readFileSync(t.paths.configPath, 'utf8').replace('gpt-6.1-sol', 'personal-model');
    fs.writeFileSync(t.paths.configPath, modified);
    assert.equal(manager.status().restoreConflict, true);
    assert.throws(() => manager.restore(), { code: 'restore_conflict' });
    assert.equal(fs.readFileSync(t.paths.configPath, 'utf8'), modified);
    fs.writeFileSync(t.paths.journalPath, '{}');
    assert.throws(() => recovery.restore({ recover: true }), { code: 'config_invalid' });
  } finally { t.cleanup(); }
});

test('atomic activation failures and concurrent edits preserve the config and release ownership', () => {
  for (const kind of ['failure', 'concurrent']) {
    const t = temporary();
    try {
      fs.writeFileSync(t.paths.configPath, ORIGINAL);
      const fileSystem = { ...fs, writeFileSync(file, ...args) {
        if (String(file).startsWith(t.paths.configPath + '.')) {
          if (kind === 'failure') throw Object.assign(new Error('read only'), { code: 'EACCES' });
          fs.writeFileSync(t.paths.configPath, ORIGINAL + '\n# concurrent change');
        }
        return fs.writeFileSync(file, ...args);
      } };
      const manager = new CodexAppConfigSession(t.paths, { fileSystem });
      assert.throws(() => manager.activate(CONFIG), { code: kind === 'failure' ? 'EACCES' : 'config_conflict' });
      assert.equal(fs.readFileSync(t.paths.configPath, 'utf8'), ORIGINAL + (kind === 'concurrent' ? '\n# concurrent change' : ''));
      assert.equal(fs.existsSync(t.paths.lockPath), false);
      assert.equal(fs.existsSync(t.paths.journalPath), false);
    } finally { t.cleanup(); }
  }
});

test('credential helper uses stored credentials only, validates them and stays independent of the package install', () => {
  assert.equal(readCodexAppCredential('routerlab', { readToken: () => 'stored-token-with-enough-length' }), 'stored-token-with-enough-length');
  assert.throws(() => readCodexAppCredential('llm', { readToken: () => null }));
  assert.throws(() => readCodexAppCredential('routerlab', { readToken: () => 'token-with-newline-123456\nsecret' }));
  const t = temporary();
  try {
    const runtime = installCodexAppRuntime(t.paths, { models: ['gpt-6.1-sol'], tokenDirectory: path.join(t.directory, 'empty-secrets') });
    assert.ok(fs.existsSync(runtime.cataloguePath));
    if (process.platform !== 'win32') {
      // Never query a developer's real macOS/Linux keychain from an absence fixture.
      fs.writeFileSync(path.join(runtime.directory, 'src', 'security', 'token-store.js'), 'export function getStoredToken(){return null;}');
    }
    const result = spawnSync(process.execPath, [runtime.helperPath, 'routerlab'], {
      env: { ...process.env, ROUTERLAB_API_KEY: 'environment-token-not-for-desktop', ROUTERLAB_LLM_API_KEY: '', WRAPPER_SCIONOS_TOKEN_DIR: '' }, encoding: 'utf8', timeout: 20000,
    });
    assert.equal(result.status, 1); assert.equal(result.stdout, '');
    assert.match(result.stderr, /credential unavailable/); assert.doesNotMatch(result.stderr, /environment-token/);
    removeCodexAppRuntime(t.paths, runtime.directory);
    assert.throws(() => removeCodexAppRuntime(t.paths, t.directory));
  } finally { t.cleanup(); }
});

test('desktop detection distinguishes the app and embedded engine, supports macOS, and never force-kills', async () => {
  const commands = [];
  const fakeRun = (command, args) => {
    commands.push([command, args]);
    if (args.includes('--version')) return { status: 0, stdout: 'codex-cli 0.164.0-alpha.11.1' };
    if (args.includes('CFBundleExecutable')) return { status: 0, stdout: 'Codex' };
    if (args.includes('CFBundleShortVersionString')) return { status: 0, stdout: '26.1021' };
    if (args.includes('-axo')) return { status: 0, stdout: '/Applications/Codex.app/Contents/MacOS/Codex' };
    if (args.at(-1).includes('Get-AppxPackage')) return { status: 0, stdout: JSON.stringify({ root: 'C:\\Apps\\Codex', version: '26.1021', packageId: 'OpenAI.Codex_family!App' }) };
    return { status: 0, stdout: 'running' };
  };
  const app = detectCodexApp({ platform: 'win32', run: fakeRun, fileSystem: { existsSync: () => true } });
  assert.equal(app.installed, true); assert.equal(app.running, true); assert.equal(app.versionSupported, true);
  const mac = detectCodexApp({ platform: 'darwin', run: fakeRun, fileSystem: { existsSync: () => true } });
  assert.equal(mac.installed, true); assert.equal(mac.running, true);
  assert.equal(detectCodexApp({ platform: 'linux' }).supported, false);
  await openCodexApp(app, { spawnFn(command, args) {
    assert.equal(command, 'explorer.exe'); assert.match(args[0], /shell:AppsFolder/);
    const child = new EventEmitter(); child.unref = () => {}; queueMicrotask(() => child.emit('spawn')); return child;
  } });
  await assert.rejects(openCodexApp({ supported: false }), { code: 'codex_app_unsupported' });
  requestCodexAppClose(app, { run: fakeRun }); requestCodexAppClose(mac, { run: fakeRun });
  assert.doesNotMatch(JSON.stringify(commands), /taskkill|Stop-Process|SIGKILL/);
  assert.equal(isCodexAppRunning({ installed: false }), false);
});

test('App integration revalidates actual models, keeps runtime alive for an open app, and restores on shutdown', async () => {
  const t = temporary();
  try {
    fs.writeFileSync(t.paths.configPath, ORIGINAL);
    let models = ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna'];
    let opened = 0; let saved = 0; let running = false;
    const app = createCodexAppIntegration({ service: 'routerlab' }, { paths: t.paths,
      detect: () => ({ installed: true, supported: true, versionSupported: true, enginePath: 'test', engineVersion: '0.164.0', running }),
      credential: () => 'stored-token-with-enough-length', fetchModels: async () => ({ valid: true, models }),
      open: async () => { opened++; running = true; return { opened: true }; }, isRunning: () => running,
      close: () => { running = false; return { requested: true }; },
    });
    const capability = await app.prepare();
    assert.doesNotMatch(JSON.stringify(capability), /stored-token-with-enough-length/);
    const selection = { family: 'claude-gpt', model: 'gpt-6.1-sol' };
    assert.equal((await app.preview(selection)).dryRun, true);
    assert.equal(fs.existsSync(t.paths.directory), false);
    models = ['gpt-6-astra', 'gpt-6-luna'];
    await assert.rejects(capability.execute(selection), { code: 'model_unavailable' });
    assert.equal(opened, 0);
    models.push('gpt-6.1-sol', 'kimi-k3');
    await capability.execute(selection, { onSpawn() { saved++; } });
    assert.equal(saved, 1); assert.equal(app.hasSession(), true);
    const catalogPath = parseAppConfig(fs.readFileSync(t.paths.configPath, 'utf8')).value.model_catalog_json;
    assert.ok(!JSON.parse(fs.readFileSync(catalogPath)).models.some(item => item.slug === 'kimi-k3'));
    assert.equal(app.shutdown().restored, true);
    assert.equal(fs.readFileSync(t.paths.configPath, 'utf8'), ORIGINAL);
    assert.ok(fs.readdirSync(t.paths.runtimePath).length > 0);
    app.close(); app.restore({ recover: true });
    assert.equal(fs.readdirSync(t.paths.runtimePath).length, 0);
    const foreign = installCodexAppRuntime(t.paths, { models: ['gpt-6.1-sol'] });
    await app.launch(selection);
    app.restore();
    assert.equal(app.hasSession(), true, 'The open App still needs an exit choice after a manual restore.');
    app.close(); app.shutdown();
    assert.equal(app.hasSession(), false);
    assert.equal(fs.existsSync(foreign.directory), true, 'Runtime assets outside this session must be preserved.');
    assert.equal(fs.readdirSync(t.paths.runtimePath).length, 1);
  } finally { t.cleanup(); }
});
