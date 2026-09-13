import test from 'node:test';
import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { handleInteractiveDesktopAction, handleInteractiveMenu, main, shouldOpenInteractiveMenu } from '../src/cli/main.js';
import { getAuthMenuContext } from '../src/cli/commands/auth.js';
import { parseOptions } from '../src/cli/args.js';
import { getLocalizedMenuRoutes, AUTH_MENU_ITEMS, CLAUDE_DESKTOP_MENU_ITEMS, MAIN_MENU_ITEMS, MENU_ROUTES, TOOLS_MENU_ITEMS, applyMenuControl, formatBanner, formatBreadcrumb, formatMenu, formatSelectChoice, formatServiceHealthAlert, MenuBackError, MenuExitError, resolveMenuChoice, resolveMenuInput, resolveNavigation } from '../src/cli/menu.js';

test('default menu exposes the supported coding clients', () => {
  const labels = MAIN_MENU_ITEMS.map((item) => item.label);
  assert.deepEqual(labels, ['Claude Code', 'Claude Desktop', 'Codex CLI', 'OpenCode CLI', 'Account & access', 'Tools & diagnostics', 'Exit']);
  assert.equal(resolveMenuChoice(MAIN_MENU_ITEMS, '1').value, 'claude-code');
  assert.equal(resolveMenuChoice(MAIN_MENU_ITEMS, '3').value, 'codex');
  assert.equal(resolveMenuChoice(MAIN_MENU_ITEMS, '5').value, 'auth');
  assert.equal(resolveMenuChoice(MAIN_MENU_ITEMS, '6').value, 'tools');
  assert.equal(resolveMenuChoice(MAIN_MENU_ITEMS, 'Claude Desktop').value, 'claude-desktop');
  assert.match(formatMenu('ScioNos Wrapper', MAIN_MENU_ITEMS), /Claude Code/);
  assert.match(formatMenu('ScioNos Wrapper', MAIN_MENU_ITEMS), /Claude Desktop/);
  assert.equal(resolveMenuChoice(MAIN_MENU_ITEMS, 'Codex CLI').value, 'codex');
  assert.match(formatMenu('ScioNos Wrapper', MAIN_MENU_ITEMS), /Codex CLI/);
  assert.match(formatMenu('ScioNos Wrapper', MAIN_MENU_ITEMS), /OpenCode CLI/);
  const banner = formatBanner('ScioNos Wrapper', '1.0.0');
  const plainBanner = stripVTControlCharacters(banner);
  assert.match(plainBanner, /ScioNos Wrapper/);
  assert.match(plainBanner, /Compatible Windows, macOS, Linux/);
  assert.match(banner, /https:\/\/github\.com\/aaddrick\/claude-desktop-debian/);
  assert.doesNotMatch(plainBanner, /ScioNos\s+✕\s+Claude Code/);
  assert.match(
    stripVTControlCharacters(formatBanner('ScioNos Wrapper', '1.0.0', { language: 'de' })),
    /Kompatibel mit Windows, macOS und Linux über/,
  );
  const genericBanner = stripVTControlCharacters(formatBanner('Claude Desktop'));
  assert.match(genericBanner, /Claude Desktop/);
  assert.doesNotMatch(genericBanner, /Compatible Windows, macOS, Linux/);
  assert.doesNotMatch(genericBanner, /v1\.0\.0/);
  assert.match(
    stripVTControlCharacters(formatMenu('Claude Desktop', CLAUDE_DESKTOP_MENU_ITEMS, {
      banner: true,
      version: '1.0.0',
    })),
    /Claude Desktop/,
  );
  assert.match(stripVTControlCharacters(formatBanner('A'.repeat(60))), /A{60}/);
  const llmAlert = stripVTControlCharacters(formatServiceHealthAlert(' LLM '));
  assert.match(llmAlert, /Active LLM service — available models may vary/);
  assert.match(llmAlert, /╔═+╗/);
  assert.match(stripVTControlCharacters(formatServiceHealthAlert('llm', 'fr')), /ℹ Service LLM actif — les modèles disponibles peuvent varier/);
  assert.match(stripVTControlCharacters(formatServiceHealthAlert('llm', 'de')), /LLM-Dienst aktiv — verfügbare Modelle können variieren/);
  assert.equal(formatServiceHealthAlert('routerlab'), '');
  assert.deepEqual(formatSelectChoice(MAIN_MENU_ITEMS[0]), {
    name: 'Claude Code',
    value: 'claude-code',
    description: 'Start a coding session through RouterLab.',
    short: 'Claude Code',
    key: '1',
  });
  assert.deepEqual(formatSelectChoice(MAIN_MENU_ITEMS[2]), {
    name: 'Codex CLI',
    value: 'codex',
    description: 'Start a Codex session through RouterLab.',
    short: 'Codex CLI',
    key: '3',
  });
  assert.deepEqual(formatSelectChoice(MAIN_MENU_ITEMS[3]), {
    name: 'OpenCode CLI',
    value: 'opencode',
    description: 'Start an OpenCode session through RouterLab.',
    short: 'OpenCode CLI',
    key: '4',
  });
});

