/**
 * @fileoverview Pull CLI command — import a task from external provider as local story
 * @module commands/pull
 */

import chalk from 'chalk';
import { isSyncEnabled } from '../providers/sync-manager.js';
import { pullStory } from '../services/sync-service.js';

export function registerPullCommand(program) {
  program
    .command('pull <id-or-url>')
    .description('Pull a task from the external sync provider as a local story')
    .option('--force', 'Overwrite local files even if more recent')
    .option('--dry-run', 'Show what would be imported without doing it')
    .action(async (idOrUrl, options) => {
      try {
        const root = process.cwd();

        if (!(await isSyncEnabled(root))) {
          console.error(chalk.red('Sync not configured. Run `aia sync setup` first.'));
          process.exit(1);
        }

        if (options.dryRun) {
          console.log(chalk.bold('\nDry run — would pull:'));
          console.log(chalk.cyan(`  Source: ${idOrUrl}`));
          console.log(chalk.dim('  Use without --dry-run to actually import.'));
          return;
        }

        const result = await pullStory(idOrUrl, root, { force: options.force });

        if (result.conflict) {
          console.log(chalk.yellow(`⚠ ${result.message}`));
          console.log(chalk.dim(`  Story: ${result.slug}`));
          return;
        }

        console.log(chalk.green(`✓ Pulled story "${result.name}" as ${result.slug}`));
        if (result.url) {
          console.log(chalk.dim(`  Source: ${result.url}`));
        }
        console.log(chalk.dim(`  Files written:`));
        for (const f of result.writtenFiles || []) {
          console.log(chalk.dim(`    ${f}`));
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
