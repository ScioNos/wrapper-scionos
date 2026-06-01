import os from 'node:os';
import path from 'node:path';

export function getCodexPaths(env = process.env) {
  const configDir = env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return {
    configDir,
    authPath: path.join(configDir, 'auth.json'),
    configPath: path.join(configDir, 'config.toml'),
  };
}

export function buildCodexThirdPartyConfig({ providerName = 'routerlab', baseUrl, model = 'gpt-5.5' }) {
  const q = (value) => JSON.stringify(value);
  return `model_provider = "custom"
model = ${q(model)}
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.custom]
name = ${q(providerName)}
base_url = ${q(baseUrl)}
wire_api = "responses"
requires_openai_auth = true`;
}

export function buildCodexAuth(apiKey = '') {
  return { OPENAI_API_KEY: apiKey };
}
