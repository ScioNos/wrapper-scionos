import { requireServiceConfig, resolveServiceBaseUrl, resolveServiceEnvToken } from '../../routerlab/services.js';
import { fetchModels } from '../../routerlab/models.js';
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
  assertCodexCliAvailable();
  let proxy = null;
  let catalog = null;
  try {
    const serviceConfig = requireServiceConfig(options.service);
    const service = { ...serviceConfig, baseUrl: resolveServiceBaseUrl(serviceConfig.value, process.env) };
    const model = options.model ?? defaultCodexModelForService(service.value);
    const envToken = resolveServiceEnvToken(service.value, process.env);
    const resolvedToken = options.token
      ? { token: options.token, source: 'option', envTokenPresent: Boolean(envToken.token), envTokenKey: envToken.envKey, storedTokenPresent: false }
      : await resolveTokenWithSource({ serviceValue: service.value, noPrompt: options.noPrompt, preferStored: true });
    if (!options.noPrompt && resolvedToken.source === 'secure-storage' && resolvedToken.envTokenPresent) {
      console.error('WARN Using stored ' + service.label + ' token for Codex; ' + resolvedToken.envTokenKey + ' is set but ignored. Pass --token to override.');
    }
    const modelResult = await fetchModels(resolvedToken.token, {
      serviceValue: service.value,
      baseUrl: service.baseUrl,
      timeoutMs: 10000,
    });
    const modelMetadata = modelResult.valid ? modelResult.modelMetadata : [];
    if (!modelResult.valid && !options.noPrompt) {
      console.error('WARN Model metadata unavailable; using the conservative local Codex catalog.');
    }

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

    catalog = writeCodexRuntimeModelCatalog({ serviceValue: service.value, modelMetadata });
    const codexArgs = buildCodexRuntimeArgs({
      providerName: service.value,
      baseUrl: baseUrl + '/v1',
      model,
      modelCatalogPath: catalog?.path ?? null,
    });
    await launchCodex({ apiKey, codexArgs: [...codexArgs, ...(options.forwarded ?? [])] });
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
    await launchCodexForService(options);
    return;
  }

  const serviceConfig = requireServiceConfig(options.service);
  const service = { ...serviceConfig, baseUrl: resolveServiceBaseUrl(serviceConfig.value, process.env) };
  const model = options.model ?? defaultCodexModelForService(service.value);
  const paths = getCodexPaths();
  const preview = buildCodexConfigPreview({
    providerName: service.value,
    serviceValue: service.value,
    baseUrl: service.baseUrl + '/v1',
    model,
    paths,
    modelCatalogModels: codexModelsForService(service.value),
  });
  print({ paths, auth: buildCodexAuth(''), config: preview.config, catalog: preview.catalog }, options);
}
