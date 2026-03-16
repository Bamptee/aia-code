import path from 'node:path';
import fs from 'fs-extra';
import yaml from 'yaml';
import { AIA_DIR, FEATURE_STEPS, STEP_STATUS, FEATURE_TYPES, LEGACY_FEATURES_DIR } from '../constants.js';
import { parseDevPlan } from './dev-plan-parser.js';

/**
 * Get story directory path (stories first, then legacy features fallback)
 */
export async function getStoryDirPath(slugOrName, root) {
  // Try stories first
  const storiesPath = path.join(root, AIA_DIR, 'stories', slugOrName);
  if (await fs.pathExists(storiesPath)) {
    return storiesPath;
  }

  // Legacy fallback
  const legacyPath = path.join(root, AIA_DIR, LEGACY_FEATURES_DIR, slugOrName);
  if (await fs.pathExists(legacyPath)) {
    return legacyPath;
  }

  // Default to stories path for new creations
  return storiesPath;
}

function statusPath(feature, root) {
  // Sync version - tries both paths
  const storiesPath = path.join(root, AIA_DIR, 'stories', feature, 'status.yaml');
  const legacyPath = path.join(root, AIA_DIR, LEGACY_FEATURES_DIR, feature, 'status.yaml');

  // Check sync (for backward compat, async version preferred)
  if (fs.existsSync(storiesPath)) return storiesPath;
  if (fs.existsSync(legacyPath)) return legacyPath;

  return storiesPath; // Default to new path
}

async function statusPathAsync(feature, root) {
  const storyDir = await getStoryDirPath(feature, root);
  return path.join(storyDir, 'status.yaml');
}

function validateStatus(status, feature) {
  if (!status || typeof status !== 'object') {
    throw new Error(`Corrupted status.yaml for feature "${feature}".`);
  }
  if (!status.steps || typeof status.steps !== 'object') {
    throw new Error(`Missing "steps" in status.yaml for feature "${feature}".`);
  }
}

export async function loadStatus(feature, root = process.cwd()) {
  const filePath = statusPath(feature, root);

  if (!(await fs.pathExists(filePath))) {
    throw new Error(`Feature "${feature}" not found.`);
  }

  const raw = await fs.readFile(filePath, 'utf-8');
  const status = yaml.parse(raw);

  validateStatus(status, feature);

  return status;
}

export async function updateStepStatus(feature, step, value, root = process.cwd()) {
  const status = await loadStatus(feature, root);

  status.steps[step] = value;

  const stepIndex = FEATURE_STEPS.indexOf(step);
  const nextStep = FEATURE_STEPS[stepIndex + 1] ?? null;
  if (value === STEP_STATUS.DONE) {
    status.current_step = nextStep;
  }

  const content = yaml.stringify(status);
  await fs.writeFile(statusPath(feature, root), content, 'utf-8');
}

export async function updateFlowType(feature, flowType, root = process.cwd()) {
  const status = await loadStatus(feature, root);
  status.flow = flowType; // 'quick' or 'full'

  // Set current_step based on flow type if not already started
  const allPending = Object.values(status.steps).every(s => s === STEP_STATUS.PENDING);
  if (allPending) {
    status.current_step = flowType === 'quick' ? 'dev-plan' : 'brief';
  }

  const content = yaml.stringify(status);
  await fs.writeFile(statusPath(feature, root), content, 'utf-8');
}

export async function resetStep(feature, step, root = process.cwd()) {
  if (!FEATURE_STEPS.includes(step)) {
    throw new Error(`Unknown step "${step}". Valid steps: ${FEATURE_STEPS.join(', ')}`);
  }

  const status = await loadStatus(feature, root);

  status.steps[step] = STEP_STATUS.PENDING;

  const firstPending = FEATURE_STEPS.find((s) => status.steps[s] !== STEP_STATUS.DONE);
  if (firstPending) {
    status.current_step = firstPending;
  }

  const content = yaml.stringify(status);
  await fs.writeFile(statusPath(feature, root), content, 'utf-8');

  // Keep the existing output — it will be fed back as context on re-run
}

export async function updateType(feature, type, root = process.cwd()) {
  // Validate type
  if (!FEATURE_TYPES.includes(type)) {
    throw new Error(`Invalid type "${type}". Valid types: ${FEATURE_TYPES.join(', ')}`);
  }

  const status = await loadStatus(feature, root);
  status.type = type;

  // Bug type forces quick flow, but only if no steps have been completed
  if (type === 'bug') {
    const allPending = Object.values(status.steps).every(s => s === STEP_STATUS.PENDING);
    if (allPending) {
      status.flow = 'quick';
      status.current_step = 'dev-plan';
    }
  }

  const content = yaml.stringify(status);
  await fs.writeFile(statusPath(feature, root), content, 'utf-8');
}

export async function updateApps(feature, apps, root = process.cwd()) {
  // Validate apps - must be an array of strings
  if (!Array.isArray(apps)) {
    throw new Error('apps must be an array');
  }
  const validApps = apps.filter(a => typeof a === 'string' && a.trim()).map(a => a.trim());

  const status = await loadStatus(feature, root);
  status.apps = validApps;
  const content = yaml.stringify(status);
  await fs.writeFile(statusPath(feature, root), content, 'utf-8');
}

