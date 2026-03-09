import chalk from 'chalk';
import { getProvider } from '../providers/registry.js';

export async function callModel(model, prompt) {
  console.log(chalk.yellow(`[AI] Calling ${model}...`));

  const provider = getProvider(model);
  return provider.generate(prompt, model);
}
