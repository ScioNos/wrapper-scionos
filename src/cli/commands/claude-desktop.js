import { requireServiceConfig } from '../../routerlab/services.js';
import { resolveToken } from '../../apps/claude-code.js';
import {
  DESKTOP_MAPPING_STRATEGIES,
  applyDirectClaudeDesktop,
  applyProxyClaudeDesktop,
  generateLocalProxyGatewayToken,
  readClaudeDesktopProxyCredential,
  readClaudeDesktopStatus,
  redactClaudeDesktopResult,
  restoreOfficialClaudeDesktop,
} from '../../apps/claude-desktop.js';
import { startClaudeDesktopProxy } from '../../apps/claude-desktop-proxy.js';
import { CLAUDE_DESKTOP_MENU_ITEMS, askMenu, askYesNo } from '../menu.js';
import { print } from './output.js';
import { warnDeprecationOnce } from '../deprecations.js';

export async function handleClaudeDesktop(action, options) {
  if (action === 'status') {
    print(readClaudeDesktopStatus(), options);
    return;
  }
  if (action === 'restore-official') {
    print(restoreOfficialClaudeDesktop({ dryRun: !options.yes }), options);
    return;
  }
  if (action === 'apply-proxy') {
    await applyClaudeDesktopProxyProfile(options);
    return;
  }
  if (action === 'proxy') {
    await runClaudeDesktopProxy(options);
    return;
  }

  warnDeprecationOnce('action:claude-desktop-apply', 'claude-desktop apply is deprecated in 4.x because it stores the RouterLab token in the Desktop profile; use apply-proxy.');
  const service = requireServiceConfig(options.service);
  const token = options.token ?? await resolveToken({ serviceValue: service.value, noPrompt: options.noPrompt });
  const result = applyDirectClaudeDesktop({
    serviceValue: service.value,
    strategyValue: options.strategy ?? defaultDesktopStrategy(service.value),
    token,
    dryRun: !options.yes,
  });
  print(redactClaudeDesktopResult(result), options);
}

async function applyClaudeDesktopProxyProfile(options) {
  const service = requireServiceConfig(options.service);
  const strategyValue = options.strategy ?? defaultDesktopStrategy(service.value);
  const strategyValues = resolveDesktopProxyStrategyValues(service.value, options);
  if (!options.yes) {
    const preview = applyProxyClaudeDesktop({
      serviceValue: service.value,
      strategyValue,
      strategyValues,
      host: options.host,
      port: options.port,
      dryRun: true,
    });
    print(redactClaudeDesktopResult(preview), options);
    return;
  }

  const token = options.token ?? await resolveToken({ serviceValue: service.value, noPrompt: options.noPrompt });
  const gatewayToken = generateLocalProxyGatewayToken();
  const proxy = await startClaudeDesktopProxy({
    serviceValue: service.value,
    strategyValue,
    strategyValues,
    routerlabToken: token,
    gatewayToken,
    host: options.host,
    port: options.port,
  });
  try {
    const applied = applyProxyClaudeDesktop({
      serviceValue: service.value,
      strategyValue,
      strategyValues,
      host: options.host,
      port: options.port,
      gatewayToken,
      dryRun: false,
    });
    print(redactClaudeDesktopResult(applied), options);
  } finally {
    await closeStartedProxy(proxy.server);
  }
}
async function runClaudeDesktopProxy(options) {
  let credential = readClaudeDesktopProxyCredential();
  const explicitProfileOptions = ['service', 'strategy', 'host', 'port']
    .some((name) => options.providedOptions?.has(name));
  let config = options.setupLocalMapping
    ? requestedProxyConfig(options)
    : credential ? storedProxyConfig(credential, options) : requestedProxyConfig(options);

  if (credential && explicitProfileOptions) {
    const requested = mergeExplicitProxyConfig(config, options);
    if (!sameProxyConfig(config, requested)) {
      if (!options.yes) {
        throw new Error('Explicit proxy options differ from the stored Claude Desktop profile. Run "claude-desktop apply-proxy --yes" first, or repeat this command with --yes to rewrite it atomically.');
      }
      config = requested;
      credential = null;
    }
  }

  if (!credential && !options.yes && !options.setupLocalMapping) {
    throw new Error('No wrapper-managed local Claude Desktop profile exists. Run "claude-desktop apply-proxy --yes" first.');
  }
  if (credential && !credential.metadata) {
    console.error('WARN Legacy Claude Desktop profile: restored host/port from inferenceGatewayBaseUrl and using the CLI-selected service. The next apply-proxy will persist v4 metadata.');
  }

  const service = requireServiceConfig(config.serviceValue);
  const token = options.token ?? await resolveToken({ serviceValue: service.value, noPrompt: options.noPrompt });
  const rewriteProfile = !credential || credential.legacy || options.setupLocalMapping || options.yes;
  const gatewayToken = rewriteProfile ? generateLocalProxyGatewayToken() : credential.token;
  const result = await startClaudeDesktopProxy({
    serviceValue: service.value,
    strategyValue: config.strategyValue,
    strategyValues: config.strategyValues,
    routerlabToken: token,
    gatewayToken,
    allowedOrigins: options.allowOrigins,
    host: config.host,
    port: config.port,
  });

  try {
    if (rewriteProfile) {
      const applied = applyProxyClaudeDesktop({
        serviceValue: config.serviceValue,
        strategyValue: config.strategyValue,
        strategyValues: config.strategyValues,
        host: config.host,
        port: config.port,
        gatewayToken,
        dryRun: false,
      });
      credential = readClaudeDesktopProxyCredential(applied.paths);
      console.log('Configured Claude Desktop local mapping profile at ' + applied.paths.profilePath);
    }
  } catch (error) {
    await closeStartedProxy(result.server);
    throw error;
  }

  console.log('Claude Desktop local mapping proxy listening on ' + result.baseUrl);
  console.log('Service: ' + service.value);
  console.log('Strategies: ' + (config.strategyValues ?? [config.strategyValue]).join(', '));
  console.log('Routes:');
  for (const route of result.routes) console.log('  ' + route.routeId + ' -> ' + route.upstreamModel);
  console.log('Press Ctrl+C to stop.');
  await waitForProxyShutdown(result.server);
}

