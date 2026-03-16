/**
 * @fileoverview System CLI Commands (Migration, Diagnostics, Init)
 * @module commands/system
 */

import chalk from 'chalk';
import { FileStorageProvider } from '../epic/providers/file-storage-provider.js';
import { StoryIndexService } from '../epic/services/story-index-service.js';
import { MigrationService } from '../epic/services/migration-service.js';

/**
 * Creates and initializes services
 */
function createServices() {
  const storage = new FileStorageProvider(process.cwd());
  const storyIndexService = new StoryIndexService(storage);
  const migrationService = new MigrationService(storage, storyIndexService);
  return { storage, storyIndexService, migrationService };
}

export function registerSystemCommands(program) {
  // epic-init command (initializes the epic system)
  program
    .command('epic-init')
    .description('Initialize the epic system')
    .option('-f, --force', 'Force re-initialization')
    .action(async (options) => {
      try {
        const { migrationService } = createServices();
        const result = await migrationService.initialize({ force: options.force });

        if (result.initialized) {
          console.log(chalk.green('✓ Epic system initialized'));
          for (const item of result.created) {
            console.log(chalk.dim(`  Created: ${item}`));
          }
        } else {
          console.log(chalk.yellow('Epic system already initialized. Use --force to re-initialize.'));
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // diagnose command
  program
    .command('diagnose')
    .description('Check system integrity')
    .action(async () => {
      try {
        const { migrationService } = createServices();
        const result = await migrationService.diagnose();

        console.log(chalk.bold('\nSystem Diagnosis:\n'));

        if (result.status === 'healthy') {
          console.log(chalk.green('✓ System is healthy'));
        } else if (result.status === 'issues_found') {
          console.log(chalk.yellow('⚠ Issues found:'));
          for (const issue of result.issues) {
            console.log(chalk.dim(`  - ${issue}`));
          }
          console.log(chalk.dim('\nRun "aia repair" to fix issues.'));
        } else {
          console.log(chalk.red('✗ Diagnosis failed:'));
          for (const issue of result.issues) {
            console.log(chalk.dim(`  - ${issue}`));
          }
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // repair command
  program
    .command('repair')
    .description('Repair system issues')
    .action(async () => {
      try {
        const { migrationService } = createServices();
        const result = await migrationService.repair();

        console.log(chalk.bold('\nRepair Results:\n'));

        if (result.repaired.length > 0) {
          console.log(chalk.green('Repaired:'));
          for (const item of result.repaired) {
            console.log(chalk.dim(`  ✓ ${item}`));
          }
        }

        if (result.failed.length > 0) {
          console.log(chalk.red('Failed:'));
          for (const item of result.failed) {
            console.log(chalk.dim(`  ✗ ${item}`));
          }
        }

        if (result.repaired.length === 0 && result.failed.length === 0) {
          console.log(chalk.green('No repairs needed.'));
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // export command
  program
    .command('export')
    .description('Export all epic data')
    .option('-o, --output <file>', 'Output file', 'epic-export.json')
    .option('--no-archived', 'Exclude archived epics')
    .action(async (options) => {
      try {
        const { migrationService, storage } = createServices();
        const fs = await import('fs-extra');

        const data = await migrationService.exportData({
          includeArchived: options.archived,
        });

        await fs.writeJson(options.output, data, { spaces: 2 });
        console.log(chalk.green(`✓ Data exported to: ${options.output}`));
        console.log(chalk.dim(`  Epics: ${data.epics.length}`));
        console.log(chalk.dim(`  Version: ${data.version}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // import command
  program
    .command('import <file>')
    .description('Import epic data from file')
    .option('--no-merge', 'Replace instead of merge')
    .option('--dry-run', 'Preview without importing')
    .action(async (file, options) => {
      try {
        const { migrationService } = createServices();
        const fs = await import('fs-extra');

        const data = await fs.readJson(file);
        const result = await migrationService.importData(data, {
          merge: options.merge,
          dryRun: options.dryRun,
        });

        console.log(chalk.bold(`\nImport ${options.dryRun ? 'Preview' : 'Results'}:\n`));
        console.log(`  Epics imported: ${result.imported.epics}`);
        console.log(`  Stories imported: ${result.imported.stories}`);
        console.log(`  Skipped: ${result.skipped}`);

        if (result.errors.length > 0) {
          console.log(chalk.yellow('\n  Errors:'));
          for (const error of result.errors) {
            console.log(chalk.dim(`    - ${error}`));
          }
        }

        if (options.dryRun) {
          console.log(chalk.dim('\n(dry run - no changes made)'));
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // stats command
  program
    .command('epic-stats')
    .description('Show system statistics')
    .action(async () => {
      try {
        const { migrationService } = createServices();
        const stats = await migrationService.getStats();

        console.log(chalk.bold('\nSystem Statistics:\n'));
        console.log(`  Version: ${stats.version}`);
        console.log(`  Initialized: ${stats.initialized ? 'Yes' : 'No'}`);

        console.log(chalk.bold('\n  Epics:'));
        console.log(`    Total: ${stats.epics.total}`);
        console.log(`    Active: ${stats.epics.active}`);
        console.log(`    Archived: ${stats.epics.archived}`);

        console.log(chalk.bold('\n  Stories:'));
        console.log(`    Total: ${stats.stories.total}`);
        console.log(`    Done: ${stats.stories.done}`);
        console.log(`    Completion: ${stats.stories.completion}%`);

        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // clear command (dangerous)
  program
    .command('epic-clear')
    .description('Clear all epic data (destructive!)')
    .option('--confirm', 'Confirm deletion')
    .action(async (options) => {
      try {
        if (!options.confirm) {
          console.log(chalk.red('⚠ This will delete ALL epic data!'));
          console.log(chalk.dim('Use --confirm to proceed.'));
          return;
        }

        const { migrationService } = createServices();
        await migrationService.clearAll({ confirm: true });
        console.log(chalk.green('✓ All data cleared and system re-initialized.'));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // rebuild-index command
  program
    .command('rebuild-index')
    .description('Rebuild the story index')
    .action(async () => {
      try {
        const { storyIndexService } = createServices();
        const index = await storyIndexService.rebuild();
        const count = Object.keys(index).length;
        console.log(chalk.green(`✓ Index rebuilt with ${count} stories`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // validate-index command
  program
    .command('validate-index')
    .description('Validate and repair the story index')
    .action(async () => {
      try {
        const { storyIndexService } = createServices();
        const result = await storyIndexService.validateAndRepair();

        if (result.repaired) {
          console.log(chalk.yellow('⚠ Index had issues and was repaired:'));
          for (const issue of result.issues) {
            console.log(chalk.dim(`  - ${issue.message}`));
          }
        } else {
          console.log(chalk.green('✓ Index is valid'));
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
