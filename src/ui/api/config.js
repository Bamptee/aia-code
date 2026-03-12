import path from 'node:path';
import fs from 'fs-extra';
import yaml from 'yaml';
import { AIA_DIR } from '../../constants.js';
import { loadGlobalConfig, saveGlobalConfig, getGlobalConfigPath } from '../../services/config.js';
import { json, error } from '../router.js';

export function registerConfigRoutes(router) {
  // Get project config
  router.get('/api/config', async (req, res, { root }) => {
    const configPath = path.join(root, AIA_DIR, 'config.yaml');
    if (!(await fs.pathExists(configPath))) {
      return error(res, 'config.yaml not found', 404);
    }
    const content = await fs.readFile(configPath, 'utf-8');
    json(res, { content, parsed: yaml.parse(content) });
  });

  // Save project config
  router.put('/api/config', async (req, res, { root, parseBody }) => {
    const body = await parseBody();
    const configPath = path.join(root, AIA_DIR, 'config.yaml');
    await fs.writeFile(configPath, body.content, 'utf-8');
    json(res, { ok: true });
  });

  // Get global user config
  router.get('/api/user-config', async (req, res) => {
    try {
      const config = await loadGlobalConfig();
      const configPath = getGlobalConfigPath();
      json(res, { parsed: config, path: configPath });
    } catch (e) {
      error(res, e.message, 500);
    }
  });

  // Update global user preferences
  router.patch('/api/user-config', async (req, res, { parseBody }) => {
    const body = await parseBody();

    try {
      const config = await loadGlobalConfig();

      // Update only user preference fields
      if (body.user_name !== undefined) config.user_name = body.user_name;
      if (body.communication_language !== undefined) config.communication_language = body.communication_language;

      await saveGlobalConfig(config);

      json(res, { ok: true, config });
    } catch (e) {
      error(res, e.message, 500);
    }
  });

  // Update project preferences (partial update)
  router.patch('/api/config/project', async (req, res, { root, parseBody }) => {
    const body = await parseBody();
    const configPath = path.join(root, AIA_DIR, 'config.yaml');

    if (!(await fs.pathExists(configPath))) {
      return error(res, 'config.yaml not found', 404);
    }

    const content = await fs.readFile(configPath, 'utf-8');
    const config = yaml.parse(content);

    // Update project preference fields
    if (body.projectName !== undefined) config.projectName = body.projectName;
    if (body.document_output_language !== undefined) config.document_output_language = body.document_output_language;

    const newContent = yaml.stringify(config);
    await fs.writeFile(configPath, newContent, 'utf-8');

    json(res, { ok: true, config });
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
