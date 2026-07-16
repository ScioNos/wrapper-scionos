import {
  requireServiceConfig,
  resolveServiceBaseUrlWithSource,
  resolveServiceEnvToken,
  validateServiceBaseUrl,
} from '../../routerlab/services.js';
import { fetchModels, validateTokenFormat } from '../../routerlab/models.js';
import { resolveTokenWithSource } from '../../apps/claude-code.js';
import { startLongRunningLlmProxy, stopLongRunningLlmProxy } from '../../platform/llm-proxy.js';
import {
  assertCodexCliAvailable,
  buildCodexAuth,
  buildCodexConfigPreview,
  buildCodexRuntimeArgs,
  cleanupCodexRuntimeModelCatalog,
  codexModelsForService,
  defaultCodexModelForService,
  getCodexPaths,
  launchCodex,
  readCodexStatus,
  restoreCodexConfig,
  writeCodexRuntimeModelCatalog,
} from '../../apps/codex.js';
import { print } from './output.js';

export async function launchCodexForService(options) {
  const codex = assertCodexCliAvailable();
  let proxy = null;
  let catalog = null;
  try {
    const serviceConfig = requireServiceConfig(options.service);
    const baseResolution = resolveServiceBaseUrlWithSource(serviceConfig.value, process.env);
    const service = {
      ...serviceConfig,
      baseUrl: validateServiceBaseUrl(baseResolution.baseUrl, serviceConfig.value),
    };
    warnCodexBaseUrlOverride(service, baseResolution);
    const model = options.model ?? defaultCodexModelForService(service.value);
    const envToken = resolveServiceEnvToken(service.value, process.env);
    const resolvedToken = options.token
      ? explicitCodexToken(options.token, envToken)
      : await resolveTokenWithSource({ serviceValue: service.value, noPrompt: options.noPrompt, preferStored: true });
    warnStoredCodexTokenPrecedence(options, resolvedToken, service);
    const modelResult = await fetchModels(resolvedToken.token, {
      serviceValue: service.value,
      baseUrl: service.baseUrl,
      timeoutMs: 10000,
    });
    if (!modelResult.valid && modelResult.reason === 'auth_failed') {
      throw codexAuthenticationError(modelResult, service, resolvedToken);
    }
    const supportedModels = codexModelsForService(service.value);
    const availableModels = modelResult.valid
      ? supportedModels.filter((candidate) => modelResult.models.includes(candidate))
      : supportedModels;
    if (modelResult.valid && !availableModels.includes(model)) {
      throw codexModelUnavailableError(model, service, availableModels);
    }
    if (!modelResult.valid) warnCodexModelFallback(modelResult);
    const modelMetadata = modelResult.valid ? modelResult.modelMetadata : [];

    let baseUrl = service.baseUrl;
    let apiKey = resolvedToken.token;
    if (options.transport !== 'direct') {
      proxy = await startLongRunningLlmProxy({
        targetBaseUrl: service.baseUrl,
        routerlabToken: resolvedToken.token,
        upstreamAuth: 'openai',
        codexServiceValue: service.value,
      });
      baseUrl = proxy.baseUrl;
      apiKey = proxy.gatewayToken;
    }

    catalog = writeCodexRuntimeModelCatalog({
      serviceValue: service.value,
      modelMetadata,
      models: availableModels,
    });
    const codexArgs = buildCodexRuntimeArgs({
      providerName: service.value,
      baseUrl: appendCodexApiPath(baseUrl),
      model,
      modelCatalogPath: catalog?.path ?? null,
    });
    return await launchCodex({
      apiKey,
      codexArgs: [...codexArgs, ...(options.forwarded ?? [])],
      codex,
      updateProcessExitCode: options.updateProcessExitCode ?? true,
    });
  } finally {
    try {
      cleanupCodexRuntimeModelCatalog(catalog);
    } finally {
      await stopLongRunningLlmProxy(proxy);
    }
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
    serviceValue: service.value,
    baseUrl: appendCodexApiPath(service.baseUrl),
    model,
    paths,
    modelCatalogModels: codexModelsForService(service.value),
  });
  print({ paths, auth: buildCodexAuth(''), config: preview.config, catalog: preview.catalog }, options);
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

export function warnCodexBaseUrlOverride(service, resolution) {
  if (resolution.source !== 'env' && resolution.source !== 'legacy-env') return;
  const legacy = resolution.source === 'legacy-env' ? 'deprecated ' : '';
  console.error(`WARN Codex is using ${legacy}${resolution.envKey} for the ${service.label} endpoint: ${resolution.baseUrl}`);
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

export function warnCodexModelFallback(modelResult) {
  const detail = modelResult.message ? `: ${modelResult.message}` : '';
  console.error(
    `WARN Model metadata unavailable (${modelResult.reason ?? 'unknown'}${detail}); using the conservative local Codex catalog.`,
  );
}

export function appendCodexApiPath(baseUrl) {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/+$/, '');
  url.pathname = basePath.endsWith('/v1') ? basePath : `${basePath}/v1`;
  return url.href.replace(/\/$/, '');
}
