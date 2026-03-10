import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      console.log(`AIA UI running at http://127.0.0.1:${port}`);
      resolve({ server, port });
    });
  });
}
