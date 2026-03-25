/**
 * @fileoverview Epic Service - YAML-based epic management
 * Stores epics in .aia/epics/<slug>/status.yaml
 */

import path from 'node:path';
import fs from 'fs-extra';
import yaml from 'yaml';
import { AIA_DIR } from '../constants.js';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Generate a unique slug from a name
 */
function generateSlug(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30);
  const shortId = Math.random().toString(36).substring(2, 8);
  return `${base}-${shortId}`;
}

function validateSlug(slug) {
  if (!slug || !SLUG_RE.test(slug)) {
    throw new Error(`Invalid slug "${slug}". Use lowercase alphanumeric with hyphens.`);
  }
}

/**
 * Get epics directory path
 */
export function getEpicsDir(root = process.cwd()) {
  return path.join(root, AIA_DIR, 'epics');
}

/**
 * Get epic directory path
 */
export function getEpicDir(slug, root = process.cwd()) {
  return path.join(getEpicsDir(root), slug);
}

/**
 * Get epic status.yaml path
 */
function getStatusPath(slug, root) {
  return path.join(getEpicDir(slug, root), 'status.yaml');
}

/**
 * Build status.yaml content for a new epic
 */
function buildStatusYaml(slug, { name, description = null, status = 'discovery', plannedPeriod = null } = {}) {
  const epicData = {
    slug,
    name: name || slug,
    description,
    status,
    plannedPeriod,
    isGeneral: false,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return yaml.stringify(epicData);
}

/**
 * Build init.md content for a new epic
 */
function buildInitMd(name, description) {
  return `# ${name}

${description || '<!-- Add epic description here -->'}

## Goals


## Success Criteria


## Notes

`;
}

/**
 * Create a new epic
 */
export async function createEpic(name, root = process.cwd(), options = {}) {
  const slug = options.slug || generateSlug(name);
  validateSlug(slug);

  const epicDir = getEpicDir(slug, root);

  if (await fs.pathExists(epicDir)) {
    throw new Error(`Epic with slug "${slug}" already exists.`);
  }

  await fs.ensureDir(epicDir);

  // Create status.yaml
  const statusContent = buildStatusYaml(slug, { name, ...options });
  await fs.writeFile(path.join(epicDir, 'status.yaml'), statusContent, 'utf-8');

  // Create init.md
  const initContent = buildInitMd(name, options.description);
  await fs.writeFile(path.join(epicDir, 'init.md'), initContent, 'utf-8');

  // Return the full epic object
  return loadEpic(slug, root);
}

/**
 * Load epic status
 */
export async function loadEpic(slug, root = process.cwd()) {
  const statusPath = getStatusPath(slug, root);

  if (!(await fs.pathExists(statusPath))) {
    throw new Error(`Epic "${slug}" not found.`);
  }

  const raw = await fs.readFile(statusPath, 'utf-8');
  return yaml.parse(raw);
}

/**
 * Update epic
 */
export async function updateEpic(slug, updates, root = process.cwd()) {
  const epic = await loadEpic(slug, root);

  const allowedFields = ['name', 'description', 'status', 'plannedPeriod', 'isArchived'];
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      epic[field] = updates[field];
    }
  }

  epic.updatedAt = new Date().toISOString();

  const statusPath = getStatusPath(slug, root);
  await fs.writeFile(statusPath, yaml.stringify(epic), 'utf-8');

  return epic;
}

/**
 * Delete epic (must have no stories)
 */
export async function deleteEpic(slug, root = process.cwd()) {
  const epic = await loadEpic(slug, root);

  if (epic.isGeneral) {
    throw new Error('Cannot delete the General epic.');
  }

  // Check if any stories reference this epic
  const storiesDir = path.join(root, AIA_DIR, 'stories');
  if (await fs.pathExists(storiesDir)) {
    const entries = await fs.readdir(storiesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const storyStatusPath = path.join(storiesDir, entry.name, 'status.yaml');
        if (await fs.pathExists(storyStatusPath)) {
          const raw = await fs.readFile(storyStatusPath, 'utf-8');
          const storyStatus = yaml.parse(raw);
          if (storyStatus.epic === slug) {
            throw new Error(`Cannot delete epic "${slug}". Story "${entry.name}" still references it.`);
          }
        }
      }
    }
  }

  const epicDir = getEpicDir(slug, root);
  await fs.remove(epicDir);
}

/**
 * List all epics
 */
export async function listEpics(root = process.cwd(), options = {}) {
  const epicsDir = getEpicsDir(root);

  if (!(await fs.pathExists(epicsDir))) {
    return [];
  }

  const entries = await fs.readdir(epicsDir, { withFileTypes: true });
  const epics = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      try {
        const epic = await loadEpic(entry.name, root);

        // Apply filters
        if (!options.includeArchived && epic.isArchived) continue;
        if (options.status && epic.status !== options.status) continue;

        // Count stories for this epic
        const storyCount = await countStoriesForEpic(entry.name, root);

        epics.push({ ...epic, storyCount });
      } catch {
        // Skip invalid epics
      }
    }
  }

  return epics;
}

/**
 * Count stories for an epic
 */
