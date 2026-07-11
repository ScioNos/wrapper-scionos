import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { requireServiceConfig, resolveServiceBaseUrl } from '../routerlab/services.js';
import { findStrategy } from '../routerlab/strategies.js';
import {
  DESKTOP_MAPPING_STRATEGIES,
  desktopLabelForDesktopMapping,
  desktopLabelForStrategyModel,
  desktopRouteIdForStrategyModel,
  getStrategyModels,
  sortDesktopRoutes,
  supportsOneMillionContext,
} from '../routerlab/strategy-models.js';

export { DESKTOP_MAPPING_STRATEGIES, desktopRouteIdForStrategyModel, supportsOneMillionContext };

export const CLAUDE_DESKTOP_PROFILE_ID = '00000000-0000-4000-8000-000000157210';
export const CLAUDE_DESKTOP_PROFILE_NAME = 'ScioNos Wrapper';
export const LEGACY_LOCAL_PROXY_GATEWAY_TOKEN = 'scionos-local';
export const CLAUDE_DESKTOP_META_SCHEMA_VERSION = 1;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

const CONFIG_FILE = 'claude_desktop_config.json';
const CONFIG_LIBRARY_DIR = 'configLibrary';

export function isClaudeDesktopSupportedPlatform(platform = process.platform) {
  return platform === 'win32' || platform === 'darwin' || platform === 'linux';
}

export function getClaudeDesktopPaths(env = process.env, platform = process.platform) {
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return pathsFromBaseDirs(
      path.win32.join(localAppData, 'Claude'),
      path.win32.join(localAppData, 'Claude-3p'),
      path.win32,
    );
  }

  if (platform === 'darwin') {
    const home = env.HOME || os.homedir();
    return pathsFromBaseDirs(
      path.posix.join(home, 'Library', 'Application Support', 'Claude'),
      path.posix.join(home, 'Library', 'Application Support', 'Claude-3p'),
      path.posix,
    );
  }

  if (platform === 'linux') {
    const configHome = env.XDG_CONFIG_HOME || path.posix.join(env.HOME || os.homedir(), '.config');
    return pathsFromBaseDirs(
      path.posix.join(configHome, 'Claude'),
      path.posix.join(configHome, 'Claude-3p'),
      path.posix,
    );
  }

  throw new Error('Claude Desktop 3P configuration is currently supported only on Windows, macOS, and Linux.');
}

function pathsFromBaseDirs(normalDir, threepDir, pathImpl = path) {
  const configLibraryPath = pathImpl.join(threepDir, CONFIG_LIBRARY_DIR);
  return {
    normalConfigPath: pathImpl.join(normalDir, CONFIG_FILE),
    threepConfigPath: pathImpl.join(threepDir, CONFIG_FILE),
    configLibraryPath,
    profilePath: pathImpl.join(configLibraryPath, `${CLAUDE_DESKTOP_PROFILE_ID}.json`),
    metaPath: pathImpl.join(configLibraryPath, '_meta.json'),
  };
}

export function isClaudeDesktopSafeModelId(model) {
  const normalized = model.trim().toLowerCase();
  const routeTail = normalized.startsWith('anthropic/claude-')
    ? normalized.slice('anthropic/claude-'.length)
    : normalized.startsWith('aws-claude-')
      ? normalized.slice('aws-claude-'.length)
      : normalized.startsWith('cursor-aws-')
        ? normalized.slice('cursor-aws-'.length)
    : normalized.startsWith('claude-')
      ? normalized.slice('claude-'.length)
      : null;

  if (!routeTail || normalized.includes('[1m]')) {
    return false;
  }

  return ['sonnet-', 'opus-', 'haiku-'].some((prefix) => {
    const rest = routeTail.startsWith(prefix) ? routeTail.slice(prefix.length) : '';
    return rest.length > 0;
  });
}

