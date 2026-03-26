/**
 * @fileoverview Sync service — orchestrates provider + mapping + filesystem
 * @module services/sync-service
 */

import fs from 'fs-extra';
import path from 'node:path';
import { AIA_DIR } from '../constants.js';
import { loadSyncConfig } from './config.js';
import { getSyncProvider } from '../providers/sync-manager.js';
import {
  loadMapping,
  getMapping,
  setMapping,
  findByExternalId,
} from '../providers/sync-mapping.js';
import { loadStatus, getStoryDirPath } from './status.js';

/**
 * Push a full story to the external provider
 */
export async function pushStory(slug, root = process.cwd(), options = {}) {
  const provider = await getSyncProvider(root);
  if (!provider) throw new Error('Sync not configured. Run `aia sync setup` first.');

  const status = await loadStatus(slug, root);
  const storyDir = await getStoryDirPath(slug, root);

  // Build storyData from local files
  const steps = {};
  const storyFiles = await fs.readdir(storyDir).catch(() => []);
  for (const file of storyFiles) {
    if (!file.endsWith('.md')) continue;
    const stepName = file.replace('.md', '');
    const content = await fs.readFile(path.join(storyDir, file), 'utf-8');
    steps[stepName] = { content, status: status?.steps?.[stepName] || 'done' };
  }

  // Include status.yaml as a special step so it gets pushed as attachment
  const statusYamlPath = path.join(storyDir, 'status.yaml');
  if (await fs.pathExists(statusYamlPath)) {
    const statusContent = await fs.readFile(statusYamlPath, 'utf-8');
    steps['status.yaml'] = { content: statusContent };
  }

  // Check existing mapping
  const existing = await getMapping(provider.getProviderName(), slug, root);

  const storyData = {
    name: status?.name || slug,
    description: steps.init?.content || '',
    status: status?.phase || 'pending',
    steps,
    existingTaskId: existing?.taskId || null,
  };

  const result = await provider.pushStory(slug, storyData);

  // Update mapping
  await setMapping(provider.getProviderName(), slug, {
    taskId: result.taskId,
    url: result.url,
    lastPush: new Date().toISOString(),
  }, root);

  return result;
}

/**
 * Push a single step
 */
export async function pushStep(slug, step, root = process.cwd()) {
  const provider = await getSyncProvider(root);
  if (!provider) throw new Error('Sync not configured. Run `aia sync setup` first.');

  const storyDir = await getStoryDirPath(slug, root);
  const filePath = path.join(storyDir, `${step}.md`);
  const content = await fs.readFile(filePath, 'utf-8').catch(() => '');
  if (!content) return { ok: true, skipped: true };

  const existing = await getMapping(provider.getProviderName(), slug, root);
  const status = await loadStatus(slug, root);

  const result = await provider.pushStep(slug, step, content, {
    taskId: existing?.taskId,
    status: status?.steps?.[step],
  });

  // Update lastPush
  await setMapping(provider.getProviderName(), slug, {
    ...existing,
    lastPush: new Date().toISOString(),
  }, root);

  return result;
}

/**
 * Pull a story from external provider
 */
