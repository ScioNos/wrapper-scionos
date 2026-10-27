import path from 'node:path';
import { createCodexAppIntegration } from '../../src/apps/codex-app.js';
import { codexAppPaths } from '../../src/platform/codex-app-config.js';
import { handleCodexApp } from '../../src/cli/commands/codex-app.js';

const directory = process.argv[2];
let running = false;
const integration = createCodexAppIntegration({ service: 'routerlab' }, {
  paths: codexAppPaths({ env: { CODEX_HOME: path.join(directory, 'home') }, root: path.join(directory, 'state') }),
  detect: () => ({ supported: true, installed: true, versionSupported: true, running, engineVersion: '0.164.0' }),
  credential: () => 'scionos-subprocess-test-token-only',
  fetchModels: async () => ({ valid: true, models: ['gpt-6.1-sol'] }),
  open: async () => { running = true; return { opened: true }; }, isRunning: () => running,
});
// Windows cannot deliver POSIX SIGTERM with child.kill(). The unreferenced IPC
// channel injects the same signal event without keeping the fixture alive.
process.on('message', signal => process.emit(signal));
process.channel.unref();
await handleCodexApp('launch', { service: 'routerlab', noPrompt: true, yes: true }, { integration, interactive: false });
