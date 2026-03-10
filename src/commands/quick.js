import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'node:path';
import yaml from 'yaml';
import { AIA_DIR, FEATURE_STEPS, QUICK_STEPS, STEP_STATUS } from '../constants.js';
import { createFeature, validateFeatureName } from '../services/feature.js';
import { runStep } from '../services/runner.js';

async function skipEarlySteps(feature, root) {
  const statusFile = path.join(root, AIA_DIR, 'features', feature, 'status.yaml');
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

export function registerQuickCommand(program) {
  program
    .command('quick <name> [description]')
    .description('Quick story/ticket: create feature then run dev-plan → implement → review')
    .option('-v, --verbose', 'Show AI thinking/tool usage')
    .option('-a, --apply', 'Force agent mode (file editing) for all steps')
    .action(async (name, description, opts) => {
      try {
        validateFeatureName(name);

        const root = process.cwd();
        const featureDir = path.join(root, AIA_DIR, 'features', name);

        if (!(await fs.pathExists(featureDir))) {
          await createFeature(name, root);
          console.log(chalk.green(`Feature "${name}" created.`));
          const initPath = path.join(AIA_DIR, 'features', name, 'init.md');
          console.log(chalk.gray(`Using ${initPath} as input.`));
        }

        await skipEarlySteps(name, root);

        for (const step of QUICK_STEPS) {
          console.log(chalk.cyan(`\n--- Running ${step} ---\n`));
          await runStep(step, name, {
            description,
            verbose: opts.verbose,
            apply: opts.apply,
            root,
          });
        }

        console.log(chalk.green(`\nQuick pipeline completed for "${name}".`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
