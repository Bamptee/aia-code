import path from 'node:path';
import fs from 'fs-extra';
import yaml from 'yaml';
import { AIA_DIR } from '../../constants.js';
import { json, error } from '../router.js';

export function registerConfigRoutes(router) {
  // Get config
  router.get('/api/config', async (req, res, { root }) => {
    const configPath = path.join(root, AIA_DIR, 'config.yaml');
    if (!(await fs.pathExists(configPath))) {
      return error(res, 'config.yaml not found', 404);
    }
    const content = await fs.readFile(configPath, 'utf-8');
    json(res, { content, parsed: yaml.parse(content) });
  });

  // Save config
  router.put('/api/config', async (req, res, { root, parseBody }) => {
    const body = await parseBody();
    const configPath = path.join(root, AIA_DIR, 'config.yaml');
    await fs.writeFile(configPath, body.content, 'utf-8');
    json(res, { ok: true });
  });

  // List context files
  router.get('/api/context', async (req, res, { root }) => {
    const dir = path.join(root, AIA_DIR, 'context');
    if (!(await fs.pathExists(dir))) return json(res, []);
    const files = await fs.readdir(dir);
    json(res, files.filter(f => f.endsWith('.md')));
  });

  // Read context file
  router.get('/api/context/:filename', async (req, res, { params, root }) => {
    const filePath = path.join(root, AIA_DIR, 'context', params.filename);
    if (!(await fs.pathExists(filePath))) return error(res, 'Not found', 404);
    const content = await fs.readFile(filePath, 'utf-8');
    json(res, { filename: params.filename, content });
  });

  // Save context file
  router.put('/api/context/:filename', async (req, res, { params, root, parseBody }) => {
    const body = await parseBody();
    const filePath = path.join(root, AIA_DIR, 'context', params.filename);
    await fs.writeFile(filePath, body.content, 'utf-8');
    json(res, { ok: true });
  });

  // List knowledge categories
  router.get('/api/knowledge', async (req, res, { root }) => {
    const dir = path.join(root, AIA_DIR, 'knowledge');
    if (!(await fs.pathExists(dir))) return json(res, []);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const categories = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const files = await fs.readdir(path.join(dir, entry.name));
        categories.push({ name: entry.name, files: files.filter(f => f.endsWith('.md')) });
      }
    }
    json(res, categories);
  });

  // Read knowledge file
  router.get('/api/knowledge/:category/:filename', async (req, res, { params, root }) => {
    const filePath = path.join(root, AIA_DIR, 'knowledge', params.category, params.filename);
    if (!(await fs.pathExists(filePath))) return error(res, 'Not found', 404);
    const content = await fs.readFile(filePath, 'utf-8');
    json(res, { filename: params.filename, category: params.category, content });
  });

  // Save knowledge file
  router.put('/api/knowledge/:category/:filename', async (req, res, { params, root, parseBody }) => {
    const body = await parseBody();
    const filePath = path.join(root, AIA_DIR, 'knowledge', params.category, params.filename);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, body.content, 'utf-8');
    json(res, { ok: true });
  });
}
