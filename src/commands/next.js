import chalk from 'chalk';
import { loadStatus } from '../services/status.js';
import { runStep } from '../services/runner.js';

export function registerNextCommand(program) {
  program
    .command('next <feature> [description]')
    .description('Run the next pending step for a feature')
    .option('-v, --verbose', 'Show CLI logs (thinking, tool use, etc.)')
    .option('-a, --apply', 'Let the AI edit and create files in the project')
    .action(async (feature, description, opts) => {
      try {
        const status = await loadStatus(feature);
        const nextStep = status.current_step;

        if (!nextStep) {
          console.log(chalk.green(`All steps completed for feature "${feature}".`));
          return;
        }

        console.log(chalk.cyan(`[next] Running step: ${nextStep}`));
        await runStep(nextStep, feature, { description, verbose: opts.verbose, apply: opts.apply });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
