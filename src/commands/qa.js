/**
 * @fileoverview QA CLI Commands
 * @module commands/qa
 */

import chalk from 'chalk';
import { FileStorageProvider } from '../epic/providers/file-storage-provider.js';
import { StoryIndexService } from '../epic/services/story-index-service.js';
import { EpicService } from '../epic/services/epic-service.js';
import { StoryService } from '../epic/services/story-service.js';
import { QAService } from '../epic/services/qa-service.js';

/**
 * Creates and initializes services
 */
function createServices() {
  const storage = new FileStorageProvider(process.cwd());
  const storyIndexService = new StoryIndexService(storage);
  const epicService = new EpicService(storage, storyIndexService);
  const storyService = new StoryService(storage, storyIndexService, epicService);
  const qaService = new QAService(storage, storyService, storyIndexService);
  return { storage, storyService, qaService };
}

export function registerQACommand(program) {
  const qa = program
    .command('qa')
    .description('QA workflow commands');

  // qa queue
  qa
    .command('queue')
    .alias('list')
    .description('List stories in testing queue')
    .action(async () => {
      try {
        const { qaService } = createServices();
        const queue = await qaService.listTestingQueue();

        if (queue.length === 0) {
          console.log(chalk.yellow('No stories in testing queue.'));
          return;
        }

        console.log(chalk.bold(`\nTesting Queue (${queue.length}):\n`));
        for (const story of queue) {
          const typeIcon = story.type === 'bug' ? chalk.red('🐛') : chalk.blue('✨');
          console.log(`  ${typeIcon} ${story.title} ${chalk.dim(story.id.slice(0, 8))}`);
          console.log(chalk.dim(`     Epic: ${story.epicName}`));
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // qa approve
  qa
    .command('approve <id>')
    .description('Approve a story in testing')
    .option('-n, --notes <notes>', 'Approval notes')
    .action(async (id, options) => {
      try {
        const { qaService } = createServices();
        const approved = await qaService.approve(id, options.notes);
        console.log(chalk.green(`✓ Story approved: ${approved.title}`));
        console.log(chalk.dim(`  Status: done`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // qa reject
  qa
    .command('reject <id>')
    .description('Reject a story in testing')
    .requiredOption('-r, --reason <reason>', 'Rejection reason (min 10 chars)')
    .action(async (id, options) => {
      try {
        const { qaService } = createServices();
        const { story, bug } = await qaService.reject(id, options.reason);
        console.log(chalk.yellow(`✓ Story rejected: ${story.title}`));
        console.log(chalk.dim(`  Status: in_progress`));
        console.log(chalk.red(`  Bug created: ${bug.title}`));
        console.log(chalk.dim(`  Bug ID: ${bug.id}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // qa history
  qa
    .command('history <id>')
    .description('Show QA history for a story')
    .action(async (id) => {
      try {
        const { qaService } = createServices();
        const history = await qaService.getHistory(id);

        if (history.length === 0) {
          console.log(chalk.yellow('No QA history for this story.'));
          return;
        }

        console.log(chalk.bold('\nQA History:\n'));
        for (const action of history) {
          const icon = action.action === 'approve' ? chalk.green('✓') : chalk.red('✗');
          console.log(`  ${icon} ${action.action} - ${new Date(action.performedAt).toLocaleString()}`);
          if (action.reason) {
            console.log(chalk.dim(`    ${action.reason}`));
          }
          if (action.createdBugId) {
            console.log(chalk.dim(`    Bug: ${action.createdBugId}`));
          }
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // qa submit (move to testing)
  qa
    .command('submit <id>')
    .description('Submit a story for QA testing')
    .action(async (id) => {
      try {
        const { qaService } = createServices();
        const submitted = await qaService.moveToTesting(id);
        console.log(chalk.green(`✓ Story submitted for testing: ${submitted.title}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // qa stats
  qa
    .command('stats')
    .description('Show QA statistics')
    .action(async () => {
      try {
        const { qaService } = createServices();
        const stats = await qaService.getStats();

        console.log(chalk.bold('\nQA Statistics:\n'));
        console.log(`  In Testing: ${stats.inTesting}`);
        console.log(`  Approved Today: ${stats.approvedToday}`);
        console.log(`  Rejected Today: ${stats.rejectedToday}`);
        console.log(`  Total Approvals: ${stats.totalApprovals}`);
        console.log(`  Total Rejections: ${stats.totalRejections}`);
        console.log(`  Avg Rejections/Story: ${stats.avgRejectionsPerStory}`);
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // qa bugs
  qa
    .command('bugs <id>')
    .description('List bugs linked to a story')
    .action(async (id) => {
      try {
        const { qaService } = createServices();
        const bugs = await qaService.getLinkedBugs(id);

        if (bugs.length === 0) {
          console.log(chalk.yellow('No linked bugs.'));
          return;
        }

        console.log(chalk.bold(`\nLinked Bugs (${bugs.length}):\n`));
        for (const bug of bugs) {
          const statusColor = bug.status === 'done' ? chalk.green : chalk.yellow;
          console.log(`  🐛 ${bug.title} ${statusColor(bug.status)} ${chalk.dim(bug.id.slice(0, 8))}`);
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
