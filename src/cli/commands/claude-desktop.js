import { requireServiceConfig } from '../../routerlab/services.js';
import { resolveToken } from '../../apps/claude-code.js';
import { DESKTOP_MAPPING_STRATEGIES, applyDirectClaudeDesktop, applyProxyClaudeDesktop, readClaudeDesktopStatus, restoreOfficialClaudeDesktop } from '../../apps/claude-desktop.js';
import { startClaudeDesktopProxy } from '../../apps/claude-desktop-proxy.js';
import { CLAUDE_DESKTOP_MENU_ITEMS, askMenu, askYesNo } from '../menu.js';
import { print } from './output.js';

export async function handleClaudeDesktopMenu(options) {
  while (true) {
    const action = await askMenu('Claude Desktop', CLAUDE_DESKTOP_MENU_ITEMS, {
      interactiveSelect: true,
      message: 'Select Claude Desktop action:',
    });
    if (action === 'back') {
      return;
    }

    const desktopOptions = { ...options };
    if (action === 'proxy') {
      const service = requireServiceConfig(options.service);
      desktopOptions.service = service.value;
      desktopOptions.strategyValues = resolveDesktopMappingStrategies(service.value);
      desktopOptions.setupLocalMapping = true;
      desktopOptions.yes = true;
    } else if (action === 'restore-official') {
      desktopOptions.yes = await askYesNo('Restore Claude Desktop official mode now?', false);
    }

    await handleClaudeDesktop(action, desktopOptions);
  }
}

export async function handleClaudeDesktop(action, options) {
  if (action === 'status') {
    print(readClaudeDesktopStatus(), options);
    return;
  }

  if (action === 'restore-official') {
    const result = restoreOfficialClaudeDesktop({ dryRun: !options.yes });
    print(result, options);
    return;
  }

  if (action === 'apply-proxy') {
    const service = requireServiceConfig(options.service);
    const strategyValue = options.strategy ?? (service.value === 'llm' ? 'claude' : 'default');
    const strategyValues = resolveDesktopProxyStrategyValues(service.value, options);
    const result = applyProxyClaudeDesktop({
      serviceValue: service.value,
      strategyValue,
      strategyValues,
      host: options.host,
      port: options.port,
      dryRun: !options.yes,
    });
    print(result, options);
    return;
  }

  if (action === 'proxy') {
    const service = requireServiceConfig(options.service);
    const token = options.token ?? await resolveToken({ serviceValue: service.value, noPrompt: options.noPrompt });
    const strategyValue = options.strategy ?? (service.value === 'llm' ? 'claude' : 'default');
    const strategyValues = resolveDesktopProxyStrategyValues(service.value, options);
    if (options.setupLocalMapping || options.yes) {
      const profile = applyProxyClaudeDesktop({
        serviceValue: service.value,
        strategyValue,
        strategyValues,
        host: options.host,
        port: options.port,
        dryRun: false,
      });
      console.log(`Configured Claude Desktop local mapping profile at ${profile.paths.profilePath}`);
    }

    const result = await startClaudeDesktopProxy({
      serviceValue: service.value,
      strategyValue,
      strategyValues,
      routerlabToken: token,
      host: options.host,
      port: options.port,
    });
    console.log(`Claude Desktop local mapping proxy listening on ${result.baseUrl}`);
    console.log(`Service: ${service.value}`);
    console.log(`Strategies: ${(strategyValues ?? [strategyValue]).join(', ')}`);
    console.log('Routes:');
    for (const route of result.routes) {
      console.log(`  ${route.routeId} -> ${route.upstreamModel}`);
    }
    console.log('Press Ctrl+C to stop.');
    await new Promise((resolve) => {
      result.server.on('close', resolve);
    });
    return;
  }

  if (action !== 'apply') {
    throw new Error(`Unknown claude-desktop action "${action}".`);
  }

  const service = requireServiceConfig(options.service);
  const token = options.token ?? await resolveToken({ serviceValue: service.value, noPrompt: options.noPrompt });
  const result = applyDirectClaudeDesktop({
    serviceValue: service.value,
    strategyValue: options.strategy ?? (service.value === 'llm' ? 'claude' : 'default'),
    token,
    dryRun: !options.yes,
  });
  print(result, options);
}

function resolveDesktopMappingStrategies(serviceValue) {
  const service = requireServiceConfig(serviceValue);
  return DESKTOP_MAPPING_STRATEGIES[service.value] ?? [
    service.value === 'llm' ? 'claude' : 'default',
  ];
}

function resolveDesktopProxyStrategyValues(serviceValue, options) {
  if (options.strategyValues) {
    return options.strategyValues;
  }
  return options.strategy ? null : resolveDesktopMappingStrategies(serviceValue);
}
