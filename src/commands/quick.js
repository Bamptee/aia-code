import chalk from 'chalk';
import { runQuick } from '../services/quick.js';
import { QUICK_STEPS } from '../constants.js';

export function registerQuickCommand(program) {
  program
    .command('quick <name> [description]')
    .description(`Quick story/ticket: create feature then run ${QUICK_STEPS.join(' \u2192 ')}`)
    .option('-v, --verbose', 'Show AI thinking/tool usage')
    .option('-a, --apply', 'Force agent mode (file editing) for all steps')
    .action(async (name, description, opts) => {
      try {
        await runQuick(name, {
          description,
          verbose: opts.verbose,
          apply: opts.apply,
        });
        console.log(chalk.green(`\nQuick pipeline completed for "${name}".`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
