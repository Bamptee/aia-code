/**
 * @fileoverview Integration API routes — ClickUp browser, sync operations
 * @module ui/api/integrations
 */

import path from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { json, error } from '../router.js';
import { loadSyncConfig, saveSyncConfig } from '../../services/config.js';
import { createSyncProvider } from '../../providers/sync-manager.js';
import { ClickUpProvider } from '../../providers/clickup-provider.js';
import { loadMapping } from '../../providers/sync-mapping.js';
import {
  pushStory,
  pushStep,
  pullStory,
  getStoryExternalLink,
  batchCheckForChanges,
} from '../../services/sync-service.js';

/**
 * Read/write .env file helpers
 */
function readEnvFile(root) {
  const envPath = path.join(root, '.env');
  if (!existsSync(envPath)) return {};
  const entries = {};
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

function writeEnvFile(root, entries) {
  const envPath = path.join(root, '.env');
  const lines = [];
  // Preserve existing file with comments
  if (existsSync(envPath)) {
    const existing = readFileSync(envPath, 'utf-8').split('\n');
    const updatedKeys = new Set();
    for (const line of existing) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        lines.push(line);
        continue;
      }
      const eq = trimmed.indexOf('=');
      if (eq === -1) { lines.push(line); continue; }
      const key = trimmed.slice(0, eq).trim();
      if (key in entries) {
        lines.push(`${key}=${entries[key]}`);
        updatedKeys.add(key);
      } else {
        lines.push(line);
      }
    }
    // Append new keys
    for (const [key, value] of Object.entries(entries)) {
      if (!updatedKeys.has(key)) {
        lines.push(`${key}=${value}`);
      }
    }
  } else {
    for (const [key, value] of Object.entries(entries)) {
      lines.push(`${key}=${value}`);
    }
  }
  writeFileSync(envPath, lines.join('\n') + '\n', 'utf-8');
}

