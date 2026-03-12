import path from 'node:path';
import fs from 'fs-extra';
import yaml from 'yaml';
import { AIA_DIR, FEATURE_STEPS, STEP_STATUS, FEATURE_TYPES } from '../constants.js';

function statusPath(feature, root) {
  return path.join(root, AIA_DIR, 'features', feature, 'status.yaml');
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
