import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { appConfigError, parseAppConfig, planAppConfig, restoreAppConfig } from './codex-app-toml.js';

export const configHash = value => value === null ? null : createHash('sha256').update(value).digest('hex');
export function codexAppPaths({ env = process.env, home = os.homedir(), root } = {}) {
  const codexHome = path.resolve(env.CODEX_HOME || path.join(home, '.codex'));
  const configPath = path.join(codexHome, 'config.toml');
  const stateRoot = root ?? path.join(home, '.wrapper-scionos', 'codex-app');
  const directory = path.join(stateRoot, configHash(configPath).slice(0, 24));
  return { configPath, directory, journalPath: path.join(directory, 'session.json'),
    lockPath: path.join(directory, 'owner.json'), backupsPath: path.join(directory, 'backups'), runtimePath: path.join(directory, 'runtime') };
}

function readOptional(file, fileSystem) {
  try { return fileSystem.readFileSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function decode(buffer) {
  if (buffer === null) return '';
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer); }
  catch { throw appConfigError('config_invalid', 'Codex config.toml must be UTF-8.'); }
}
export function atomicAppWrite(file, value, { fileSystem = fs, expected, mode = 0o600 } = {}) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  fileSystem.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  try {
    fileSystem.writeFileSync(temporary, value, { mode, flag: 'wx', flush: true });
    if (expected !== undefined && configHash(readOptional(file, fileSystem)) !== expected) {
      throw appConfigError('config_conflict', 'Codex configuration changed before the write. Your file was preserved.');
    }
    fileSystem.renameSync(temporary, file);
  } finally { try { fileSystem.unlinkSync(temporary); } catch { /* The rename normally consumes the temporary file. */ } }
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}

