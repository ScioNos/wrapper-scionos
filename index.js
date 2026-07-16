#!/usr/bin/env node

import { main } from './src/cli/main.js';
import { assertSupportedNodeVersion } from './src/platform/runtime.js';
import { printError } from './src/cli/commands/output.js';

export function handleTopLevelError(error, {
  argv = process.argv.slice(2),
  env = process.env,
  processState = process,
  printErrorFn = printError,
  errorLogger = console.error,
} = {}) {
  if (error?.name === 'ExitPromptError' || error?.code === 'ERR_USE_AFTER_CLOSE') {
    processState.exitCode = 130;
    return;
  }
  printErrorFn(error, { json: argv.includes('--json') });
  if (env.SCIONOS_DEBUG) errorLogger(error);
  processState.exitCode = error?.exitCode ?? 1;
}

export function runEntrypoint({
  argv = process.argv.slice(2),
  assertSupportedNodeVersionFn = assertSupportedNodeVersion,
  mainFn = main,
  errorOptions = {},
} = {}) {
  return Promise.resolve()
    .then(() => {
      assertSupportedNodeVersionFn();
      return mainFn(argv);
    })
    .catch((error) => handleTopLevelError(error, { argv, ...errorOptions }));
}

export const entrypointPromise = runEntrypoint();
