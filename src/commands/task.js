/**
 * @fileoverview Task CLI Commands
 * @module commands/task
 */

import chalk from 'chalk';
import { FileStorageProvider } from '../epic/providers/file-storage-provider.js';
import { TaskStorageProvider } from '../epic/providers/task-storage-provider.js';
import { AIProvider } from '../epic/providers/ai-provider.js';
import { StoryIndexService } from '../epic/services/story-index-service.js';
import { EpicService } from '../epic/services/epic-service.js';
import { StoryService } from '../epic/services/story-service.js';
import { TaskService } from '../epic/services/task-service.js';
import { TaskSplittingService } from '../epic/services/task-splitting-service.js';
import { TaskExecutorService } from '../epic/services/task-executor-service.js';
import { TaskReviewService, REVIEW_MODE } from '../epic/services/task-review-service.js';
import { TASK_STATUS } from '../epic/models/task.js';

/**
 * Creates and initializes services
 */
function createServices() {
  const storage = new FileStorageProvider(process.cwd());
  const taskStorage = new TaskStorageProvider(process.cwd());
  const storyIndexService = new StoryIndexService(storage);
  const epicService = new EpicService(storage, storyIndexService);
  const storyService = new StoryService(storage, storyIndexService, epicService);
  const taskService = new TaskService(taskStorage, storyService);
  const aiProvider = new AIProvider();
  const taskSplittingService = new TaskSplittingService(aiProvider, taskService);
  const taskExecutorService = new TaskExecutorService(taskService);
  const taskReviewService = new TaskReviewService(taskService, aiProvider);

  return {
    storage,
    storyService,
    taskService,
    taskSplittingService,
    taskExecutorService,
    taskReviewService,
  };
}

/**
 * Formats task for display
 */
function formatTask(task, index) {
  const statusIcons = {
    [TASK_STATUS.PENDING]: chalk.gray('○'),
    [TASK_STATUS.IN_PROGRESS]: chalk.yellow('◐'),
    [TASK_STATUS.COMPLETED]: chalk.green('●'),
    [TASK_STATUS.FAILED]: chalk.red('✗'),
    [TASK_STATUS.SKIPPED]: chalk.dim('⊘'),
  };

  const statusColors = {
    [TASK_STATUS.PENDING]: chalk.gray,
    [TASK_STATUS.IN_PROGRESS]: chalk.yellow,
    [TASK_STATUS.COMPLETED]: chalk.green,
    [TASK_STATUS.FAILED]: chalk.red,
    [TASK_STATUS.SKIPPED]: chalk.dim,
  };

  const icon = statusIcons[task.status] || chalk.gray('○');
  const colorFn = statusColors[task.status] || chalk.gray;
  const deps = task.dependencies.length > 0 ? chalk.dim(` [deps: ${task.dependencies.length}]`) : '';
  const files = task.files.length > 0 ? chalk.dim(` (${task.files.length} files)`) : '';

  return `  ${icon} ${chalk.bold(index + 1)}. ${task.title} ${colorFn(task.status)}${deps}${files}`;
}

