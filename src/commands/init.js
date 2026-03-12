import chalk from 'chalk';
import { createAiaStructure } from '../services/scaffold.js';
import { writeDefaultConfig, isGlobalConfigured, updateGlobalConfig } from '../services/config.js';
import { writeDefaultPrompts } from '../services/prompts.js';
import { AIA_DIR } from '../constants.js';
import { ask, askRequired, isInteractive } from '../utils/prompt.js';

export function registerInitCommand(program) {
  program
    .command('init')
    .description('Initialize .aia folder structure, default config, and prompt templates')
    .action(async () => {
      try {
        // First-time user setup
        if (!(await isGlobalConfigured()) && isInteractive()) {
          console.log(chalk.cyan('First time setup - let\'s configure your preferences.\n'));
          const name = await askRequired('Your name');
          const lang = await ask('Communication language', 'English');
          await updateGlobalConfig({ user_name: name, communication_language: lang });
          console.log(chalk.green('\nUser preferences saved to ~/.aia/config.yaml\n'));
        }

        await createAiaStructure();
        await writeDefaultConfig();
        await writeDefaultPrompts();
        console.log(chalk.green(`Initialized ${AIA_DIR}/ project structure.`));
      } catch (err) {
        console.error(chalk.red(`Init failed: ${err.message}`));
        process.exit(1);
      }
    });
}
