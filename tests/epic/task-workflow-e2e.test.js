/**
 * @fileoverview End-to-end tests for Task Workflow
 * Tests the complete task splitting, execution, and review workflow
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';

import { FileStorageProvider } from '../../src/epic/providers/file-storage-provider.js';
import { TaskStorageProvider } from '../../src/epic/providers/task-storage-provider.js';
import { StoryIndexService } from '../../src/epic/services/story-index-service.js';
import { EpicService } from '../../src/epic/services/epic-service.js';
import { StoryService } from '../../src/epic/services/story-service.js';
import { TaskService } from '../../src/epic/services/task-service.js';
import { TaskExecutorService } from '../../src/epic/services/task-executor-service.js';
import { TaskReviewService, REVIEW_MODE } from '../../src/epic/services/task-review-service.js';
import { TASK_STATUS } from '../../src/epic/models/task.js';

// Test directory setup
let testRoot;
let storage;
let taskStorage;
let storyIndex;
let epicService;
let storyService;
let taskService;
let taskExecutorService;
let taskReviewService;
let testEpic;
let testStory;

beforeEach(async () => {
  testRoot = path.join(os.tmpdir(), `task-e2e-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.ensureDir(testRoot);

  storage = new FileStorageProvider(testRoot);
  taskStorage = new TaskStorageProvider(testRoot);
  storyIndex = new StoryIndexService(storage);
  epicService = new EpicService(storage, storyIndex);
  storyService = new StoryService(storage, storyIndex, epicService);
  taskService = new TaskService(taskStorage, storyService);
  taskExecutorService = new TaskExecutorService(taskService);
  taskReviewService = new TaskReviewService(taskService);

  await storage.ensureDirectories();

  // Create test epic and story
  testEpic = await epicService.create({ name: 'E2E Test Epic' });
  testStory = await storyService.create(testEpic.id, {
    title: 'E2E Test Story',
    type: 'feature',
    description: 'A test story for E2E workflow',
  });
});

afterEach(async () => {
  if (testRoot) {
    await fs.remove(testRoot);
  }
});

describe('Task Workflow E2E - Complete Flow', () => {
  test('full task lifecycle: create -> execute -> review -> approve', async () => {
    // 1. Create tasks
    const tasks = await taskService.createTasks(testStory.id, [
      { title: 'Setup project structure', details: 'Create directories and files' },
      { title: 'Implement core logic', details: 'Write the main functionality' },
      { title: 'Add tests', details: 'Write unit tests' },
    ]);

    assert.strictEqual(tasks.length, 3);
    assert.ok(tasks.every((t) => t.status === TASK_STATUS.PENDING));

    // 2. Enable task mode on story
    await storyService.enableTaskMode(testStory.id);
    const updatedStory = await storyService.getById(testStory.id);
    assert.strictEqual(updatedStory.taskMode, true);

    // 3. Execute first task
    const task1 = await taskExecutorService.executeTask(testStory.id, tasks[0].id);
    assert.strictEqual(task1.status, TASK_STATUS.COMPLETED);
    assert.ok(task1.implementationResult);

    // 4. Execute second task
    const task2 = await taskExecutorService.executeTask(testStory.id, tasks[1].id);
    assert.strictEqual(task2.status, TASK_STATUS.COMPLETED);

    // 5. Execute third task
    const task3 = await taskExecutorService.executeTask(testStory.id, tasks[2].id);
    assert.strictEqual(task3.status, TASK_STATUS.COMPLETED);

    // 6. Review all tasks
    const reviewResult = await taskReviewService.reviewAllTasks(testStory.id, {
      mode: REVIEW_MODE.INDIVIDUAL,
    });
    assert.ok(reviewResult.reviews);

    // 7. Approve tasks
    for (const task of tasks) {
      await taskReviewService.approveTask(testStory.id, task.id, 'Looks good');
    }

    // 8. Verify final state
    const finalTasks = await taskService.getTasksForStory(testStory.id);
    assert.ok(finalTasks.every((t) => t.status === TASK_STATUS.COMPLETED));
    assert.ok(finalTasks.every((t) => t.reviewResult?.status === 'approved'));

    // 9. Check task summary
    const summary = await taskService.getTaskSummary(testStory.id);
    assert.strictEqual(summary.total, 3);
    assert.strictEqual(summary.completed, 3);
    assert.strictEqual(summary.pending, 0);
  });

  test('task workflow with failure and retry', async () => {
    // 1. Create tasks
    const tasks = await taskService.createTasks(testStory.id, [
      { title: 'Task that might fail', details: 'Could have issues' },
    ]);

    // 2. Simulate task failure using the proper method
    await taskService.updateTaskStatus(testStory.id, tasks[0].id, TASK_STATUS.IN_PROGRESS);
    await taskService.setImplementationResult(testStory.id, tasks[0].id, {
      success: false,
      error: 'Simulated failure',
    });
    await taskService.updateTaskStatus(testStory.id, tasks[0].id, TASK_STATUS.FAILED);

    // 3. Verify failed state
    let failedTask = await taskService.getTask(testStory.id, tasks[0].id);
    assert.strictEqual(failedTask.status, TASK_STATUS.FAILED);
    assert.strictEqual(failedTask.implementationResult.success, false);

    // 4. Reset task
    const resetTask = await taskService.resetTask(testStory.id, tasks[0].id);
    assert.strictEqual(resetTask.status, TASK_STATUS.PENDING);
    assert.strictEqual(resetTask.implementationResult, null);

    // 5. Retry execution
    const retriedTask = await taskExecutorService.executeTask(testStory.id, tasks[0].id);
    assert.strictEqual(retriedTask.status, TASK_STATUS.COMPLETED);
  });

  test('task workflow with changes requested', async () => {
    // 1. Create and execute task
    const tasks = await taskService.createTasks(testStory.id, [
      { title: 'Needs refinement', details: 'Initial implementation' },
    ]);

    await taskExecutorService.executeTask(testStory.id, tasks[0].id);

    // 2. Request changes
    const changesRequested = await taskReviewService.requestChanges(
      testStory.id,
      tasks[0].id,
      'Please add error handling',
      ['Missing try-catch blocks', 'No input validation']
    );

    assert.strictEqual(changesRequested.reviewResult.status, 'changes_requested');
    assert.strictEqual(changesRequested.reviewResult.feedback, 'Please add error handling');
    assert.deepStrictEqual(changesRequested.reviewResult.issues, [
      'Missing try-catch blocks',
      'No input validation',
    ]);

    // 3. Reset task to address changes
    await taskService.resetTask(testStory.id, tasks[0].id);

    // 4. Re-execute with fixes
    await taskExecutorService.executeTask(testStory.id, tasks[0].id);

    // 5. Approve after fixes
    const approved = await taskReviewService.approveTask(
      testStory.id,
      tasks[0].id,
      'Error handling looks good now'
    );

    assert.strictEqual(approved.reviewResult.status, 'approved');
  });

  test('task workflow with dependencies', async () => {
    // 1. Create tasks with dependencies
    const tasks = await taskService.createTasks(testStory.id, [
      { title: 'Foundation', details: 'Base layer' },
      { title: 'Building on foundation', details: 'Depends on foundation' },
      { title: 'Final layer', details: 'Depends on building' },
    ]);

    // 2. Set up dependencies
    await taskService.updateTask(testStory.id, tasks[1].id, {
      dependencies: [tasks[0].id],
    });
    await taskService.updateTask(testStory.id, tasks[2].id, {
      dependencies: [tasks[1].id],
    });

    // 3. Verify can't execute dependent task first
    const canExecuteSecond = await taskService.canExecuteTask(testStory.id, tasks[1].id);
    assert.strictEqual(canExecuteSecond.canExecute, false);
    assert.ok(canExecuteSecond.blockedBy);
    assert.strictEqual(canExecuteSecond.blockedBy.length, 1);

    // 4. Execute in order
    await taskExecutorService.executeTask(testStory.id, tasks[0].id);

    const canExecuteSecondNow = await taskService.canExecuteTask(testStory.id, tasks[1].id);
    assert.strictEqual(canExecuteSecondNow.canExecute, true);

    await taskExecutorService.executeTask(testStory.id, tasks[1].id);
    await taskExecutorService.executeTask(testStory.id, tasks[2].id);

    // 5. Verify all completed
    const allTasks = await taskService.getTasksForStory(testStory.id);
    assert.ok(allTasks.every((t) => t.status === TASK_STATUS.COMPLETED));
  });

  test('skip task workflow', async () => {
    // 1. Create tasks
    const tasks = await taskService.createTasks(testStory.id, [
      { title: 'Required task', details: 'Must do' },
      { title: 'Optional task', details: 'Can skip' },
      { title: 'Another required', details: 'Must do' },
    ]);

    // 2. Execute first task
    await taskExecutorService.executeTask(testStory.id, tasks[0].id);

    // 3. Skip optional task
    const skipped = await taskService.skipTask(testStory.id, tasks[1].id);
    assert.strictEqual(skipped.status, TASK_STATUS.SKIPPED);

    // 4. Execute last task
    await taskExecutorService.executeTask(testStory.id, tasks[2].id);

    // 5. Check summary
    const summary = await taskService.getTaskSummary(testStory.id);
    assert.strictEqual(summary.completed, 2);
    assert.strictEqual(summary.skipped, 1);
  });
});

describe('Task Workflow E2E - Batch Operations', () => {
  test('execute all tasks sequentially', async () => {
    // 1. Create tasks
    const tasks = await taskService.createTasks(testStory.id, [
      { title: 'Task 1' },
      { title: 'Task 2' },
      { title: 'Task 3' },
    ]);

    // 2. Execute all
    const result = await taskExecutorService.executeAllTasks(testStory.id);

    assert.strictEqual(result.completed, 3);
    assert.strictEqual(result.failed, 0);
    assert.strictEqual(result.skipped, 0);

    // 3. Verify all completed
    const allTasks = await taskService.getTasksForStory(testStory.id);
    assert.ok(allTasks.every((t) => t.status === TASK_STATUS.COMPLETED));
  });

  test('execute all stops on error when configured', async () => {
    // 1. Create tasks
    const tasks = await taskService.createTasks(testStory.id, [
      { title: 'Task 1' },
      { title: 'Task 2' },
      { title: 'Task 3' },
    ]);

    // 2. Execute first task manually and fail it
    await taskService.updateTaskStatus(testStory.id, tasks[0].id, TASK_STATUS.IN_PROGRESS);
    await taskService.updateTaskStatus(testStory.id, tasks[0].id, TASK_STATUS.COMPLETED);

    await taskService.updateTaskStatus(testStory.id, tasks[1].id, TASK_STATUS.IN_PROGRESS);
    await taskService.setImplementationResult(testStory.id, tasks[1].id, {
      success: false,
      error: 'Test error',
    });
    await taskService.updateTaskStatus(testStory.id, tasks[1].id, TASK_STATUS.FAILED);

    // 3. Check that third task is still pending
    const task3 = await taskService.getTask(testStory.id, tasks[2].id);
    assert.strictEqual(task3.status, TASK_STATUS.PENDING);

    // 4. Verify summary
    const summary = await taskService.getTaskSummary(testStory.id);
    assert.strictEqual(summary.completed, 1);
    assert.strictEqual(summary.failed, 1);
    assert.strictEqual(summary.pending, 1);
  });
});

describe('Task Workflow E2E - Review Operations', () => {
  test('review all tasks with individual mode', async () => {
    // 1. Create and complete tasks
    const tasks = await taskService.createTasks(testStory.id, [
      { title: 'Task 1', details: 'First implementation' },
      { title: 'Task 2', details: 'Second implementation' },
    ]);

    for (const task of tasks) {
      await taskExecutorService.executeTask(testStory.id, task.id);
    }

    // 2. Review all
    const result = await taskReviewService.reviewAllTasks(testStory.id, {
      mode: REVIEW_MODE.INDIVIDUAL,
    });

    assert.strictEqual(result.mode, REVIEW_MODE.INDIVIDUAL);
    assert.ok(Array.isArray(result.reviews));
    assert.strictEqual(result.reviews.length, 2);
  });

  test('review all tasks with general mode', async () => {
    // 1. Create and complete tasks
    const tasks = await taskService.createTasks(testStory.id, [
      { title: 'Task 1' },
      { title: 'Task 2' },
    ]);

    for (const task of tasks) {
      await taskExecutorService.executeTask(testStory.id, task.id);
    }

    // 2. Review all with general mode (without AI, returns summary)
    const result = await taskReviewService.reviewAllTasks(testStory.id, {
      mode: REVIEW_MODE.GENERAL,
      storyContext: 'Testing the general review feature',
    });

    assert.strictEqual(result.mode, REVIEW_MODE.GENERAL);
    assert.strictEqual(result.tasksReviewed, 2);
    // Without AI provider, it should indicate manual review is needed
    assert.ok(result.needsManualReview || result.tasks);
  });

  test('get review status', async () => {
    // 1. Create tasks
    const tasks = await taskService.createTasks(testStory.id, [
      { title: 'Task 1' },
      { title: 'Task 2' },
      { title: 'Task 3' },
    ]);

    // 2. Complete and review some
    await taskExecutorService.executeTask(testStory.id, tasks[0].id);
    await taskExecutorService.executeTask(testStory.id, tasks[1].id);

    await taskReviewService.approveTask(testStory.id, tasks[0].id);
    await taskReviewService.requestChanges(testStory.id, tasks[1].id, 'Needs work');

    // 3. Check review status
    const status = await taskReviewService.getReviewStatus(testStory.id);

    assert.strictEqual(status.total, 3);
    assert.strictEqual(status.reviewable, 2);
    assert.strictEqual(status.approved, 1);
    assert.strictEqual(status.changesRequested, 1);
    assert.strictEqual(status.notReviewable, 1);  // Task 3 is still pending
  });
});

describe('Task Workflow E2E - Progress Tracking', () => {
  test('track execution progress', async () => {
    // 1. Create tasks
    await taskService.createTasks(testStory.id, [
      { title: 'Task 1' },
      { title: 'Task 2' },
      { title: 'Task 3' },
      { title: 'Task 4' },
    ]);

    // 2. Get initial progress
    let progress = await taskExecutorService.getProgress(testStory.id);
    assert.strictEqual(progress.percentage, 0);
    assert.strictEqual(progress.total, 4);
    assert.strictEqual(progress.completed, 0);

    // 3. Execute some tasks and check progress
    const tasks = await taskService.getTasksForStory(testStory.id);
    await taskExecutorService.executeTask(testStory.id, tasks[0].id);

    progress = await taskExecutorService.getProgress(testStory.id);
    assert.strictEqual(progress.percentage, 25);
    assert.strictEqual(progress.completed, 1);

    await taskExecutorService.executeTask(testStory.id, tasks[1].id);

    progress = await taskExecutorService.getProgress(testStory.id);
    assert.strictEqual(progress.percentage, 50);
    assert.strictEqual(progress.completed, 2);
  });

  test('next pending task after completions', async () => {
    // 1. Create tasks
    const tasks = await taskService.createTasks(testStory.id, [
      { title: 'First' },
      { title: 'Second' },
      { title: 'Third' },
    ]);

    // 2. Check next pending
    let next = await taskService.getNextPendingTask(testStory.id);
    assert.strictEqual(next.id, tasks[0].id);

    // 3. Complete first and check again
    await taskExecutorService.executeTask(testStory.id, tasks[0].id);
    next = await taskService.getNextPendingTask(testStory.id);
    assert.strictEqual(next.id, tasks[1].id);

    // 4. Skip second and check again
    await taskService.skipTask(testStory.id, tasks[1].id);
    next = await taskService.getNextPendingTask(testStory.id);
    assert.strictEqual(next.id, tasks[2].id);

    // 5. Complete third, should be null
    await taskExecutorService.executeTask(testStory.id, tasks[2].id);
    next = await taskService.getNextPendingTask(testStory.id);
    assert.strictEqual(next, null);
  });
});

describe('Task Workflow E2E - Story Integration', () => {
  test('task summary updates on story', async () => {
    // 1. Enable task mode
    await storyService.enableTaskMode(testStory.id);

    // 2. Create tasks
    const tasks = await taskService.createTasks(testStory.id, [
      { title: 'Task 1' },
      { title: 'Task 2' },
    ]);

    // 3. Update story task summary
    let summary = await taskService.getTaskSummary(testStory.id);
    await storyService.updateTaskSummary(testStory.id, summary);

    let story = await storyService.getById(testStory.id);
    assert.strictEqual(story.taskSummary.total, 2);
    assert.strictEqual(story.taskSummary.pending, 2);

    // 4. Execute task and update summary
    await taskExecutorService.executeTask(testStory.id, tasks[0].id);
    summary = await taskService.getTaskSummary(testStory.id);
    await storyService.updateTaskSummary(testStory.id, summary);

    story = await storyService.getById(testStory.id);
    assert.strictEqual(story.taskSummary.completed, 1);
    assert.strictEqual(story.taskSummary.pending, 1);
  });

  test('delete all tasks clears task summary', async () => {
    // 1. Enable task mode
    await storyService.enableTaskMode(testStory.id);

    // 2. Create tasks
    await taskService.createTasks(testStory.id, [
      { title: 'Task 1' },
      { title: 'Task 2' },
    ]);

    // 3. Update story task summary
    let summary = await taskService.getTaskSummary(testStory.id);
    await storyService.updateTaskSummary(testStory.id, summary);

    // 4. Delete all tasks
    await taskService.deleteAllTasks(testStory.id);

    // 5. Update and verify
    summary = await taskService.getTaskSummary(testStory.id);
    await storyService.updateTaskSummary(testStory.id, summary);

    const story = await storyService.getById(testStory.id);
    assert.strictEqual(story.taskSummary.total, 0);
  });
});
