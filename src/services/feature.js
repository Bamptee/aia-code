import path from 'node:path';
import fs from 'fs-extra';
import yaml from 'yaml';
import { AIA_DIR, FEATURE_STEPS } from '../constants.js';

const FEATURE_FILES = [
  'status.yaml',
  ...FEATURE_STEPS.map((s) => `${s}.md`),
];

const FEATURE_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateFeatureName(name) {
  if (!name || !FEATURE_NAME_RE.test(name)) {
    throw new Error(
      `Invalid feature name "${name}". Use lowercase alphanumeric with hyphens (e.g. session-replay).`,
    );
  }
}

function buildStatusYaml(name) {
  const steps = {};
  for (const step of FEATURE_STEPS) {
    steps[step] = 'pending';
  }

  return yaml.stringify({
    feature: name,
    current_step: 'brief',
    steps,
    knowledge: ['backend'],
  });
}

export async function createFeature(name, root = process.cwd()) {
  validateFeatureName(name);

  const featureDir = path.join(root, AIA_DIR, 'features', name);

  if (await fs.pathExists(featureDir)) {
    throw new Error(`Feature "${name}" already exists.`);
  }

  await fs.ensureDir(featureDir);

  for (const file of FEATURE_FILES) {
    const filePath = path.join(featureDir, file);
    const content = file === 'status.yaml' ? buildStatusYaml(name) : '';
    await fs.writeFile(filePath, content, 'utf-8');
  }
}
