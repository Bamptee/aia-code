import { runCli } from './cli-runner.js';

export async function generate(prompt, model, { verbose = false, apply = false } = {}) {
  const args = ['exec'];
  if (model) {
    args.push('-c', `model="${model}"`);
  }
  if (apply) {
    args.push('-c', 'approval_policy="on-failure"');
  }
  args.push('-');

  return runCli('codex', args, { stdin: prompt, verbose: verbose || apply, apply });
}
