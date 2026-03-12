import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import chalk from 'chalk';
import { runCli } from './cli-runner.js';

export async function generate(prompt, model, { verbose = false, apply = false, onData, cwd } = {}) {
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

  return runCli('claude', args, { stdin: prompt, verbose: verbose || apply, apply, onData, cwd });
}
