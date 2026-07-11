import { launchClaudeCode } from '../../apps/claude-code.js';

export async function handleClaudeCode(options, version = null, claudeArgs = options.passthrough) {
  return launchClaudeCode({
    serviceValue: options.service,
    strategyValue: options.strategy,
    token: options.token,
    noPrompt: options.noPrompt,
    claudeArgs,
    version,
    allowBack: options.allowBack ?? false,
  });
}
