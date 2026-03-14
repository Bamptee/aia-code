import path from 'node:path';
import fs from 'fs-extra';
import yaml from 'yaml';
import { FEATURE_STEPS, QUICK_STEPS, STEP_STATUS } from '../constants.js';
import { createFeature, validateFeatureName, getStoryDir, getStoriesDir } from './feature.js';
import { runStep } from './runner.js';
import { getStoryDirPath } from './status.js';

export async function skipEarlySteps(feature, root) {
  const storyDir = await getStoryDirPath(feature, root);
  const statusFile = path.join(storyDir, 'status.yaml');
  const raw = await fs.readFile(statusFile, 'utf-8');
  const status = yaml.parse(raw);

  for (const step of FEATURE_STEPS) {
    if (!QUICK_STEPS.includes(step)) {
      status.steps[step] = STEP_STATUS.DONE;
    }
  }
  status.current_step = QUICK_STEPS[0];

  await fs.writeFile(statusFile, yaml.stringify(status), 'utf-8');
}

export async function runQuick(name, { description, verbose = false, apply = false, root = process.cwd(), onData } = {}) {
  validateFeatureName(name);

  // Check both stories and legacy features directories
  const existingDir = await getStoryDir(name, root);
  const created = !existingDir;

  if (created) {
    await createFeature(name, root);
  }

  await skipEarlySteps(name, root);

  for (const step of QUICK_STEPS) {
    await runStep(step, name, { description, verbose, apply, root, onData });
  }

  return { created };
}
