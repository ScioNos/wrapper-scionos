import test from 'node:test';
import assert from 'node:assert/strict';
import { main, shouldOpenInteractiveMenu } from '../src/cli/main.js';
import { parseOptions } from '../src/cli/args.js';
import { AUTH_MENU_ITEMS, CLAUDE_DESKTOP_MENU_ITEMS, MAIN_MENU_ITEMS, formatBanner, formatMenu, formatSelectChoice, resolveMenuChoice } from '../src/cli/menu.js';

test('default menu exposes Claude Code and Claude Desktop', () => {
  const labels = MAIN_MENU_ITEMS.map((item) => item.label);
  assert.deepEqual(labels, ['Claude Code', 'Claude Desktop', 'Codex CLI', 'Auth', 'Doctor', 'Quit']);
  assert.equal(resolveMenuChoice(MAIN_MENU_ITEMS, '1').value, 'claude-code');
  assert.equal(resolveMenuChoice(MAIN_MENU_ITEMS, '3').value, 'codex');
  assert.equal(resolveMenuChoice(MAIN_MENU_ITEMS, '5').value, 'doctor');
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
    description: 'Launch Claude Code through RouterLab.',
    short: 'Claude Code',
  });
  assert.deepEqual(formatSelectChoice(MAIN_MENU_ITEMS[2]), {
    name: 'Codex CLI',
    value: 'codex',
    description: 'Launch Codex CLI through RouterLab.',
    short: 'Codex CLI',
  });
});

test('wrapper options without a command keep the user in the main menu', () => {
  assert.equal(shouldOpenInteractiveMenu(parseOptions([])), true);
  assert.equal(shouldOpenInteractiveMenu(parseOptions(['--service', 'llm'])), true);
  assert.equal(shouldOpenInteractiveMenu(parseOptions(['--service', 'llm', '--strategy', 'claude-gpt'])), true);
  assert.equal(parseOptions(['codex', 'launch', '--model', 'deepseek-v4-pro']).model, 'deepseek-v4-pro');
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
  for (const items of [MAIN_MENU_ITEMS, CLAUDE_DESKTOP_MENU_ITEMS, AUTH_MENU_ITEMS]) {
    assert.equal(items.some((item) => !item.label || !item.value), false);
  }
});

test('Codex apply command is rejected before writing config', async () => {
  await assert.rejects(
    () => main(['codex', 'apply', '--yes']),
    /codex apply was removed/,
  );
});
