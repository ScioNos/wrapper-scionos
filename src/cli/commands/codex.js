import { requireServiceConfig } from '../../routerlab/services.js';
import { resolveToken } from '../../apps/claude-code.js';
import {
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
  const service = requireServiceConfig(options.service);
  const model = options.model ?? defaultCodexModelForService(service.value);
  const token = options.token ?? await resolveToken({ serviceValue: service.value, noPrompt: options.noPrompt });
  const catalog = writeCodexRuntimeModelCatalog({ serviceValue: service.value });
  const codexArgs = buildCodexRuntimeArgs({
    providerName: service.value,
    baseUrl: `${service.baseUrl}/v1`,
    model,
    modelCatalogPath: catalog?.path ?? null,
  });
  try {
    await launchCodex({ apiKey: token, codexArgs: [...codexArgs, ...options.passthrough.slice(1)] });
  } finally {
    cleanupCodexRuntimeModelCatalog(catalog);
  }
}

export async function handleCodex(action, options) {
  if (action === 'apply') {
    throw new Error('codex apply was removed because persistent Codex config rewrites are too risky. Use "codex launch" instead; use "codex restore" only to undo an existing wrapper config.');
  }
  if (action !== 'launch' && action !== 'template' && action !== 'restore' && action !== 'status') {
    throw new Error(`Unknown codex action "${action}".`);
  }

  const service = requireServiceConfig(options.service);
  const model = options.model ?? defaultCodexModelForService(service.value);
  if (action === 'status') {
    print(readCodexStatus(), options);
    return;
  }
  if (action === 'launch') {
    await launchCodexForService(options);
    return;
  }
  if (action === 'restore') {
    print(restoreCodexConfig({ dryRun: !options.yes }), options);
    return;
  }

  const paths = getCodexPaths();
  const preview = buildCodexConfigPreview({
    providerName: service.value,
    baseUrl: `${service.baseUrl}/v1`,
    model,
    paths,
    modelCatalogModels: codexModelsForService(service.value),
  });

  print({
    paths,
    auth: buildCodexAuth(''),
    config: preview.config,
    catalog: preview.catalog,
  }, options);
}