test('wrapper options without a command keep the user in the main menu', () => {
  assert.equal(shouldOpenInteractiveMenu(parseOptions([])), true);
  assert.equal(shouldOpenInteractiveMenu(parseOptions(['--service', 'llm'])), true);
  assert.equal(shouldOpenInteractiveMenu(parseOptions(['--service', 'llm', '--strategy', 'claude-gpt'])), true);
  assert.equal(parseOptions(['codex', 'launch', '--model', 'deepseek-v4.1-flash']).model, 'deepseek-v4.1-flash');
  assert.equal(parseOptions(['codex', 'launch', '--strategy', 'open-source']).strategy, 'open-source');
  assert.equal(parseOptions(['--lang', 'fr']).language, 'fr');
  assert.equal(parseOptions(['--language=de']).language, 'de');
  assert.throws(() => parseOptions(['--lang', 'it']), /--lang must be one of: en, fr, de/);
  assert.equal(Object.hasOwn(parseOptions(['codex', 'launch']), 'transport'), false);
  assert.throws(() => parseOptions(['codex', 'launch', '--direct']), /--direct has been removed/);
  assert.throws(() => parseOptions(['codex', 'launch', '--transport', 'direct']), /--transport has been removed/);
  assert.throws(() => parseOptions(['codex', 'launch', '--proxy']), /--proxy has been removed/);
  assert.equal(shouldOpenInteractiveMenu(parseOptions(['--', '-p', 'hello'])), false);
  assert.equal(shouldOpenInteractiveMenu(parseOptions(['-p', 'hello'])), false);
});

test('interactive menu routes are translated without changing their actions', () => {
  const french = getLocalizedMenuRoutes('fr');
  const german = getLocalizedMenuRoutes('de');
  assert.equal(french.home.items.find((item) => item.value === 'codex').key, '3');
  assert.equal(french.home.items.find((item) => item.value === 'codex').label, 'Codex CLI');
  assert.equal(french.home.items.find((item) => item.value === 'auth').label, 'Compte et accès');
  assert.equal(french.account.message, 'Choisissez une action de compte :');
  assert.equal(french.account.items.at(-1).key, '0');
  assert.equal(german.tools.items.find((item) => item.value === 'doctor').label, 'Diagnose ausführen');
  assert.equal(formatBreadcrumb('account', 'fr', french), 'ScioNos Wrapper  ›  Compte et accès');
});

test('Codex launch validates a direct model-family strategy', async () => {
  await assert.rejects(
    () => main(['codex', 'launch', '--strategy', 'missing']),
    (error) => error.exitCode === 2 && /Unknown strategy/.test(error.message),
  );
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
    key: '1',
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
  assert.deepEqual(resolveNavigation('tools', 'q'), { kind: 'exit' });
  assert.deepEqual(resolveNavigation('tools', 'quit'), { kind: 'exit' });
  assert.deepEqual(resolveNavigation('tools', 'back'), { kind: 'navigate', routeId: 'home' });
  assert.equal(formatBreadcrumb('home'), 'ScioNos Wrapper');
  assert.equal(formatBreadcrumb('desktop'), 'ScioNos Wrapper  ›  Claude Desktop');
});

