import { DEFAULT_ANTHROPIC_VERSION, resolveServiceBaseUrl } from './services.js';

function firstFiniteNumber(...values) {
  return values.find((value) => Number.isFinite(value) && value > 0);
}

function normalizeModalities(entry = {}) {
  const raw = entry.input_modalities ?? entry.modalities?.input ?? entry.modalities;
  if (!Array.isArray(raw)) {
    return { values: ['text'], verified: false };
  }
  const values = raw.map((value) => String(value).toLowerCase()).filter(Boolean);
  return values.length > 0
    ? { values: [...new Set(values)], verified: true }
    : { values: ['text'], verified: false };
}

function explicitBoolean(entry, ...keys) {
  for (const key of keys) {
    const value = key.split('.').reduce((current, segment) => current?.[segment], entry);
    if (typeof value === 'boolean') {
      return { value, verified: true };
    }
  }
  return { value: false, verified: false };
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function normalizeReasoningLevels(entry = {}) {
  const raw = entry.supported_reasoning_levels
    ?? entry.reasoning_levels
    ?? entry.capabilities?.reasoning_levels;
  if (!Array.isArray(raw)) {
    return { values: null, verified: false };
  }

  const values = raw.map((level) => {
    if (typeof level === 'string') {
      const effort = level.trim();
      return effort ? { effort, description: effort } : null;
    }
    const effort = firstNonEmptyString(level?.effort, level?.level, level?.name, level?.id);
    if (!effort) {
      return null;
    }
    return { effort, description: firstNonEmptyString(level?.description, level?.label) ?? effort };
  }).filter(Boolean);

  return values.length > 0 ? { values, verified: true } : { values: null, verified: false };
}

function normalizeModelEntry(entry) {
  const source = typeof entry === 'string' ? { id: entry } : entry ?? {};
  const id = source.id ?? source.name;
  if (!id) {
    return null;
  }

  const contextWindow = firstFiniteNumber(
    source.context_window,
    source.context_length,
    source.max_context_tokens,
    source.max_input_tokens,
    source.limits?.context_window,
  );
  const inputModalities = normalizeModalities(source);
  const supportsReasoning = explicitBoolean(source, 'supports_reasoning', 'capabilities.reasoning');
  const supportsParallelToolCalls = explicitBoolean(
    source,
    'supports_parallel_tool_calls',
    'capabilities.parallel_tool_calls',
  );
  const supportsFunctionTools = explicitBoolean(
    source,
    'supports_function_tools',
    'capabilities.function_tools',
    'capabilities.tools',
  );
  const supportsFreeformTools = explicitBoolean(
    source,
    'supports_freeform_tools',
    'capabilities.freeform_tools',
  );
  const supportsHostedTools = explicitBoolean(
    source,
    'supports_hosted_tools',
    'capabilities.hosted_tools',
  );
  const supportsSearch = explicitBoolean(source, 'supports_search', 'capabilities.search');
  const reasoningLevels = normalizeReasoningLevels(source);
  const defaultReasoningLevel = firstNonEmptyString(
    source.default_reasoning_level,
    source.default_reasoning_effort,
    source.reasoning?.default_level,
  );
  const displayName = firstNonEmptyString(source.display_name, source.displayName, source.label);
  const description = firstNonEmptyString(source.description, source.summary);
  const baseInstructions = firstNonEmptyString(source.base_instructions, source.baseInstructions);

  return {
    id: String(id),
    displayName,
    description,
    baseInstructions,
    baseInstructionsVerified: baseInstructions !== null,
    defaultReasoningLevel,
    defaultReasoningLevelVerified: defaultReasoningLevel !== null,
    supportedReasoningLevels: reasoningLevels.values,
    supportedReasoningLevelsVerified: reasoningLevels.verified,
    contextWindow: contextWindow ?? 128000,
    contextWindowVerified: contextWindow !== undefined,
    inputModalities: inputModalities.values,
    inputModalitiesVerified: inputModalities.verified,
    supportsReasoning: supportsReasoning.value,
    supportsReasoningVerified: supportsReasoning.verified,
    supportsParallelToolCalls: supportsParallelToolCalls.value,
    supportsParallelToolCallsVerified: supportsParallelToolCalls.verified,
    supportsFunctionTools: supportsFunctionTools.value,
    supportsFunctionToolsVerified: supportsFunctionTools.verified,
    supportsFreeformTools: supportsFreeformTools.value,
    supportsFreeformToolsVerified: supportsFreeformTools.verified,
    supportsHostedTools: supportsHostedTools.value,
    supportsHostedToolsVerified: supportsHostedTools.verified,
    supportsSearch: supportsSearch.value,
    supportsSearchVerified: supportsSearch.verified,
    raw: source,
  };
}

export function extractModelMetadata(payload) {
  if (!payload) {
    return [];
  }

  const entries = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.models)
        ? payload.models
        : [];

  return entries.map(normalizeModelEntry).filter(Boolean);
}

export function extractModelIds(payload) {
  return extractModelMetadata(payload).map((model) => model.id);
}

export async function fetchModels(apiKey, options = {}) {
  const {
    serviceValue,
    baseUrl = resolveServiceBaseUrl(serviceValue),
    anthropicVersion = DEFAULT_ANTHROPIC_VERSION,
    timeoutMs = 30000,
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');

  try {
    const response = await fetch(`${normalizedBaseUrl}/v1/models`, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': anthropicVersion,
      },
      signal: controller.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      return {
        valid: false,
        reason: 'redirect_not_allowed',
        status: response.status,
        message: 'Model discovery redirects are not allowed',
      };
    }

    if (response.ok) {
      let payload;
      try {
        payload = await response.json();
      } catch {
        return { valid: false, reason: 'invalid_response', message: 'Model list response is not valid JSON' };
      }

      const modelMetadata = extractModelMetadata(payload);
      const models = modelMetadata.map((model) => model.id);
      if (models.length === 0) {
        return {
          valid: false,
          reason: 'models_unavailable',
          message: 'Model list response did not include any model ids',
          models,
          modelMetadata,
        };
      }
      return { valid: true, models, modelMetadata, modelsVerified: true };
    }

    if (response.status === 401 || response.status === 403) {
      return { valid: false, reason: 'auth_failed', status: response.status };
    }

    return {
      valid: false,
      reason: 'server_error',
      status: response.status,
      statusText: response.statusText,
      message: `Server responded with ${response.status} ${response.statusText}`.trim(),
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { valid: false, reason: 'timeout', message: `Request timed out after ${Math.round(timeoutMs / 1000)}s` };
    }
    return { valid: false, reason: 'network_error', message: error.message };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function validateTokenFormat(apiKey) {
  const token = apiKey?.trim() ?? '';
  if (!token) {
    return { valid: false, reason: 'missing', message: 'Token is required.' };
  }
  if (token.length < 20) {
    return { valid: false, reason: 'too_short', message: 'Token seems invalid (too short).' };
  }
  return { valid: true };
}
