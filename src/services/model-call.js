import chalk from 'chalk';
import { resolveModelAlias } from '../providers/registry.js';

export async function callModel(model, prompt, { verbose = false, apply = false } = {}) {
  const resolved = resolveModelAlias(model);
  const displayName = resolved.model ?? `${model} (CLI default)`;
  const mode = apply ? 'agent' : 'print';

  console.log(chalk.yellow(`[AI] Calling ${displayName} (${mode} mode)...`));

  return resolved.provider.generate(prompt, resolved.model, { verbose, apply });
}
