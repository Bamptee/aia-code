import chalk from 'chalk';
import { resolveModelAlias } from '../providers/registry.js';

export async function callModel(model, prompt, { verbose = false, apply = false, onData, cwd } = {}) {
  const resolved = resolveModelAlias(model);
  const displayName = resolved.model ?? `${model} (CLI default)`;
  const mode = apply ? 'agent' : 'print';

  console.log(chalk.yellow(`[AI] Calling ${displayName} (${mode} mode)...`));

  const result = await resolved.provider.generate(prompt, resolved.model, { verbose, apply, onData, cwd });

  const modelUsed = resolved.model || model;

  // Handle new format with tokenUsage and fileOperations (from stream-json mode)
  if (result && typeof result === 'object' && 'output' in result) {
    return {
      output: result.output,
      tokenUsage: result.tokenUsage || null,
      fileOperations: result.fileOperations || [],
      modelUsed,
    };
  }

  // Legacy format: string output
  return {
    output: result,
    tokenUsage: null,
    fileOperations: [],
    modelUsed,
  };
}
