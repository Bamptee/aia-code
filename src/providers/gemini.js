import { runCli } from './cli-runner.js';

export async function generate(prompt, model) {
  const args = [];
  if (model) {
    args.push('-m', model);
  }
  args.push('-');

  return runCli('gemini', args, { stdin: prompt });
}
