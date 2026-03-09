import chalk from 'chalk';
import { resetStep } from '../services/status.js';

export function registerResetCommand(program) {
  program
    .command('reset <step> <feature>')
    .description('Reset a step to pending so it can be re-run')
    .action(async (step, feature) => {
      try {
        await resetStep(feature, step);
        console.log(chalk.green(`Step "${step}" reset to pending for feature "${feature}".`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
