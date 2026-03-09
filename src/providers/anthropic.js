import { runCli } from './cli-runner.js';

export async function generate(prompt, model) {
  return runCli('claude', [
    '-p',
    '--model', model,
    '-',
  ], { stdin: prompt });
}