test('menu controls use declared keys and support text aliases', () => {
  assert.equal(resolveMenuInput(MAIN_MENU_ITEMS, '4').choice.value, 'opencode');
  assert.equal(resolveMenuInput(MAIN_MENU_ITEMS, 'OpenCode CLI').value, 'opencode');
  assert.equal(resolveMenuInput(CLAUDE_DESKTOP_MENU_ITEMS, '0').choice.value, 'back');
  assert.equal(resolveMenuInput(CLAUDE_DESKTOP_MENU_ITEMS, 'back').value, 'back');
  assert.equal(resolveMenuInput(MAIN_MENU_ITEMS, 'q').value, 'quit');
  assert.equal(resolveMenuInput(MAIN_MENU_ITEMS, 'exit').value, 'quit');
  assert.equal(resolveMenuInput(MAIN_MENU_ITEMS, 'not-a-choice'), null);
  assert.equal(applyMenuControl('back'), null);
  assert.throws(() => applyMenuControl('back', { allowBack: false }), (error) => error instanceof MenuBackError && error.exitCode === 130);
  assert.throws(() => applyMenuControl('quit'), (error) => error instanceof MenuExitError && error.exitCode === 0);
});

test('interactive Claude Desktop actions confirm replacements and pass return-to-menu behavior', async () => {
  const options = parseOptions(['--service', 'llm']);
  const replacementPlan = {
    action: 'replace',
    requiresConfirmation: true,
    current: {
      serviceValue: 'routerlab',
      strategyValue: 'default',
      strategyValues: ['default'],
      host: '127.0.0.1',
      port: 15721,
    },
    config: {
      serviceValue: 'llm',
      strategyValue: 'claude',
      strategyValues: ['claude'],
      host: '127.0.0.1',
      port: 15721,
    },
    credential: { token: 'never-print-this' },
  };
  let handled = false;
  const cancelled = await handleInteractiveDesktopAction('proxy', options, {
    planInteractiveClaudeDesktopStart: () => replacementPlan,
    askYesNo: async (message, defaultValue) => {
      assert.match(message, /routerlab/);
      assert.match(message, /llm/);
      assert.doesNotMatch(message, /never-print-this/);
      assert.equal(defaultValue, false);
      return false;
    },
    handleClaudeDesktop: async () => {
      handled = true;
    },
  });
  assert.deepEqual(cancelled, { kind: 'cancelled' });
  assert.equal(handled, false);

  const started = await handleInteractiveDesktopAction('proxy', options, {
    planInteractiveClaudeDesktopStart: () => ({ ...replacementPlan, requiresConfirmation: false }),
    handleClaudeDesktop: async (action, desktopOptions) => {
      assert.equal(action, 'proxy');
      assert.equal(desktopOptions.returnToMenuOnSigint, true);
      assert.equal(desktopOptions.interactiveDesktopPlan.action, 'replace');
      return { kind: 'back', signal: 'SIGINT', exitCode: 0 };
    },
  });
  assert.deepEqual(started, { kind: 'back', signal: 'SIGINT', exitCode: 0 });
});

test('interactive menu routes Claude Desktop actions for the selected service and returns cleanly', async () => {
  const actions = ['claude-desktop', 'proxy', 'back', 'quit'];
  const seenMessages = [];
  let desktopCalls = 0;
  await handleInteractiveMenu(parseOptions(['--service', 'llm']), {
    askMenu: async (_title, _items, menuOptions) => {
      seenMessages.push(menuOptions.message);
      return actions.shift();
    },
    handleInteractiveDesktopAction: async (action, options) => {
      desktopCalls += 1;
      assert.equal(action, 'proxy');
      assert.equal(options.service, 'llm');
      return { kind: 'back', signal: 'SIGINT', exitCode: 0 };
    },
  });
  assert.equal(desktopCalls, 1);
  assert.equal(actions.length, 0);
  assert.equal(seenMessages.every((message) => /Active service: RouterLab LLM/.test(message)), true);
});

