import test from 'node:test';
import assert from 'node:assert/strict';
import { main, shouldOpenInteractiveMenu } from '../src/cli/main.js';
import { getAuthMenuContext } from '../src/cli/commands/auth.js';
import { parseOptions } from '../src/cli/args.js';
import { AUTH_MENU_ITEMS, CLAUDE_DESKTOP_MENU_ITEMS, MAIN_MENU_ITEMS, MENU_ROUTES, TOOLS_MENU_ITEMS, formatBanner, formatBreadcrumb, formatMenu, formatSelectChoice, resolveMenuChoice, resolveNavigation } from '../src/cli/menu.js';

test('default menu exposes Claude Code and Claude Desktop', () => {
  const labels = MAIN_MENU_ITEMS.map((item) => item.label);
  assert.deepEqual(labels, ['Claude Code', 'Claude Desktop', 'Codex CLI', 'Account & access', 'Tools & diagnostics', 'Exit']);
  assert.equal(resolveMenuChoice(MAIN_MENU_ITEMS, '1').value, 'claude-code');
  assert.equal(resolveMenuChoice(MAIN_MENU_ITEMS, '3').value, 'codex');
  assert.equal(resolveMenuChoice(MAIN_MENU_ITEMS, '5').value, 'tools');
  assert.equal(resolveMenuChoice(MAIN_MENU_ITEMS, 'Claude Desktop').value, 'claude-desktop');
  assert.match(formatMenu('ScioNos Wrapper', MAIN_MENU_ITEMS), /Claude Code/);
  assert.match(formatMenu('ScioNos Wrapper', MAIN_MENU_ITEMS), /Claude Desktop/);
  assert.equal(resolveMenuChoice(MAIN_MENU_ITEMS, 'Codex CLI').value, 'codex');
  assert.match(formatMenu('ScioNos Wrapper', MAIN_MENU_ITEMS), /Codex CLI/);
  assert.match(formatBanner('ScioNos Wrapper', '1.0.0'), /ScioNos Wrapper/);
  assert.match(formatBanner('ScioNos Wrapper', '1.0.0'), /Compatible Windows, macOS, Linux/);
  assert.match(formatBanner('ScioNos Wrapper', '1.0.0'), /https:\/\/github\.com\/aaddrick\/claude-desktop-debian/);
  assert.doesNotMatch(formatBanner('ScioNos Wrapper', '1.0.0'), /ScioNos\s+✕\s+Claude Code/);
  assert.deepEqual(formatSelectChoice(MAIN_MENU_ITEMS[0]), {
    name: 'Claude Code',
    value: 'claude-code',
    description: 'Start a coding session through RouterLab.',
    short: 'Claude Code',
  });
  assert.deepEqual(formatSelectChoice(MAIN_MENU_ITEMS[2]), {
    name: 'Codex CLI',
    value: 'codex',
    description: 'Start a Codex session through RouterLab.',
    short: 'Codex CLI',
  });
});

test('wrapper options without a command keep the user in the main menu', () => {
  assert.equal(shouldOpenInteractiveMenu(parseOptions([])), true);
  assert.equal(shouldOpenInteractiveMenu(parseOptions(['--service', 'llm'])), true);
  assert.equal(shouldOpenInteractiveMenu(parseOptions(['--service', 'llm', '--strategy', 'claude-gpt'])), true);
  assert.equal(parseOptions(['codex', 'launch', '--model', 'deepseek-v4-pro']).model, 'deepseek-v4-pro');
  assert.equal(parseOptions(['codex', 'launch']).transport, 'proxy');
  assert.equal(parseOptions(['codex', 'launch', '--direct']).transport, 'direct');
  assert.equal(parseOptions(['codex', 'launch', '--transport', 'direct']).transport, 'direct');
  assert.equal(parseOptions(['codex', 'launch', '--transport', 'proxy']).transport, 'proxy');
  assert.equal(parseOptions(['codex', 'launch', '--proxy']).transport, 'proxy');
  assert.throws(() => parseOptions(['codex', 'launch', '--transport', 'remote']), /--transport/);
  assert.equal(shouldOpenInteractiveMenu(parseOptions(['--', '-p', 'hello'])), false);
  assert.equal(shouldOpenInteractiveMenu(parseOptions(['-p', 'hello'])), false);
});

test('Claude Desktop menu keeps only the simple customer actions', () => {
  assert.deepEqual(CLAUDE_DESKTOP_MENU_ITEMS.map((item) => item.value), [
    'proxy',
    'restore-official',
    'status',
    'back',
  ]);
  assert.deepEqual(formatSelectChoice(CLAUDE_DESKTOP_MENU_ITEMS[0]), {
    name: 'Start Local Mapping',
    value: 'proxy',
    description: 'Configure the selected Desktop mapping and run the local proxy.',
    short: 'Start Local Mapping',
  });
});

test('interactive select menus stay compact without separator rows', () => {
  for (const items of [MAIN_MENU_ITEMS, CLAUDE_DESKTOP_MENU_ITEMS, AUTH_MENU_ITEMS, TOOLS_MENU_ITEMS]) {
    assert.equal(items.some((item) => !item.label || !item.value), false);
  }
});

test('every submenu ends with the same route back to the home screen', () => {
  for (const items of [CLAUDE_DESKTOP_MENU_ITEMS, AUTH_MENU_ITEMS, TOOLS_MENU_ITEMS]) {
    const back = items.at(-1);
    assert.equal(back.value, 'back');
    assert.equal(back.key, '0');
    assert.equal(back.label, '← Back to home');
    assert.match(back.description, /main menu/);
  }
  assert.equal(MAIN_MENU_ITEMS.some((item) => item.value === 'back'), false);
  assert.equal(MAIN_MENU_ITEMS.at(-1).value, 'quit');
});

test('the interactive navigation model has predictable parents and actions', () => {
  assert.deepEqual(Object.keys(MENU_ROUTES), ['home', 'desktop', 'account', 'tools']);
  assert.deepEqual(resolveNavigation('home', 'claude-desktop'), { kind: 'navigate', routeId: 'desktop' });
  assert.deepEqual(resolveNavigation('home', 'auth'), { kind: 'navigate', routeId: 'account' });
  assert.deepEqual(resolveNavigation('desktop', 'back'), { kind: 'navigate', routeId: 'home' });
  assert.deepEqual(resolveNavigation('account', 'status'), { kind: 'action', action: 'status' });
  assert.deepEqual(resolveNavigation('home', 'quit'), { kind: 'exit' });
  assert.equal(formatBreadcrumb('home'), 'ScioNos Wrapper');
  assert.equal(formatBreadcrumb('desktop'), 'ScioNos Wrapper  ›  Claude Desktop');
});
test('auth menu uses the command-selected service', () => {
  const routerlab = getAuthMenuContext(parseOptions([]));
  assert.equal(routerlab.service.value, 'routerlab');
  assert.equal(routerlab.title, 'Auth (RouterLab)');
  assert.equal(routerlab.options.service, 'routerlab');

  const llm = getAuthMenuContext(parseOptions(['--service', 'llm']));
  assert.equal(llm.service.value, 'llm');
  assert.equal(llm.title, 'Auth (RouterLab LLM)');
  assert.equal(llm.options.service, 'llm');
});

test('Codex apply command is rejected before writing config', async () => {
  await assert.rejects(
    () => main(['codex', 'apply', '--yes']),
    /codex apply was removed/,
  );
});
