import chalk from 'chalk';
import { createFeature } from '../services/feature.js';

export function registerFeatureCommand(program) {
  program
    .command('feature <name>')
    .description('Create a new feature workspace under .aia/features/')
    .action(async (name) => {
      try {
        await createFeature(name);
        console.log(chalk.green(`Feature "${name}" created.`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