export function buildGatewayProfile({ baseUrl, apiKey, modelSpecs = [] }) {
  const profile = {
    coworkEgressAllowedHosts: ['*'],
    disableDeploymentModeChooser: true,
    inferenceGatewayApiKey: apiKey,
    inferenceGatewayAuthScheme: 'bearer',
    inferenceGatewayBaseUrl: baseUrl,
    inferenceProvider: 'gateway',
  };

  if (modelSpecs.length > 0) {
    profile.inferenceModels = modelSpecs.map((spec) => {
      if (spec.supports1m || spec.labelOverride) {
        return {
          name: spec.name,
          ...(spec.labelOverride ? { labelOverride: spec.labelOverride } : {}),
          ...(spec.supports1m ? { supports1m: true } : {}),
        };
      }
      return spec.name;
    });
  }

  return profile;
}

export function modelSpecsForDirectStrategy(strategyValue, serviceValue) {
  const models = getStrategyModels(strategyValue, serviceValue);
  const hidden = models
    .map((entry) => entry.model)
    .filter((model) => !isClaudeDesktopSafeModelId(model));

  if (hidden.length > 0) {
    throw new Error(`Claude Desktop may hide these model ids in direct mode: ${hidden.join(', ')}. Use apply-proxy for this strategy.`);
  }

  return models.map((entry) => ({
    name: entry.model,
    supports1m: supportsOneMillionContext(entry.model),
  }));
}

export function modelRoutesForProxyStrategy(strategyValue, serviceValue) {
  return getStrategyModels(strategyValue, serviceValue).map((entry) => ({
    role: entry.role,
    routeId: desktopRouteIdForStrategyModel(entry.role, entry.model),
    upstreamModel: entry.model,
    labelOverride: desktopLabelForStrategyModel(entry.model),
    supports1m: supportsOneMillionContext(entry.model),
  }));
}

export function modelRoutesForDesktopMapping(serviceValue, strategyValues = null) {
  const service = requireServiceConfig(serviceValue);
  const values = strategyValues ?? DESKTOP_MAPPING_STRATEGIES[service.value] ?? [
    service.value === 'llm' ? 'claude' : 'default',
  ];

  const routes = values.flatMap((strategyValue) => {
    const strategy = findStrategy(strategyValue, service.value);
    const strategyLabel = strategy?.selectionName ?? strategy?.name ?? strategyValue;
    const suffix = desktopRouteSuffix(strategyValue);
    return getStrategyModels(strategyValue, service.value).map((entry) => ({
      role: entry.role,
      strategyValue,
      routeId: desktopRouteIdForStrategyModel(entry.role, entry.model, suffix),
      upstreamModel: entry.model,
      labelOverride: desktopLabelForDesktopMapping(strategyLabel, entry.model),
      supports1m: supportsOneMillionContext(entry.model),
    }));
  });

  return sortDesktopRoutes(routes);
}

