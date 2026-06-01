#!/usr/bin/env node

import { main } from './src/cli/main.js';

main(process.argv.slice(2)).catch((error) => {
  console.error(`wrapper-scionos: ${error.message}`);
  if (process.env.SCIONOS_DEBUG) {
    console.error(error);
  }
  process.exitCode = 1;
});
