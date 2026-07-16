import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildInteractiveCliInvocation } from '../src/platform/process.js';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIR, '..');
const ENTRY_SMOKE = path.join(TEST_DIR, 'entry-mode-smoke.mjs');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapper-scionos-entry-modes-'));
const installPrefix = path.join(tempDir, 'install');
const npmCommand = process.platform === 'win32'
  ? path.join(path.dirname(process.execPath), 'npm.cmd')
  : 'npm';
const npxCommand = process.platform === 'win32'
  ? path.join(path.dirname(process.execPath), 'npx.cmd')
  : 'npx';

try {
  const packResult = runCommand(npmCommand, ['pack', '--silent', PROJECT_ROOT], {
    cwd: tempDir,
    encoding: 'utf8',
  });
  const tarballName = packResult.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!tarballName) {
    throw new Error(`npm pack did not report a tarball name.\nstderr:\n${packResult.stderr}`);
  }
  const tarballPath = path.join(tempDir, tarballName);

  runCommand(npmCommand, ['install', '--prefix', installPrefix, tarballPath], {
    cwd: tempDir,
    stdio: 'inherit',
  });

  const binDirectory = path.join(installPrefix, 'node_modules', '.bin');
  const installedWrapper = path.join(
    binDirectory,
    process.platform === 'win32' ? 'wrapper-scionos.cmd' : 'wrapper-scionos',
  );
  const smokeCases = [
    {
      label: 'wrapper-scionos',
      command: installedWrapper,
      args: [],
    },
    {
      label: 'wrapper-scionos --service llm',
      command: installedWrapper,
      args: ['--service', 'llm'],
    },
    {
      label: 'npx wrapper-scionos',
      command: npxCommand,
      args: ['--yes', '--package', tarballPath, 'wrapper-scionos'],
    },
    {
      label: 'npx wrapper-scionos --service llm',
      command: npxCommand,
      args: ['--yes', '--package', tarballPath, 'wrapper-scionos', '--service', 'llm'],
    },
  ];

  for (const smokeCase of smokeCases) {
    const result = spawnSync(process.execPath, [
      ENTRY_SMOKE,
      '--label',
      smokeCase.label,
      smokeCase.command,
      ...smokeCase.args,
    ], {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function runCommand(command, args, options = {}) {
  const invocation = buildInteractiveCliInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    env: process.env,
    ...options,
    ...(invocation.spawnOptions ?? {}),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}.`);
  }
  return result;
}
