// Wrapper pour lancer l'Express backend en dev sur port 3001.
// Utilisé par `npm run dev:api` (avec `node --watch` pour hot reload).
// Story 1.5 — dev loop concurrently.

import { startServer } from '../src/ui/server.js';

const PORT = 3001;

startServer(PORT)
  .then(({ port }) => {
    console.log(`[api] Express ready on http://127.0.0.1:${port}`);
  })
  .catch((err) => {
    console.error('[api] Failed to start:', err);
    process.exit(1);
  });
