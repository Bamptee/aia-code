import path from 'node:path';
import fs from 'fs-extra';
import yaml from 'yaml';
import { AIA_DIR, FEATURE_STEPS, DEFAULT_FEATURE_TYPE, FEATURE_TYPES } from '../constants.js';

const FEATURE_FILES = [
  'status.yaml',
  'init.md',
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

function buildInitMd(name) {
  return `# ${name}

<!-- Describe your feature here. This file is injected into every step as context. -->
<!-- Add any initial specs, requirements, mockups, or notes you already have. -->

## Description


## Existing specs


## Constraints

`;
}

function buildStatusYaml(name, { type = DEFAULT_FEATURE_TYPE, apps = [] } = {}) {
  // Validate type
  const validType = FEATURE_TYPES.includes(type) ? type : DEFAULT_FEATURE_TYPE;

  // Validate apps - ensure it's an array of strings
  const validApps = Array.isArray(apps)
    ? apps.filter(a => typeof a === 'string' && a.trim()).map(a => a.trim())
    : [];

  const steps = {};
  for (const step of FEATURE_STEPS) {
    steps[step] = 'pending';
  }

  const flow = validType === 'bug' ? 'quick' : undefined;
  const currentStep = flow === 'quick' ? 'dev-plan' : 'brief';

  const status = {
    feature: name,
    type: validType,
    current_step: currentStep,
    steps,
    knowledge: ['backend'],
  };

  if (validApps.length > 0) {
    status.apps = validApps;
  }

  if (flow) {
    status.flow = flow;
  }

  return yaml.stringify(status);
}

export async function createFeature(name, root = process.cwd(), options = {}) {
  validateFeatureName(name);

  const featureDir = path.join(root, AIA_DIR, 'features', name);

  if (await fs.pathExists(featureDir)) {
    throw new Error(`Feature "${name}" already exists.`);
  }

  await fs.ensureDir(featureDir);

  for (const file of FEATURE_FILES) {
    const filePath = path.join(featureDir, file);
    let content = '';
    if (file === 'status.yaml') content = buildStatusYaml(name, options);
    else if (file === 'init.md') content = buildInitMd(name);
    await fs.writeFile(filePath, content, 'utf-8');
  }
}
