import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { AIA_DIR, FEATURE_STEPS, APPLY_STEPS, STEP_STATUS } from '../constants.js';
import { resolveModel } from '../models.js';
import { buildPrompt } from '../prompt-builder.js';
import { callModel } from './model-call.js';
import { loadStatus, updateStepStatus } from './status.js';
import { logExecution } from '../logger.js';

export async function runStep(step, feature, { description, instructions, history, attachments, model: modelOverride, verbose = false, apply = false, root = process.cwd(), onData } = {}) {
  if (!FEATURE_STEPS.includes(step)) {
    throw new Error(`Unknown step "${step}". Valid steps: ${FEATURE_STEPS.join(', ')}`);
  }

  const status = await loadStatus(feature, root);

  if (status.steps[step] === STEP_STATUS.DONE) {
    throw new Error(
      `Step "${step}" already done for feature "${feature}". Use "aia reset ${step} ${feature}" to re-run.`,
    );
  }

  await updateStepStatus(feature, step, STEP_STATUS.IN_PROGRESS, root);

  const shouldApply = apply || APPLY_STEPS.has(step);

  try {
    const model = modelOverride || await resolveModel(step, root);
    const prompt = await buildPrompt(feature, step, { description, instructions, history, attachments, root });

    const start = performance.now();
    const output = await callModel(model, prompt, { verbose, apply: shouldApply, onData });
    const duration = performance.now() - start;

    const outputPath = path.join(root, AIA_DIR, 'features', feature, `${step}.md`);
    await fs.writeFile(outputPath, output, 'utf-8');

    await updateStepStatus(feature, step, STEP_STATUS.DONE, root);
    await logExecution({ feature, step, model, duration }, root);

    console.log(chalk.green(`Step "${step}" completed for feature "${feature}".`));
    return output;
  } catch (err) {
    await updateStepStatus(feature, step, STEP_STATUS.ERROR, root);
    throw err;
  }
}
