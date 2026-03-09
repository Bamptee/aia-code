import chalk from 'chalk';
import { STEP_STATUS } from '../constants.js';
import { loadStatus } from '../services/status.js';

const STATUS_COLORS = {
  [STEP_STATUS.DONE]: chalk.green,
  [STEP_STATUS.IN_PROGRESS]: chalk.yellow,
  [STEP_STATUS.ERROR]: chalk.red,
  [STEP_STATUS.PENDING]: chalk.gray,
};

export function registerStatusCommand(program) {
  program
    .command('status <feature>')
    .description('Show the current status of a feature')
    .action(async (feature) => {
      try {
        const status = await loadStatus(feature);

        console.log(chalk.bold(`Feature: ${status.feature}`));
        console.log(chalk.bold(`Current step: ${status.current_step}\n`));

        for (const [step, value] of Object.entries(status.steps)) {
          const colorize = STATUS_COLORS[value] ?? chalk.white;
          const marker = value === STEP_STATUS.DONE ? 'v' : value === STEP_STATUS.ERROR ? 'x' : '-';
          console.log(`  ${colorize(`[${marker}] ${step}: ${value}`)}`);
        }

        if (status.knowledge?.length) {
          console.log(chalk.gray(`\nKnowledge: ${status.knowledge.join(', ')}`));
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
