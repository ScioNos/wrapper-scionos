import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const CLIENTS = Object.freeze(['claude-code', 'codex', 'opencode', 'codex-app']);
export const preferencesPath = () => path.join(os.homedir(), '.wrapper-scionos', 'ui-state.json');
const identifier = (value) => typeof value === 'string' && value.length <= 256 && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(value);

export function sanitizeSelection(value) {
  if (!value || !identifier(value.family)) return null;
  const selection = { family: value.family };
  for (const key of ['model', 'subagent']) if (identifier(value[key])) selection[key] = value[key];
  return selection;
}

export function normalizePreferences(raw) {
  const result = { version: 1, services: {} };
  if (raw?.version !== 1) return result;
  for (const service of ['routerlab', 'llm']) {
    const saved = raw.services?.[service];
    if (!saved || typeof saved !== 'object') continue;
    const clients = {};
    for (const client of CLIENTS) {
      const selection = sanitizeSelection(saved.clients?.[client]);
      if (selection) clients[client] = selection;
    }
    result.services[service] = { clients,
      ...(CLIENTS.includes(saved.lastClient) && clients[saved.lastClient] ? { lastClient: saved.lastClient } : {}),
    };
  }
  return result;
}

export function loadPreferences(file = preferencesPath(), fileSystem = fs) {
  try {
    const raw = JSON.parse(fileSystem.readFileSync(file, 'utf8'));
    return { value: normalizePreferences(raw), warning: raw?.version === 1 ? null : 'preferencesInvalid' };
  } catch (error) {
    return { value: normalizePreferences(null), warning: error.code === 'ENOENT' ? null : 'preferencesInvalid' };
  }
}

export function rememberSelection(preferences, service, client, selection) {
  const value = normalizePreferences(preferences);
  const clean = sanitizeSelection(selection);
  if (!['routerlab', 'llm'].includes(service) || !CLIENTS.includes(client) || !clean) return value;
  const previous = value.services[service]?.clients ?? {};
  value.services[service] = { lastClient: client, clients: { ...previous, [client]: clean } };
  return value;
}

export function savePreferences(value, file = preferencesPath(), fileSystem = fs) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    fileSystem.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fileSystem.writeFileSync(temporary, JSON.stringify(normalizePreferences(value), null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
    fileSystem.renameSync(temporary, file);
    return { ok: true };
  } catch {
    try { fileSystem.unlinkSync(temporary); } catch { /* The write may not have created a file. */ }
    return { ok: false, warning: 'preferencesWriteFailed' };
  }
}
