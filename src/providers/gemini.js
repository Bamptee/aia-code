import { runCli } from './cli-runner.js';

export async function generate(prompt, model) {
  return runCli('gemini', [
    '-m', model,
    '-',
  ], { stdin: prompt });
}
