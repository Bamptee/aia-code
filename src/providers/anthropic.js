import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import chalk from 'chalk';
import { runCli } from './cli-runner.js';

export async function generate(prompt, model, { verbose = false, apply = false, onData } = {}) {
  const args = ['-p'];
  if (model) {
    args.push('--model', model);
  }
  if (apply) {
    args.push('--allowedTools', 'Edit,Write,Bash,Read,Glob,Grep');
  }
  if (verbose || apply) {
    args.push('--verbose');
  }

  // In agent mode, large prompts via stdin can hang Claude CLI.
  // Write context to a temp file and give a short prompt to read it.
  if (apply) {
    const tmpFile = path.join(tmpdir(), `aia-prompt-${randomBytes(6).toString('hex')}.md`);
    writeFileSync(tmpFile, prompt, 'utf-8');
    console.error(chalk.gray(`[AI] Prompt written to temp file (${(prompt.length / 1024).toFixed(1)}KB): ${tmpFile}`));
    const shortPrompt = `Read the file at ${tmpFile} — it contains your full instructions and context. Follow them exactly.`;
    args.push('-');
    console.error(chalk.gray(`[AI] Spawning: claude ${args.join(' ')}`));
    console.error(chalk.gray(`[AI] Waiting for Claude agent response...`));
    try {
      return await runCli('claude', args, { stdin: shortPrompt, verbose: verbose || apply, apply, onData });
    } finally {
      try { unlinkSync(tmpFile); } catch {}
    }
  }

  args.push('-');
  console.error(chalk.gray(`[AI] Spawning: claude ${args.join(' ')} (${(prompt.length / 1024).toFixed(1)}KB prompt)`));
  return runCli('claude', args, { stdin: prompt, verbose: verbose || apply, apply, onData });
}
