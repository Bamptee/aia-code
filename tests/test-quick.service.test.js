/**
 * @fileoverview Unit tests for test-quick service
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';

import {
  loadItems,
  createItem,
  getItem,
  listItems,
  updateItem,
  deleteItem,
  updateStatus,
  clearCompleted,
} from '../src/services/test-quick.js';

import { TEST_QUICK_STATUS } from '../src/types/test-quick.js';

// Test directory setup
let testRoot;

beforeEach(async () => {
  testRoot = path.join(os.tmpdir(), `test-quick-test-${Date.now()}`);
  await fs.ensureDir(path.join(testRoot, '.aia'));
});

afterEach(async () => {
  if (testRoot) {
    await fs.remove(testRoot);
  }
});

describe('test-quick service', () => {
  describe('loadItems', () => {
    test('returns empty array when no items exist', async () => {
      const items = await loadItems(testRoot);
      assert.deepStrictEqual(items, []);
    });

    test('returns items when data file exists', async () => {
      // Pre-create data file
      const dataDir = path.join(testRoot, '.aia', 'test-quick');
      await fs.ensureDir(dataDir);
      await fs.writeFile(
        path.join(dataDir, 'items.yaml'),
        'items:\n  - id: test-1\n    name: test-item\n    status: pending\n',
        'utf-8'
      );

      const items = await loadItems(testRoot);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].name, 'test-item');
    });
  });

  describe('createItem', () => {
    test('creates item successfully', async () => {
      const result = await createItem({ name: 'my-item', description: 'Test description' }, testRoot);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.name, 'my-item');
      assert.strictEqual(result.data.description, 'Test description');
      assert.strictEqual(result.data.status, TEST_QUICK_STATUS.PENDING);
    });

    test('fails with invalid name', async () => {
      const result = await createItem({ name: 'Invalid Name!' }, testRoot);

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('Invalid name'));
    });

    test('fails when name is missing', async () => {
      const result = await createItem({}, testRoot);

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('Name is required'));
    });

    test('fails when item already exists', async () => {
      await createItem({ name: 'existing-item' }, testRoot);
      const result = await createItem({ name: 'existing-item' }, testRoot);

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('already exists'));
    });
  });

  describe('getItem', () => {
    test('returns item when exists', async () => {
      await createItem({ name: 'get-test', description: 'Get test' }, testRoot);
      const result = await getItem('get-test', testRoot);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.name, 'get-test');
    });

    test('returns error when item not found', async () => {
      const result = await getItem('non-existent', testRoot);

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('not found'));
    });
  });

  describe('listItems', () => {
    test('returns all items', async () => {
      await createItem({ name: 'item-a' }, testRoot);
      await createItem({ name: 'item-b' }, testRoot);

      const result = await listItems({}, testRoot);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.items.length, 2);
      assert.strictEqual(result.total, 2);
    });

    test('filters by status', async () => {
      await createItem({ name: 'item-pending' }, testRoot);
      await createItem({ name: 'item-active' }, testRoot);
      await updateStatus('item-active', TEST_QUICK_STATUS.ACTIVE, testRoot);

      const result = await listItems({ status: TEST_QUICK_STATUS.ACTIVE }, testRoot);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.items[0].name, 'item-active');
    });
  });

  describe('updateItem', () => {
    test('updates item description', async () => {
      await createItem({ name: 'update-test' }, testRoot);
      const result = await updateItem('update-test', { description: 'Updated!' }, testRoot);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.description, 'Updated!');
    });

    test('updates item status', async () => {
      await createItem({ name: 'status-test' }, testRoot);
      const result = await updateItem('status-test', { status: TEST_QUICK_STATUS.ACTIVE }, testRoot);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.status, TEST_QUICK_STATUS.ACTIVE);
    });

    test('fails with invalid status', async () => {
      await createItem({ name: 'invalid-status-test' }, testRoot);
      const result = await updateItem('invalid-status-test', { status: 'invalid' }, testRoot);

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('Invalid status'));
    });

    test('returns error when item not found', async () => {
      const result = await updateItem('non-existent', { description: 'test' }, testRoot);

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('not found'));
    });
  });

  describe('deleteItem', () => {
    test('deletes item successfully', async () => {
      await createItem({ name: 'delete-test' }, testRoot);
      const result = await deleteItem('delete-test', testRoot);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.name, 'delete-test');

      // Verify item is deleted
      const items = await loadItems(testRoot);
      assert.strictEqual(items.length, 0);
    });

    test('returns error when item not found', async () => {
      const result = await deleteItem('non-existent', testRoot);

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('not found'));
    });
  });

  describe('updateStatus', () => {
    test('updates status successfully', async () => {
      await createItem({ name: 'status-update-test' }, testRoot);
      const result = await updateStatus('status-update-test', TEST_QUICK_STATUS.COMPLETED, testRoot);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.status, TEST_QUICK_STATUS.COMPLETED);
    });
  });

  describe('clearCompleted', () => {
    test('clears completed items', async () => {
      await createItem({ name: 'keep-pending' }, testRoot);
      await createItem({ name: 'clear-completed' }, testRoot);
      await updateStatus('clear-completed', TEST_QUICK_STATUS.COMPLETED, testRoot);

      const result = await clearCompleted(testRoot);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.cleared, 1);

      // Verify only pending item remains
      const items = await loadItems(testRoot);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].name, 'keep-pending');
    });

    test('returns 0 when no completed items', async () => {
      await createItem({ name: 'pending-item' }, testRoot);

      const result = await clearCompleted(testRoot);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.cleared, 0);
    });
  });
});
