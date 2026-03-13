import { runCli } from './cli-runner.js';

export async function generate(prompt, model, { verbose = false, apply = false, onData, cwd } = {}) {
  const args = ['exec'];
  if (model) {
    args.push('-c', `model="${model}"`);
  }
  if (apply) {
    args.push('-c', 'approval_policy="on-failure"');
  }
  args.push('-');

  // Note: Codex CLI does not support stream-json output format
  return runCli('codex', args, { stdin: prompt, verbose: verbose || apply, apply, onData, cwd });
}
