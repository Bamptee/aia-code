import { execSync } from 'node:child_process';
import { startServer } from '../ui/server.js';

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try { execSync(`${cmd} ${url}`, { stdio: 'ignore' }); } catch {}
}

export function registerUiCommand(program) {
  program
    .command('ui')
    .description('Launch the local web UI to manage features and config')
    .option('-p, --port <port>', 'Port to listen on (scans from 3100 if not specified)')
    .action(async (opts) => {
      const port = opts.port ? parseInt(opts.port, 10) : undefined;
      const { port: actualPort } = await startServer(port);
      openBrowser(`http://127.0.0.1:${actualPort}`);
    });
}