export class CodexAppConfigSession {
  constructor(paths = codexAppPaths(), { fileSystem = fs, isAlive = processAlive, pid = process.pid } = {}) {
    this.paths = paths; this.fs = fileSystem; this.isAlive = isAlive;
    this.owner = { pid, nonce: randomUUID() };
  }
  read() { return readOptional(this.paths.configPath, this.fs); }
  readLock() {
    const value = readOptional(this.paths.lockPath, this.fs);
    if (!value) return null;
    try {
      const lock = JSON.parse(value);
      if (!Number.isSafeInteger(lock.pid) || lock.pid < 1 || typeof lock.nonce !== 'string') throw new Error();
      return lock;
    } catch { throw appConfigError('config_conflict', 'The Codex App session lock is invalid; no configuration was changed.'); }
  }
  own(lock) { return lock?.pid === this.owner.pid && lock?.nonce === this.owner.nonce; }
  readJournal(buffer = this.read()) {
    const raw = readOptional(this.paths.journalPath, this.fs);
    if (!raw) return null;
    let journal;
    try {
      journal = JSON.parse(raw);
      const valid = item => item?.version === 1 && item.configPath === this.paths.configPath
        && /^[a-f0-9-]{36}$/.test(item.id) && ['routerlab', 'llm'].includes(item.service)
        && ['prepared', 'active', 'restoring'].includes(item.phase)
        && item.before && item.applied && Array.isArray(item.fragments) && item.fragments.length > 0 && item.fragments.length <= 2
        && item.fragments.every(fragment => typeof fragment === 'string' && fragment.includes(item.id))
        && ['model', 'model_provider', 'model_catalog_json'].every(key =>
          typeof item.before[key]?.present === 'boolean'
          && (!item.before[key].present || typeof item.before[key].raw === 'string')
          && item.applied[key]?.present === true && typeof item.applied[key].raw === 'string'
          && typeof JSON.parse(item.applied[key].raw) === 'string')
        && JSON.parse(item.applied.model_provider.raw) === 'scionos_' + item.service;
      if (!valid(journal) || (journal.previous && !valid(journal.previous))) throw new Error();
    } catch { throw appConfigError('config_invalid', 'The Codex App recovery journal is invalid; no configuration was changed.'); }
    if (journal.phase === 'prepared' && configHash(buffer) === journal.beforeHash) return journal.previous ?? null;
    if (journal.phase === 'restoring' && configHash(buffer) === journal.restoreHash) return null;
    return journal;
  }
  status() {
    const buffer = this.read();
    const text = decode(buffer);
    const document = parseAppConfig(text);
    const lock = this.readLock();
    const journal = this.readJournal(buffer);
    let conflict = false;
    if (journal) { try { restoreAppConfig(text, journal); } catch { conflict = true; } }
    return { configPath: this.paths.configPath, configured: Boolean(journal),
      owned: this.own(lock), ownerActive: Boolean(lock && this.isAlive(lock.pid)),
      recoveryRequired: Boolean(journal && !this.own(lock) && (!lock || !this.isAlive(lock.pid))),
      restoreConflict: conflict, service: journal?.service ?? null,
      model: typeof document.value.model === 'string' ? document.value.model : null,
      provider: typeof document.value.model_provider === 'string' ? document.value.model_provider : null };
  }
  acquire() {
    const lock = this.readLock();
    if (this.own(lock)) return;
    if (lock && this.isAlive(lock.pid)) throw appConfigError('config_busy', 'Another ScioNos session owns this Codex configuration.');
    if (lock) this.fs.unlinkSync(this.paths.lockPath);
    this.fs.mkdirSync(this.paths.directory, { recursive: true, mode: 0o700 });
    try { this.fs.writeFileSync(this.paths.lockPath, JSON.stringify(this.owner), { mode: 0o600, flag: 'wx' }); }
    catch (error) { if (error.code === 'EEXIST') throw appConfigError('config_busy', 'Another ScioNos session acquired the Codex configuration.'); throw error; }
  }
  release() {
    if (this.own(this.readLock())) this.fs.unlinkSync(this.paths.lockPath);
  }
  preview(configuration) {
    const buffer = this.read();
    const previous = this.readJournal(buffer);
    const lock = this.readLock();
    if (previous && !this.own(lock)) throw appConfigError('recovery_required', 'Restore the previous ScioNos Codex App session before activating a new one.');
    const text = previous ? restoreAppConfig(decode(buffer), previous) : decode(buffer);
    return planAppConfig(text, { ...configuration, id: previous?.id ?? configuration.id ?? randomUUID() });
  }
  activate(configuration) {
    const existing = this.readJournal();
    if (existing && !this.own(this.readLock())) throw appConfigError('recovery_required', 'Restore the previous ScioNos Codex App session before activating a new one.');
    this.acquire();
    let wrote = false;
    try {
      const buffer = this.read();
      const previous = this.readJournal(buffer);
      const text = previous ? restoreAppConfig(decode(buffer), previous) : decode(buffer);
      const plan = planAppConfig(text, { ...configuration, id: previous?.id ?? randomUUID() });
      let backupPath = previous?.backupPath;
      if (!previous) {
        this.fs.mkdirSync(this.paths.backupsPath, { recursive: true, mode: 0o700 });
        backupPath = path.join(this.paths.backupsPath, `${new Date().toISOString().replace(/[:.]/g, '-')}-${plan.fragments.length}-${randomUUID()}.toml`);
        this.fs.writeFileSync(backupPath, buffer ?? Buffer.alloc(0), { mode: 0o600, flag: 'wx' });
      }
      const record = { version: 1, configPath: this.paths.configPath, id: plan.id,
        owner: this.owner, phase: 'prepared', beforeHash: configHash(buffer), originalExists: previous?.originalExists ?? buffer !== null,
        service: configuration.service, backupPath, before: plan.before, applied: plan.applied, fragments: plan.fragments,
        ...(previous ? { previous: { ...previous, previous: undefined } } : {}) };
      atomicAppWrite(this.paths.journalPath, JSON.stringify(record, null, 2) + '\n', { fileSystem: this.fs });
      const mode = buffer === null ? 0o600 : this.fs.statSync(this.paths.configPath).mode & 0o777;
      atomicAppWrite(this.paths.configPath, plan.text, { fileSystem: this.fs, expected: configHash(buffer), mode });
      wrote = true;
      try {
        const committed = { ...record, phase: 'active', previous: undefined };
        atomicAppWrite(this.paths.journalPath, JSON.stringify(committed, null, 2) + '\n', { fileSystem: this.fs });
      } catch { /* The prepared journal already contains enough information to recover the applied change. */ }
      return { configured: true, configPath: this.paths.configPath, service: configuration.service, model: configuration.model };
    } catch (error) {
      if (!wrote) {
        try {
          if (existing) atomicAppWrite(this.paths.journalPath, JSON.stringify(existing), { fileSystem: this.fs });
          else this.fs.unlinkSync(this.paths.journalPath);
        } catch { /* Keep the prepared record if rollback storage is unavailable. */ }
        if (!existing) this.release();
      }
      throw error;
    }
  }
  restore({ dryRun = false, recover = false } = {}) {
    const lock = this.readLock();
    if (!this.own(lock) && lock && this.isAlive(lock.pid)) throw appConfigError('config_busy', 'Another ScioNos session owns this Codex configuration.');
    const buffer = this.read();
    const journal = this.readJournal(buffer);
    if (journal && !this.own(lock) && !recover) throw appConfigError('recovery_required', 'This session requires explicit Codex App recovery.');
    const restored = journal ? restoreAppConfig(decode(buffer), journal) : null;
    if (dryRun) return { restored: false, dryRun: true, changed: Boolean(journal), configPath: this.paths.configPath };
    if (!this.own(lock)) this.acquire();
    try {
      if (journal) {
        const restoreHash = !journal.originalExists && restored === '' ? null : configHash(restored);
        atomicAppWrite(this.paths.journalPath, JSON.stringify({ ...journal, phase: 'restoring', restoreHash }), { fileSystem: this.fs });
        if (!journal.originalExists && restored === '') {
          if (configHash(this.read()) !== configHash(buffer)) throw appConfigError('config_conflict', 'Codex configuration changed before restoration.');
          if (buffer !== null) this.fs.unlinkSync(this.paths.configPath);
        } else atomicAppWrite(this.paths.configPath, restored, { fileSystem: this.fs,
          expected: configHash(buffer), mode: buffer === null ? 0o600 : this.fs.statSync(this.paths.configPath).mode & 0o777 });
      }
      try { this.fs.unlinkSync(this.paths.journalPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      return { restored: Boolean(journal), configPath: this.paths.configPath };
    } finally { this.release(); }
  }
}
