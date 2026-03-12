/**
 * @fileoverview Unit tests for feature soft-delete service
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';

import {
  loadStatus,
  softDeleteFeature,
  restoreFeature,
  isFeatureDeleted,
} from '../src/services/status.js';

import { createFeature } from '../src/services/feature.js';

// Test directory setup
let testRoot;

beforeEach(async () => {
  testRoot = path.join(os.tmpdir(), `feature-delete-test-${Date.now()}`);
  await fs.ensureDir(path.join(testRoot, '.aia', 'features'));
});

afterEach(async () => {
  if (testRoot) {
    await fs.remove(testRoot);
  }
});

describe('feature soft-delete service', () => {
  describe('isFeatureDeleted', () => {
    test('returns false when deletedAt is null', () => {
      const status = { feature: 'test', deletedAt: null };
      assert.strictEqual(isFeatureDeleted(status), false);
    });

    test('returns false when deletedAt is undefined', () => {
      const status = { feature: 'test' };
      assert.strictEqual(isFeatureDeleted(status), false);
    });

    test('returns true when deletedAt has a value', () => {
      const status = { feature: 'test', deletedAt: '2024-01-01T00:00:00.000Z' };
      assert.strictEqual(isFeatureDeleted(status), true);
    });

    test('returns false for null status', () => {
      assert.strictEqual(isFeatureDeleted(null), false);
    });
  });

  describe('softDeleteFeature', () => {
    test('sets deletedAt to current timestamp', async () => {
      // Create a feature first
      await createFeature('test-delete', testRoot);

      // Soft delete
      const beforeDelete = new Date();
      await softDeleteFeature('test-delete', testRoot);
      const afterDelete = new Date();

      // Load status and verify
      const status = await loadStatus('test-delete', testRoot);
      assert.ok(status.deletedAt, 'deletedAt should be set');

      const deletedAt = new Date(status.deletedAt);
      assert.ok(deletedAt >= beforeDelete, 'deletedAt should be after or equal to before time');
      assert.ok(deletedAt <= afterDelete, 'deletedAt should be before or equal to after time');
    });

    test('preserves other status fields', async () => {
      await createFeature('test-preserve', testRoot, { type: 'bug' });

      await softDeleteFeature('test-preserve', testRoot);

      const status = await loadStatus('test-preserve', testRoot);
      assert.strictEqual(status.feature, 'test-preserve');
      assert.strictEqual(status.type, 'bug');
      assert.ok(status.steps, 'steps should be preserved');
    });

    test('throws error for non-existent feature', async () => {
      await assert.rejects(
        async () => softDeleteFeature('non-existent', testRoot),
        /not found/
      );
    });
  });

  describe('restoreFeature', () => {
    test('clears deletedAt field', async () => {
      // Create and delete a feature
      await createFeature('test-restore', testRoot);
      await softDeleteFeature('test-restore', testRoot);

      // Verify it's deleted
      let status = await loadStatus('test-restore', testRoot);
      assert.ok(status.deletedAt, 'deletedAt should be set before restore');

      // Restore
      await restoreFeature('test-restore', testRoot);

      // Verify it's restored
      status = await loadStatus('test-restore', testRoot);
      assert.strictEqual(status.deletedAt, undefined, 'deletedAt should be undefined after restore');
    });

    test('preserves other status fields', async () => {
      await createFeature('test-restore-preserve', testRoot, { type: 'feature', apps: ['app1'] });
      await softDeleteFeature('test-restore-preserve', testRoot);
      await restoreFeature('test-restore-preserve', testRoot);

      const status = await loadStatus('test-restore-preserve', testRoot);
      assert.strictEqual(status.feature, 'test-restore-preserve');
      assert.strictEqual(status.type, 'feature');
      assert.deepStrictEqual(status.apps, ['app1']);
    });

    test('throws error for non-existent feature', async () => {
      await assert.rejects(
        async () => restoreFeature('non-existent', testRoot),
        /not found/
      );
    });

    test('works even if feature was not deleted', async () => {
      // Create a feature without deleting it
      await createFeature('test-not-deleted', testRoot);

      // Restore should not throw
      await restoreFeature('test-not-deleted', testRoot);

      const status = await loadStatus('test-not-deleted', testRoot);
      assert.strictEqual(status.deletedAt, undefined);
    });
  });

  describe('delete-restore cycle', () => {
    test('can delete and restore multiple times', async () => {
      await createFeature('test-cycle', testRoot);

      // First delete
      await softDeleteFeature('test-cycle', testRoot);
      let status = await loadStatus('test-cycle', testRoot);
      assert.ok(isFeatureDeleted(status), 'Should be deleted after first delete');

      // First restore
      await restoreFeature('test-cycle', testRoot);
      status = await loadStatus('test-cycle', testRoot);
      assert.strictEqual(isFeatureDeleted(status), false, 'Should not be deleted after first restore');

      // Second delete
      await softDeleteFeature('test-cycle', testRoot);
      status = await loadStatus('test-cycle', testRoot);
      assert.ok(isFeatureDeleted(status), 'Should be deleted after second delete');

      // Second restore
      await restoreFeature('test-cycle', testRoot);
      status = await loadStatus('test-cycle', testRoot);
      assert.strictEqual(isFeatureDeleted(status), false, 'Should not be deleted after second restore');
    });
  });
});
