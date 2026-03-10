import { spawn } from 'node:child_process';
import chalk from 'chalk';

const DEFAULT_IDLE_TIMEOUT_MS = 180_000;
const AGENT_IDLE_TIMEOUT_MS = 600_000;

export function runCli(command, args, { stdin: stdinData, verbose = false, apply = false, idleTimeoutMs } = {}) {
  if (!idleTimeoutMs) {
    idleTimeoutMs = apply ? AGENT_IDLE_TIMEOUT_MS : DEFAULT_IDLE_TIMEOUT_MS;
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    const chunks = [];
    let stderr = '';
    let settled = false;

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
      if (err) reject(err);
      else resolve(result);
    }

    let timer;
    resetTimer();

    child.stdout.on('data', (data) => {
      const text = data.toString();
      process.stdout.write(text);
      chunks.push(text);
      resetTimer();
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      if (verbose) {
        process.stderr.write(chalk.gray(text));
      }
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

    if (stdinData) {
      child.stdin.write(stdinData);
      child.stdin.end();
    }
  });
}
