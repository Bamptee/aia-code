import { runCli } from './cli-runner.js';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// Codex rejects stdin prompts over 1,048,576 chars (input_too_large); keep headroom for the fallback instruction
const MAX_STDIN_CHARS = 1_000_000;

export async function generate(prompt, model, { verbose = false, apply = false, onData, cwd } = {}) {
  const args = ['exec'];
  if (model) {
    args.push('-c', `model="${model}"`);
  }
  if (apply) {
    args.push('-c', 'approval_policy="on-failure"');
  }
  args.push('-');

  let stdin = prompt;
  let promptFile = null;
  if (prompt.length > MAX_STDIN_CHARS) {
    promptFile = join(tmpdir(), `aia-codex-prompt-${randomUUID()}.md`);
    await writeFile(promptFile, prompt, 'utf8');
    stdin = `The full prompt exceeds the stdin size limit and has been written to a file instead. Read the file below, then follow its instructions exactly as if it had been given to you directly.\n\nPrompt file: ${promptFile}`;
  }

  try {
    // Note: Codex CLI does not support stream-json output format
    return await runCli('codex', args, { stdin, verbose: verbose || apply, apply, onData, cwd });
  } finally {
    if (promptFile) {
      await unlink(promptFile).catch(() => {});
    }
  }
}