function closeStartedProxy(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
export function storedProxyConfig(credential, options) {
  const meta = credential.metadata;
  if (!meta || meta.mode !== 'proxy') {
    const service = requireServiceConfig(options.service);
    return {
      serviceValue: service.value,
      strategyValue: options.strategy ?? defaultDesktopStrategy(service.value),
      strategyValues: resolveDesktopProxyStrategyValues(service.value, options),
      host: credential.host,
      port: credential.port,
    };
  }
  const service = requireServiceConfig(meta.service);
  return {
    serviceValue: service.value,
    strategyValue: meta.strategy ?? defaultDesktopStrategy(service.value),
    strategyValues: Array.isArray(meta.strategies) ? meta.strategies : null,
    host: credential.host,
    port: credential.port,
  };
}

export function requestedProxyConfig(options) {
  const service = requireServiceConfig(options.service);
  return {
    serviceValue: service.value,
    strategyValue: options.strategy ?? defaultDesktopStrategy(service.value),
    strategyValues: resolveDesktopProxyStrategyValues(service.value, options),
    host: options.host,
    port: options.port,
  };
}

export function mergeExplicitProxyConfig(stored, options) {
  const serviceExplicit = options.providedOptions?.has('service');
  const serviceValue = serviceExplicit ? requireServiceConfig(options.service).value : stored.serviceValue;
  const serviceChanged = serviceValue !== stored.serviceValue;
  const strategyExplicit = options.providedOptions?.has('strategy');
  const resetStrategy = serviceChanged && !strategyExplicit;
  return {
    serviceValue,
    strategyValue: strategyExplicit ? options.strategy : resetStrategy ? defaultDesktopStrategy(serviceValue) : stored.strategyValue,
    strategyValues: strategyExplicit ? null : resetStrategy ? resolveDesktopMappingStrategies(serviceValue) : stored.strategyValues,
    host: options.providedOptions?.has('host') ? options.host.replace(/^\[|\]$/g, '') : stored.host,
    port: options.providedOptions?.has('port') ? options.port : stored.port,
  };
}

export function sameProxyConfig(left, right) {
  return left.serviceValue === right.serviceValue
    && left.strategyValue === right.strategyValue
    && left.host.replace(/^\[|\]$/g, '') === right.host.replace(/^\[|\]$/g, '')
    && left.port === right.port
    && JSON.stringify(left.strategyValues ?? null) === JSON.stringify(right.strategyValues ?? null);
}

export function defaultDesktopStrategy(serviceValue) {
  return serviceValue === 'llm' ? 'claude' : 'default';
}
function resolveDesktopMappingStrategies(serviceValue) {
  const service = requireServiceConfig(serviceValue);
  return DESKTOP_MAPPING_STRATEGIES[service.value] ?? [service.value === 'llm' ? 'claude' : 'default'];
}

function resolveDesktopProxyStrategyValues(serviceValue, options) {
  if (options.strategyValues) return options.strategyValues;
  return options.strategy ? null : resolveDesktopMappingStrategies(serviceValue);
}
export function waitForProxyShutdown(server) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      process.off('SIGINT', stopSigint);
      process.off('SIGTERM', stopSigterm);
      server.off('error', fail);
      server.off('close', done);
    };
    const done = () => { cleanup(); resolve(); };
    const fail = (error) => { cleanup(); reject(error); };
    const stop = (exitCode) => {
      process.exitCode = exitCode;
      if (server.listening) {
        server.close();
        server.closeAllConnections?.();
      } else {
        done();
      }
    };
    const stopSigint = () => stop(130);
    const stopSigterm = () => stop(143);
    process.once('SIGINT', stopSigint);
    process.once('SIGTERM', stopSigterm);
    server.once('error', fail);
    server.once('close', done);
  });
}
