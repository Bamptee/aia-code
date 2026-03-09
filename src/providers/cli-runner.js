import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 300_000;

export function runCli(command, args, { stdin: stdinData, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    const chunks = [];
    let stderr = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      process.stdout.write(text);
      chunks.push(text);
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`CLI timed out after ${timeoutMs / 1000}s: ${command} ${args.join(' ')}`));
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(new Error(`CLI not found: "${command}". Make sure it is installed and in your PATH.`));
      } else {
        reject(err);
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}:\n${stderr.trim()}`));
      } else {
        resolve(chunks.join(''));
      }
    });

    if (stdinData) {
      child.stdin.write(stdinData);
      child.stdin.end();
    }
  });
}
