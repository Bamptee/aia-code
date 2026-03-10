import path from 'node:path';
import fs from 'fs-extra';
import { AIA_DIR } from '../../constants.js';
import { json } from '../router.js';

export function registerLogRoutes(router) {
  router.get('/api/logs', async (req, res, { root }) => {
    const logPath = path.join(root, AIA_DIR, 'logs', 'execution.log');
    if (!(await fs.pathExists(logPath))) {
      return json(res, { content: '' });
    }
    const content = await fs.readFile(logPath, 'utf-8');
    json(res, { content });
  });
}
