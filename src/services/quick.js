import path from 'node:path';
import fs from 'fs-extra';
import yaml from 'yaml';
import { FEATURE_STEPS, QUICK_STEPS, STEP_STATUS, DEV_CHAIN_STEPS, CODE_STEPS } from '../constants.js';
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

/**
 * Run the dev chain starting from `fromStep` through `implement`.
 *
 * Chain order: spec-tech -> dev-plan -> implement (review excluded on purpose).
 * `description` and `attachments` only apply to the starting step; downstream
 * steps rely on the artefacts produced by previous steps. apply/readOnly are
 * derived from CODE_STEPS per step.
 *
 * On per-step failure, the original error is rethrown with `partialResults`
 * attached (array of { step, ... } for steps that completed successfully) so
 * callers can surface what already landed.
 *
 * @param {string} name - Story slug
 * @param {string} fromStep - Starting step (must be in DEV_CHAIN_STEPS)
 * @param {Object} options
 * @param {string} [options.description]
 * @param {Array}  [options.attachments]
 * @param {string} [options.model]
 * @param {boolean} [options.verbose=false]
 * @param {string} [options.root]
 * @param {Function} [options.onData]      Per-log chunk
 * @param {Function} [options.onChainStep] Called with each step name before it runs
 * @returns {Promise<{steps: string[], results: Array<Object>}>}
 */
export async function runDevChain(name, fromStep, {
  description,
  attachments,
  model,
  verbose = false,
  root = process.cwd(),
  onData,
  onChainStep,
} = {}) {
  const startIdx = DEV_CHAIN_STEPS.indexOf(fromStep);
  if (startIdx === -1) {
    throw new Error(`Step "${fromStep}" is not part of the dev chain (${DEV_CHAIN_STEPS.join(', ')}).`);
  }

  const stepsToRun = DEV_CHAIN_STEPS.slice(startIdx);
  const results = [];

  for (const step of stepsToRun) {
    const isCode = CODE_STEPS.has(step);
    if (onChainStep) onChainStep(step);

    try {
      const result = await runStep(step, name, {
        description: step === fromStep ? description : undefined,
        attachments: step === fromStep ? attachments : undefined,
        model,
        apply: isCode,
        readOnly: !isCode,
        verbose,
        root,
        onData,
      });
      results.push({ step, ...result });
    } catch (err) {
      err.failedStep = step;
      err.partialResults = results;
      throw err;
    }
  }

  return { steps: stepsToRun, results };
}
