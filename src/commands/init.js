import chalk from 'chalk';
import { createAiaStructure } from '../services/scaffold.js';
import { writeDefaultConfig } from '../services/config.js';
import { AIA_DIR } from '../constants.js';

export function registerInitCommand(program) {
  program
    .command('init')
    .description('Initialize .aia folder structure and default config')
    .action(async () => {
      try {
        await createAiaStructure();
        await writeDefaultConfig();
        console.log(chalk.green(`Initialized ${AIA_DIR}/ project structure.`));
      } catch (err) {
        console.error(chalk.red(`Init failed: ${err.message}`));
        process.exit(1);
      }
    });
}