function desktopRouteSuffix(strategyValue) {
  if (strategyValue === 'default') {
    return 'native';
  }
  if (strategyValue === 'claude-gpt') {
    return 'gpt';
  }
  return strategyValue
    .replace(/^claude-/, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export function readClaudeDesktopStatus() {
  if (!isClaudeDesktopSupportedPlatform()) {
    return { supported: false };
  }

  const paths = getClaudeDesktopPaths();
  return {
    supported: true,
    paths,
    configured: fs.existsSync(paths.profilePath),
    appliedId: readJson(paths.metaPath)?.appliedId ?? null,
    wrapperScionos: readJson(paths.metaPath)?.wrapperScionos ?? null,
    profile: redactClaudeDesktopProfile(readJson(paths.profilePath)),
  };
}

export function applyDirectClaudeDesktop({ serviceValue, strategyValue = 'default', token, dryRun = true, paths = getClaudeDesktopPaths() }) {
  const serviceConfig = requireServiceConfig(serviceValue);
  const service = { ...serviceConfig, baseUrl: resolveServiceBaseUrl(serviceConfig.value, process.env) };
  const modelSpecs = strategyValue === 'default' ? [] : modelSpecsForDirectStrategy(strategyValue, service.value);
  const profile = buildGatewayProfile({
    baseUrl: service.baseUrl,
    apiKey: token,
    modelSpecs,
  });

  if (dryRun) {
    return { dryRun: true, paths, profile };
  }

  withRollback(paths, () => {
    writeDeploymentMode(paths.normalConfigPath, '3p');
    writeDeploymentMode(paths.threepConfigPath, '3p');
    writeJson(paths.profilePath, profile);
    writeMeta(paths.metaPath, CLAUDE_DESKTOP_PROFILE_ID, buildWrapperMeta({
      mode: 'direct', serviceValue: service.value, strategyValue, baseUrl: service.baseUrl,
    }));
  });

  return { dryRun: false, paths, profile };
}

export function generateLocalProxyGatewayToken() {
  return randomBytes(32).toString('base64url');
}

export function buildLoopbackUrl(host = '127.0.0.1', port = 15721) {
  const normalized = String(host).trim().replace(/^\[|\]$/g, '');
  const displayHost = normalized.includes(':') ? '[' + normalized + ']' : normalized;
  return 'http://' + displayHost + ':' + port;
}

export function readClaudeDesktopProxyCredential(paths = getClaudeDesktopPaths()) {
  const profile = readJson(paths.profilePath);
  const meta = readJson(paths.metaPath)?.wrapperScionos ?? null;
  const token = profile?.inferenceGatewayApiKey;
  const baseUrl = profile?.inferenceGatewayBaseUrl;
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    return null;
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const loopback = url.protocol === 'http:'
    && (hostname === 'localhost' || hostname === '::1' || hostname.startsWith('127.'));
  if (typeof token !== 'string' || !token || !loopback) return null;
  return {
    token,
    baseUrl: url.origin,
    host: hostname,
    port: Number(url.port || 80),
    metadata: meta?.schemaVersion === CLAUDE_DESKTOP_META_SCHEMA_VERSION ? meta : null,
    legacy: token === LEGACY_LOCAL_PROXY_GATEWAY_TOKEN,
  };
}
export function redactClaudeDesktopProfile(profile) {
  if (!profile || typeof profile !== 'object') return profile;
  return {
    ...profile,
    ...(Object.hasOwn(profile, 'inferenceGatewayApiKey') ? { inferenceGatewayApiKey: '[redacted]' } : {}),
  };
}

export function redactClaudeDesktopResult(result) {
  return result && typeof result === 'object'
    ? { ...result, ...(result.profile ? { profile: redactClaudeDesktopProfile(result.profile) } : {}) }
    : result;
}
export function applyProxyClaudeDesktop({
  serviceValue,
  strategyValue,
  strategyValues = null,
  host = '127.0.0.1',
  port = 15721,
  gatewayToken = generateLocalProxyGatewayToken(),
  dryRun = true,
  paths = getClaudeDesktopPaths(),
}) {
  requireServiceConfig(serviceValue);
  const routes = strategyValues
    ? modelRoutesForDesktopMapping(serviceValue, strategyValues)
    : modelRoutesForProxyStrategy(strategyValue, serviceValue);
  const profile = buildGatewayProfile({
    baseUrl: buildLoopbackUrl(host, port),
    apiKey: gatewayToken,
    modelSpecs: routes.map((route) => ({
      name: route.routeId,
      labelOverride: route.labelOverride,
      supports1m: route.supports1m,
    })),
  });

  if (dryRun) {
    return { dryRun: true, paths, profile, routes };
  }

  withRollback(paths, () => {
    writeDeploymentMode(paths.normalConfigPath, '3p');
    writeDeploymentMode(paths.threepConfigPath, '3p');
    writeJson(paths.profilePath, profile);
    writeMeta(paths.metaPath, CLAUDE_DESKTOP_PROFILE_ID, buildWrapperMeta({
      mode: 'proxy', serviceValue, strategyValue, strategyValues,
      baseUrl: profile.inferenceGatewayBaseUrl,
    }));
  });

  return { dryRun: false, paths, profile, routes };
}

export function restoreOfficialClaudeDesktop({ dryRun = true, paths = getClaudeDesktopPaths() } = {}) {
  if (dryRun) {
    return { dryRun: true, paths };
  }

  withRollback(paths, () => {
    writeDeploymentMode(paths.normalConfigPath, '1p');
    writeDeploymentMode(paths.threepConfigPath, '1p');
    if (fs.existsSync(paths.profilePath)) {
      fs.unlinkSync(paths.profilePath);
    }
    writeMeta(paths.metaPath, null, null);
  });

  return { dryRun: false, paths };
}

function withRollback(paths, operation) {
  const targetPaths = [
    paths.normalConfigPath,
    paths.threepConfigPath,
    paths.profilePath,
    paths.metaPath,
  ];
  const snapshots = targetPaths.map((targetPath) => ({
    path: targetPath,
    content: fs.existsSync(targetPath) ? fs.readFileSync(targetPath) : null,
    mode: fs.existsSync(targetPath) ? fs.statSync(targetPath).mode & 0o777 : null,
  }));

  try {
    operation();
  } catch (error) {
    for (const snapshot of snapshots) {
      if (snapshot.content !== null) {
        ensurePrivateDirectory(path.dirname(snapshot.path));
        fs.writeFileSync(snapshot.path, snapshot.content, { mode: snapshot.mode ?? PRIVATE_FILE_MODE });
        if (process.platform !== 'win32') {
          fs.chmodSync(snapshot.path, snapshot.mode ?? PRIVATE_FILE_MODE);
          assertMode(snapshot.path, snapshot.mode ?? PRIVATE_FILE_MODE, 'rollback file');
        }
      } else if (fs.existsSync(snapshot.path)) {
        fs.unlinkSync(snapshot.path);
      }
    }
    throw error;
  }
}

function readJson(filePath) {
  if (typeof filePath !== 'string' || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  ensurePrivateDirectory(path.dirname(filePath));
  const tmp = filePath + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', {
      encoding: 'utf8',
      mode: PRIVATE_FILE_MODE,
    });
    ensurePrivateFile(tmp);
    fs.renameSync(tmp, filePath);
    ensurePrivateFile(filePath);
  } catch (error) {
    fs.rmSync(tmp, { force: true });
    throw error;
  }
}

function ensurePrivateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  if (process.platform === 'win32') return;
  fs.chmodSync(directory, PRIVATE_DIRECTORY_MODE);
  assertMode(directory, PRIVATE_DIRECTORY_MODE, 'directory');
}

function ensurePrivateFile(filePath) {
  if (process.platform === 'win32') return;
  fs.chmodSync(filePath, PRIVATE_FILE_MODE);
  assertMode(filePath, PRIVATE_FILE_MODE, 'file');
}

function assertMode(filePath, expectedMode, kind) {
  const actualMode = fs.statSync(filePath).mode & 0o777;
  if (actualMode !== expectedMode) {
    throw new Error('Refusing to use ' + kind + ' ' + filePath + ': expected mode ' + expectedMode.toString(8) + ', found ' + actualMode.toString(8) + '.');
  }
}
function writeDeploymentMode(filePath, mode) {
  const value = readJson(filePath) ?? {};
  value.deploymentMode = mode;
  writeJson(filePath, value);
}

function writeMeta(filePath, appliedProfileId, wrapperScionos = null) {
  const value = readJson(filePath) ?? {};
  const entries = Array.isArray(value.entries)
    ? value.entries.filter((entry) => entry?.id !== CLAUDE_DESKTOP_PROFILE_ID)
    : [];

  if (appliedProfileId) {
    entries.push({ id: CLAUDE_DESKTOP_PROFILE_ID, name: CLAUDE_DESKTOP_PROFILE_NAME });
    value.appliedId = appliedProfileId;
  } else if (value.appliedId === CLAUDE_DESKTOP_PROFILE_ID) {
    delete value.appliedId;
  }

  if (wrapperScionos) value.wrapperScionos = wrapperScionos;
  else delete value.wrapperScionos;
  value.entries = entries;
  writeJson(filePath, value);
}

function buildWrapperMeta({ mode, serviceValue, strategyValue = null, strategyValues = null, baseUrl }) {
  return {
    schemaVersion: CLAUDE_DESKTOP_META_SCHEMA_VERSION,
    mode,
    service: serviceValue,
    strategy: strategyValues ? null : strategyValue,
    strategies: strategyValues ? [...strategyValues] : null,
    baseUrl,
  };
}
