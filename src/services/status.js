import path from 'node:path';
import fs from 'fs-extra';
import yaml from 'yaml';
import { AIA_DIR, FEATURE_STEPS } from '../constants.js';

function statusPath(feature, root) {
  return path.join(root, AIA_DIR, 'features', feature, 'status.yaml');
}

export async function loadStatus(feature, root = process.cwd()) {
  const filePath = statusPath(feature, root);

  if (!(await fs.pathExists(filePath))) {
    throw new Error(`Feature "${feature}" not found.`);
  }

  const raw = await fs.readFile(filePath, 'utf-8');
  return yaml.parse(raw);
}

export async function updateStepStatus(feature, step, value, root = process.cwd()) {
  const status = await loadStatus(feature, root);

  status.steps[step] = value;

  const stepIndex = FEATURE_STEPS.indexOf(step);
  const nextStep = FEATURE_STEPS[stepIndex + 1] ?? null;
  if (value === 'done' && nextStep) {
    status.current_step = nextStep;
  }

  const content = yaml.stringify(status);
  await fs.writeFile(statusPath(feature, root), content, 'utf-8');
}
