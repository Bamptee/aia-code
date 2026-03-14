/**
 * @fileoverview Epic CLI Commands
 * @module commands/epic
 */

import chalk from 'chalk';
import { FileStorageProvider } from '../epic/providers/file-storage-provider.js';
import { StoryIndexService } from '../epic/services/story-index-service.js';
import { EpicService } from '../epic/services/epic-service.js';

/**
 * Creates and initializes services
 * @returns {{storage: FileStorageProvider, epicService: EpicService}}
 */
function createServices() {
  const storage = new FileStorageProvider(process.cwd());
  const storyIndexService = new StoryIndexService(storage);
  const epicService = new EpicService(storage, storyIndexService);
  return { storage, epicService };
}

/**
 * Formats epic for display
 * @param {Object} epic - Epic to format
 * @returns {string} Formatted string
 */
function formatEpic(epic) {
  const statusColors = {
    discovery: chalk.blue,
    planning: chalk.yellow,
    in_progress: chalk.cyan,
    testing: chalk.magenta,
    done: chalk.green,
  };
  const colorFn = statusColors[epic.status] || chalk.white;
  const archived = epic.isArchived ? chalk.gray(' [archived]') : '';
  const general = epic.isGeneral ? chalk.dim(' (default)') : '';
  const progress = epic.progress !== undefined ? chalk.dim(` ${epic.progress}%`) : '';
  const period = epic.plannedPeriod ? chalk.dim(` [${epic.plannedPeriod}]`) : '';

  return `${colorFn('●')} ${epic.name}${general}${archived}${progress}${period} ${chalk.dim(`(${epic.status})`)} ${chalk.dim(epic.id.slice(0, 8))}`;
}

export function registerEpicCommand(program) {
  const epic = program
    .command('epic')
    .description('Manage epics');

  // epic list
  epic
    .command('list')
    .alias('ls')
    .description('List all epics')
    .option('-a, --all', 'Include archived epics')
    .option('-s, --status <status>', 'Filter by status')
    .action(async (options) => {
      try {
        const { epicService } = createServices();
        const epics = await epicService.list({
          includeArchived: options.all,
          status: options.status,
        });

        if (epics.length === 0) {
          console.log(chalk.yellow('No epics found. Create one with: aia epic create <name>'));
          return;
        }

        console.log(chalk.bold(`\nEpics (${epics.length}):\n`));
        for (const e of epics) {
          console.log(`  ${formatEpic(e)}`);
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // epic create
  epic
    .command('create <name>')
    .description('Create a new epic')
    .option('-d, --description <desc>', 'Epic description')
    .option('-s, --status <status>', 'Initial status', 'discovery')
    .option('-p, --period <period>', 'Planned period (e.g., 2026-Q2)')
    .action(async (name, options) => {
      try {
        const { epicService } = createServices();
        const newEpic = await epicService.create({
          name,
          description: options.description,
          status: options.status,
          plannedPeriod: options.period,
        });

        console.log(chalk.green(`✓ Epic created: ${newEpic.name}`));
        console.log(chalk.dim(`  ID: ${newEpic.id}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // epic show
  epic
    .command('show <id>')
    .description('Show epic details')
    .action(async (id) => {
      try {
        const { epicService } = createServices();
        const e = await epicService.getById(id);

        console.log(chalk.bold(`\n${e.name}`));
        console.log(chalk.dim(`ID: ${e.id}`));
        console.log(`Status: ${e.status}`);
        if (e.description) console.log(`Description: ${e.description}`);
        if (e.plannedPeriod) console.log(`Planned Period: ${e.plannedPeriod}`);
        console.log(`Stories: ${(e.stories || []).length}`);
        console.log(`Progress: ${epicService.calculateProgress(e)}%`);
        console.log(`Created: ${e.createdAt}`);
        console.log(`Updated: ${e.updatedAt}`);
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // epic update
  epic
    .command('update <id>')
    .description('Update an epic')
    .option('-n, --name <name>', 'New name')
    .option('-d, --description <desc>', 'New description')
    .option('-p, --period <period>', 'Planned period')
    .action(async (id, options) => {
      try {
        const { epicService } = createServices();
        const updates = {};
        if (options.name) updates.name = options.name;
        if (options.description !== undefined) updates.description = options.description;
        if (options.period !== undefined) updates.plannedPeriod = options.period;

        if (Object.keys(updates).length === 0) {
          console.log(chalk.yellow('No updates specified'));
          return;
        }

        const updated = await epicService.update(id, updates);
        console.log(chalk.green(`✓ Epic updated: ${updated.name}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // epic status
  epic
    .command('status <id> <status>')
    .description('Update epic status (discovery|planning|in_progress|testing|done)')
    .action(async (id, status) => {
      try {
        const { epicService } = createServices();
        const updated = await epicService.updateStatus(id, status);
        console.log(chalk.green(`✓ Epic status updated to: ${updated.status}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // epic archive
  epic
    .command('archive <id>')
    .description('Archive an epic')
    .action(async (id) => {
      try {
        const { epicService } = createServices();
        const archived = await epicService.archive(id);
        console.log(chalk.green(`✓ Epic archived: ${archived.name}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // epic unarchive
  epic
    .command('unarchive <id>')
    .description('Unarchive an epic')
    .action(async (id) => {
      try {
        const { epicService } = createServices();
        const unarchived = await epicService.unarchive(id);
        console.log(chalk.green(`✓ Epic unarchived: ${unarchived.name}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // epic delete
  epic
    .command('delete <id>')
    .description('Delete an epic (must be empty)')
    .action(async (id) => {
      try {
        const { epicService } = createServices();
        await epicService.delete(id);
        console.log(chalk.green(`✓ Epic deleted`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // epic stats
  epic
    .command('stats')
    .description('Show epic statistics')
    .action(async () => {
      try {
        const { epicService } = createServices();
        const stats = await epicService.getStats();

        console.log(chalk.bold('\nEpic Statistics:\n'));
        console.log(`  Total: ${stats.total}`);
        console.log(`  Active: ${stats.active}`);
        console.log(`  Archived: ${stats.archived}`);
        console.log(chalk.bold('\n  By Status:'));
        for (const [status, count] of Object.entries(stats.byStatus)) {
          if (count > 0) {
            console.log(`    ${status}: ${count}`);
          }
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
