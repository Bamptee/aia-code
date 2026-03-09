import chalk from 'chalk';
import { runStep } from '../services/runner.js';

export function registerRunCommand(program) {
  program
    .command('run <step> <feature> [description]')
    .description('Execute a step for a feature using the configured AI model')
    .action(async (step, feature, description) => {
      try {
        await runStep(step, feature, { description });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
