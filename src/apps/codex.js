import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

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

export function applyCodexConfig({
  providerName = 'routerlab',
  baseUrl,
  model = 'gpt-5.5',
  paths = getCodexPaths(),
  dryRun = true,
} = {}) {
  const config = buildCodexThirdPartyConfig({ providerName, baseUrl, model });
  const previousConfig = readText(paths.configPath);
  const changed = previousConfig !== config;

  if (dryRun) {
    return {
      dryRun: true,
      changed,
      paths,
      config,
      authPreserved: true,
    };
  }

  fs.mkdirSync(path.dirname(paths.configPath), { recursive: true });
  writeTextAtomic(paths.configPath, `${config}\n`);

  return {
    dryRun: false,
    changed,
    paths,
    authPreserved: true,
  };
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trimEnd();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function writeTextAtomic(filePath, value) {
  const tmp = `${filePath}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, value, 'utf8');
  fs.renameSync(tmp, filePath);
}
