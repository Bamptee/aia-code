import chalk from 'chalk';
import { resetStep } from '../services/status.js';
import { runStep } from '../services/runner.js';

export function registerIterateCommand(program) {
  program
    .command('iterate <step> <feature> <instructions>')
    .description('Re-run a step with additional instructions to refine the output')
    .option('-v, --verbose', 'Show AI thinking/tool usage')
    .option('-a, --apply', 'Force agent mode (file editing)')
    .action(async (step, feature, instructions, opts) => {
      try {
        await resetStep(feature, step);
        console.log(chalk.gray(`Reset "${step}" — iterating with new instructions...`));

        await runStep(step, feature, {
          instructions,
          verbose: opts.verbose,
          apply: opts.apply,
        });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
