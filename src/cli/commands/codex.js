import {
  requireServiceConfig,
  resolveServiceBaseUrlWithSource,
  resolveServiceEnvToken,
  validateServiceBaseUrl,
} from '../../routerlab/services.js';
import { fetchModels, validateTokenFormat } from '../../routerlab/models.js';
import { resolveTokenWithSource } from '../../apps/claude-code.js';
import { CliUsageError } from '../args.js';
import {
  assertCodexCliAvailable,
  buildCodexConfigPreview,
  buildCodexRuntimeArgs,
  cleanupCodexRuntimeModelCatalog,
  codexModelDisplayName,
  codexModelsForService,
  defaultCodexModelForService,
  getCodexPaths,
  launchCodex,
  readCodexStatus,
  restoreCodexConfig,
  writeCodexRuntimeModelCatalog,
} from '../../apps/codex.js';
import { applyMenuControl, askSelect } from '../menu.js';
import { getServiceModelFamilies } from '../../routerlab/strategy-models.js';
import { findStrategy } from '../../routerlab/strategies.js';
import { print } from './output.js';
import { translate } from '../i18n.js';

const DEFAULT_CODEX_DEPENDENCIES = Object.freeze({
  assertCodexCliAvailable,
  cleanupCodexRuntimeModelCatalog,
  fetchModels,
  launchCodex,
  resolveTokenWithSource,
  selectFamily: askSelect,
  selectModel: askSelect,
  writeCodexRuntimeModelCatalog,
});

export async function launchCodexForService(options, dependencies = {}) {
  const deps = { ...DEFAULT_CODEX_DEPENDENCIES, ...dependencies };
  const forwarded = validateCodexForwardedArgs(options.forwarded ?? []);
  const codex = deps.assertCodexCliAvailable();
  const serviceConfig = requireServiceConfig(options.service);
  const baseResolution = resolveServiceBaseUrlWithSource(serviceConfig.value, process.env);
  const service = {
    ...serviceConfig,
    baseUrl: validateServiceBaseUrl(baseResolution.baseUrl, serviceConfig.value),
  };
  const envToken = resolveServiceEnvToken(service.value, process.env);
  const resolvedToken = options.token
    ? explicitCodexToken(options.token, envToken)
    : await deps.resolveTokenWithSource({
        serviceValue: service.value,
        noPrompt: options.noPrompt,
        preferStored: true,
      });
  warnStoredCodexTokenPrecedence(options, resolvedToken, service);

  let modelResult;
  try {
    modelResult = await deps.fetchModels(resolvedToken.token, {
      serviceValue: service.value,
      baseUrl: service.baseUrl,
      timeoutMs: 10000,
    });
  } catch (error) {
    throw codexModelDiscoveryError(
      { reason: 'network_error', message: error.message },
      service,
    );
  }
  if (!modelResult.valid) {
    if (modelResult.reason === 'auth_failed') {
      throw codexAuthenticationError(modelResult, service, resolvedToken);
    }
    throw codexModelDiscoveryError(modelResult, service);
  }

  const availableModels = availableCodexModels(service.value, modelResult.models);
  if (availableModels.length === 0) {
    throw codexModelDiscoveryError(
      { reason: 'models_unavailable', message: 'No allowed Codex model is currently available' },
      service,
    );
  }
  const availableFamilies = availableCodexModelFamilies(service.value, modelResult.models);
  if (!options.model && !options.noPrompt && !options.strategy && availableFamilies.length === 0) {
    throw codexModelDiscoveryError(
      { reason: 'models_unavailable', message: 'No Codex model family is currently available' },
      service,
    );
  }
  let selectedFamily = options.interactiveMenu
    ? null
    : await resolveCodexLaunchFamily({
        requestedFamily: options.strategy,
        availableFamilies,
        service,
        noPrompt: options.noPrompt || Boolean(options.model),
        language: options.language,
        selectFamily: deps.selectFamily,
      });
  let selectionModels;
  let model;
  while (true) {
    selectionModels = selectedFamily
      ? selectedFamily.models.map(({ model: familyModel }) => familyModel)
      : availableModels;
    try {
      model = await resolveCodexLaunchModel({
        requestedModel: options.model ?? (options.interactiveMenu
          ? defaultCodexModelForService(service.value)
          : null),
        availableModels: selectionModels,
        service,
        noPrompt: options.noPrompt || Boolean(options.interactiveMenu),
        language: options.language,
        selectModel: deps.selectModel,
      });
      break;
    } catch (error) {
      if (error?.name !== 'MenuBackError' || options.noPrompt || options.model || options.strategy || options.interactiveMenu || availableFamilies.length < 2) {
        throw error;
      }
      selectedFamily = await resolveCodexLaunchFamily({
        availableFamilies,
        service,
        language: options.language,
        selectFamily: deps.selectFamily,
      });
    }
  }
  const catalog = deps.writeCodexRuntimeModelCatalog({
    models: availableModels,
    modelMetadata: modelResult.modelMetadata ?? [],
  });
  try {
    const codexArgs = buildCodexRuntimeArgs({
      providerName: service.value,
      baseUrl: appendCodexApiPath(service.baseUrl),
      model,
      modelCatalogPath: catalog.path,
    });
    return await deps.launchCodex({
      apiKey: resolvedToken.token,
      codexArgs: [...codexArgs, ...forwarded],
      codex,
      updateProcessExitCode: options.updateProcessExitCode ?? true,
    });
  } finally {
    deps.cleanupCodexRuntimeModelCatalog(catalog);
  }
}

