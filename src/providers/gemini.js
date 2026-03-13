import { runCli } from './cli-runner.js';

export async function generate(prompt, model, { verbose = false, apply = false, onData, cwd } = {}) {
  const args = [];
  if (model) {
    args.push('-m', model);
  }
  if (apply) {
    args.push('--sandbox', 'false');
    // Use stream-json for real-time output visibility
    args.push('--output-format', 'stream-json');
  }
  args.push('-');

  return runCli('gemini', args, { stdin: prompt, verbose: verbose || apply, apply, onData, cwd, streamJson: apply });
}