test('interactive menu launches Codex directly with the selected service', async (t) => {
  for (const serviceCase of [
    { args: [], service: 'routerlab', label: 'RouterLab' },
    { args: ['--service', 'llm'], service: 'llm', label: 'RouterLab LLM' },
  ]) {
    await t.test(serviceCase.service, async () => {
      const messages = [];
      let launched = 0;
      await handleInteractiveMenu(parseOptions(serviceCase.args), {
        askMenu: async (_title, _items, menuOptions) => {
          messages.push(menuOptions.message);
          return 'codex';
        },
        launchCodexForService: async (options) => {
          launched += 1;
          assert.equal(options.service, serviceCase.service);
          assert.equal(options.interactiveMenu, true);
          assert.equal(options.updateProcessExitCode, false);
          return 0;
        },
      });
      assert.equal(launched, 1);
      assert.equal(messages.length, 1);
      assert.match(messages[0], new RegExp(`Active service: ${serviceCase.label}`));
    });
  }
});

test('interactive Codex failures report the error and return to the home menu', async (t) => {
  const previousExitCode = process.exitCode;
  const originalError = console.error;
  const errors = [];
  console.error = (...values) => errors.push(values.join(' '));
  try {
    await t.test('non-zero child exit', async () => {
      const actions = ['codex', 'quit'];
      process.exitCode = 9;
      await handleInteractiveMenu(parseOptions(['--service', 'llm']), {
        askMenu: async () => actions.shift(),
        launchCodexForService: async () => 9,
      });
      assert.equal(actions.length, 0);
      assert.equal(process.exitCode, 0);
      assert.match(errors.at(-1), /exited with code 9/);
    });

    await t.test('startup exception', async () => {
      const actions = ['codex', 'quit'];
      await handleInteractiveMenu(parseOptions([]), {
        askMenu: async () => actions.shift(),
        launchCodexForService: async () => {
          throw new Error('test startup failure');
        },
      });
      assert.equal(actions.length, 0);
      assert.equal(process.exitCode, 0);
      assert.match(errors.at(-1), /could not start for RouterLab: test startup failure/);
    });
  } finally {
    console.error = originalError;
    if (previousExitCode === undefined) process.exitCode = 0;
    else process.exitCode = previousExitCode;
  }
});

test('interactive menu launches OpenCode with the selected service', async () => {
  const actions = ['opencode'];
  let launched = 0;
  await handleInteractiveMenu(parseOptions(['--service', 'llm']), {
    askMenu: async () => actions.shift(),
    launchOpenCodeForService: async (options) => {
      launched += 1;
      assert.equal(options.service, 'llm');
      assert.equal(options.updateProcessExitCode, false);
      return 0;
    },
  });
  assert.equal(launched, 1);
  assert.equal(actions.length, 0);
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

test('Claude Code rejects command-line tokens without changing other command interfaces', async () => {
  await assert.rejects(
    () => main(['claude-code', '--token', 'visible-token-with-enough-length']),
    (error) => error.exitCode === 2 && /--token is not valid for claude-code/.test(error.message),
  );
  assert.equal(
    parseOptions(['codex', 'launch', '--token', 'codex-token-with-enough-length']).token,
    'codex-token-with-enough-length',
  );
  assert.equal(
    parseOptions(['auth', 'test', '--token', 'auth-token-with-enough-length']).token,
    'auth-token-with-enough-length',
  );
});

test('Claude Code rejects GLM 5.3 as a RouterLab subagent before launch', async () => {
  await assert.rejects(
    () => main(['claude-code', '--service', 'routerlab', '--subagent-model', 'glm-5.3']),
    (error) => error.exitCode === 2
      && /--subagent-model must be one of: claude-haiku-4-5, aws-claude-haiku-4-5, gpt-5\.6-luna, deepseek-v4\.1-flash\./.test(error.message),
  );
});
