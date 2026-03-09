import chalk from 'chalk';
import { resolveModelAlias } from '../providers/registry.js';

export async function callModel(model, prompt) {
  const resolved = resolveModelAlias(model);
  const displayName = resolved.model ?? `${model} (CLI default)`;

  console.log(chalk.yellow(`[AI] Calling ${displayName}...`));

  return resolved.provider.generate(prompt, resolved.model);
}
