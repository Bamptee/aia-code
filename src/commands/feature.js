import path from 'node:path';
import chalk from 'chalk';
import { createFeature } from '../services/feature.js';
import { AIA_DIR } from '../constants.js';

export function registerFeatureCommand(program) {
  program
    .command('feature <name>')
    .description('Create a new feature workspace under .aia/features/')
    .action(async (name) => {
      try {
        await createFeature(name);
        const initPath = path.join(AIA_DIR, 'features', name, 'init.md');
        console.log(chalk.green(`Feature "${name}" created.`));
        console.log(chalk.gray(`Edit ${initPath} to add your initial specs and requirements.`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