export async function pullStory(externalIdOrUrl, root = process.cwd(), options = {}) {
  const provider = await getSyncProvider(root);
  if (!provider) throw new Error('Sync not configured. Run `aia sync setup` first.');

  // Extract ID from URL if needed
  const externalId = parseExternalId(externalIdOrUrl);

  // Check for existing mapping (reverse lookup)
  const existingSlug = await findByExternalId(provider.getProviderName(), externalId, root);

  const pulled = await provider.pullStory(externalId);
  const slug = existingSlug || pulled.slug;

  // Check for conflicts — only warn if remote hasn't changed since last sync
  if (existingSlug && !options.force) {
    const existing = await getMapping(provider.getProviderName(), existingSlug, root);
    const lastPull = existing?.lastPull;
    if (lastPull && pulled.dateUpdated) {
      const remoteDate = new Date(parseInt(pulled.dateUpdated, 10));
      const lastPullDate = new Date(lastPull);
      if (lastPullDate >= remoteDate) {
        return {
          conflict: true,
          message: 'No remote changes since last pull. Use --force to overwrite anyway.',
          slug,
        };
      }
    }
  }

  // Write files to local
  const storyDir = path.join(root, AIA_DIR, 'stories', slug);
  await fs.ensureDir(storyDir);
  const yaml = (await import('yaml')).default;

  const writtenFiles = [];

  // Check if status.yaml was pushed as attachment — use it directly
  const pulledStatus = pulled.steps?.['status.yaml'];
  if (pulledStatus?.content) {
    await fs.writeFile(path.join(storyDir, 'status.yaml'), pulledStatus.content, 'utf-8');
    writtenFiles.push('status.yaml');
  }

  for (const [stepName, stepData] of Object.entries(pulled.steps || {})) {
    if (stepName === 'status.yaml') continue; // already handled above
    const filePath = path.join(storyDir, `${stepName}.md`);
    await fs.writeFile(filePath, stepData.content, 'utf-8');
    writtenFiles.push(`${stepName}.md`);
  }

  // Generate status.yaml if not pulled from remote
  if (!pulledStatus?.content) {
    const { getDefaultEpicSlug } = await import('./epic.js');
    const defaultEpic = await getDefaultEpicSlug(root).catch(() => 'general');
    const devSteps = ['spec-tech', 'dev-plan', 'implement', 'review'];
    const hasDevSteps = Object.keys(pulled.steps || {}).some(s => devSteps.includes(s));
    const statusData = {
      slug,
      name: pulled.name,
      phase: hasDevSteps ? 'development' : 'discovery',
      type: 'story',
      epic: defaultEpic,
      createdAt: new Date().toISOString(),
      steps: {},
    };
    for (const stepName of Object.keys(pulled.steps || {})) {
      statusData.steps[stepName] = 'done';
    }
    await fs.writeFile(
      path.join(storyDir, 'status.yaml'),
      yaml.stringify(statusData),
      'utf-8',
    );
    writtenFiles.push('status.yaml');
  }

  // Update mapping
  await setMapping(provider.getProviderName(), slug, {
    taskId: externalId,
    url: pulled.url,
    lastPull: new Date().toISOString(),
  }, root);

  // Determine phase for routing
  let phase = 'discovery';
  if (pulledStatus?.content) {
    const parsed = yaml.parse(pulledStatus.content);
    phase = parsed?.phase || 'discovery';
  } else {
    const devStepNames = ['spec-tech', 'dev-plan', 'implement', 'review'];
    if (Object.keys(pulled.steps || {}).some(s => devStepNames.includes(s))) {
      phase = 'development';
    }
  }

  return { slug, writtenFiles, url: pulled.url, name: pulled.name, phase, isNew: !existingSlug };
}

/**
 * Check for remote changes on a story
 */
export async function checkForRemoteChanges(slug, root = process.cwd()) {
  const provider = await getSyncProvider(root);
  if (!provider) return null;

  const existing = await getMapping(provider.getProviderName(), slug, root);
  if (!existing?.taskId) return null;

  const remoteDate = await provider.getRemoteUpdatedAt(existing.taskId);
  if (!remoteDate) return null;

  const lastSync = existing.lastPush || existing.lastPull;
  if (!lastSync) return { hasChanges: true, remoteDate, localDate: null };

  const localDate = new Date(lastSync);
  return {
    hasChanges: remoteDate > localDate,
    remoteDate,
    localDate,
  };
}

/**
 * Batch check all synced stories for changes
 */
export async function batchCheckForChanges(root = process.cwd()) {
  const provider = await getSyncProvider(root);
  if (!provider) return [];

  const mapping = await loadMapping(provider.getProviderName(), root);
  const entries = Object.entries(mapping);
  const changed = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async ([slug, entry]) => {
        const result = await checkForRemoteChanges(slug, root);
        if (result?.hasChanges) {
          return { slug, ...result, url: entry.url };
        }
        return null;
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        changed.push(r.value);
      }
    }
  }

  return changed;
}

/**
 * Get the external link for a story
 */
export async function getStoryExternalLink(slug, root = process.cwd()) {
  const syncConfig = await loadSyncConfig(root);
  if (!syncConfig?.provider || syncConfig.provider === 'none') return null;

  const existing = await getMapping(syncConfig.provider, slug, root);
  if (!existing) return null;

  return { url: existing.url, taskId: existing.taskId, provider: syncConfig.provider };
}

// ─── Helpers ──────────────────────────────────────────────────────

function parseExternalId(input) {
  // Parse ClickUp URL formats:
  // https://app.clickup.com/t/abc123
  // https://app.clickup.com/t/86abc123
  // https://app.clickup.com/{workspace}/v/dc/{view}/{task_id}
  const shortMatch = input.match(/https?:\/\/app\.clickup\.com\/t\/([a-z0-9]+)/i);
  if (shortMatch) return shortMatch[1];
  const longMatch = input.match(/https?:\/\/app\.clickup\.com\/[^/]+\/v\/\w+\/[^/]+\/([a-z0-9]+)/i);
  if (longMatch) return longMatch[1];
  return input; // assume it's already an ID
}
