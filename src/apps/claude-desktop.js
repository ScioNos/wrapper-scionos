import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { requireServiceConfig } from '../routerlab/services.js';
import { findStrategy, getStrategyEnvironment } from '../routerlab/strategies.js';

export const CLAUDE_DESKTOP_PROFILE_ID = '00000000-0000-4000-8000-000000157210';
export const CLAUDE_DESKTOP_PROFILE_NAME = 'ScioNos Wrapper';

const CONFIG_FILE = 'claude_desktop_config.json';
const CONFIG_LIBRARY_DIR = 'configLibrary';
const STRATEGY_MODEL_KEYS = [
  ['haiku', 'ANTHROPIC_DEFAULT_HAIKU_MODEL'],
  ['sonnet', 'ANTHROPIC_DEFAULT_SONNET_MODEL'],
  ['opus', 'ANTHROPIC_DEFAULT_OPUS_MODEL'],
];
const DESKTOP_ROUTE_PREFIX_BY_ROLE = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-8',
};
const DESKTOP_MODEL_OVERRIDES = {
  'claude-haiku-4-5-20251001': {
    routeId: 'claude-haiku-4-5',
    labelOverride: 'claude-haiku-4-5',
  },
  'claude-sonnet-4-6': {
    routeId: 'claude-sonnet-4-6',
    labelOverride: 'claude-sonnet-4-6',
  },
  'claude-opus-4-7': {
    routeId: 'claude-opus-4-8',
    labelOverride: 'claude-opus-4-8',
  },
  'aws-claude-haiku-4-5-20251001': {
    routeId: 'aws-claude-haiku-4-5',
    labelOverride: 'aws-claude-haiku-4-5',
  },
  'aws-claude-sonnet-4-6': {
    routeId: 'aws-claude-sonnet-4-6',
    labelOverride: 'aws-claude-sonnet-4-6',
  },
  'aws-claude-opus-4-8': {
    routeId: 'aws-claude-opus-4-8',
    labelOverride: 'aws-claude-opus-4-8',
  },
  'claude-gpt-5.5': {
    routeId: 'claude-5.5',
    labelOverride: 'gpt-5.5',
  },
  'claude-gpt-5.4': {
    routeId: 'claude-5.4',
    labelOverride: 'gpt-5.4',
  },
  'claude-gpt-5.4-mini': {
    routeId: 'claude-5.4-mini',
    labelOverride: 'gpt-5.4-mini',
  },
  'claude-gpt-5.5-sp': {
    routeId: 'claude-5.5-sp',
    labelOverride: 'gpt-5.5-sp',
  },
  'claude-gpt-5.4-mini-sp': {
    routeId: 'claude-5.4-mini-sp',
    labelOverride: 'gpt-5.4-mini-sp',
  },
  'claude-kimi-k2.6': {
    routeId: 'claude-kim2.6',
    labelOverride: 'Kimi K2.6',
  },
  'claude-glm-5.1': {
    routeId: 'claude-lm5.1',
    labelOverride: 'glm-5.1',
  },
};
const MODELS_WITHOUT_ONE_M_CONTEXT = new Set([
  'claude-haiku-4-5-20251001',
  'aws-claude-haiku-4-5-20251001',
  'claude-gpt-5.4-mini',
  'claude-gpt-5.4-mini-sp',
  'claude-kimi-k2.6',
  'claude-glm-5.1',
]);
const DESKTOP_MODEL_ORDER = [
  'claude-opus-4-8',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'aws-claude-opus-4-8',
  'aws-claude-sonnet-4-6',
  'aws-claude-haiku-4-5',
  'claude-5.5',
  'claude-5.4',
  'claude-5.4-mini',
  'claude-5.5-sp',
  'claude-5.4-mini-sp',
  'claude-kim2.6',
  'claude-lm5.1',
];
export const DESKTOP_MAPPING_STRATEGIES = {
  routerlab: [
    'default',
    'aws',
    'claude-gpt',
    'claude-kimi-k2.6',
    'glm-5.1',
  ],
  llm: [
    'claude',
    'claude-gpt',
    'claude-gpt-special',
    'glm-5.1',
  ],
};

export function isClaudeDesktopSupportedPlatform(platform = process.platform) {
  return platform === 'win32' || platform === 'darwin';
}

export function getClaudeDesktopPaths(env = process.env, platform = process.platform) {
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return pathsFromBaseDirs(path.join(localAppData, 'Claude'), path.join(localAppData, 'Claude-3p'));
  }

  if (platform === 'darwin') {
    return pathsFromBaseDirs(
      path.join(os.homedir(), 'Library', 'Application Support', 'Claude'),
      path.join(os.homedir(), 'Library', 'Application Support', 'Claude-3p'),
    );
  }

  throw new Error('Claude Desktop 3P configuration is currently supported only on Windows and macOS.');
}

