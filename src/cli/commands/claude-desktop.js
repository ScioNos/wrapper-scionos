import {
  requireServiceConfig,
  resolveServiceBaseUrl,
  validateServiceBaseUrl,
} from '../../routerlab/services.js';
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
    return runClaudeDesktopProxy(options);
  }

  warnDeprecationOnce('action:claude-desktop-apply', 'claude-desktop apply is deprecated in 4.x because it stores the RouterLab token in the Desktop profile; use apply-proxy.');
  const service = resolveValidatedDesktopService(options.service);
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
  const service = resolveValidatedDesktopService(options.service);
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
    targetBaseUrl: service.baseUrl,
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

export async function runClaudeDesktopProxy(options) {
  const interactivePlan = options.interactiveDesktopPlan ?? null;
  let credential = interactivePlan?.credential ?? readClaudeDesktopProxyCredential();
  let config;
  let rewriteProfile;

  if (interactivePlan) {
    config = interactivePlan.config;
    rewriteProfile = interactivePlan.action !== 'reuse';
  } else {
    const explicitProfileOptions = ['service', 'strategy', 'host', 'port']
      .some((name) => options.providedOptions?.has(name));
    config = credential ? storedProxyConfig(credential, options) : requestedProxyConfig(options);

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

    if (!credential && !options.yes) {
      throw new Error('No wrapper-managed local Claude Desktop profile exists. Run "claude-desktop apply-proxy --yes" first.');
    }
    rewriteProfile = !credential || credential.legacy || options.yes;
  }

  if (credential && !credential.metadata) {
    console.error('WARN Legacy Claude Desktop profile: restored host/port from inferenceGatewayBaseUrl and using the CLI-selected service. The next apply-proxy will persist v4 metadata.');
  }

  const service = resolveValidatedDesktopService(config.serviceValue);
  const token = options.token ?? await resolveToken({ serviceValue: service.value, noPrompt: options.noPrompt });
  const gatewayToken = rewriteProfile ? generateLocalProxyGatewayToken() : credential.token;
  const result = await startClaudeDesktopProxy({
    serviceValue: service.value,
    strategyValue: config.strategyValue,
    strategyValues: config.strategyValues,
    routerlabToken: token,
    gatewayToken,
    targetBaseUrl: service.baseUrl,
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
  return waitForProxyShutdown(result.server, {
    ...(options.shutdownOptions ?? {}),
    returnToMenuOnSigint: Boolean(options.returnToMenuOnSigint),
  });
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

export function planInteractiveClaudeDesktopStart(options, context = {}) {
  const credential = Object.hasOwn(context, 'credential')
    ? context.credential
    : readClaudeDesktopProxyCredential();
  const status = Object.hasOwn(context, 'status')
    ? context.status
    : readClaudeDesktopStatus();
  const current = safeStoredProxyConfig(credential, options);
  const config = requestedInteractiveProxyConfig(options, credential);
  const profileExists = status?.profileExists ?? status?.configured ?? false;

  if (!profileExists) {
    return {
      action: 'create',
      reason: 'profile_missing',
      requiresConfirmation: false,
      current,
      config,
      credential,
    };
  }
  if (credential && status?.healthy && current && sameProxyConfig(current, config)) {
    return {
      action: 'reuse',
      reason: 'configuration_matches',
      requiresConfirmation: false,
      current,
      config,
      credential,
    };
  }
  return {
    action: 'replace',
    reason: status?.healthy ? 'configuration_differs' : 'profile_unhealthy',
    requiresConfirmation: true,
    current,
    config,
    credential,
  };
}

export function formatDesktopReplacementPrompt(plan) {
  const requested = describeProxyConfig(plan.config);
  if (!plan.current) {
    return `Replace the existing invalid or non-proxy Claude Desktop profile with ${requested}?`;
  }
  return `Replace the current Claude Desktop mapping (${describeProxyConfig(plan.current)}) with ${requested}?`;
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

function requestedInteractiveProxyConfig(options, credential) {
  const service = requireServiceConfig(options.service);
  const strategyExplicit = options.providedOptions?.has('strategy');
  return {
    serviceValue: service.value,
    strategyValue: strategyExplicit ? options.strategy : defaultDesktopStrategy(service.value),
    strategyValues: strategyExplicit ? null : resolveDesktopMappingStrategies(service.value),
    host: options.providedOptions?.has('host')
      ? options.host.replace(/^\[|\]$/g, '')
      : credential?.host ?? options.host,
    port: options.providedOptions?.has('port') ? options.port : credential?.port ?? options.port,
  };
}

function safeStoredProxyConfig(credential, options) {
  if (!credential?.metadata || credential.metadata.mode !== 'proxy') return null;
  try {
    return storedProxyConfig(credential, options);
  } catch {
    return null;
  }
}

function describeProxyConfig(config) {
  const strategies = (config.strategyValues ?? [config.strategyValue]).join(', ');
  const host = String(config.host).includes(':') ? `[${String(config.host).replace(/^\[|\]$/g, '')}]` : config.host;
  return `${config.serviceValue} at ${host}:${config.port} using ${strategies}`;
}

function resolveValidatedDesktopService(serviceValue) {
  const serviceConfig = requireServiceConfig(serviceValue);
  return {
    ...serviceConfig,
    baseUrl: validateServiceBaseUrl(
      resolveServiceBaseUrl(serviceConfig.value, process.env),
      serviceConfig.value,
    ),
  };
}

export function waitForProxyShutdown(server, {
  signalSource = process,
  exitState = process,
  returnToMenuOnSigint = false,
} = {}) {
  return new Promise((resolve, reject) => {
    let receivedSignal = null;
    const cleanup = () => {
      signalSource.off('SIGINT', stopSigint);
      signalSource.off('SIGTERM', stopSigterm);
      server.off('error', fail);
      server.off('close', done);
    };
    const done = () => {
      cleanup();
      if (receivedSignal === 'SIGINT' && returnToMenuOnSigint) {
        exitState.exitCode = 0;
        resolve({ kind: 'back', signal: receivedSignal, exitCode: 0 });
        return;
      }
      if (receivedSignal) {
        const exitCode = receivedSignal === 'SIGINT' ? 130 : 143;
        resolve({ kind: 'terminate', signal: receivedSignal, exitCode });
        return;
      }
      resolve({ kind: 'stopped', signal: null, exitCode: exitState.exitCode ?? 0 });
    };
    const fail = (error) => { cleanup(); reject(error); };
    const stop = (signal, exitCode) => {
      receivedSignal = signal;
      if (!(signal === 'SIGINT' && returnToMenuOnSigint)) {
        exitState.exitCode = exitCode;
      }
      if (server.listening) {
        server.close();
        server.closeAllConnections?.();
      } else {
        done();
      }
    };
    const stopSigint = () => stop('SIGINT', 130);
    const stopSigterm = () => stop('SIGTERM', 143);
    signalSource.once('SIGINT', stopSigint);
    signalSource.once('SIGTERM', stopSigterm);
    server.once('error', fail);
    server.once('close', done);
  });
}
