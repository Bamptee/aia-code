import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createRouter, parseBody, json, error } from './router.js';
import { registerApiRoutes } from './api/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';

  if (!existsSync(filePath)) {
    // SPA fallback: serve index.html for non-API, non-file routes
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      createReadStream(indexPath).pipe(res);
      return;
    }
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  res.writeHead(200, { 'Content-Type': mime });
  createReadStream(filePath).pipe(res);
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => { resolve(true); });
  });
}

async function findFreePort(start = 3100, maxAttempts = 50) {
  for (let port = start; port < start + maxAttempts; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port found between ${start} and ${start + maxAttempts - 1}`);
}

export async function startServer(preferredPort, root = process.cwd()) {
  const port = preferredPort ?? await findFreePort();

  const router = createRouter();
  registerApiRoutes(router, root);

  const server = createServer(async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // API routes
    if (pathname.startsWith('/api/')) {
      const matched = router.match(req.method, pathname);
      if (matched) {
        try {
          await matched.handler(req, res, { params: matched.params, query: Object.fromEntries(url.searchParams), root, parseBody: () => parseBody(req) });
        } catch (err) {
          error(res, err.message, 500);
        }
      } else {
        error(res, 'Not found', 404);
      }
      return;
    }

    // Static files
    let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
    serveStatic(res, filePath);
  });

  // Setup WebSocket server for terminal
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/api/terminal') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        const cwd = url.searchParams.get('cwd') || root;

        // Dynamically import node-pty (may not be installed)
        import('node-pty').then(({ spawn: ptySpawn }) => {
          // F6: Use user's preferred shell from environment
          const shell = process.platform === 'win32'
            ? 'powershell.exe'
            : process.env.SHELL || '/bin/bash';
          const ptyProcess = ptySpawn(shell, [], {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd,
            env: process.env,
          });

          // F7: Idle timeout - close terminal after 30 minutes of inactivity
          const IDLE_TIMEOUT = 30 * 60 * 1000;
          let idleTimer = setTimeout(() => {
            ws.send('\r\n\x1b[33m[Session closed due to inactivity]\x1b[0m\r\n');
            ws.close();
          }, IDLE_TIMEOUT);

          const resetIdleTimer = () => {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
              ws.send('\r\n\x1b[33m[Session closed due to inactivity]\x1b[0m\r\n');
              ws.close();
            }, IDLE_TIMEOUT);
          };

          ws.on('message', (data) => {
            resetIdleTimer();
            const msg = data.toString();
            // F5: Limit message size to 64KB
            if (msg.length > 65536) return;
            // Handle resize messages
            if (msg.startsWith('\x1b[8;')) {
              const match = msg.match(/\x1b\[8;(\d+);(\d+)t/);
              if (match) {
                ptyProcess.resize(parseInt(match[2], 10), parseInt(match[1], 10));
                return;
              }
            }
            ptyProcess.write(msg);
          });

          ptyProcess.onData((data) => {
            resetIdleTimer();
            try {
              ws.send(data);
            } catch {}
          });

          ws.on('close', () => {
            clearTimeout(idleTimer);
            ptyProcess.kill();
          });

          ws.on('error', () => {
            clearTimeout(idleTimer);
            ptyProcess.kill();
          });
        }).catch((err) => {
          ws.send(`\r\n\x1b[31mError: ${err.message}\x1b[0m\r\n`);
          if (err.code === 'ERR_MODULE_NOT_FOUND') {
            ws.send(`\x1b[33mRun: npm install node-pty\x1b[0m\r\n`);
          }
          ws.close();
        });
      });
    } else {
      socket.destroy();
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      console.log(`AIA UI running at http://127.0.0.1:${port}`);
      resolve({ server, port });
    });
  });
}
