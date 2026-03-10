import { runCli } from './cli-runner.js';

export async function generate(prompt, model, { verbose = false, apply = false } = {}) {
  const args = [];
  if (model) {
    args.push('-m', model);
  }
  if (apply) {
    args.push('--sandbox', 'false');
  }
  args.push('-');

  return runCli('gemini', args, { stdin: prompt, verbose: verbose || apply, apply });
}