export function registerIntegrationRoutes(router) {

  // ─── Configuration ────────────────────────────────────────────

  router.get('/api/integrations/config', async (req, res, { root }) => {
    try {
      const config = await loadSyncConfig(root);
      if (!config) {
        // Check if API key exists in .env even without config
        const env = readEnvFile(root);
        const hasKey = Boolean(env.CLICKUP_API_KEY);
        return json(res, { configured: false, hasApiKey: hasKey });
      }
      const safe = { ...config };
      const apiKeyEnv = safe.clickup?.api_key_env || 'CLICKUP_API_KEY';
      const env = readEnvFile(root);
      const hasKey = Boolean(env[apiKeyEnv] || process.env[apiKeyEnv]);
      if (safe.clickup) {
        safe.clickup = { ...safe.clickup };
        delete safe.clickup.api_key_env;
      }
      json(res, { configured: true, hasApiKey: hasKey, ...safe });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  router.post('/api/integrations/test-connection', async (req, res, { root }) => {
    try {
      const config = await loadSyncConfig(root);
      if (!config) return error(res, 'Sync not configured', 400);
      const provider = createSyncProvider(config);
      if (!provider) return error(res, 'No provider configured', 400);
      const result = await provider.testConnection();
      json(res, result);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  // Test connection with a raw API key (for setup wizard before config is saved)
  router.post('/api/integrations/test-key', async (req, res, { root, parseBody }) => {
    try {
      const body = await parseBody(req);
      if (!body.apiKey) return error(res, 'apiKey is required', 400);
      const provider = new ClickUpProvider({ apiKey: body.apiKey, timeout: 10000 });
      const result = await provider.testConnection();
      json(res, result);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  // Browse with raw API key (for setup wizard — no saved config needed)
  router.post('/api/integrations/browse-with-key', async (req, res, { root, parseBody }) => {
    try {
      const body = await parseBody(req);
      if (!body.apiKey) return error(res, 'apiKey is required', 400);
      const provider = new ClickUpProvider({ apiKey: body.apiKey, timeout: 10000 });
      const result = await provider.browse(body.level, body.parentId);
      json(res, result);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  // Save full integration setup from UI (supports partial updates)
  router.post('/api/integrations/setup', async (req, res, { root, parseBody }) => {
    try {
      const body = await parseBody(req);

      // Save API key to .env if provided
      if (body.apiKey) {
        const envVarName = body.apiKeyEnv || 'CLICKUP_API_KEY';
        writeEnvFile(root, { [envVarName]: body.apiKey });
        process.env[envVarName] = body.apiKey;
      }

      // Load existing config for partial updates
      const existing = await loadSyncConfig(root);

      const syncConfig = {
        provider: 'clickup',
        auto_push: body.autoPush ?? existing?.auto_push ?? true,
        auto_pull_check: body.autoPullCheck ?? existing?.auto_pull_check ?? true,
        clickup: {
          workspace_id: body.workspaceId || existing?.clickup?.workspace_id || '',
          space_id: body.spaceId || existing?.clickup?.space_id || '',
          default_list_id: body.defaultListId || existing?.clickup?.default_list_id || '',
          api_key_env: body.apiKeyEnv || existing?.clickup?.api_key_env || 'CLICKUP_API_KEY',
          epic_as: body.epicAs || existing?.clickup?.epic_as || 'folder',
          status_map: existing?.clickup?.status_map || {
            pending: 'to do',
            'in-progress': 'in progress',
            done: 'complete',
            error: 'blocked',
          },
        },
      };

      await saveSyncConfig(syncConfig, root);
      json(res, { ok: true });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  // Disconnect integration
  router.post('/api/integrations/disconnect', async (req, res, { root }) => {
    try {
      await saveSyncConfig(null, root);
      json(res, { ok: true });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  // ─── Navigation (Browse) with TTL cache ─────────────────────────

  const browseCache = new Map();
  const CACHE_TTL = 60_000; // 1 minute

  function getCached(key) {
    const entry = browseCache.get(key);
    if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
    browseCache.delete(key);
    return null;
  }

  router.get('/api/integrations/browse/:level', async (req, res, { root, params, query }) => {
    try {
      const config = await loadSyncConfig(root);
      if (!config) return error(res, 'Sync not configured', 400);
      const provider = createSyncProvider(config);
      if (!provider) return error(res, 'No provider configured', 400);

      const page = query.page ? parseInt(query.page, 10) : 0;
      const cacheKey = `${params.level}:${query.parentId || ''}:${page}`;
      const cached = getCached(cacheKey);
      if (cached) return json(res, cached);

      const result = await provider.browse(params.level, query.parentId, { page });
      browseCache.set(cacheKey, { data: result, ts: Date.now() });
      json(res, result);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  router.get('/api/integrations/task/:taskId', async (req, res, { root, params }) => {
    try {
      const config = await loadSyncConfig(root);
      if (!config) return error(res, 'Sync not configured', 400);
      const provider = createSyncProvider(config);
      if (!provider) return error(res, 'No provider configured', 400);

      const task = await provider.getTask(params.taskId);
      json(res, task);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  // Search task by custom ID (e.g. "BB-32592")
  router.get('/api/integrations/search/:query', async (req, res, { root, params }) => {
    try {
      const config = await loadSyncConfig(root);
      if (!config) return error(res, 'Sync not configured', 400);
      const provider = createSyncProvider(config);
      if (!provider) return error(res, 'No provider configured', 400);

      const task = await provider.findTaskById(params.query);
      json(res, task);
    } catch (err) {
      error(res, err.message, 404);
    }
  });

  // Get custom fields for a list
  router.get('/api/integrations/fields/:listId', async (req, res, { root, params }) => {
    try {
      const config = await loadSyncConfig(root);
      if (!config) return error(res, 'Sync not configured', 400);
      const provider = createSyncProvider(config);
      if (!provider) return error(res, 'No provider configured', 400);

      const fields = await provider.getListFields(params.listId);
      json(res, { fields });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  // ─── Sync Operations ─────────────────────────────────────────

  router.post('/api/integrations/push', async (req, res, { root, parseBody }) => {
    try {
      const body = await parseBody(req);
      if (!body.slug) return error(res, 'slug is required', 400);

      let result;
      if (body.step) {
        result = await pushStep(body.slug, body.step, root);
      } else {
        result = await pushStory(body.slug, root);
      }
      json(res, result);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  router.post('/api/integrations/pull', async (req, res, { root, parseBody }) => {
    try {
      const body = await parseBody(req);
      if (!body.externalId) return error(res, 'externalId is required', 400);

      const result = await pullStory(body.externalId, root, { force: body.force });
      if (result.conflict) {
        return error(res, result.message, 409);
      }
      json(res, result);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  router.get('/api/integrations/mapping', async (req, res, { root }) => {
    try {
      const config = await loadSyncConfig(root);
      if (!config?.provider) return json(res, {});
      const mapping = await loadMapping(config.provider, root);
      json(res, mapping);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  router.get('/api/integrations/changes', async (req, res, { root }) => {
    try {
      const changes = await batchCheckForChanges(root);
      json(res, { changes });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  // ─── Story Link ───────────────────────────────────────────────

  router.get('/api/integrations/link/:slug', async (req, res, { root, params }) => {
    try {
      const link = await getStoryExternalLink(params.slug, root);
      json(res, link || { linked: false });
    } catch (err) {
      error(res, err.message, 500);
    }
  });
}
