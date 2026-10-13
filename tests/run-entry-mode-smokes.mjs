import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withCleanup, removeTestDirectory, runTestProcess } from './support/lifecycle.mjs';

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
const npmEnv = {
  ...process.env,
  npm_config_cache: path.join(tempDir, 'npm-cache'),
};

await withCleanup(async () => {
  const packResult = await runCommand(npmCommand, ['pack', '--silent', PROJECT_ROOT], {
    cwd: tempDir,
    env: npmEnv,
  });
  const tarballName = packResult.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!tarballName) {
    throw new Error(`npm pack did not report a tarball name.\nstderr:\n${packResult.stderr}`);
  }
  const tarballPath = path.join(tempDir, tarballName);

  await runCommand(npmCommand, ['install', '--prefix', installPrefix, tarballPath], {
    cwd: tempDir,
    env: npmEnv,
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
      selection: 'numeric',
    },
    {
      label: 'wrapper-scionos --service llm',
      command: installedWrapper,
      args: ['--service', 'llm'],
      selection: 'arrows',
    },
    {
      label: 'npx wrapper-scionos',
      command: npxCommand,
      args: ['--yes', '--package', tarballPath, 'wrapper-scionos'],
      selection: 'arrows',
    },
    {
      label: 'npx wrapper-scionos --service llm',
      command: npxCommand,
      args: ['--yes', '--package', tarballPath, 'wrapper-scionos', '--service', 'llm'],
      selection: 'arrows',
    },
  ];

  for (const smokeCase of smokeCases) {
    const result = await runTestProcess(process.execPath, [
      ENTRY_SMOKE,
      '--label',
      smokeCase.label,
      '--selection',
      smokeCase.selection,
      smokeCase.command,
      ...smokeCase.args,
    ], {
      cwd: PROJECT_ROOT,
      env: npmEnv,
      timeoutMs: 90000,
    });
    if (result.code !== 0) throw new Error(result.diagnostic);
    console.log(result.stdout.trim());
  }
}, [() => removeTestDirectory(tempDir)]);

async function runCommand(command, args, options = {}) {
  const result = await runTestProcess(command, args, {
    env: process.env,
    ...options,
    timeoutMs: 120000,
  });
  if (result.code !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed.\n${result.diagnostic}`);
  }
  return result;
}
