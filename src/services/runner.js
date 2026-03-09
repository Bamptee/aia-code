import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { AIA_DIR, FEATURE_STEPS } from '../constants.js';
import { resolveModel } from '../models.js';
import { buildPrompt } from '../prompt-builder.js';
import { callModel } from './model-call.js';
import { loadStatus, updateStepStatus } from './status.js';
import { logExecution } from '../logger.js';

export async function runStep(step, feature, root = process.cwd()) {
  if (!FEATURE_STEPS.includes(step)) {
    throw new Error(`Unknown step "${step}". Valid steps: ${FEATURE_STEPS.join(', ')}`);
  }

  const status = await loadStatus(feature, root);

  if (status.steps[step] === 'done') {
    throw new Error(`Step "${step}" already done for feature "${feature}". Delete the output to re-run.`);
  }

  await updateStepStatus(feature, step, 'in-progress', root);

  try {
    const model = await resolveModel(step, root);
    const prompt = await buildPrompt(feature, step, root);

    const start = performance.now();
    const output = await callModel(model, prompt);
    const duration = performance.now() - start;

    const outputPath = path.join(root, AIA_DIR, 'features', feature, `${step}.md`);
    await fs.writeFile(outputPath, output, 'utf-8');

    await updateStepStatus(feature, step, 'done', root);
    await logExecution({ feature, step, model, duration }, root);

    console.log(chalk.green(`Step "${step}" completed for feature "${feature}".`));
    return output;
  } catch (err) {
    await updateStepStatus(feature, step, 'error', root);
    throw err;
  }
}
