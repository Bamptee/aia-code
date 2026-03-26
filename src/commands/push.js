/**
 * @fileoverview Push CLI command — push story/step to external provider
 * @module commands/push
 */

import chalk from 'chalk';
import { isSyncEnabled } from '../providers/sync-manager.js';
import { pushStory, pushStep } from '../services/sync-service.js';
import { loadStatus, getStoryDirPath } from '../services/status.js';
import fs from 'fs-extra';
import path from 'node:path';

export function registerPushCommand(program) {
  program
    .command('push <slug>')
    .description('Push a story to the external sync provider')
    .option('--step <step>', 'Push only a specific step')
    .option('--force', 'Force push even if remote is more recent')
    .option('--dry-run', 'Show what would be pushed without doing it')
    .action(async (slug, options) => {
      try {
        const root = process.cwd();

        if (!(await isSyncEnabled(root))) {
          console.error(chalk.red('Sync not configured. Run `aia sync setup` first.'));
          process.exit(1);
        }

        // Dry run
        if (options.dryRun) {
          const status = await loadStatus(slug, root);
          const storyDir = await getStoryDirPath(slug, root);
          const files = await fs.readdir(storyDir).catch(() => []);
          const mdFiles = files.filter(f => f.endsWith('.md'));

          console.log(chalk.bold(`\nDry run — would push ${slug}:`));
          for (const f of mdFiles) {
            const stepName = f.replace('.md', '');
            if (stepName === 'implement') {
              console.log(chalk.dim(`  ⊘ ${f} (skipped — local only)`));
            } else {
              console.log(chalk.cyan(`  ↗ ${f}`));
            }
          }
          return;
        }

        if (options.step) {
          const result = await pushStep(slug, options.step, root);
          if (result.skipped) {
            console.log(chalk.yellow(`⊘ Step "${options.step}" is local-only, not pushed.`));
          } else {
            console.log(chalk.green(`✓ Pushed step "${options.step}" for ${slug}`));
          }
        } else {
          const result = await pushStory(slug, root);
          console.log(chalk.green(`✓ Pushed to ClickUp: ${result.url}`));
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
