import path from 'node:path';
import fs from 'fs-extra';
import yaml from 'yaml';
import { AIA_DIR, STEP_ORDER } from '../../constants.js';
import { loadGlobalConfig, saveGlobalConfig, getGlobalConfigPath, getApps, setApps, toggleApp } from '../../services/config.js';
import { scanApps } from '../../services/apps.js';
import { DEFAULT_PROMPTS } from '../../services/prompts.js';
import { json, error } from '../router.js';

function parseFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (match) {
    try {
      return { frontMatter: yaml.parse(match[1]), body: content.slice(match[0].length), parseError: null };
    } catch (e) {
      return { frontMatter: null, body: content, parseError: e.message };
    }
  }
  return { frontMatter: null, body: content, parseError: null };
}

export function registerConfigRoutes(router) {
  // GET /api/apps - List configured apps
  router.get('/api/apps', async (req, res, { root }) => {
    const apps = await getApps(root);
    json(res, apps);
  });

  // POST /api/apps/scan - Re-scan and update apps
  router.post('/api/apps/scan', async (req, res, { root }) => {
    const scanned = await scanApps(root);
    const existing = await getApps(root);
    // Merge: keep enabled status from existing apps
    const merged = scanned.map(s => {
      const ex = existing.find(e => e.path === s.path);
      return ex ? { ...s, enabled: ex.enabled } : s;
    });
    await setApps(merged, root);
    json(res, merged);
  });

  // PATCH /api/apps/:name - Toggle app enabled status
  router.patch('/api/apps/:name', async (req, res, { params, root, parseBody }) => {
    const { enabled } = await parseBody();
    await toggleApp(params.name, enabled, root);
    json(res, { ok: true });
  });

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

  // ============== Prompt Templates ==============

  // List prompt templates with parsed front matter
  router.get('/api/prompts', async (req, res, { root }) => {
    const dir = path.join(root, AIA_DIR, 'prompts');
    if (!(await fs.pathExists(dir))) return json(res, []);
    const prompts = [];
    for (const step of STEP_ORDER) {
      const filePath = path.join(dir, `${step}.md`);
      if (await fs.pathExists(filePath)) {
        const content = await fs.readFile(filePath, 'utf-8');
        const { frontMatter } = parseFrontMatter(content);
        const hasDefault = DEFAULT_PROMPTS[step] != null;
        const isDefault = hasDefault && content.trim() === DEFAULT_PROMPTS[step].trim();
        prompts.push({ step, phase: frontMatter?.phase ?? null, type: frontMatter?.type ?? null, scan_required: frontMatter?.scan_required ?? false, modified: hasDefault ? !isDefault : false });
      }
    }
    json(res, prompts);
  });

  // Read prompt template
  router.get('/api/prompts/:step', async (req, res, { params, root }) => {
    if (!STEP_ORDER.includes(params.step)) return error(res, 'Invalid step', 400);
    const filePath = path.join(root, AIA_DIR, 'prompts', `${params.step}.md`);
    if (!(await fs.pathExists(filePath))) return error(res, 'Not found', 404);
    const content = await fs.readFile(filePath, 'utf-8');
    const { frontMatter, parseError } = parseFrontMatter(content);
    const hasDefault = DEFAULT_PROMPTS[params.step] != null;
    const isDefault = hasDefault && content.trim() === DEFAULT_PROMPTS[params.step].trim();
    json(res, { step: params.step, content, frontMatter, modified: hasDefault ? !isDefault : false, parseError });
  });

  // Save prompt template
  router.put('/api/prompts/:step', async (req, res, { params, root, parseBody }) => {
    if (!STEP_ORDER.includes(params.step)) return error(res, 'Invalid step', 400);
    const body = await parseBody();
    if (typeof body.content !== 'string') return error(res, 'content must be a string', 400);
    const filePath = path.join(root, AIA_DIR, 'prompts', `${params.step}.md`);
    // F14: Warn if front matter is missing or malformed
    const { parseError } = parseFrontMatter(body.content);
    await fs.writeFile(filePath, body.content, 'utf-8');
    json(res, { ok: true, frontMatterWarning: parseError || null });
  });

  // Reset prompt template to default
  router.post('/api/prompts/:step/reset', async (req, res, { params, root }) => {
    if (!STEP_ORDER.includes(params.step)) return error(res, 'Invalid step', 400);
    const defaultContent = DEFAULT_PROMPTS[params.step];
    if (!defaultContent) return error(res, 'No default template for this step', 404);
    const filePath = path.join(root, AIA_DIR, 'prompts', `${params.step}.md`);
    await fs.writeFile(filePath, defaultContent, 'utf-8');
    json(res, { ok: true, content: defaultContent });
  });
}
