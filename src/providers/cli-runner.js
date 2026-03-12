import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import chalk from 'chalk';

const DEFAULT_IDLE_TIMEOUT_MS = 180_000;
const AGENT_IDLE_TIMEOUT_MS = 600_000;

export function runCli(command, args, { stdin: stdinData, verbose = false, apply = false, idleTimeoutMs, onData } = {}) {
  if (!idleTimeoutMs) {
    idleTimeoutMs = apply ? AGENT_IDLE_TIMEOUT_MS : DEFAULT_IDLE_TIMEOUT_MS;
  }

  // Write prompt to a temp file to avoid stdin piping issues
  let tmpFile;
  if (stdinData) {
    tmpFile = path.join(tmpdir(), `aia-prompt-${randomBytes(6).toString('hex')}.txt`);
    writeFileSync(tmpFile, stdinData, 'utf-8');
  }

  return new Promise((resolve, reject) => {
    const { CLAUDECODE, ...cleanEnv } = process.env;

    // Replace the `-` stdin marker with the temp file path via shell redirection
    const finalArgs = tmpFile
      ? args.filter(a => a !== '-')
      : args;

    const spawnCommand = tmpFile
      ? `${command} ${finalArgs.map(a => `'${a}'`).join(' ')} < '${tmpFile}'`
      : `${command} ${args.map(a => `'${a}'`).join(' ')}`;

    console.error(`[DEBUG] ${spawnCommand}`);

    const child = spawn('sh', ['-c', spawnCommand], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...cleanEnv, FORCE_COLOR: '0' },
    });

    const chunks = [];
    let stderr = '';
    let settled = false;

    function cleanup() {
      if (tmpFile) {
        try { unlinkSync(tmpFile); } catch {}
      }
    }

    function resetTimer() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        child.kill('SIGTERM');
        finish(new Error(`CLI idle timeout (no output for ${idleTimeoutMs / 1000}s): ${command} ${args.join(' ')}`));
      }, idleTimeoutMs);
    }

    function finish(err, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      if (err) reject(err);
      else resolve(result);
    }

    let timer;
    resetTimer();

    child.stdout.on('data', (data) => {
      const text = data.toString();
      process.stdout.write(text);
      chunks.push(text);
      if (onData) onData({ type: 'stdout', text });
      resetTimer();
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      if (verbose) {
        process.stderr.write(chalk.gray(text));
      }
      if (onData) onData({ type: 'stderr', text });
      resetTimer();
    });

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        finish(new Error(`CLI not found: "${command}". Make sure it is installed and in your PATH.`));
      } else {
        finish(err);
      }
    });

    child.on('close', (code) => {
      if (code !== 0) {
        finish(new Error(`${command} exited with code ${code}:\n${stderr.trim()}`));
      } else {
        finish(null, chunks.join(''));
      }
    });
  });
}
