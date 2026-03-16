/**
 * @fileoverview Migration CLI command
 */

import chalk from 'chalk';
import { migrateEpicsToYaml, cleanupOldJsonFiles } from '../services/migration.js';
import { ensureGeneralEpic } from '../services/epic.js';

export function registerMigrateCommand(program) {
  const migrate = program
    .command('migrate')
    .description('Migration utilities');

  migrate
    .command('epics')
    .description('Migrate epics from JSON to YAML format')
    .action(async () => {
      try {
        console.log(chalk.cyan('Migrating epics from JSON to YAML format...\n'));

        const result = await migrateEpicsToYaml();

        if (result.migrated.length === 0) {
          console.log(chalk.yellow('No epics to migrate.'));
          console.log(chalk.dim('The epics directory is either empty or already migrated.'));
        } else {
          console.log(chalk.green(`✓ ${result.message}\n`));

          for (const epic of result.migrated) {
            console.log(`  ${chalk.cyan(epic.slug)} - ${epic.name} (${epic.stories} stories)`);
          }
        }

        if (result.errors.length > 0) {
          console.log(chalk.red('\nErrors:'));
          for (const err of result.errors) {
            console.log(`  ${chalk.red('✗')} ${err.file || err.id}: ${err.error}`);
          }
        }

        // Ensure General epic exists
        await ensureGeneralEpic();
        console.log(chalk.dim('\n✓ General epic ensured'));

      } catch (err) {
        console.error(chalk.red(`Migration failed: ${err.message}`));
        process.exit(1);
      }
    });

  migrate
    .command('cleanup')
    .description('Clean up old JSON files and caches')
    .action(async () => {
      try {
        console.log(chalk.cyan('Cleaning up old JSON files...\n'));

        const cleaned = await cleanupOldJsonFiles();

        if (cleaned.length === 0) {
          console.log(chalk.yellow('Nothing to clean up.'));
        } else {
          console.log(chalk.green(`✓ Cleaned up ${cleaned.length} items:\n`));
          for (const item of cleaned) {
            console.log(`  ${chalk.dim('removed')} ${item}`);
          }
        }
      } catch (err) {
        console.error(chalk.red(`Cleanup failed: ${err.message}`));
        process.exit(1);
      }
    });

  migrate
    .command('all')
    .description('Run full migration (epics + cleanup)')
    .action(async () => {
      try {
        console.log(chalk.bold.cyan('Running full migration...\n'));

        // Step 1: Migrate epics
        console.log(chalk.bold('1. Migrating epics...'));
        const migrateResult = await migrateEpicsToYaml();
        console.log(chalk.green(`   ✓ ${migrateResult.message}`));

        // Step 2: Ensure General epic
        console.log(chalk.bold('\n2. Ensuring General epic...'));
        await ensureGeneralEpic();
        console.log(chalk.green('   ✓ General epic ready'));

        // Step 3: Cleanup
        console.log(chalk.bold('\n3. Cleaning up old files...'));
        const cleaned = await cleanupOldJsonFiles();
        console.log(chalk.green(`   ✓ Cleaned ${cleaned.length} items`));

        console.log(chalk.bold.green('\n✓ Migration complete!\n'));
        console.log(chalk.dim('Your epics and stories are now in YAML format.'));
        console.log(chalk.dim('Run `aia ui` to see your dashboard.'));

      } catch (err) {
        console.error(chalk.red(`Migration failed: ${err.message}`));
        process.exit(1);
      }
    });
}
