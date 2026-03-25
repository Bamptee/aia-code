import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import chalk from 'chalk';
import { runCli } from './cli-runner.js';

export async function generate(prompt, model, { verbose = false, apply = false, readOnly = false, onData, cwd } = {}) {
  const args = ['-p'];
  if (model) {
    args.push('--model', model);
  }
  if (apply) {
    args.push('--allowedTools', 'Edit,Write,Bash,Read,Glob,Grep');
    // Use stream-json for real-time output visibility
    args.push('--output-format', 'stream-json');
    // Include partial messages for token-by-token streaming
    args.push('--include-partial-messages');
  } else if (readOnly) {
    // Read-only mode: allow exploration tools only (no Write/Edit/Bash)
    args.push('--allowedTools', 'Read,Glob,Grep');
    args.push('--output-format', 'stream-json');
    args.push('--include-partial-messages');
  }
  if (verbose || apply || readOnly) {
    args.push('--verbose');
  }

  const useStreamJson = apply || readOnly;
  return runCli('claude', args, { stdin: prompt, verbose: verbose || apply || readOnly, apply, readOnly, onData, cwd, streamJson: useStreamJson });
}