/**
 * Soft delete a feature by setting deletedAt timestamp
 * @param {string} feature - Feature name
 * @param {string} root - Project root directory
 */
export async function softDeleteFeature(feature, root = process.cwd()) {
  const status = await loadStatus(feature, root);
  status.deletedAt = new Date().toISOString();
  const content = yaml.stringify(status);
  await fs.writeFile(statusPath(feature, root), content, 'utf-8');
}

/**
 * Restore a deleted feature by clearing deletedAt
 * @param {string} feature - Feature name
 * @param {string} root - Project root directory
 */
export async function restoreFeature(feature, root = process.cwd()) {
  const status = await loadStatus(feature, root);
  delete status.deletedAt;
  const content = yaml.stringify(status);
  await fs.writeFile(statusPath(feature, root), content, 'utf-8');
}

/**
 * Check if a feature is deleted
 * @param {object} status - Feature status object
 * @returns {boolean}
 */
export function isFeatureDeleted(status) {
  return !!(status && status.deletedAt != null);
}

/**
 * Update the epic for a story (slug-based)
 * @param {string} feature - Story name/slug
 * @param {string|null} epicSlug - Epic slug to link to (null to unlink)
 * @param {string} root - Project root directory
 */
export async function updateEpicId(feature, epicSlug, root = process.cwd()) {
  const status = await loadStatus(feature, root);
  // Support both old epicId and new epic field
  status.epic = epicSlug;
  delete status.epicId; // Remove old field if exists
  const content = yaml.stringify(status);
  await fs.writeFile(statusPath(feature, root), content, 'utf-8');
}

/**
 * Get the epic slug for a story
 * @param {object} status - Story status object
 * @returns {string|null}
 */
export function getFeatureEpicId(status) {
  // Support both old epicId and new epic field
  return status?.epic || status?.epicId || null;
}

// ============== PHASE MANAGEMENT ==============

/**
 * Initialize phases from dev-plan content
 * @param {string} feature - Feature name
 * @param {string} root - Project root directory
 * @returns {Promise<Array>} Parsed phases
 */
export async function initializePhasesFromDevPlan(feature, root = process.cwd()) {
  const status = await loadStatus(feature, root);

  // Read dev-plan.md (with legacy fallback)
  const storyDir = await getStoryDirPath(feature, root);
  const devPlanPath = path.join(storyDir, 'dev-plan.md');
  if (!(await fs.pathExists(devPlanPath))) {
    return [];
  }

  const devPlanContent = await fs.readFile(devPlanPath, 'utf-8');
  const tasks = parseDevPlan(devPlanContent);

  // Convert tasks to phases format
  status.phases = tasks.map(task => ({
    id: task.id,
    number: task.number,
    title: task.title,
    status: 'pending',
    files: task.files,
  }));

  const content = yaml.stringify(status);
  await fs.writeFile(statusPath(feature, root), content, 'utf-8');

  return status.phases;
}

/**
 * Update phase status
 * @param {string} feature - Feature name
 * @param {string|number} phaseId - Phase ID or number
 * @param {string} newStatus - New status (pending, in-progress, done)
 * @param {string} root - Project root directory
 */
export async function updatePhaseStatus(feature, phaseId, newStatus, root = process.cwd()) {
  const status = await loadStatus(feature, root);

  if (!status.phases || !Array.isArray(status.phases)) {
    throw new Error(`No phases defined for feature "${feature}". Run dev-plan step first.`);
  }

  // Find phase by ID or number
  const phase = status.phases.find(p =>
    p.id === phaseId ||
    p.id === `task-${phaseId}` ||
    p.number === parseInt(phaseId, 10)
  );

  if (!phase) {
    throw new Error(`Phase "${phaseId}" not found in feature "${feature}".`);
  }

  phase.status = newStatus;

  const content = yaml.stringify(status);
  await fs.writeFile(statusPath(feature, root), content, 'utf-8');
}

/**
 * Get current phase (first non-done phase)
 * @param {object} status - Feature status object
 * @returns {object|null} Current phase or null
 */
export function getCurrentPhase(status) {
  if (!status?.phases || !Array.isArray(status.phases)) {
    return null;
  }
  return status.phases.find(p => p.status !== 'done') || null;
}

/**
 * Get phase by number
 * @param {object} status - Feature status object
 * @param {number} phaseNumber - Phase number (1-based)
 * @returns {object|null} Phase or null
 */
export function getPhaseByNumber(status, phaseNumber) {
  if (!status?.phases || !Array.isArray(status.phases)) {
    return null;
  }
  return status.phases.find(p => p.number === phaseNumber) || null;
}

/**
 * Check if all phases are complete
 * @param {object} status - Feature status object
 * @returns {boolean}
 */
export function areAllPhasesComplete(status) {
  if (!status?.phases || !Array.isArray(status.phases)) {
    return true; // No phases = nothing to check
  }
  return status.phases.every(p => p.status === 'done');
}