export function registerTaskCommand(program) {
  const task = program
    .command('task')
    .description('Manage implementation tasks');

  // task list <storyId>
  task
    .command('list <storyId>')
    .alias('ls')
    .description('List all tasks for a story')
    .option('--verbose', 'Show detailed information')
    .action(async (storyId, options) => {
      try {
        const { taskService, storyService } = createServices();

        // Verify story exists
        const story = await storyService.getById(storyId);
        console.log(chalk.bold(`\nTasks for: ${story.title}\n`));

        const tasks = await taskService.getTasksForStory(storyId);

        if (tasks.length === 0) {
          console.log(chalk.yellow('  No tasks found. Use "aia task split" to generate tasks.'));
          return;
        }

        // Sort by order
        tasks.sort((a, b) => a.order - b.order);

        for (let i = 0; i < tasks.length; i++) {
          console.log(formatTask(tasks[i], i));

          if (options.verbose) {
            console.log(chalk.dim(`     ID: ${tasks[i].id.slice(0, 8)}`));
            if (tasks[i].files.length > 0) {
              console.log(chalk.dim(`     Files: ${tasks[i].files.join(', ')}`));
            }
            if (tasks[i].details) {
              console.log(chalk.dim(`     ${tasks[i].details.substring(0, 80)}...`));
            }
          }
        }

        // Summary
        const summary = await taskService.getTaskSummary(storyId);
        console.log(chalk.dim(`\n  Total: ${summary.total} | Completed: ${summary.completed} | Pending: ${summary.pending} | Failed: ${summary.failed}`));
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // task show <storyId> <taskId>
  task
    .command('show <storyId> <taskId>')
    .description('Show task details')
    .action(async (storyId, taskId) => {
      try {
        const { taskService } = createServices();
        const t = await taskService.getTask(storyId, taskId);

        console.log(chalk.bold(`\n${t.title}`));
        console.log(chalk.dim(`ID: ${t.id}`));
        console.log(`Status: ${t.status}`);
        console.log(`Order: ${t.order}`);

        if (t.details) {
          console.log(chalk.bold('\nDetails:'));
          console.log(t.details);
        }

        if (t.files.length > 0) {
          console.log(chalk.bold('\nFiles:'));
          t.files.forEach((f) => console.log(`  - ${f}`));
        }

        if (t.dependencies.length > 0) {
          console.log(chalk.bold('\nDependencies:'));
          t.dependencies.forEach((d) => console.log(`  - ${d.slice(0, 8)}`));
        }

        if (t.tests.length > 0) {
          console.log(chalk.bold('\nTests:'));
          t.tests.forEach((test) => console.log(`  - ${test}`));
        }

        if (t.implementationResult) {
          console.log(chalk.bold('\nImplementation Result:'));
          console.log(`  Success: ${t.implementationResult.success}`);
          if (t.implementationResult.error) {
            console.log(chalk.red(`  Error: ${t.implementationResult.error}`));
          }
          if (t.implementationResult.filesModified?.length > 0) {
            console.log(`  Modified: ${t.implementationResult.filesModified.join(', ')}`);
          }
        }

        if (t.reviewResult) {
          console.log(chalk.bold('\nReview Result:'));
          console.log(`  Status: ${t.reviewResult.status}`);
          if (t.reviewResult.feedback) {
            console.log(`  Feedback: ${t.reviewResult.feedback}`);
          }
        }

        console.log(`\nCreated: ${t.createdAt}`);
        console.log(`Updated: ${t.updatedAt}`);
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // task split <storyId>
  task
    .command('split <storyId>')
    .description('Generate tasks from story using AI')
    .option('--from-plan <file>', 'Parse tasks from a dev plan file')
    .action(async (storyId, options) => {
      try {
        const { taskSplittingService, storyService, taskService } = createServices();

        // Check if tasks already exist
        const existingTasks = await taskService.getTasksForStory(storyId);
        if (existingTasks.length > 0) {
          console.log(chalk.yellow(`Story already has ${existingTasks.length} tasks.`));
          console.log(chalk.dim('Use "aia task list" to view or "aia task reset-all" to regenerate.'));
          return;
        }

        const story = await storyService.getById(storyId);

        console.log(chalk.cyan(`Generating tasks for: ${story.title}...`));

        let tasks;
        if (options.fromPlan) {
          const fs = await import('fs-extra');
          const content = await fs.default.readFile(options.fromPlan, 'utf-8');
          tasks = await taskSplittingService.splitFromDevPlan(storyId, content);
        } else {
          tasks = await taskSplittingService.splitIntoTasks(story);
        }

        console.log(chalk.green(`\n✓ Generated ${tasks.length} tasks:\n`));

        tasks.forEach((t, i) => {
          console.log(formatTask(t, i));
        });

        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // task run <storyId> [taskId]
  task
    .command('run <storyId> [taskId]')
    .description('Run a specific task or the next pending task')
    .option('--force', 'Ignore dependency checks')
    .option('--dry-run', 'Show what would be executed without running')
    .action(async (storyId, taskId, options) => {
      try {
        const { taskExecutorService, taskService } = createServices();

        let targetTask;

        if (taskId) {
          targetTask = await taskService.getTask(storyId, taskId);
        } else {
          targetTask = await taskService.getNextPendingTask(storyId);
          if (!targetTask) {
            console.log(chalk.yellow('No pending tasks to run.'));
            return;
          }
        }

        console.log(chalk.cyan(`Running task: ${targetTask.title}`));

        if (options.dryRun) {
          console.log(chalk.dim('\n[Dry run mode - no changes will be made]'));
          console.log(chalk.dim(`Files to modify: ${targetTask.files.join(', ') || 'none specified'}`));
          console.log(chalk.dim(`Details: ${targetTask.details || 'none'}`));
          return;
        }

        const result = await taskExecutorService.executeTask(storyId, targetTask.id, {
          force: options.force,
        });

        if (result.status === TASK_STATUS.COMPLETED) {
          console.log(chalk.green(`\n✓ Task completed: ${result.title}`));
        } else {
          console.log(chalk.red(`\n✗ Task failed: ${result.title}`));
          if (result.implementationResult?.error) {
            console.log(chalk.red(`  Error: ${result.implementationResult.error}`));
          }
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // task run-all <storyId>
  task
    .command('run-all <storyId>')
    .description('Run all tasks sequentially')
    .option('--continue-on-error', 'Continue even if a task fails')
    .option('--interactive', 'Pause between tasks for confirmation')
    .action(async (storyId, options) => {
      try {
        const { taskExecutorService, taskService } = createServices();

        const tasks = await taskService.getTasksForStory(storyId);
        const pendingCount = tasks.filter((t) => t.status === TASK_STATUS.PENDING).length;

        if (pendingCount === 0) {
          console.log(chalk.yellow('No pending tasks to run.'));
          return;
        }

        console.log(chalk.cyan(`Running ${pendingCount} pending tasks...\n`));

        if (options.interactive) {
          // Interactive mode - run one by one with confirmation
          const readline = await import('readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          const question = (q) => new Promise((resolve) => rl.question(q, resolve));

          let task = await taskService.getNextPendingTask(storyId);

          while (task) {
            console.log(chalk.cyan(`\nNext task: ${task.title}`));
            const answer = await question('Run this task? (y/n/q): ');

            if (answer.toLowerCase() === 'q') {
              console.log(chalk.yellow('Stopped by user.'));
              break;
            }

            if (answer.toLowerCase() === 'y') {
              try {
                const result = await taskExecutorService.executeTask(storyId, task.id);
                console.log(result.status === TASK_STATUS.COMPLETED
                  ? chalk.green(`✓ Completed: ${task.title}`)
                  : chalk.red(`✗ Failed: ${task.title}`));
              } catch (err) {
                console.log(chalk.red(`✗ Error: ${err.message}`));
                if (!options.continueOnError) {
                  break;
                }
              }
            } else {
              console.log(chalk.dim('Skipping task.'));
            }

            task = await taskService.getNextPendingTask(storyId);
          }

          rl.close();
        } else {
          // Non-interactive batch execution
          const summary = await taskExecutorService.executeAllTasks(storyId, {
            stopOnError: !options.continueOnError,
          });

          console.log(chalk.bold('\nExecution Summary:'));
          console.log(`  Completed: ${chalk.green(summary.completed)}`);
          console.log(`  Failed: ${chalk.red(summary.failed)}`);
          console.log(`  Skipped: ${chalk.dim(summary.skipped)}`);
        }

        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // task review <storyId> [taskId]
  task
    .command('review <storyId> [taskId]')
    .description('Review a specific task or all completed tasks')
    .option('--ai', 'Use AI for review')
    .option('--mode <mode>', 'Review mode: individual or general', 'individual')
    .action(async (storyId, taskId, options) => {
      try {
        const { taskReviewService, taskService } = createServices();

        if (taskId) {
          // Review specific task
          console.log(chalk.cyan('Reviewing task...'));
          const result = await taskReviewService.reviewTask(storyId, taskId, {
            useAI: options.ai,
          });

          console.log(chalk.bold(`\nReview: ${result.taskTitle}`));
          console.log(`Status: ${result.status}`);
          if (result.feedback) {
            console.log(`Feedback: ${result.feedback}`);
          }
          if (result.issues?.length > 0) {
            console.log(chalk.bold('\nIssues:'));
            result.issues.forEach((issue) => console.log(`  - ${issue}`));
          }
        } else {
          // Review all completed tasks
          console.log(chalk.cyan(`Reviewing all completed tasks (${options.mode} mode)...`));

          const result = await taskReviewService.reviewAllTasks(storyId, {
            mode: options.mode === 'general' ? REVIEW_MODE.GENERAL : REVIEW_MODE.INDIVIDUAL,
            useAI: options.ai,
          });

          console.log(chalk.bold('\nReview Summary:'));
          console.log(`Tasks reviewed: ${result.tasksReviewed}`);

          if (result.mode === REVIEW_MODE.INDIVIDUAL) {
            console.log(`Approved: ${chalk.green(result.approved)}`);
            console.log(`Changes requested: ${chalk.yellow(result.changesRequested)}`);
          } else if (result.overallStatus) {
            console.log(`Overall status: ${result.overallStatus}`);
            console.log(`Summary: ${result.summary}`);
          }

          if (result.needsManualReview) {
            console.log(chalk.yellow('\nManual review required.'));
          }
        }

        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // task reset <storyId> <taskId>
  task
    .command('reset <storyId> <taskId>')
    .description('Reset a task to pending status')
    .action(async (storyId, taskId) => {
      try {
        const { taskService } = createServices();
        await taskService.resetTask(storyId, taskId);
        console.log(chalk.green('✓ Task reset to pending'));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // task skip <storyId> <taskId>
  task
    .command('skip <storyId> <taskId>')
    .description('Skip a task')
    .action(async (storyId, taskId) => {
      try {
        const { taskService } = createServices();
        await taskService.skipTask(storyId, taskId);
        console.log(chalk.green('✓ Task skipped'));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // task approve <storyId> <taskId>
  task
    .command('approve <storyId> <taskId>')
    .description('Approve a completed task')
    .option('-m, --message <message>', 'Approval message')
    .action(async (storyId, taskId, options) => {
      try {
        const { taskReviewService } = createServices();
        await taskReviewService.approveTask(storyId, taskId, options.message);
        console.log(chalk.green('✓ Task approved'));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // task request-changes <storyId> <taskId> <feedback>
  task
    .command('request-changes <storyId> <taskId> <feedback>')
    .description('Request changes for a task')
    .action(async (storyId, taskId, feedback) => {
      try {
        const { taskReviewService } = createServices();
        await taskReviewService.requestChanges(storyId, taskId, feedback);
        console.log(chalk.yellow('✓ Changes requested'));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // task progress <storyId>
  task
    .command('progress <storyId>')
    .description('Show task progress')
    .action(async (storyId) => {
      try {
        const { taskExecutorService } = createServices();
        const progress = await taskExecutorService.getProgress(storyId);

        console.log(chalk.bold('\nTask Progress:'));
        console.log(`  Total: ${progress.total}`);
        console.log(`  Completed: ${chalk.green(progress.completed)}`);
        console.log(`  In Progress: ${chalk.yellow(progress.inProgress)}`);
        console.log(`  Pending: ${chalk.gray(progress.pending)}`);
        console.log(`  Failed: ${chalk.red(progress.failed)}`);
        console.log(`  Skipped: ${chalk.dim(progress.skipped)}`);
        console.log();

        // Progress bar
        const width = 30;
        const filled = Math.round((progress.percentage / 100) * width);
        const empty = width - filled;
        const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
        console.log(`  [${bar}] ${progress.percentage}%`);

        if (progress.isRunning) {
          console.log(chalk.yellow(`\n  Currently running task: ${progress.currentTaskId}`));
        }

        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // task delete <storyId> <taskId>
  task
    .command('delete <storyId> <taskId>')
    .description('Delete a task')
    .action(async (storyId, taskId) => {
      try {
        const { taskService } = createServices();
        await taskService.deleteTask(storyId, taskId);
        console.log(chalk.green('✓ Task deleted'));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // task clear <storyId>
  task
    .command('clear <storyId>')
    .description('Delete all tasks for a story')
    .action(async (storyId) => {
      try {
        const { taskService } = createServices();
        await taskService.deleteAllTasks(storyId);
        console.log(chalk.green('✓ All tasks deleted'));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
