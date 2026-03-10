import { runCli } from './cli-runner.js';

export async function generate(prompt, model, { verbose = false, apply = false } = {}) {
  const args = ['-p'];
  if (model) {
    args.push('--model', model);
  }
  if (apply) {
    args.push('--allowedTools', 'Edit', 'Write', 'Bash', 'Read', 'Glob', 'Grep');
  }
  if (verbose || apply) {
    args.push('--verbose');
  }
  args.push('-');

  return runCli('claude', args, { stdin: prompt, verbose: verbose || apply, apply });
}
