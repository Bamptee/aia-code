/**
 * @fileoverview Roadmap CLI Commands
 * @module commands/roadmap
 */

import chalk from 'chalk';
import { FileStorageProvider } from '../epic/providers/file-storage-provider.js';
import { StoryIndexService } from '../epic/services/story-index-service.js';
import { EpicService } from '../epic/services/epic-service.js';
import { RoadmapService } from '../epic/services/roadmap-service.js';

/**
 * Creates and initializes services
 */
function createServices() {
  const storage = new FileStorageProvider(process.cwd());
  const storyIndexService = new StoryIndexService(storage);
  const epicService = new EpicService(storage, storyIndexService);
  const roadmapService = new RoadmapService(storage, epicService);
  return { storage, epicService, roadmapService };
}

export function registerRoadmapCommand(program) {
  const roadmap = program
    .command('roadmap')
    .description('Roadmap planning commands');

  // roadmap show
  roadmap
    .command('show')
    .alias('view')
    .description('Display the roadmap')
    .option('-g, --granularity <type>', 'Time granularity (weekly|monthly|quarterly)', 'quarterly')
    .option('-n, --periods <count>', 'Number of periods to show', '4')
    .option('-c, --completed', 'Include completed epics')
    .action(async (options) => {
      try {
        const { roadmapService } = createServices();
        const roadmapData = await roadmapService.getRoadmap({
          granularity: options.granularity,
          periodsAhead: parseInt(options.periods, 10),
          includeCompleted: options.completed,
        });

        console.log(chalk.bold(`\n📅 Roadmap (${roadmapData.granularity})\n`));
        console.log(chalk.dim(`Current period: ${roadmapData.currentPeriod}\n`));

        // Show periods
        for (const [period, epics] of Object.entries(roadmapData.periods)) {
          const isCurrent = period === roadmapData.currentPeriod;
          const periodLabel = isCurrent ? chalk.bold.cyan(period) : chalk.bold(period);
          console.log(`${periodLabel}${isCurrent ? chalk.cyan(' ←') : ''}`);

          if (epics.length === 0) {
            console.log(chalk.dim('  No epics planned'));
          } else {
            for (const epic of epics) {
              const statusColors = {
                discovery: chalk.blue,
                planning: chalk.yellow,
                in_progress: chalk.cyan,
                testing: chalk.magenta,
                done: chalk.green,
              };
              const colorFn = statusColors[epic.status] || chalk.white;
              const progress = epic.progress > 0 ? chalk.dim(` ${epic.progress}%`) : '';
              console.log(`  ${colorFn('●')} ${epic.name}${progress} ${chalk.dim(`(${epic.storyCount} stories)`)}`);
            }
          }
          console.log();
        }

        // Show unplanned
        if (roadmapData.unplanned.length > 0) {
          console.log(chalk.bold('Unplanned:'));
          for (const epic of roadmapData.unplanned) {
            if (!epic.isGeneral) {
              console.log(`  ${chalk.gray('○')} ${epic.name}`);
            }
          }
          console.log();
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // roadmap assign
  roadmap
    .command('assign <epicId> <period>')
    .description('Assign an epic to a time period (e.g., 2026-Q2)')
    .action(async (epicId, period) => {
      try {
        const { roadmapService } = createServices();
        const updated = await roadmapService.assignPeriod(epicId, period);
        console.log(chalk.green(`✓ Epic "${updated.name}" assigned to ${period}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // roadmap unassign
  roadmap
    .command('unassign <epicId>')
    .description('Remove period assignment from an epic')
    .action(async (epicId) => {
      try {
        const { roadmapService } = createServices();
        const updated = await roadmapService.unassignPeriod(epicId);
        console.log(chalk.green(`✓ Epic "${updated.name}" unassigned from roadmap`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // roadmap period
  roadmap
    .command('period <period>')
    .description('Show epics for a specific period')
    .action(async (period) => {
      try {
        const { roadmapService } = createServices();
        const epics = await roadmapService.getEpicsForPeriod(period);

        if (epics.length === 0) {
          console.log(chalk.yellow(`No epics planned for ${period}`));
          return;
        }

        console.log(chalk.bold(`\n${period}:\n`));
        for (const epic of epics) {
          const progress = epic.progress > 0 ? ` ${epic.progress}%` : '';
          console.log(`  ● ${epic.name}${progress} (${epic.status})`);
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // roadmap progress
  roadmap
    .command('progress <period>')
    .description('Show progress summary for a period')
    .action(async (period) => {
      try {
        const { roadmapService } = createServices();
        const progress = await roadmapService.getPeriodProgress(period);

        console.log(chalk.bold(`\n${period} Progress:\n`));
        console.log(`  Epics: ${progress.epicCount}`);
        console.log(`  Stories: ${progress.totalStories}`);
        console.log(`  Avg Progress: ${progress.averageProgress}%`);

        if (Object.keys(progress.byStatus).length > 0) {
          console.log(chalk.bold('\n  By Status:'));
          for (const [status, count] of Object.entries(progress.byStatus)) {
            console.log(`    ${status}: ${count}`);
          }
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // roadmap current
  roadmap
    .command('current')
    .description('Show current period')
    .option('-g, --granularity <type>', 'Time granularity', 'quarterly')
    .action(async (options) => {
      try {
        const { roadmapService } = createServices();
        const period = roadmapService.getCurrentPeriod(options.granularity);
        console.log(chalk.bold(`Current period: ${period}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // roadmap upcoming
  roadmap
    .command('upcoming')
    .description('Show upcoming periods')
    .option('-n, --count <count>', 'Number of periods', '4')
    .option('-g, --granularity <type>', 'Time granularity', 'quarterly')
    .action(async (options) => {
      try {
        const { roadmapService } = createServices();
        const periods = roadmapService.getUpcomingPeriods(
          parseInt(options.count, 10),
          options.granularity
        );

        console.log(chalk.bold('\nUpcoming Periods:\n'));
        for (const period of periods) {
          console.log(`  ${period}`);
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // roadmap stats
  roadmap
    .command('stats')
    .description('Show roadmap statistics')
    .action(async () => {
      try {
        const { roadmapService } = createServices();
        const stats = await roadmapService.getStats();

        console.log(chalk.bold('\nRoadmap Statistics:\n'));
        console.log(`  Total Epics: ${stats.totalEpics}`);
        console.log(`  Planned: ${stats.planned}`);
        console.log(`  Unplanned: ${stats.unplanned}`);

        if (Object.keys(stats.byPeriod).length > 0) {
          console.log(chalk.bold('\n  By Period:'));
          const sortedPeriods = Object.entries(stats.byPeriod).sort(([a], [b]) => a.localeCompare(b));
          for (const [period, count] of sortedPeriods) {
            console.log(`    ${period}: ${count}`);
          }
        }

        if (Object.keys(stats.byStatus).length > 0) {
          console.log(chalk.bold('\n  By Status:'));
          for (const [status, count] of Object.entries(stats.byStatus)) {
            if (count > 0) {
              console.log(`    ${status}: ${count}`);
            }
          }
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