async function countStoriesForEpic(epicSlug, root) {
  const storiesDir = path.join(root, AIA_DIR, 'stories');

  if (!(await fs.pathExists(storiesDir))) {
    return 0;
  }

  const entries = await fs.readdir(storiesDir, { withFileTypes: true });
  let count = 0;

  for (const entry of entries) {
    if (entry.isDirectory()) {
      try {
        const storyStatusPath = path.join(storiesDir, entry.name, 'status.yaml');
        if (await fs.pathExists(storyStatusPath)) {
          const raw = await fs.readFile(storyStatusPath, 'utf-8');
          const storyStatus = yaml.parse(raw);
          if (storyStatus.epic === epicSlug) {
            count++;
          }
        }
      } catch {
        // Skip invalid stories
      }
    }
  }

  return count;
}

/**
 * Get stories for an epic
 */
export async function getEpicStories(epicSlug, root = process.cwd()) {
  const storiesDir = path.join(root, AIA_DIR, 'stories');

  if (!(await fs.pathExists(storiesDir))) {
    return [];
  }

  const entries = await fs.readdir(storiesDir, { withFileTypes: true });
  const stories = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      try {
        const storyStatusPath = path.join(storiesDir, entry.name, 'status.yaml');
        if (await fs.pathExists(storyStatusPath)) {
          const raw = await fs.readFile(storyStatusPath, 'utf-8');
          const storyStatus = yaml.parse(raw);
          if (storyStatus.epic === epicSlug && !storyStatus.deletedAt) {
            stories.push(storyStatus);
          }
        }
      } catch {
        // Skip invalid stories
      }
    }
  }

  return stories;
}

/**
 * Ensure General epic exists
 */
export async function ensureGeneralEpic(root = process.cwd()) {
  const generalSlug = 'general';
  const epicDir = getEpicDir(generalSlug, root);

  if (await fs.pathExists(epicDir)) {
    return loadEpic(generalSlug, root);
  }

  await fs.ensureDir(epicDir);

  const epicData = {
    slug: generalSlug,
    name: 'General',
    description: 'Default epic for unorganized items',
    status: 'in_progress',
    plannedPeriod: null,
    isGeneral: true,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(path.join(epicDir, 'status.yaml'), yaml.stringify(epicData), 'utf-8');
  await fs.writeFile(path.join(epicDir, 'init.md'), buildInitMd('General', 'Default epic for unorganized items'), 'utf-8');

  return epicData;
}

/**
 * Archive an epic
 */
export async function archiveEpic(slug, root = process.cwd()) {
  return updateEpic(slug, { isArchived: true }, root);
}

/**
 * Unarchive an epic
 */
export async function unarchiveEpic(slug, root = process.cwd()) {
  return updateEpic(slug, { isArchived: false }, root);
}

/**
 * Calculate epic progress
 */
export async function calculateEpicProgress(slug, root = process.cwd()) {
  const stories = await getEpicStories(slug, root);

  if (stories.length === 0) {
    return { total: 0, completed: 0, percentage: 0 };
  }

  // A story is "completed" when phase is 'done' OR all relevant steps are done/skipped
  const completed = stories.filter(s => {
    const phase = s.phase || 'discovery';
    if (phase === 'done') return true;
    const steps = s.steps || {};
    const skippedSteps = s.skippedSteps || [];
    const relevantStepKeys = phase === 'discovery'
      ? ['init', 'brainstorming', 'spec-func']
      : ['spec-tech', 'dev-plan', 'implement', 'review'];
    return relevantStepKeys.every(k => steps[k] === 'done' || skippedSteps.includes(k));
  }).length;
  const percentage = Math.round((completed / stories.length) * 100);

  return { total: stories.length, completed, percentage };
}

/**
 * Get the default (General) epic slug
 * Creates the General epic if it doesn't exist
 * @param {string} root - Project root directory
 * @returns {Promise<string>} The default epic slug ('general')
 */
export async function getDefaultEpicSlug(root = process.cwd()) {
  await ensureGeneralEpic(root);
  return 'general';
}

/**
 * List all epics with story counts for dropdown display
 * Sorted by: General first, then alphabetically by name
 * @param {string} root - Project root directory
 * @returns {Promise<Array>} Array of epics with storyCount
 */
export async function listEpicsForDropdown(root = process.cwd()) {
  const epics = await listEpics(root, { includeArchived: false });

  // Sort: General first, then alphabetically by name
  epics.sort((a, b) => {
    if (a.isGeneral) return -1;
    if (b.isGeneral) return 1;
    return a.name.localeCompare(b.name);
  });

  return epics.map(epic => ({
    id: epic.slug,
    slug: epic.slug,
    name: epic.name,
    isDefault: epic.isGeneral || false,
    storyCount: epic.storyCount || 0,
  }));
}

/**
 * Get all existing story slugs
 * Used for slug collision checking
 * @param {string} root - Project root directory
 * @returns {Promise<string[]>} Array of existing story slugs
 */
export async function getAllStorySlugs(root = process.cwd()) {
  const storiesDir = path.join(root, AIA_DIR, 'stories');

  if (!(await fs.pathExists(storiesDir))) {
    return [];
  }

  const entries = await fs.readdir(storiesDir, { withFileTypes: true });
  const slugs = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      slugs.push(entry.name);
    }
  }

  return slugs;
}
