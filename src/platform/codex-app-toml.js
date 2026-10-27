import { parseTOML, getStaticTOMLValue } from 'toml-eslint-parser';

export const CODEX_APP_KEYS = Object.freeze(['model', 'model_provider', 'model_catalog_json']);
export function appConfigError(code, message) { return Object.assign(new Error(message), { code }); }

export function parseAppConfig(text) {
  try {
    const ast = parseTOML(text.replace(/^\uFEFF/, ' '), { tomlVersion: '1.0.0' });
    const nodes = ast.body[0].body;
    const roots = new Map(nodes.filter(node => node.type === 'TOMLKeyValue' && node.key.keys.length === 1)
      .map(node => [node.key.keys[0].name ?? node.key.keys[0].value, node]));
    return { ast, nodes, roots, value: getStaticTOMLValue(ast) };
  } catch { throw appConfigError('config_invalid', 'Codex config.toml is not valid TOML 1.0; no changes were made.'); }
}

function edit(text, changes) {
  return changes.sort((a, b) => b.start - a.start).reduce((result, change) =>
    result.slice(0, change.start) + change.text + result.slice(change.end), text);
}

function rootSnapshot(text, document) {
  return Object.fromEntries(CODEX_APP_KEYS.map(key => {
    const node = document.roots.get(key);
    return [key, node ? { present: true, raw: text.slice(...node.value.range) } : { present: false }];
  }));
}

export function planAppConfig(text, { id, providerId, model, cataloguePath, baseUrl, nodePath, helperPath, service }) {
  const document = parseAppConfig(text);
  if (!/^scionos_(routerlab|llm)$/.test(providerId) || !/^[a-f0-9-]{36}$/.test(id)) {
    throw appConfigError('config_invalid', 'Invalid ScioNos configuration identity.');
  }
  if (Object.hasOwn(document.value.model_providers ?? {}, providerId)) {
    throw appConfigError('provider_conflict', `The provider ${providerId} already exists and is not owned by this session.`);
  }
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const before = rootSnapshot(text, document);
  const values = { model, model_provider: providerId, model_catalog_json: cataloguePath };
  const changes = [];
  const missing = [];
  for (const key of CODEX_APP_KEYS) {
    const node = document.roots.get(key);
    if (node) changes.push({ start: node.value.range[0], end: node.value.range[1], text: JSON.stringify(values[key]) });
    else if (Object.hasOwn(document.value, key)) throw appConfigError('config_invalid', `Unsupported shape for Codex setting ${key}.`);
    else missing.push(`${key} = ${JSON.stringify(values[key])}`);
  }
  let result = edit(text, changes);
  const fragments = [];
  if (missing.length) {
    const updated = parseAppConfig(result);
    const table = updated.nodes.find(node => node.type === 'TOMLTable');
    const position = Math.max(result.startsWith('\uFEFF') ? 1 : 0, table ? result.lastIndexOf('\n', table.range[0] - 1) + 1 : result.length);
    const separator = position && !['\n', '\uFEFF'].includes(result[position - 1]) ? newline : '';
    const fragment = separator + [`# ScioNos Codex App ${id} settings`, ...missing, `# End ScioNos Codex App ${id} settings`, ''].join(newline);
    result = result.slice(0, position) + fragment + result.slice(position);
    fragments.push(fragment);
  }
  const q = JSON.stringify;
  const provider = newline + [
    `# ScioNos Codex App ${id} provider`,
    `[model_providers.${providerId}]`,
    `name = ${q(service === 'llm' ? 'ScioNos RouterLab LLM' : 'ScioNos RouterLab')}`,
    `base_url = ${q(baseUrl)}`, 'wire_api = "responses"',
    `[model_providers.${providerId}.auth]`, `command = ${q(nodePath)}`,
    `args = [${q(helperPath)}, ${q(service)}]`, 'timeout_ms = 30000', 'refresh_interval_ms = 300000',
    `# End ScioNos Codex App ${id} provider`, '',
  ].join(newline);
  result += provider;
  fragments.push(provider);
  const applied = parseAppConfig(result);
  if (applied.value.model_provider !== providerId || applied.value.model !== model
    || applied.value.model_catalog_json !== cataloguePath) throw appConfigError('config_invalid', 'Codex configuration validation failed.');
  return { id, text: result, before, applied: rootSnapshot(result, applied), fragments };
}

export function restoreAppConfig(text, record) {
  const document = parseAppConfig(text);
  const expectedProviders = parseAppConfig(record.fragments.at(-1)).value.model_providers;
  const providerId = JSON.parse(record.applied.model_provider.raw);
  if (JSON.stringify(document.value.model_providers?.[providerId]) !== JSON.stringify(expectedProviders?.[providerId])) {
    throw appConfigError('restore_conflict', 'The ScioNos provider changed after activation. Your configuration was preserved.');
  }
  for (const key of CODEX_APP_KEYS) {
    const node = document.roots.get(key);
    if (!node || text.slice(...node.value.range) !== record.applied[key].raw) {
      throw appConfigError('restore_conflict', `Codex setting ${key} changed after activation. Your configuration was preserved.`);
    }
  }
  const changes = [];
  for (const fragment of record.fragments) {
    const position = text.indexOf(fragment);
    if (position < 0 || text.indexOf(fragment, position + 1) >= 0) {
      throw appConfigError('restore_conflict', 'ScioNos settings changed after activation. Your configuration was preserved.');
    }
    changes.push({ start: position, end: position + fragment.length, text: '' });
  }
  for (const key of CODEX_APP_KEYS) {
    if (!record.before[key].present) continue;
    const node = document.roots.get(key);
    changes.push({ start: node.value.range[0], end: node.value.range[1], text: record.before[key].raw });
  }
  const restored = edit(text, changes);
  parseAppConfig(restored);
  return restored;
}
