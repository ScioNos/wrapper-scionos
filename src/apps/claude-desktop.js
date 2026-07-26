import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { requireServiceConfig } from '../routerlab/services.js';
import { findStrategy } from '../routerlab/strategies.js';
import {
  buildValidatedLoopbackUrl,
  parseLoopbackUrl,
} from '../platform/loopback.js';
import {
  DESKTOP_MAPPING_STRATEGIES,
  desktopLabelForDesktopMapping,
  desktopLabelForStrategyModel,
  desktopRouteIdForStrategyModel,
  getStrategyModels,
  sortDesktopRoutes,
} from '../routerlab/strategy-models.js';

export { DESKTOP_MAPPING_STRATEGIES, desktopRouteIdForStrategyModel };

export const CLAUDE_DESKTOP_PROFILE_ID = '00000000-0000-4000-8000-000000157210';
export const CLAUDE_DESKTOP_PROFILE_NAME = 'ScioNos Wrapper';
export const LEGACY_LOCAL_PROXY_GATEWAY_TOKEN = 'scionos-local';
export const CLAUDE_DESKTOP_META_SCHEMA_VERSION = 2;
export const CLAUDE_DESKTOP_LEGACY_META_SCHEMA_VERSION = 1;
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

export function buildGatewayProfile({ baseUrl, apiKey, modelSpecs = [] }) {
  const egressHost = gatewayEgressHost(baseUrl);
  const profile = {
    coworkEgressAllowedHosts: [egressHost],
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

function gatewayEgressHost(baseUrl) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`Claude Desktop gateway base URL is invalid: ${baseUrl}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Claude Desktop gateway base URL must use HTTP or HTTPS.');
  }
  return parsed.hostname.replace(/^\[|\]$/g, '');
}

export function modelRoutesForProxyStrategy(strategyValue, serviceValue) {
  return getStrategyModels(strategyValue, serviceValue).map((entry) => ({
    role: entry.role,
    routeId: desktopRouteIdForStrategyModel(entry.role, entry.model),
    upstreamModel: entry.model,
    labelOverride: desktopLabelForStrategyModel(entry.model),
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
    }));
  });

  return sortDesktopRoutes(routes);
}

export function buildVerifiedClaudeDesktopRoutes({
  serviceValue,
  strategyValue,
  strategyValues = null,
  models,
  modelMetadata = new Map(),
}) {
  requireServiceConfig(serviceValue);
  const configuredRoutes = strategyValues
    ? modelRoutesForDesktopMapping(serviceValue, strategyValues)
    : modelRoutesForProxyStrategy(strategyValue, serviceValue);
  const authorizedModels = new Set(Array.isArray(models) ? models : []);
  const metadataByModel = normalizeModelMetadata(modelMetadata);
  const verifiedRoutes = [];
  const routeTargets = new Map();

  for (const route of configuredRoutes) {
    if (!authorizedModels.has(route.upstreamModel)) continue;
    const previousTarget = routeTargets.get(route.routeId);
    if (previousTarget && previousTarget !== route.upstreamModel) {
      throw desktopError(
        'route_collision',
        `Claude Desktop route ${route.routeId} maps to multiple upstream models.`,
      );
    }
    if (previousTarget) continue;
    routeTargets.set(route.routeId, route.upstreamModel);

    const metadata = metadataByModel.get(route.upstreamModel);
    verifiedRoutes.push({
      ...route,
      ...(metadata?.contextWindowVerified && metadata.contextWindow >= 1_000_000
        ? { supports1m: true }
        : {}),
      ...(explicitCreatedAt(metadata) !== undefined
        ? { createdAt: explicitCreatedAt(metadata) }
        : {}),
    });
  }

  if (verifiedRoutes.length === 0) {
    throw desktopError(
      'no_authorized_models',
      'RouterLab did not authorize any model configured for Claude Desktop.',
    );
  }
  return sortDesktopRoutes(verifiedRoutes);
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

export function readClaudeDesktopStatus(paths = getClaudeDesktopPaths()) {
  if (!isClaudeDesktopSupportedPlatform()) {
    return { supported: false };
  }

  const profileState = readJsonState(paths.profilePath);
  const metaState = readJsonState(paths.metaPath);
  const profile = profileState.value;
  const meta = metaState.value;
  const wrapperScionos = meta?.wrapperScionos ?? null;
  const appliedId = meta?.appliedId ?? null;
  const issues = [];

  if (!profileState.exists) {
    issues.push('profile_missing');
  } else if (!profileState.valid || !isJsonObject(profile)) {
    issues.push('profile_invalid');
  }
  if (appliedId !== CLAUDE_DESKTOP_PROFILE_ID) {
    issues.push('profile_not_applied');
  }
  if (wrapperScionos?.mode === 'direct') {
    issues.push('insecure_direct_profile');
  } else if (isLegacyProxyMetadata(wrapperScionos)) {
    issues.push('metadata_migration_required');
  } else if (!isValidWrapperMetadata(wrapperScionos)) {
    issues.push('metadata_invalid');
  }
  if (profileState.valid && isJsonObject(profile)) {
    if (!isValidLocalGatewayToken(profile.inferenceGatewayApiKey)) {
      issues.push('missing_gateway_credential');
    }
    const localOrigin = safeParseLoopbackUrl(profile.inferenceGatewayBaseUrl);
    if (!localOrigin) {
      issues.push('invalid_gateway_base_url');
    }
    if (profile.inferenceGatewayAuthScheme !== 'bearer') issues.push('invalid_auth_scheme');
    if (profile.inferenceProvider !== 'gateway') issues.push('invalid_provider');
    if (localOrigin && (
      !Array.isArray(profile.coworkEgressAllowedHosts)
      || profile.coworkEgressAllowedHosts.length !== 1
      || profile.coworkEgressAllowedHosts[0] !== localOrigin.host
    )) {
      issues.push('invalid_egress_host');
    }
    if (isValidWrapperMetadata(wrapperScionos)) {
      if (localOrigin?.origin !== wrapperScionos.baseUrl) issues.push('metadata_base_url_mismatch');
      if (!profileMatchesRoutes(profile, wrapperScionos.routes)) issues.push('catalog_mismatch');
    }
  }

  return {
    supported: true,
    paths,
    configured: profileState.exists,
    profileExists: profileState.exists,
    applied: appliedId === CLAUDE_DESKTOP_PROFILE_ID,
    healthy: issues.length === 0,
    issues,
    appliedId,
    wrapperScionos,
    profile: redactClaudeDesktopProfile(profile),
  };
}

export function generateLocalProxyGatewayToken() {
  return randomBytes(32).toString('base64url');
}

export function buildLoopbackUrl(host = '127.0.0.1', port = 15721) {
  return buildValidatedLoopbackUrl(host, port);
}

export function readClaudeDesktopProxyCredential(paths = getClaudeDesktopPaths()) {
  const profile = readJson(paths.profilePath);
  const meta = readJson(paths.metaPath)?.wrapperScionos ?? null;
  if (meta?.mode === 'direct') return null;
  const token = profile?.inferenceGatewayApiKey;
  const baseUrl = profile?.inferenceGatewayBaseUrl;
  const localOrigin = safeParseLoopbackUrl(baseUrl);
  if (!isValidLocalGatewayToken(token, { allowLegacy: true }) || !localOrigin) return null;
  return {
    token,
    baseUrl: localOrigin.origin,
    host: localOrigin.host,
    port: localOrigin.port,
    metadata: isValidWrapperMetadata(meta) ? meta : null,
    legacyMetadata: isLegacyProxyMetadata(meta) ? meta : null,
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
  routes,
  host = '127.0.0.1',
  port = 15721,
  gatewayToken = generateLocalProxyGatewayToken(),
  dryRun = true,
  paths = getClaudeDesktopPaths(),
}) {
  requireServiceConfig(serviceValue);
  const verifiedRoutes = validateVerifiedRoutes(routes);
  const profile = buildGatewayProfile({
    baseUrl: buildLoopbackUrl(host, port),
    apiKey: gatewayToken,
    modelSpecs: verifiedRoutes.map((route) => ({
      name: route.routeId,
      labelOverride: route.labelOverride,
      supports1m: route.supports1m,
    })),
  });

  if (dryRun) {
    return { dryRun: true, paths, profile, routes: verifiedRoutes };
  }

  validateMutableDesktopFiles(paths);
  withRollback(paths, () => {
    writeDeploymentMode(paths.normalConfigPath, '3p');
    writeDeploymentMode(paths.threepConfigPath, '3p');
    writeJson(paths.profilePath, profile);
    writeMeta(paths.metaPath, CLAUDE_DESKTOP_PROFILE_ID, buildWrapperMeta({
      mode: 'proxy', serviceValue, strategyValue, strategyValues,
      baseUrl: profile.inferenceGatewayBaseUrl,
      routes: verifiedRoutes,
    }));
  });

  return { dryRun: false, paths, profile, routes: verifiedRoutes };
}

export function restoreOfficialClaudeDesktop({ dryRun = true, paths = getClaudeDesktopPaths() } = {}) {
  if (dryRun) {
    return { dryRun: true, paths };
  }

  validateMutableDesktopFiles(paths);
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
  return readJsonState(filePath).value;
}

function readJsonState(filePath) {
  if (typeof filePath !== 'string' || !fs.existsSync(filePath)) {
    return { exists: false, valid: false, value: null };
  }
  try {
    return { exists: true, valid: true, value: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
  } catch {
    return { exists: true, valid: false, value: null };
  }
}

function readJsonObjectForMutation(filePath, label) {
  const state = readJsonState(filePath);
  if (!state.exists) return {};
  if (!state.valid || !isJsonObject(state.value)) {
    throw desktopError(
      'invalid_desktop_config',
      `Refusing to modify invalid ${label}: ${filePath}.`,
    );
  }
  return state.value;
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
  const value = readJsonObjectForMutation(filePath, 'Claude Desktop configuration');
  value.deploymentMode = mode;
  writeJson(filePath, value);
}

function writeMeta(filePath, appliedProfileId, wrapperScionos = null) {
  const value = readJsonObjectForMutation(filePath, 'Claude Desktop metadata');
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

function buildWrapperMeta({
  mode,
  serviceValue,
  strategyValue = null,
  strategyValues = null,
  baseUrl,
  routes,
}) {
  return {
    schemaVersion: CLAUDE_DESKTOP_META_SCHEMA_VERSION,
    mode,
    service: serviceValue,
    strategy: strategyValues ? null : strategyValue,
    strategies: strategyValues ? [...strategyValues] : null,
    baseUrl,
    routes: routes.map(metadataRoute),
  };
}

function isValidWrapperMetadata(meta) {
  if (!isJsonObject(meta)) return false;
  if (meta.schemaVersion !== CLAUDE_DESKTOP_META_SCHEMA_VERSION) return false;
  if (meta.mode !== 'proxy') return false;
  if (!safeParseLoopbackUrl(meta.baseUrl)) return false;
  if (!Array.isArray(meta.routes) || meta.routes.length === 0) return false;
  try {
    validateVerifiedRoutes(meta.routes);
  } catch {
    return false;
  }
  let service;
  try {
    service = requireServiceConfig(meta.service);
  } catch {
    return false;
  }
  const strategyValues = Array.isArray(meta.strategies) ? meta.strategies : null;
  if (strategyValues) {
    if (strategyValues.length === 0
      || !strategyValues.every((strategyValue) => Boolean(findStrategy(strategyValue, service.value)))) {
      return false;
    }
  } else if (typeof meta.strategy !== 'string' || !findStrategy(meta.strategy, service.value)) {
    return false;
  }

  const configuredRoutes = strategyValues
    ? modelRoutesForDesktopMapping(service.value, strategyValues)
    : modelRoutesForProxyStrategy(meta.strategy, service.value);
  const configured = new Map(configuredRoutes.map((route) => [
    `${route.routeId}\0${route.upstreamModel}`,
    route,
  ]));
  return meta.routes.every((route) => {
    if (!hasOnlyRouteMetadataFields(route)) return false;
    const expected = configured.get(`${route.routeId}\0${route.upstreamModel}`);
    return Boolean(expected)
      && (route.labelOverride ?? null) === (expected.labelOverride ?? null)
      && (route.supports1m === undefined || route.supports1m === true)
      && (route.createdAt === undefined
        || typeof route.createdAt === 'string'
        || typeof route.createdAt === 'number');
  });
}

function isLegacyProxyMetadata(meta) {
  if (!isJsonObject(meta)
    || meta.schemaVersion !== CLAUDE_DESKTOP_LEGACY_META_SCHEMA_VERSION
    || meta.mode !== 'proxy'
    || !safeParseLoopbackUrl(meta.baseUrl)) {
    return false;
  }
  let service;
  try {
    service = requireServiceConfig(meta.service);
  } catch {
    return false;
  }
  if (Array.isArray(meta.strategies)) {
    return meta.strategies.length > 0
      && meta.strategies.every((strategyValue) => Boolean(findStrategy(strategyValue, service.value)));
  }
  return typeof meta.strategy === 'string' && Boolean(findStrategy(meta.strategy, service.value));
}

function validateMutableDesktopFiles(paths) {
  readJsonObjectForMutation(paths.normalConfigPath, 'Claude Desktop configuration');
  readJsonObjectForMutation(paths.threepConfigPath, 'Claude Desktop 3P configuration');
  readJsonObjectForMutation(paths.profilePath, 'Claude Desktop managed profile');
  readJsonObjectForMutation(paths.metaPath, 'Claude Desktop metadata');
}

function validateVerifiedRoutes(routes) {
  if (!Array.isArray(routes) || routes.length === 0) {
    throw desktopError('no_authorized_models', 'Claude Desktop requires at least one verified model route.');
  }
  const routeIds = new Map();
  return routes.map((route) => {
    if (!isJsonObject(route)
      || typeof route.routeId !== 'string'
      || !route.routeId
      || typeof route.upstreamModel !== 'string'
      || !route.upstreamModel) {
      throw desktopError('invalid_verified_routes', 'Claude Desktop received an invalid verified model route.');
    }
    if (route.createdAt !== undefined
      && typeof route.createdAt !== 'string'
      && typeof route.createdAt !== 'number') {
      throw desktopError('invalid_verified_routes', 'Claude Desktop received invalid created_at metadata.');
    }
    const previous = routeIds.get(route.routeId);
    if (previous && previous !== route.upstreamModel) {
      throw desktopError('route_collision', `Claude Desktop route ${route.routeId} maps to multiple upstream models.`);
    }
    if (previous) {
      throw desktopError('route_collision', `Claude Desktop route ${route.routeId} is duplicated.`);
    }
    routeIds.set(route.routeId, route.upstreamModel);
    return {
      ...(typeof route.role === 'string' ? { role: route.role } : {}),
      ...(typeof route.strategyValue === 'string' ? { strategyValue: route.strategyValue } : {}),
      routeId: route.routeId,
      upstreamModel: route.upstreamModel,
      ...(typeof route.labelOverride === 'string' && route.labelOverride
        ? { labelOverride: route.labelOverride }
        : {}),
      ...(route.supports1m === true ? { supports1m: true } : {}),
      ...(route.createdAt !== undefined ? { createdAt: route.createdAt } : {}),
    };
  });
}

function metadataRoute(route) {
  return {
    routeId: route.routeId,
    upstreamModel: route.upstreamModel,
    ...(route.labelOverride ? { labelOverride: route.labelOverride } : {}),
    ...(route.supports1m === true ? { supports1m: true } : {}),
    ...(route.createdAt !== undefined ? { createdAt: route.createdAt } : {}),
  };
}

function hasOnlyRouteMetadataFields(route) {
  if (!isJsonObject(route)) return false;
  const allowed = new Set(['routeId', 'upstreamModel', 'labelOverride', 'supports1m', 'createdAt']);
  return Object.keys(route).every((key) => allowed.has(key));
}

function profileMatchesRoutes(profile, routes) {
  if (!Array.isArray(profile.inferenceModels)) return false;
  const expected = routes.map((route) => {
    const object = {
      name: route.routeId,
      ...(route.labelOverride ? { labelOverride: route.labelOverride } : {}),
      ...(route.supports1m === true ? { supports1m: true } : {}),
    };
    return Object.keys(object).length === 1 ? route.routeId : object;
  });
  return JSON.stringify(profile.inferenceModels) === JSON.stringify(expected);
}

function normalizeModelMetadata(modelMetadata) {
  if (modelMetadata instanceof Map) return modelMetadata;
  if (Array.isArray(modelMetadata)) {
    return new Map(modelMetadata
      .filter((entry) => isJsonObject(entry) && typeof entry.id === 'string')
      .map((entry) => [entry.id, entry]));
  }
  if (isJsonObject(modelMetadata)) return new Map(Object.entries(modelMetadata));
  return new Map();
}

function explicitCreatedAt(metadata) {
  if (!isJsonObject(metadata)) return undefined;
  const raw = isJsonObject(metadata.raw) ? metadata.raw : null;
  const value = raw && Object.hasOwn(raw, 'created_at')
    ? raw.created_at
    : raw && Object.hasOwn(raw, 'createdAt')
      ? raw.createdAt
      : undefined;
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function safeParseLoopbackUrl(value) {
  try {
    return parseLoopbackUrl(value);
  } catch {
    return null;
  }
}

function isValidLocalGatewayToken(value, { allowLegacy = false } = {}) {
  if (allowLegacy && value === LEGACY_LOCAL_PROXY_GATEWAY_TOKEN) return true;
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

function isJsonObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function desktopError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
