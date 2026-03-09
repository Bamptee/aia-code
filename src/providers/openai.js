import { runCli } from './cli-runner.js';

export async function generate(prompt, model) {
  const args = ['exec'];
  if (model) {
    args.push('-c', `model="${model}"`);
  }
  args.push('-');

  return runCli('codex', args, { stdin: prompt });
}
