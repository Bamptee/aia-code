import chalk from 'chalk';
import { loadStatus } from '../services/status.js';
import { runStep } from '../services/runner.js';

export function registerNextCommand(program) {
  program
    .command('next <feature> [description]')
    .description('Run the next pending step for a feature')
    .action(async (feature, description) => {
      try {
        const status = await loadStatus(feature);
        const nextStep = status.current_step;

        if (!nextStep) {
          console.log(chalk.green(`All steps completed for feature "${feature}".`));
          return;
        }

        console.log(chalk.cyan(`[next] Running step: ${nextStep}`));
        await runStep(nextStep, feature, { description });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
