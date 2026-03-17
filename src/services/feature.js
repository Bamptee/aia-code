import path from 'node:path';
import fs from 'fs-extra';
import yaml from 'yaml';
import { AIA_DIR, FEATURE_STEPS, DEFAULT_FEATURE_TYPE, FEATURE_TYPES, LEGACY_FEATURES_DIR, STORY_PHASES, SKIPPABLE_STEPS } from '../constants.js';
import { generateSlug as generateSlugFromService } from '../epic/services/slug-service.js';
import { getDefaultEpicSlug, getAllStorySlugs } from './epic.js';

const STORY_FILES = [
  'status.yaml',
  'init.md',
  ...FEATURE_STEPS.map((s) => `${s}.md`),
];

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Generate a unique slug from a name
 * @param {string} name - Display name
 * @returns {string} Unique slug (name-shortid)
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

export function validateSlug(slug) {
  if (!slug || !SLUG_RE.test(slug)) {
    throw new Error(
      `Invalid slug "${slug}". Use lowercase alphanumeric with hyphens.`,
    );
  }
}

// Legacy support
export function validateFeatureName(name) {
  validateSlug(name);
}

function buildInitMd(name) {
  return `# ${name}

<!-- Describe your story here. This file is injected into every step as context. -->
<!-- Add any initial specs, requirements, mockups, or notes you already have. -->

## Description


## Existing specs


## Constraints

`;
}

function buildStatusYaml(slug, { name, type = DEFAULT_FEATURE_TYPE, apps = [], epic = null, phase = STORY_PHASES.DISCOVERY, createdFrom = 'product' } = {}) {
  // Validate type
  const validType = FEATURE_TYPES.includes(type) ? type : DEFAULT_FEATURE_TYPE;

  // Validate apps - ensure it's an array of strings
  const validApps = Array.isArray(apps)
    ? apps.filter(a => typeof a === 'string' && a.trim()).map(a => a.trim())
    : [];

  // Validate createdFrom
  const validCreatedFrom = ['dev', 'product'].includes(createdFrom) ? createdFrom : 'product';

  const steps = {};
  for (const step of FEATURE_STEPS) {
    steps[step] = 'pending';
  }

  // Determine first step based on phase (V3 step names)
  const currentStep = phase === STORY_PHASES.DEVELOPMENT ? 'spec-tech' : 'init';

  // Keep flow for backwards compatibility (deprecated but still used in some places)
  const flow = 'full';

  const status = {
    slug,
    name: name || slug,
    epic: epic || null,
    phase,
    type: validType,
    flow, // Deprecated - kept for backwards compatibility
    current_step: currentStep,
    createdFrom: validCreatedFrom,
    createdAt: new Date().toISOString(),
    steps,
    skippedSteps: [], // Steps that are skipped (count as done for progress)
    knowledge: ['backend'],
  };

  if (validApps.length > 0) {
    status.apps = validApps;
  }

  return yaml.stringify(status);
}

/**
 * Get stories directory path (with legacy fallback)
 */
export function getStoriesDir(root = process.cwd()) {
  return path.join(root, AIA_DIR, 'stories');
}

/**
 * Get legacy features directory path
 */
export function getLegacyFeaturesDir(root = process.cwd()) {
  return path.join(root, AIA_DIR, LEGACY_FEATURES_DIR);
}

/**
 * Get story directory (checks stories first, then legacy features)
 */
export async function getStoryDir(slugOrName, root = process.cwd()) {
  const storiesDir = getStoriesDir(root);
  const storyPath = path.join(storiesDir, slugOrName);

  if (await fs.pathExists(storyPath)) {
    return storyPath;
  }

  // Legacy fallback
  const legacyPath = path.join(getLegacyFeaturesDir(root), slugOrName);
  if (await fs.pathExists(legacyPath)) {
    return legacyPath;
  }

  return null;
}

