/**
 * @fileoverview Unit tests for Task Service
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';

import { TaskStorageProvider } from '../../src/epic/providers/task-storage-provider.js';
import { FileStorageProvider } from '../../src/epic/providers/file-storage-provider.js';
import { StoryIndexService } from '../../src/epic/services/story-index-service.js';
import { EpicService } from '../../src/epic/services/epic-service.js';
import { StoryService } from '../../src/epic/services/story-service.js';
import { TaskService } from '../../src/epic/services/task-service.js';
import { TASK_STATUS } from '../../src/epic/models/task.js';
import { ValidationError, NotFoundError, BusinessRuleError } from '../../src/epic/utils/errors.js';

// Test directory setup
let testRoot;
let storage;
let taskStorage;
let storyIndex;
let epicService;
let storyService;
let taskService;
let testEpic;
let testStory;

beforeEach(async () => {
  testRoot = path.join(os.tmpdir(), `task-service-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.ensureDir(testRoot);
  storage = new FileStorageProvider(testRoot);
  taskStorage = new TaskStorageProvider(testRoot);
  storyIndex = new StoryIndexService(storage);
  epicService = new EpicService(storage, storyIndex);
  storyService = new StoryService(storage, storyIndex, epicService);
  taskService = new TaskService(taskStorage, storyService);
  await storage.ensureDirectories();

  // Create test epic and story
  testEpic = await epicService.create({ name: 'Test Epic' });
  testStory = await storyService.create(testEpic.id, {
    title: 'Test Story',
    type: 'feature',
  });
});

afterEach(async () => {
  if (testRoot) {
    await fs.remove(testRoot);
  }
});

describe('TaskService - Basic Operations', () => {
  describe('createTasks', () => {
    test('creates multiple tasks for a story', async () => {
      const tasksData = [
        { title: 'Task 1', details: 'Details 1' },
        { title: 'Task 2', details: 'Details 2' },
        { title: 'Task 3', details: 'Details 3' },
      ];

      const tasks = await taskService.createTasks(testStory.id, tasksData);

      assert.strictEqual(tasks.length, 3);
      assert.strictEqual(tasks[0].title, 'Task 1');
      assert.strictEqual(tasks[0].order, 0);
      assert.strictEqual(tasks[1].order, 1);
      assert.strictEqual(tasks[2].order, 2);
    });

    test('sets correct storyId on all tasks', async () => {
      const tasks = await taskService.createTasks(testStory.id, [
        { title: 'Task 1' },
        { title: 'Task 2' },
      ]);

      assert.ok(tasks.every((t) => t.storyId === testStory.id));
    });

    test('sets default status to pending', async () => {
      const tasks = await taskService.createTasks(testStory.id, [
        { title: 'Task 1' },
      ]);

      assert.strictEqual(tasks[0].status, TASK_STATUS.PENDING);
    });

    test('creates tasks with optional fields', async () => {
      const tasks = await taskService.createTasks(testStory.id, [
        {
          title: 'Full Task',
          details: 'Implementation details',
          files: ['src/file1.js', 'src/file2.js'],
          tests: ['Test case 1', 'Test case 2'],
        },
      ]);

      assert.strictEqual(tasks[0].details, 'Implementation details');
      assert.deepStrictEqual(tasks[0].files, ['src/file1.js', 'src/file2.js']);
      assert.deepStrictEqual(tasks[0].tests, ['Test case 1', 'Test case 2']);
    });

    test('throws NotFoundError for non-existent story', async () => {
      await assert.rejects(
        async () => {
          await taskService.createTasks('non-existent', [{ title: 'Task' }]);
        },
        NotFoundError
      );
    });

    test('throws ValidationError for empty title', async () => {
      await assert.rejects(
        async () => {
          await taskService.createTasks(testStory.id, [{ title: '' }]);
        },
        ValidationError
      );
    });
  });

  describe('getTasksForStory', () => {
    test('returns all tasks for a story', async () => {
      await taskService.createTasks(testStory.id, [
        { title: 'Task 1' },
        { title: 'Task 2' },
        { title: 'Task 3' },
      ]);

      const tasks = await taskService.getTasksForStory(testStory.id);
      assert.strictEqual(tasks.length, 3);
    });

    test('returns tasks in order', async () => {
      await taskService.createTasks(testStory.id, [
        { title: 'First' },
        { title: 'Second' },
        { title: 'Third' },
      ]);

      const tasks = await taskService.getTasksForStory(testStory.id);
      assert.strictEqual(tasks[0].title, 'First');
      assert.strictEqual(tasks[1].title, 'Second');
      assert.strictEqual(tasks[2].title, 'Third');
    });

    test('returns empty array for story with no tasks', async () => {
      const tasks = await taskService.getTasksForStory(testStory.id);
      assert.deepStrictEqual(tasks, []);
    });
  });

  describe('getTask', () => {
    test('returns specific task', async () => {
      const created = await taskService.createTasks(testStory.id, [
        { title: 'Target Task' },
      ]);

      const task = await taskService.getTask(testStory.id, created[0].id);
      assert.strictEqual(task.title, 'Target Task');
    });

    test('throws NotFoundError for non-existent task', async () => {
      await assert.rejects(
        async () => {
          await taskService.getTask(testStory.id, 'non-existent');
        },
        NotFoundError
      );
    });
  });

  describe('updateTask', () => {
    test('updates task title', async () => {
      const [task] = await taskService.createTasks(testStory.id, [
        { title: 'Original' },
      ]);

      const updated = await taskService.updateTask(testStory.id, task.id, {
        title: 'Updated',
      });

      assert.strictEqual(updated.title, 'Updated');
    });

    test('updates task details', async () => {
      const [task] = await taskService.createTasks(testStory.id, [
        { title: 'Task' },
      ]);

      const updated = await taskService.updateTask(testStory.id, task.id, {
        details: 'New details',
      });

      assert.strictEqual(updated.details, 'New details');
    });

    test('updates task files', async () => {
      const [task] = await taskService.createTasks(testStory.id, [
        { title: 'Task' },
      ]);

      const updated = await taskService.updateTask(testStory.id, task.id, {
        files: ['new-file.js'],
      });

      assert.deepStrictEqual(updated.files, ['new-file.js']);
    });
  });

  describe('deleteTask', () => {
    test('deletes a task', async () => {
      const [task] = await taskService.createTasks(testStory.id, [
        { title: 'To Delete' },
      ]);

      await taskService.deleteTask(testStory.id, task.id);

      await assert.rejects(
        async () => {
          await taskService.getTask(testStory.id, task.id);
        },
        NotFoundError
      );
    });

    test('preserves original order of remaining tasks', async () => {
      const tasks = await taskService.createTasks(testStory.id, [
        { title: 'First' },
        { title: 'Second' },
        { title: 'Third' },
      ]);

      await taskService.deleteTask(testStory.id, tasks[0].id);

      const remaining = await taskService.getTasksForStory(testStory.id);
      assert.strictEqual(remaining.length, 2);
      // Tasks retain their original order values
      assert.strictEqual(remaining[0].title, 'Second');
      assert.strictEqual(remaining[0].order, 1);
      assert.strictEqual(remaining[1].title, 'Third');
      assert.strictEqual(remaining[1].order, 2);
    });
  });

  describe('deleteAllTasks', () => {
    test('deletes all tasks for a story', async () => {
      await taskService.createTasks(testStory.id, [
        { title: 'Task 1' },
        { title: 'Task 2' },
        { title: 'Task 3' },
      ]);

      await taskService.deleteAllTasks(testStory.id);

      const tasks = await taskService.getTasksForStory(testStory.id);
      assert.strictEqual(tasks.length, 0);
    });
  });
});

describe('TaskService - Status Management', () => {
  describe('updateTaskStatus', () => {
    test('transitions task from pending to in_progress', async () => {
      const [task] = await taskService.createTasks(testStory.id, [
        { title: 'Task' },
      ]);

      const updated = await taskService.updateTaskStatus(
        testStory.id,
        task.id,
        TASK_STATUS.IN_PROGRESS
      );

      assert.strictEqual(updated.status, TASK_STATUS.IN_PROGRESS);
    });

    test('transitions task from in_progress to completed', async () => {
      const [task] = await taskService.createTasks(testStory.id, [
        { title: 'Task' },
      ]);

      await taskService.updateTaskStatus(testStory.id, task.id, TASK_STATUS.IN_PROGRESS);
      const updated = await taskService.updateTaskStatus(
        testStory.id,
        task.id,
        TASK_STATUS.COMPLETED
      );

      assert.strictEqual(updated.status, TASK_STATUS.COMPLETED);
    });

    test('transitions task from in_progress to failed', async () => {
      const [task] = await taskService.createTasks(testStory.id, [
        { title: 'Task' },
      ]);

      await taskService.updateTaskStatus(testStory.id, task.id, TASK_STATUS.IN_PROGRESS);
      const updated = await taskService.updateTaskStatus(
        testStory.id,
        task.id,
        TASK_STATUS.FAILED
      );

      assert.strictEqual(updated.status, TASK_STATUS.FAILED);
    });

    test('throws BusinessRuleError for invalid transition', async () => {
      const [task] = await taskService.createTasks(testStory.id, [
        { title: 'Task' },
      ]);

      // Cannot go directly from pending to completed
      await assert.rejects(
        async () => {
          await taskService.updateTaskStatus(testStory.id, task.id, TASK_STATUS.COMPLETED);
        },
        BusinessRuleError
      );
    });
  });

  describe('skipTask', () => {
    test('skips a pending task', async () => {
      const [task] = await taskService.createTasks(testStory.id, [
        { title: 'Task' },
      ]);

      const skipped = await taskService.skipTask(testStory.id, task.id);

      assert.strictEqual(skipped.status, TASK_STATUS.SKIPPED);
    });

    test('throws BusinessRuleError for non-pending task', async () => {
      const [task] = await taskService.createTasks(testStory.id, [
        { title: 'Task' },
      ]);

      await taskService.updateTaskStatus(testStory.id, task.id, TASK_STATUS.IN_PROGRESS);

      await assert.rejects(
        async () => {
          await taskService.skipTask(testStory.id, task.id);
        },
        BusinessRuleError
      );
    });
  });

  describe('resetTask', () => {
    test('resets completed task to pending', async () => {
      const [task] = await taskService.createTasks(testStory.id, [
        { title: 'Task' },
      ]);

      await taskService.updateTaskStatus(testStory.id, task.id, TASK_STATUS.IN_PROGRESS);
      await taskService.updateTaskStatus(testStory.id, task.id, TASK_STATUS.COMPLETED);

      const reset = await taskService.resetTask(testStory.id, task.id);

      assert.strictEqual(reset.status, TASK_STATUS.PENDING);
    });

    test('resets failed task to pending', async () => {
      const [task] = await taskService.createTasks(testStory.id, [
        { title: 'Task' },
      ]);

      await taskService.updateTaskStatus(testStory.id, task.id, TASK_STATUS.IN_PROGRESS);
      await taskService.updateTaskStatus(testStory.id, task.id, TASK_STATUS.FAILED);

      const reset = await taskService.resetTask(testStory.id, task.id);

      assert.strictEqual(reset.status, TASK_STATUS.PENDING);
    });

    test('resets skipped task to pending', async () => {
      const [task] = await taskService.createTasks(testStory.id, [
        { title: 'Task' },
      ]);

      await taskService.skipTask(testStory.id, task.id);

      const reset = await taskService.resetTask(testStory.id, task.id);

      assert.strictEqual(reset.status, TASK_STATUS.PENDING);
    });

    test('clears implementation and review results', async () => {
      const [task] = await taskService.createTasks(testStory.id, [
        { title: 'Task' },
      ]);

      await taskService.updateTaskStatus(testStory.id, task.id, TASK_STATUS.IN_PROGRESS);
      await taskService.setImplementationResult(testStory.id, task.id, {
        success: true,
        filesModified: ['file.js'],
      });
      await taskService.updateTaskStatus(testStory.id, task.id, TASK_STATUS.COMPLETED);

      const reset = await taskService.resetTask(testStory.id, task.id);

      assert.strictEqual(reset.implementationResult, null);
      assert.strictEqual(reset.reviewResult, null);
    });
  });
});

describe('TaskService - Task Summary', () => {
  describe('getTaskSummary', () => {
    test('returns correct summary for empty story', async () => {
      const summary = await taskService.getTaskSummary(testStory.id);

      assert.strictEqual(summary.total, 0);
      assert.strictEqual(summary.pending, 0);
      assert.strictEqual(summary.inProgress, 0);
      assert.strictEqual(summary.completed, 0);
      assert.strictEqual(summary.failed, 0);
      assert.strictEqual(summary.skipped, 0);
    });

    test('returns correct summary with mixed statuses', async () => {
      const tasks = await taskService.createTasks(testStory.id, [
        { title: 'Pending 1' },
        { title: 'Pending 2' },
        { title: 'In Progress' },
        { title: 'Completed' },
        { title: 'Failed' },
        { title: 'Skipped' },
      ]);

      await taskService.updateTaskStatus(testStory.id, tasks[2].id, TASK_STATUS.IN_PROGRESS);
      await taskService.updateTaskStatus(testStory.id, tasks[3].id, TASK_STATUS.IN_PROGRESS);
      await taskService.updateTaskStatus(testStory.id, tasks[3].id, TASK_STATUS.COMPLETED);
      await taskService.updateTaskStatus(testStory.id, tasks[4].id, TASK_STATUS.IN_PROGRESS);
      await taskService.updateTaskStatus(testStory.id, tasks[4].id, TASK_STATUS.FAILED);
      await taskService.skipTask(testStory.id, tasks[5].id);

      const summary = await taskService.getTaskSummary(testStory.id);

      assert.strictEqual(summary.total, 6);
      assert.strictEqual(summary.pending, 2);
      assert.strictEqual(summary.inProgress, 1);
      assert.strictEqual(summary.completed, 1);
      assert.strictEqual(summary.failed, 1);
      assert.strictEqual(summary.skipped, 1);
    });
  });

  describe('getNextPendingTask', () => {
    test('returns first pending task', async () => {
      const tasks = await taskService.createTasks(testStory.id, [
        { title: 'First' },
        { title: 'Second' },
        { title: 'Third' },
      ]);

      const next = await taskService.getNextPendingTask(testStory.id);

      assert.strictEqual(next.id, tasks[0].id);
    });

    test('skips completed tasks', async () => {
      const tasks = await taskService.createTasks(testStory.id, [
        { title: 'First' },
        { title: 'Second' },
        { title: 'Third' },
      ]);

      await taskService.updateTaskStatus(testStory.id, tasks[0].id, TASK_STATUS.IN_PROGRESS);
      await taskService.updateTaskStatus(testStory.id, tasks[0].id, TASK_STATUS.COMPLETED);

      const next = await taskService.getNextPendingTask(testStory.id);

      assert.strictEqual(next.id, tasks[1].id);
    });

    test('returns null when no pending tasks', async () => {
      const [task] = await taskService.createTasks(testStory.id, [
        { title: 'Only Task' },
      ]);

      await taskService.updateTaskStatus(testStory.id, task.id, TASK_STATUS.IN_PROGRESS);
      await taskService.updateTaskStatus(testStory.id, task.id, TASK_STATUS.COMPLETED);

      const next = await taskService.getNextPendingTask(testStory.id);

      assert.strictEqual(next, null);
    });
  });
});

describe('TaskService - Dependencies', () => {
  describe('canExecuteTask', () => {
    test('returns true for task with no dependencies', async () => {
      const [task] = await taskService.createTasks(testStory.id, [
        { title: 'No deps' },
      ]);

      const result = await taskService.canExecuteTask(testStory.id, task.id);

      assert.strictEqual(result.canExecute, true);
      assert.deepStrictEqual(result.blockedBy, []);
    });

    test('returns false when dependency is pending', async () => {
      const tasks = await taskService.createTasks(testStory.id, [
        { title: 'Dependency' },
        { title: 'Dependent' },
      ]);

      // Add dependency
      await taskService.updateTask(testStory.id, tasks[1].id, {
        dependencies: [tasks[0].id],
      });

      const result = await taskService.canExecuteTask(testStory.id, tasks[1].id);

      assert.strictEqual(result.canExecute, false);
      assert.strictEqual(result.blockedBy.length, 1);
    });

    test('returns true when dependency is completed', async () => {
      const tasks = await taskService.createTasks(testStory.id, [
        { title: 'Dependency' },
        { title: 'Dependent' },
      ]);

      // Complete dependency
      await taskService.updateTaskStatus(testStory.id, tasks[0].id, TASK_STATUS.IN_PROGRESS);
      await taskService.updateTaskStatus(testStory.id, tasks[0].id, TASK_STATUS.COMPLETED);

      // Add dependency
      await taskService.updateTask(testStory.id, tasks[1].id, {
        dependencies: [tasks[0].id],
      });

      const result = await taskService.canExecuteTask(testStory.id, tasks[1].id);

      assert.strictEqual(result.canExecute, true);
    });

    test('returns true when dependency is skipped', async () => {
      const tasks = await taskService.createTasks(testStory.id, [
        { title: 'Dependency' },
        { title: 'Dependent' },
      ]);

      // Skip dependency
      await taskService.skipTask(testStory.id, tasks[0].id);

      // Add dependency
      await taskService.updateTask(testStory.id, tasks[1].id, {
        dependencies: [tasks[0].id],
      });

      const result = await taskService.canExecuteTask(testStory.id, tasks[1].id);

      assert.strictEqual(result.canExecute, true);
    });
  });

  describe('reorderTasks', () => {
    test('reorders tasks', async () => {
      const tasks = await taskService.createTasks(testStory.id, [
        { title: 'First' },
        { title: 'Second' },
        { title: 'Third' },
      ]);

      // Method expects array of {taskId, order} objects
      const newOrder = [
        { taskId: tasks[2].id, order: 0 },
        { taskId: tasks[0].id, order: 1 },
        { taskId: tasks[1].id, order: 2 },
      ];
      const reordered = await taskService.reorderTasks(testStory.id, newOrder);

      assert.strictEqual(reordered[0].title, 'Third');
      assert.strictEqual(reordered[0].order, 0);
      assert.strictEqual(reordered[1].title, 'First');
      assert.strictEqual(reordered[1].order, 1);
      assert.strictEqual(reordered[2].title, 'Second');
      assert.strictEqual(reordered[2].order, 2);
    });
  });
});
