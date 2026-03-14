import path from 'node:path';
import chalk from 'chalk';
import { createStory, createFeature } from '../services/feature.js';
import { AIA_DIR } from '../constants.js';

export function registerFeatureCommand(program) {
  // Legacy command (redirects to story)
  program
    .command('feature <name>')
    .description('Create a new story (legacy alias for "story create")')
    .action(async (name) => {
      try {
        const result = await createFeature(name);
        const initPath = path.join(AIA_DIR, 'stories', result.slug, 'init.md');
        console.log(chalk.green(`Story "${result.name}" created with slug "${result.slug}".`));
        console.log(chalk.gray(`Edit ${initPath} to add your initial specs and requirements.`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
