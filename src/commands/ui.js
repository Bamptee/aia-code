import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// From src/commands/ui.js → aia-code/ package root
const PACKAGE_ROOT = path.resolve(__dirname, '../..');

function openBrowser(url) {
  const cmd = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'start'
      : 'xdg-open';
  try {
    spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref();
  } catch {}
}

export function registerUiCommand(program) {
  program
    .command('ui')
    .description('Launch the local AIA dev environment (Next.js :3000 + Express :3001)')
    .option('--no-browser', 'Do not auto-open the browser')
    .action(async (opts) => {
      console.log('🚀 Starting AIA dev environment...');
      console.log('   Web (Next.js):  http://localhost:3000');
      console.log('   API (Express): http://localhost:3001\n');

      const child = spawn('npm', ['run', 'dev'], {
        cwd: PACKAGE_ROOT,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });

      // Propagate signals to child so Ctrl+C kills both Next.js and Express.
      process.on('SIGINT', () => child.kill('SIGINT'));
      process.on('SIGTERM', () => child.kill('SIGTERM'));

      child.on('exit', (code) => {
        process.exit(code ?? 0);
      });

      child.on('error', (err) => {
        console.error('Failed to start dev environment:', err.message);
        if (err.code === 'ENOENT') {
          console.error('Make sure npm is in your PATH.');
        }
        process.exit(1);
      });

      // Auto-open browser after Turbopack should be ready (cached ~1-2s, cold ~5s).
      if (opts.browser !== false) {
        setTimeout(() => openBrowser('http://localhost:3000'), 3000);
      }
    });
}
