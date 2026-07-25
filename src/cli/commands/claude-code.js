import { launchClaudeCode } from '../../apps/claude-code.js';
import { CliUsageError } from '../args.js';

export async function handleClaudeCode(options, version = null, claudeArgs = options.passthrough) {
  if (options.providedOptions?.has('token') || options.token) {
    throw new CliUsageError('--token is not valid for claude-code. Use the masked prompt, secure storage, or a RouterLab service environment variable.');
  }
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