export async function createStory(name, root = process.cwd(), options = {}) {
  // Generate slug using the slug service if not provided
  let slug = options.slug;
  if (!slug) {
    const existingSlugs = await getAllStorySlugs(root);
    slug = generateSlugFromService(name, existingSlugs);
  }
  validateSlug(slug);

  // Auto-assign to general epic if no epic provided
  let epic = options.epic;
  if (!epic) {
    epic = await getDefaultEpicSlug(root);
  }

  const storyDir = path.join(getStoriesDir(root), slug);

  if (await fs.pathExists(storyDir)) {
    throw new Error(`Story with slug "${slug}" already exists.`);
  }

  await fs.ensureDir(storyDir);

  for (const file of STORY_FILES) {
    const filePath = path.join(storyDir, file);
    let content = '';
    if (file === 'status.yaml') content = buildStatusYaml(slug, { name, epic, ...options });
    else if (file === 'init.md') content = buildInitMd(name);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  return { slug, name, epic, dir: storyDir };
}

// Legacy wrapper
export async function createFeature(name, root = process.cwd(), options = {}) {
  // For backwards compatibility, use name as slug if it's a valid slug
  if (SLUG_RE.test(name) && !options.slug) {
    options.slug = name;
  }
  return createStory(name, root, { ...options, phase: STORY_PHASES.DEVELOPMENT });
}

/**
 * Load story status from YAML file
 * @param {string} slug - Story slug
 * @param {string} root - Project root directory
 * @returns {Promise<Object>} Story status object
 */
export async function loadStory(slug, root = process.cwd()) {
  const storyDir = await getStoryDir(slug, root);
  if (!storyDir) {
    throw new Error(`Story "${slug}" not found.`);
  }

  const statusPath = path.join(storyDir, 'status.yaml');
  if (!(await fs.pathExists(statusPath))) {
    throw new Error(`Story "${slug}" status file not found.`);
  }

  const raw = await fs.readFile(statusPath, 'utf-8');
  return yaml.parse(raw);
}

/**
 * Update story status
 * @param {string} slug - Story slug
 * @param {Object} updates - Fields to update
 * @param {string} root - Project root directory
 * @returns {Promise<Object>} Updated story status
 */
export async function updateStory(slug, updates, root = process.cwd()) {
  const storyDir = await getStoryDir(slug, root);
  if (!storyDir) {
    throw new Error(`Story "${slug}" not found.`);
  }

  const statusPath = path.join(storyDir, 'status.yaml');
  const story = await loadStory(slug, root);

  // Apply updates
  const allowedFields = ['name', 'epic', 'phase', 'type', 'current_step', 'steps', 'knowledge', 'apps', 'skippedSteps'];
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      story[field] = updates[field];
    }
  }

  story.updatedAt = new Date().toISOString();

  await fs.writeFile(statusPath, yaml.stringify(story), 'utf-8');
  return story;
}

/**
 * Update story's epic (reassignment)
 * @param {string} slug - Story slug
 * @param {string} newEpicSlug - New epic slug
 * @param {string} root - Project root directory
 * @returns {Promise<Object>} Updated story status
 */
export async function updateStoryEpic(slug, newEpicSlug, root = process.cwd()) {
  if (!newEpicSlug) {
    throw new Error('New epic slug is required');
  }

  // Verify story exists
  const story = await loadStory(slug, root);

  // Skip if same epic
  if (story.epic === newEpicSlug) {
    return story;
  }

  // Verify target epic exists
  const { loadEpic } = await import('./epic.js');
  try {
    await loadEpic(newEpicSlug, root);
  } catch {
    throw new Error(`Target epic "${newEpicSlug}" not found`);
  }

  // Update the epic
  return updateStory(slug, { epic: newEpicSlug }, root);
}

/**
 * Skip a step (mark as skipped so it counts as done for progress)
 * @param {string} slug - Story slug
 * @param {string} step - Step to skip (kebab-case)
 * @param {string} root - Project root directory
 * @returns {Promise<Object>} Updated story status
 */
export async function skipStep(slug, step, root = process.cwd()) {
  // Validate step is skippable
  if (!SKIPPABLE_STEPS.includes(step)) {
    throw new Error(`Step "${step}" cannot be skipped. Only ${SKIPPABLE_STEPS.join(', ')} can be skipped.`);
  }

  const story = await loadStory(slug, root);
  const skippedSteps = story.skippedSteps || [];

  // Already skipped
  if (skippedSteps.includes(step)) {
    return story;
  }

  // Add to skipped list
  const updatedSkipped = [...skippedSteps, step];
  return updateStory(slug, { skippedSteps: updatedSkipped }, root);
}

/**
 * Unskip a step (restore it to pending)
 * @param {string} slug - Story slug
 * @param {string} step - Step to unskip (kebab-case)
 * @param {string} root - Project root directory
 * @returns {Promise<Object>} Updated story status
 */
export async function unskipStep(slug, step, root = process.cwd()) {
  const story = await loadStory(slug, root);
  const skippedSteps = story.skippedSteps || [];

  // Not skipped
  if (!skippedSteps.includes(step)) {
    return story;
  }

  // Remove from skipped list
  const updatedSkipped = skippedSteps.filter(s => s !== step);
  return updateStory(slug, { skippedSteps: updatedSkipped }, root);
}
