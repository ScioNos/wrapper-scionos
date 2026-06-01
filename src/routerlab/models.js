import { DEFAULT_ANTHROPIC_VERSION, resolveServiceBaseUrl } from './services.js';

export function extractModelIds(payload) {
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload)) {
    return payload.map((entry) => entry?.id ?? entry?.name ?? entry).filter(Boolean);
  }
  if (Array.isArray(payload.data)) {
    return payload.data.map((entry) => entry?.id ?? entry?.name ?? entry).filter(Boolean);
  }
  if (Array.isArray(payload.models)) {
    return payload.models.map((entry) => entry?.id ?? entry?.name ?? entry).filter(Boolean);
  }
  return [];
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

  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': anthropicVersion,
      },
      signal: controller.signal,
    });

    if (response.ok) {
      let payload;
      try {
        payload = await response.json();
      } catch {
        return { valid: false, reason: 'invalid_response', message: 'Model list response is not valid JSON' };
      }

      const models = extractModelIds(payload);
      if (models.length === 0) {
        return { valid: false, reason: 'models_unavailable', message: 'Model list response did not include any model ids', models };
      }
      return { valid: true, models, modelsVerified: true };
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
