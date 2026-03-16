/**
 * @fileoverview Unit tests for Task Storage Provider
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';

import { TaskStorageProvider } from '../../src/epic/providers/task-storage-provider.js';
import { createTask, TASK_STATUS } from '../../src/epic/models/task.js';

// Test directory setup
let testRoot;
let taskStorage;

beforeEach(async () => {
  testRoot = path.join(os.tmpdir(), `task-storage-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.ensureDir(testRoot);
  taskStorage = new TaskStorageProvider(testRoot);
});

afterEach(async () => {
  if (testRoot) {
    await fs.remove(testRoot);
  }
});

describe('TaskStorageProvider - Basic Operations', () => {
  describe('saveTasks / loadTasks', () => {
    test('saves and loads tasks', async () => {
      const storyId = 'test-story-id';
      const tasks = [
        createTask({ title: 'Task 1', storyId, order: 0 }),
        createTask({ title: 'Task 2', storyId, order: 1 }),
      ];

      await taskStorage.saveTasks(storyId, tasks);
      const loaded = await taskStorage.loadTasks(storyId);

      assert.strictEqual(loaded.length, 2);
      assert.strictEqual(loaded[0].title, 'Task 1');
      assert.strictEqual(loaded[1].title, 'Task 2');
    });

    test('returns empty array for non-existent story', async () => {
      const tasks = await taskStorage.loadTasks('non-existent');
      assert.deepStrictEqual(tasks, []);
    });

    test('preserves all task properties', async () => {
      const storyId = 'test-story-id';
      const task = createTask({
        title: 'Full Task',
        storyId,
        order: 0,
        details: 'Implementation details',
        files: ['src/file1.js', 'src/file2.js'],
        tests: ['Test 1', 'Test 2'],
        dependencies: ['dep-id-1'],
      });

      await taskStorage.saveTasks(storyId, [task]);
      const [loaded] = await taskStorage.loadTasks(storyId);

      assert.strictEqual(loaded.id, task.id);
      assert.strictEqual(loaded.title, 'Full Task');
      assert.strictEqual(loaded.details, 'Implementation details');
      assert.deepStrictEqual(loaded.files, ['src/file1.js', 'src/file2.js']);
      assert.deepStrictEqual(loaded.tests, ['Test 1', 'Test 2']);
      assert.deepStrictEqual(loaded.dependencies, ['dep-id-1']);
    });
  });

  describe('getTask', () => {
    test('returns specific task', async () => {
      const storyId = 'test-story-id';
      const tasks = [
        createTask({ title: 'Task 1', storyId, order: 0 }),
        createTask({ title: 'Target', storyId, order: 1 }),
      ];

      await taskStorage.saveTasks(storyId, tasks);
      const found = await taskStorage.getTask(storyId, tasks[1].id);

      assert.strictEqual(found.title, 'Target');
    });

    test('returns null for non-existent task', async () => {
      const storyId = 'test-story-id';
      const tasks = [createTask({ title: 'Task 1', storyId, order: 0 })];

      await taskStorage.saveTasks(storyId, tasks);
      const found = await taskStorage.getTask(storyId, 'non-existent');

      assert.strictEqual(found, null);
    });
  });

  describe('updateTask', () => {
    test('updates task properties', async () => {
      const storyId = 'test-story-id';
      const task = createTask({ title: 'Original', storyId, order: 0 });

      await taskStorage.saveTasks(storyId, [task]);
      const updated = await taskStorage.updateTask(storyId, task.id, {
        title: 'Updated',
        status: TASK_STATUS.IN_PROGRESS,
      });

      assert.strictEqual(updated.title, 'Updated');
      assert.strictEqual(updated.status, TASK_STATUS.IN_PROGRESS);
    });

    test('persists updates', async () => {
      const storyId = 'test-story-id';
      const task = createTask({ title: 'Original', storyId, order: 0 });

      await taskStorage.saveTasks(storyId, [task]);
      await taskStorage.updateTask(storyId, task.id, { title: 'Updated' });

      const [loaded] = await taskStorage.loadTasks(storyId);
      assert.strictEqual(loaded.title, 'Updated');
    });

    test('updates updatedAt timestamp', async () => {
      const storyId = 'test-story-id';
      const task = createTask({ title: 'Task', storyId, order: 0 });
      const originalUpdatedAt = task.updatedAt;

      await taskStorage.saveTasks(storyId, [task]);

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await taskStorage.updateTask(storyId, task.id, { title: 'New' });

      assert.notStrictEqual(updated.updatedAt, originalUpdatedAt);
    });

    test('throws NotFoundError for non-existent task', async () => {
      const storyId = 'test-story-id';
      await taskStorage.saveTasks(storyId, []);

      await assert.rejects(
        async () => {
          await taskStorage.updateTask(storyId, 'non-existent', { title: 'New' });
        },
        { name: 'NotFoundError' }
      );
    });
  });

  describe('deleteTask', () => {
    test('deletes specific task', async () => {
      const storyId = 'test-story-id';
      const tasks = [
        createTask({ title: 'Keep', storyId, order: 0 }),
        createTask({ title: 'Delete', storyId, order: 1 }),
      ];

      await taskStorage.saveTasks(storyId, tasks);
      await taskStorage.deleteTask(storyId, tasks[1].id);

      const remaining = await taskStorage.loadTasks(storyId);
      assert.strictEqual(remaining.length, 1);
      assert.strictEqual(remaining[0].title, 'Keep');
    });

    test('completes without error on successful delete', async () => {
      const storyId = 'test-story-id';
      const task = createTask({ title: 'Task', storyId, order: 0 });

      await taskStorage.saveTasks(storyId, [task]);
      // deleteTask returns void, just verify it doesn't throw
      await taskStorage.deleteTask(storyId, task.id);

      // Verify task was deleted
      const remaining = await taskStorage.loadTasks(storyId);
      assert.strictEqual(remaining.length, 0);
    });

    test('handles non-existent task gracefully', async () => {
      const storyId = 'test-story-id';
      await taskStorage.saveTasks(storyId, []);

      // Should not throw for non-existent task
      await taskStorage.deleteTask(storyId, 'non-existent');
    });
  });

  describe('deleteAllTasks', () => {
    test('deletes all tasks for story', async () => {
      const storyId = 'test-story-id';
      const tasks = [
        createTask({ title: 'Task 1', storyId, order: 0 }),
        createTask({ title: 'Task 2', storyId, order: 1 }),
        createTask({ title: 'Task 3', storyId, order: 2 }),
      ];

      await taskStorage.saveTasks(storyId, tasks);
      await taskStorage.deleteAllTasks(storyId);

      const remaining = await taskStorage.loadTasks(storyId);
      assert.strictEqual(remaining.length, 0);
    });

    test('does not affect other stories', async () => {
      const storyId1 = 'story-1';
      const storyId2 = 'story-2';

      await taskStorage.saveTasks(storyId1, [
        createTask({ title: 'S1 Task', storyId: storyId1, order: 0 }),
      ]);
      await taskStorage.saveTasks(storyId2, [
        createTask({ title: 'S2 Task', storyId: storyId2, order: 0 }),
      ]);

      await taskStorage.deleteAllTasks(storyId1);

      const s1Tasks = await taskStorage.loadTasks(storyId1);
      const s2Tasks = await taskStorage.loadTasks(storyId2);

      assert.strictEqual(s1Tasks.length, 0);
      assert.strictEqual(s2Tasks.length, 1);
    });
  });
});

describe('TaskStorageProvider - Concurrent Access', () => {
  test('handles concurrent reads', async () => {
    const storyId = 'test-story-id';
    const tasks = [createTask({ title: 'Task', storyId, order: 0 })];

    await taskStorage.saveTasks(storyId, tasks);

    const results = await Promise.all([
      taskStorage.loadTasks(storyId),
      taskStorage.loadTasks(storyId),
      taskStorage.loadTasks(storyId),
    ]);

    assert.ok(results.every((r) => r.length === 1));
  });

  test('handles sequential writes', async () => {
    const storyId = 'test-story-id';
    const tasks = [
      createTask({ title: 'Task 1', storyId, order: 0 }),
      createTask({ title: 'Task 2', storyId, order: 1 }),
    ];

    await taskStorage.saveTasks(storyId, tasks);

    // Sequential updates to avoid race conditions
    await taskStorage.updateTask(storyId, tasks[0].id, { title: 'Updated 1' });
    await taskStorage.updateTask(storyId, tasks[1].id, { title: 'Updated 2' });

    const loaded = await taskStorage.loadTasks(storyId);

    // Both tasks should be updated
    assert.ok(loaded.some((t) => t.title === 'Updated 1'));
    assert.ok(loaded.some((t) => t.title === 'Updated 2'));
  });
});

describe('TaskStorageProvider - File Structure', () => {
  test('stores tasks in correct location', async () => {
    const storyId = 'test-story-id';
    const tasks = [createTask({ title: 'Task', storyId, order: 0 })];

    await taskStorage.saveTasks(storyId, tasks);

    const expectedPath = path.join(testRoot, '.aia', 'stories', storyId, 'tasks.json');
    const exists = await fs.pathExists(expectedPath);

    assert.strictEqual(exists, true);
  });

  test('stores tasks as valid JSON', async () => {
    const storyId = 'test-story-id';
    const tasks = [createTask({ title: 'Task', storyId, order: 0 })];

    await taskStorage.saveTasks(storyId, tasks);

    const filePath = path.join(testRoot, '.aia', 'stories', storyId, 'tasks.json');
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content);

    // Storage format is { storyId, tasks, updatedAt }
    assert.ok(parsed.tasks);
    assert.ok(Array.isArray(parsed.tasks));
    assert.strictEqual(parsed.tasks.length, 1);
    assert.strictEqual(parsed.tasks[0].title, 'Task');
  });
});
