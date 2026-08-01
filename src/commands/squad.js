import chalk from 'chalk';
import { runSquad } from '../services/squad.js';
import { SQUAD_PRE_STEPS, DEFAULT_MAX_PARALLEL } from '../constants.js';

/**
 * `aia squad <name>` — multi-agent build mode.
 *
 * Reuses the normal sequential engine for the spec/plan steps, then hands the
 * dev-plan to the orchestrator which runs the implementation tasks as parallel
 * sub-agents (one model per task tier), then runs the normal review step.
 * Fully additive: does not alter `run`, `next`, `quick` or the status schema.
 */
export function registerSquadCommand(program) {
  program
    .command('squad <name> [description]')
    .description(`Multi-agent build: ${SQUAD_PRE_STEPS.join(' → ')} → build (parallel sub-agents) → review`)
    .option('-v, --verbose', 'Show AI thinking/tool usage')
    .option('-p, --parallel <n>', 'Max sub-agents running in parallel', String(DEFAULT_MAX_PARALLEL))
    .option('--no-review', 'Skip the final review step')
    .action(async (name, description, opts) => {
      try {
        const maxParallel = Math.max(1, parseInt(opts.parallel, 10) || DEFAULT_MAX_PARALLEL);

        const { report } = await runSquad(name, {
          description,
          maxParallel,
          review: opts.review !== false,
          verbose: opts.verbose,
          onEvent: (ev) => {
            if (ev.kind === 'step' && ev.phase === 'start') console.log(chalk.bold(`\n=== ${ev.step} ===`));
            if (ev.kind === 'build' && ev.phase === 'start') console.log(chalk.bold('\n=== build (squad) ==='));
          },
        });

        const color = report.verdict === 'SHIP' ? chalk.green : report.verdict === 'NEEDS REWORK' ? chalk.red : chalk.yellow;
        console.log(color(`\nSquad pipeline completed for "${name}" — ${report.ok}/${report.tasks} tasks ok — verdict: ${report.verdict}.`));
        console.log(chalk.dim(`Build report: ${report.reportPath}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
