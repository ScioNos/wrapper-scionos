#!/usr/bin/env node

import { main } from './src/cli/main.js';
import { assertSupportedNodeVersion } from './src/platform/runtime.js';
import { printError } from './src/cli/commands/output.js';

Promise.resolve().then(() => { assertSupportedNodeVersion(); return main(process.argv.slice(2)); }).catch((error) => {
  if (error?.name === 'ExitPromptError' || error?.code === 'ERR_USE_AFTER_CLOSE') {
    process.exitCode = 130;
    return;
  }
  printError(error, { json: process.argv.slice(2).includes('--json') });
  if (process.env.SCIONOS_DEBUG) console.error(error);
  process.exitCode = error?.exitCode ?? 1;
});
