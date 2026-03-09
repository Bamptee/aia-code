import { runCli } from './cli-runner.js';

export async function generate(prompt, model) {
  const args = ['-p'];
  if (model) {
    args.push('--model', model);
  }
  args.push('-');

  return runCli('claude', args, { stdin: prompt });
}