export async function handleCodex(action, options) {
  if (action === 'status') {
    print(readCodexStatus(), options);
    return;
  }
  if (action === 'restore') {
    print(restoreCodexConfig({ dryRun: !options.yes }), options);
    return;
  }
  if (action === 'launch') {
    return launchCodexForService(options);
  }

  const serviceConfig = requireServiceConfig(options.service);
  const service = {
    ...serviceConfig,
    baseUrl: validateServiceBaseUrl(
      resolveServiceBaseUrlWithSource(serviceConfig.value, process.env).baseUrl,
      serviceConfig.value,
    ),
  };
  const model = options.model ?? defaultCodexModelForService(service.value);
  const paths = getCodexPaths();
  const preview = buildCodexConfigPreview({
    providerName: service.value,
    baseUrl: appendCodexApiPath(service.baseUrl),
    model,
    paths,
  });
  print({ config: preview.config }, options);
}

export function availableCodexModels(serviceValue, discoveredModelIds = []) {
  const discovered = new Set(discoveredModelIds);
  return codexModelsForService(serviceValue).filter((model) => discovered.has(model));
}

export function availableCodexModelFamilies(serviceValue, discoveredModelIds = []) {
  const discovered = new Set(discoveredModelIds);
  return getServiceModelFamilies(serviceValue, { client: 'codex' })
    .map((family) => ({
      ...family,
      models: family.models.filter(({ model }) => (
        codexModelsForService(serviceValue).includes(model) && discovered.has(model)
      )),
    }))
    .filter((family) => family.models.length > 0);
}

export async function resolveCodexLaunchFamily({
  requestedFamily = null,
  availableFamilies = [],
  service,
  noPrompt = false,
  language = 'en',
  selectFamily = askSelect,
} = {}) {
  if (requestedFamily !== null && requestedFamily !== undefined) {
    const familyValue = findStrategy(requestedFamily, service.value)?.value ?? requestedFamily;
    const family = availableFamilies.find((entry) => entry.value === familyValue);
    if (!family) {
      throw new Error(`Codex model family "${requestedFamily}" is not available on ${service.label}.`);
    }
    return family;
  }
  if (noPrompt) return null;
  if (availableFamilies.length === 1) return availableFamilies[0];
  const selected = applyMenuControl(await selectFamily({
    message: translate(language, 'selectCodexFamily', { service: service.label }),
    language,
    helpMode: 'compact',
    choices: [
      ...availableFamilies.map((family, index) => ({
        key: String(index + 1),
        name: family.name,
        value: family.value,
        description: family.description,
      })),
      {
        key: '0',
        name: '← Back',
        value: 'back',
        description: 'Return to the previous menu.',
      },
    ],
  }), { allowBack: false });
  const family = availableFamilies.find((entry) => entry.value === selected);
  if (!family) throw new Error(`Unknown Codex model family "${selected}".`);
  return family;
}

const BLOCKED_CODEX_FORWARDED_OPTIONS = new Set([
  '-c',
  '--config',
  '-m',
  '--model',
  '--oss',
  '--local-provider',
  '-p',
  '--profile',
  '--remote',
  '--remote-auth-token-env',
]);

const BLOCKED_CODEX_ATTACHED_SHORT_OPTIONS = ['-c', '-m', '-p'];

