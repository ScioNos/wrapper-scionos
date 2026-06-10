import { launchClaudeCode } from '../../apps/claude-code.js';

export async function handleClaudeCode(options, version = null, claudeArgs = options.passthrough) {
  await launchClaudeCode({
    serviceValue: options.service,
    strategyValue: options.strategy,
    subagentModel: options.subagentModel,
    noPrompt: options.noPrompt,
    claudeArgs,
    version,
  });
}
