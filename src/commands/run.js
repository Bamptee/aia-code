import chalk from 'chalk';
import { runStep } from '../services/runner.js';

export function registerRunCommand(program) {
  program
    .command('run <step> <story> [description]')
    .description('Execute a step for a story using the configured AI model')
    .option('-v, --verbose', 'Show CLI logs (thinking, tool use, etc.)')
    .option('-a, --apply', 'Let the AI edit and create files in the project')
    .action(async (step, feature, description, opts) => {
      try {
        await runStep(step, feature, { description, verbose: opts.verbose, apply: opts.apply });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