export function validateCodexForwardedArgs(forwarded = []) {
  for (const argument of forwarded) {
    const value = String(argument);
    const option = value.match(/^(--[^=]+)=/)?.[1] ?? value;
    const attachedShortOption = BLOCKED_CODEX_ATTACHED_SHORT_OPTIONS.find(
      (candidate) => value.startsWith(candidate) && value.length > candidate.length,
    );
    if (BLOCKED_CODEX_FORWARDED_OPTIONS.has(option) || attachedShortOption) {
      const blocked = attachedShortOption ?? option;
      throw new CliUsageError(
        `${blocked} cannot be forwarded to Codex because RouterLab controls the model provider and model selection. Use the wrapper --model option before --.`,
      );
    }
  }
  return [...forwarded];
}

export async function resolveCodexLaunchModel({
  requestedModel = null,
  availableModels,
  service,
  noPrompt = false,
  language = 'en',
  selectModel = askSelect,
}) {
  if (requestedModel !== null && requestedModel !== undefined) {
    if (!availableModels.includes(requestedModel)) {
      throw codexModelUnavailableError(requestedModel, service, availableModels);
    }
    return requestedModel;
  }

  if (noPrompt) {
    const defaultModel = defaultCodexModelForService(service.value);
    if (!availableModels.includes(defaultModel)) {
      throw codexModelUnavailableError(defaultModel, service, availableModels);
    }
    return defaultModel;
  }

  if (availableModels.length === 1) {
    return availableModels[0];
  }
  return applyMenuControl(await selectModel({
    message: translate(language, 'selectCodexModel', { service: service.label }),
    language,
    helpMode: 'compact',
    choices: [
      ...availableModels.map((model, index) => ({
        key: String(index + 1),
        name: codexModelDisplayName(model),
        value: model,
        description: model,
      })),
      {
        key: '0',
        name: '← Back',
        value: 'back',
        description: 'Return to the previous menu.',
      },
    ],
  }), { allowBack: false });
}

export function explicitCodexToken(token, envToken) {
  const format = validateTokenFormat(token);
  if (!format.valid) throw new Error(format.message);
  return {
    token: token.trim(),
    source: 'option',
    envTokenPresent: Boolean(envToken.token),
    envTokenKey: envToken.envKey,
    storedTokenPresent: false,
  };
}

export function warnStoredCodexTokenPrecedence(options, resolvedToken, service) {
  if (options.noPrompt || resolvedToken.source !== 'secure-storage' || !resolvedToken.envTokenPresent) {
    return;
  }
  console.error('WARN Using stored ' + service.label + ' token for Codex; ' + resolvedToken.envTokenKey + ' is set but ignored. Pass --token to override.');
}

export function describeCodexTokenSource(resolvedToken) {
  if (resolvedToken.source === 'option') return '--token';
  if (resolvedToken.source === 'secure-storage') return 'secure storage';
  if (resolvedToken.source === 'prompt') return 'the interactive prompt';
  if (resolvedToken.source === 'env' || resolvedToken.source === 'legacy-env') {
    return resolvedToken.envTokenKey ? `environment variable ${resolvedToken.envTokenKey}` : 'the environment';
  }
  return 'the configured token source';
}

export function codexAuthenticationError(validation, service, resolvedToken) {
  const status = validation.status ?? 401;
  const serviceFlag = `--service ${service.value}`;
  const error = new Error([
    `${service.label} rejected the Codex token from ${describeCodexTokenSource(resolvedToken)} with HTTP ${status}.`,
    `Check it with "wrapper-scionos auth status ${serviceFlag}" and "wrapper-scionos auth test ${serviceFlag}",`,
    `then replace it with "wrapper-scionos auth login ${serviceFlag}" or pass --token.`,
  ].join(' '));
  error.code = 'auth_failed';
  error.statusCode = status;
  return error;
}

export function codexModelUnavailableError(model, service, availableModels) {
  const available = availableModels.length > 0 ? availableModels.join(', ') : 'none';
  const error = new Error(
    `Codex model "${model}" is not available on ${service.label}. Available Codex models: ${available}.`,
  );
  error.code = 'model_unavailable';
  return error;
}

export function codexModelDiscoveryError(validation, service) {
  const detail = validation.message
    ?? (validation.status ? `HTTP ${validation.status}${validation.statusText ? ` ${validation.statusText}` : ''}` : null)
    ?? validation.reason
    ?? 'unknown error';
  const error = new Error(
    `Cannot discover available Codex models on ${service.label}: ${detail}. Codex was not launched.`,
  );
  error.code = validation.reason ?? 'model_discovery_failed';
  if (validation.status) error.statusCode = validation.status;
  return error;
}

export function appendCodexApiPath(baseUrl) {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/+$/, '');
  url.pathname = basePath.endsWith('/v1') ? basePath : `${basePath}/v1`;
  return url.href.replace(/\/$/, '');
}
