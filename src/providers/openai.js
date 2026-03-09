import { runCli } from './cli-runner.js';

export async function generate(prompt, model) {
  return runCli('codex', [
    'exec',
    '-c', `model="${model}"`,
    '-',
  ], { stdin: prompt });
}