function pathsFromBaseDirs(normalDir, threepDir) {
  const configLibraryPath = path.join(threepDir, CONFIG_LIBRARY_DIR);
  return {
    normalConfigPath: path.join(normalDir, CONFIG_FILE),
    threepConfigPath: path.join(threepDir, CONFIG_FILE),
    configLibraryPath,
    profilePath: path.join(configLibraryPath, `${CLAUDE_DESKTOP_PROFILE_ID}.json`),
    metaPath: path.join(configLibraryPath, '_meta.json'),
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
  const models = strategyModels(strategyValue, serviceValue);
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
  return strategyModels(strategyValue, serviceValue).map((entry) => ({
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
    return strategyModels(strategyValue, service.value).map((entry) => ({
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

export function supportsOneMillionContext(model) {
  const normalized = model.trim().toLowerCase();
  return !MODELS_WITHOUT_ONE_M_CONTEXT.has(normalized);
}

export function desktopRouteIdForStrategyModel(role, upstreamModel, suffix = null) {
  const override = DESKTOP_MODEL_OVERRIDES[upstreamModel];
  if (override) {
    return override.routeId;
  }

  const prefix = DESKTOP_ROUTE_PREFIX_BY_ROLE[role] ?? DESKTOP_ROUTE_PREFIX_BY_ROLE.sonnet;
  return suffix ? `${prefix}-${suffix}` : prefix;
}

function desktopLabelForStrategyModel(upstreamModel) {
  return DESKTOP_MODEL_OVERRIDES[upstreamModel]?.labelOverride ?? upstreamModel;
}

function desktopLabelForDesktopMapping(strategyLabel, upstreamModel) {
  const override = DESKTOP_MODEL_OVERRIDES[upstreamModel];
  if (override) {
    return override.labelOverride;
  }
  return `${strategyLabel} - ${upstreamModel}`;
}

function strategyModels(strategyValue, serviceValue) {
  const env = getStrategyEnvironment(strategyValue, serviceValue);
  const seen = new Set();
  const models = [];

  if (Object.keys(env).length === 0 && strategyValue === 'default') {
    return [
      { role: 'opus', model: 'claude-opus-4-7' },
      { role: 'sonnet', model: 'claude-sonnet-4-6' },
      { role: 'haiku', model: 'claude-haiku-4-5-20251001' },
    ];
  }

  for (const [role, key] of STRATEGY_MODEL_KEYS) {
    const model = env[key]?.trim();
    if (model && !seen.has(model)) {
      seen.add(model);
      models.push({ role, model });
    }
  }

  return models;
}

function sortDesktopRoutes(routes) {
  const order = new Map(DESKTOP_MODEL_ORDER.map((routeId, index) => [routeId, index]));
  return [...routes].sort((left, right) => (
    (order.get(left.routeId) ?? Number.MAX_SAFE_INTEGER)
      - (order.get(right.routeId) ?? Number.MAX_SAFE_INTEGER)
  ));
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
    profile: readJson(paths.profilePath),
  };
}

export function applyDirectClaudeDesktop({ serviceValue, strategyValue = 'default', token, dryRun = true }) {
  const service = requireServiceConfig(serviceValue);
  const paths = getClaudeDesktopPaths();
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
    writeMeta(paths.metaPath, CLAUDE_DESKTOP_PROFILE_ID);
  });

  return { dryRun: false, paths, profile };
}

export function applyProxyClaudeDesktop({
  serviceValue,
  strategyValue,
  strategyValues = null,
  host = '127.0.0.1',
  port = 15721,
  gatewayToken = 'scionos-local',
  dryRun = true,
}) {
  requireServiceConfig(serviceValue);
  const paths = getClaudeDesktopPaths();
  const routes = strategyValues
    ? modelRoutesForDesktopMapping(serviceValue, strategyValues)
    : modelRoutesForProxyStrategy(strategyValue, serviceValue);
  const profile = buildGatewayProfile({
    baseUrl: `http://${host}:${port}`,
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
    writeMeta(paths.metaPath, CLAUDE_DESKTOP_PROFILE_ID);
  });

  return { dryRun: false, paths, profile, routes };
}

export function restoreOfficialClaudeDesktop({ dryRun = true } = {}) {
  const paths = getClaudeDesktopPaths();
  if (dryRun) {
    return { dryRun: true, paths };
  }

  withRollback(paths, () => {
    writeDeploymentMode(paths.normalConfigPath, '1p');
    writeDeploymentMode(paths.threepConfigPath, '1p');
    if (fs.existsSync(paths.profilePath)) {
      fs.unlinkSync(paths.profilePath);
    }
    writeMeta(paths.metaPath, null);
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
  }));

  try {
    operation();
  } catch (error) {
    for (const snapshot of snapshots) {
      if (snapshot.content) {
        fs.mkdirSync(path.dirname(snapshot.path), { recursive: true });
        fs.writeFileSync(snapshot.path, snapshot.content);
      } else if (fs.existsSync(snapshot.path)) {
        fs.unlinkSync(snapshot.path);
      }
    }
    throw error;
  }
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function writeDeploymentMode(filePath, mode) {
  const value = readJson(filePath) ?? {};
  value.deploymentMode = mode;
  writeJson(filePath, value);
}

function writeMeta(filePath, appliedProfileId) {
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

  value.entries = entries;
  writeJson(filePath, value);
}
