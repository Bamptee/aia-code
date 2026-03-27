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

  // Download images from ClickUp attachments and step content
  const attachmentsDir = path.join(storyDir, 'attachments');
  const imageMap = {}; // url → local relative path

  // Download non-aia attachments (images, docs) from the task
  if (pulled.attachments?.length) {
    await fs.ensureDir(attachmentsDir);
    const usedNames = new Set();
    for (const att of pulled.attachments) {
      const downloadUrl = att.url_w_query || att.url;
      if (!downloadUrl || !att.filename) continue;
      const ext = (att.type || att.filename.split('.').pop() || '').toLowerCase();
      const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
      if (!isImage) continue;
      try {
        const res = await fetch(downloadUrl);
        if (!res.ok) continue;
        const buffer = Buffer.from(await res.arrayBuffer());
        // Deduplicate filenames (ClickUp often names all images "image.png")
        const base = att.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        let safeFilename = base;
        if (usedNames.has(safeFilename)) {
          const nameWithoutExt = base.replace(/\.[^.]+$/, '');
          const fileExt = base.match(/\.[^.]+$/)?.[0] || `.${ext}`;
          let counter = 2;
          while (usedNames.has(safeFilename)) {
            safeFilename = `${nameWithoutExt}-${counter}${fileExt}`;
            counter++;
          }
        }
        usedNames.add(safeFilename);
        await fs.writeFile(path.join(attachmentsDir, safeFilename), buffer);
        imageMap[att.url] = `attachments/${safeFilename}`;
        // Also map url_w_query so both URL forms get replaced
        if (att.url_w_query && att.url_w_query !== att.url) {
          imageMap[att.url_w_query] = `attachments/${safeFilename}`;
        }
        writtenFiles.push(`attachments/${safeFilename}`);
      } catch { /* skip failed downloads */ }
    }
  }

  // Write all .md step files, downloading inline images and replacing URLs
  const actualSteps = [];
  for (const [stepName, stepData] of Object.entries(pulled.steps || {})) {
    if (stepName === 'status.yaml') continue;
    let content = stepData.content;

    // Find and download inline images (markdown ![alt](url) and HTML <img src="url">)
    const imgRegex = /!\[[^\]]*\]\((https?:\/\/[^)]+)\)|<img[^>]+src=["'](https?:\/\/[^"']+)["']/g;
    let match;
    while ((match = imgRegex.exec(content)) !== null) {
      const imgUrl = match[1] || match[2];
      if (imageMap[imgUrl]) continue; // already downloaded
      try {
        await fs.ensureDir(attachmentsDir);
        const res = await fetch(imgUrl);
        if (!res.ok) continue;
        const ct = res.headers.get('content-type') || '';
        if (!ct.startsWith('image/')) continue;
        const ext = ct.split('/')[1]?.split(';')[0] || 'png';
        const filename = `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
        const buffer = Buffer.from(await res.arrayBuffer());
        await fs.writeFile(path.join(attachmentsDir, filename), buffer);
        imageMap[imgUrl] = `attachments/${filename}`;
        writtenFiles.push(`attachments/${filename}`);
      } catch { /* skip */ }
    }

    // Replace all remote image URLs with local paths
    for (const [remoteUrl, localPath] of Object.entries(imageMap)) {
      content = content.replaceAll(remoteUrl, localPath);
    }

    // For init.md: insert unreferenced images into the text
    if (stepName === 'init' && Object.keys(imageMap).length > 0) {
      const referencedImages = new Set();
      for (const localPath of Object.values(imageMap)) {
        if (content.includes(localPath)) referencedImages.add(localPath);
      }
      const unreferenced = [...new Set(Object.values(imageMap).filter(p => !referencedImages.has(p)))];

      if (unreferenced.length > 0) {
        // Heuristic: try to insert images at empty lines in the text (likely image placeholders)
        // Split content into lines, find empty lines that follow a non-empty line
        const lines = content.split('\n');
        const result = [];
        let imgIdx = 0;

        for (let i = 0; i < lines.length; i++) {
          result.push(lines[i]);
          // Insert an image at empty lines that follow content (likely where an image was)
          if (
            imgIdx < unreferenced.length &&
            lines[i].trim() === '' &&
            i > 0 && lines[i - 1].trim() !== '' &&
            // Don't insert at the very first empty line (could be just paragraph spacing)
            i > 1
          ) {
            const localPath = unreferenced[imgIdx];
            const filename = localPath.split('/').pop();
            result.push(`![${filename}](${localPath})`);
            result.push('');
            imgIdx++;
          }
        }

        // Append remaining images at the end if we ran out of empty line slots
        if (imgIdx < unreferenced.length) {
          result.push('', '---', '', '## Additional Images', '');
          for (; imgIdx < unreferenced.length; imgIdx++) {
            const localPath = unreferenced[imgIdx];
            const filename = localPath.split('/').pop();
            result.push(`![${filename}](${localPath})`, '');
          }
        }

        content = result.join('\n');
      }
    }

    const filePath = path.join(storyDir, `${stepName}.md`);
    await fs.writeFile(filePath, content, 'utf-8');
    writtenFiles.push(`${stepName}.md`);
    actualSteps.push(stepName);
  }

  // Build status.yaml — start from pulled attachment if available, then merge actual steps
  const pulledStatus = pulled.steps?.['status.yaml'];
  let statusData;
  if (pulledStatus?.content) {
    statusData = yaml.parse(pulledStatus.content) || {};
  } else {
    const { getDefaultEpicSlug } = await import('./epic.js');
    const defaultEpic = await getDefaultEpicSlug(root).catch(() => 'general');
    statusData = {
      slug,
      name: pulled.name,
      type: 'story',
      epic: defaultEpic,
      createdAt: new Date().toISOString(),
    };
  }

  // Always ensure steps reflect what was actually downloaded
  if (!statusData.steps) statusData.steps = {};
  for (const stepName of actualSteps) {
    statusData.steps[stepName] = statusData.steps[stepName] || 'done';
  }

  // Determine phase from actual steps
  const devStepNames = ['spec-tech', 'dev-plan', 'implement', 'review'];
  const hasDevSteps = actualSteps.some(s => devStepNames.includes(s));
  if (!statusData.phase || statusData.phase === 'pending') {
    statusData.phase = hasDevSteps ? 'development' : 'discovery';
  }

  // Ensure slug and name are current
  statusData.slug = slug;
  statusData.name = pulled.name || statusData.name;

  await fs.writeFile(
    path.join(storyDir, 'status.yaml'),
    yaml.stringify(statusData),
    'utf-8',
  );
  writtenFiles.push('status.yaml');

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
 * Preview what a pull would change (dry-run)
 */
export async function previewPull(externalIdOrUrl, root = process.cwd()) {
  const provider = await getSyncProvider(root);
  if (!provider) throw new Error('Sync not configured.');

  const externalId = parseExternalId(externalIdOrUrl);
  const existingSlug = await findByExternalId(provider.getProviderName(), externalId, root);
  const pulled = await provider.pullStory(externalId);
  const slug = existingSlug || pulled.slug;
  const storyDir = path.join(root, AIA_DIR, 'stories', slug);
  const isNew = !(await fs.pathExists(storyDir));

  const changes = [];
  for (const [stepName, stepData] of Object.entries(pulled.steps || {})) {
    if (stepName === 'status.yaml') continue;
    const filePath = path.join(storyDir, `${stepName}.md`);
    const localExists = await fs.pathExists(filePath);
    if (!localExists) {
      changes.push({ file: `${stepName}.md`, status: 'new' });
    } else {
      const localContent = await fs.readFile(filePath, 'utf-8');
      if (localContent !== stepData.content) {
        changes.push({ file: `${stepName}.md`, status: 'modified', localSize: localContent.length, remoteSize: stepData.content.length });
      } else {
        changes.push({ file: `${stepName}.md`, status: 'unchanged' });
      }
    }
  }

  return { slug, name: pulled.name, isNew, changes, url: pulled.url, taskId: externalId };
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
