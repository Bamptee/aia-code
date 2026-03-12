import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import chalk from 'chalk';

const DEFAULT_IDLE_TIMEOUT_MS = 180_000;
const AGENT_IDLE_TIMEOUT_MS = 600_000;

export function runCli(command, args, { stdin: stdinData, verbose = false, apply = false, idleTimeoutMs, onData, cwd } = {}) {
  if (!idleTimeoutMs) {
    idleTimeoutMs = apply ? AGENT_IDLE_TIMEOUT_MS : DEFAULT_IDLE_TIMEOUT_MS;
  }
  return new Promise((resolve, reject) => {
    const { CLAUDECODE, ...cleanEnv } = process.env;
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
      cwd,
    });

    const chunks = [];
    let stderr = '';
    let settled = false;
    let gotFirstOutput = false;

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
      if (!gotFirstOutput) {
        gotFirstOutput = true;
        console.error(chalk.gray('[AI] First stdout received — agent is running'));
      }
      const text = data.toString();
      if (verbose) process.stdout.write(text);
      chunks.push(text);
      if (onData) onData({ type: 'stdout', text });
      resetTimer();
    });

    child.stderr.on('data', (data) => {
      if (!gotFirstOutput) {
        gotFirstOutput = true;
        console.error(chalk.gray('[AI] First stderr received — agent is running'));
      }
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

    if (stdinData) {
      child.stdin.on('error', () => {}); // Ignore EPIPE if child exits early
      child.stdin.write(stdinData);
      child.stdin.end();
    }
  });
}
