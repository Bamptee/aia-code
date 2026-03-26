/**
 * @fileoverview Unit tests for sync mapping CRUD operations
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';

import {
  loadMapping,
  saveMapping,
  getMapping,
  setMapping,
  removeMapping,
  findByExternalId,
} from '../src/providers/sync-mapping.js';

let testRoot;

beforeEach(async () => {
  testRoot = path.join(os.tmpdir(), `sync-mapping-test-${Date.now()}`);
  await fs.ensureDir(path.join(testRoot, '.aia'));
});

afterEach(async () => {
  if (testRoot) {
    await fs.remove(testRoot);
  }
});

describe('sync-mapping', () => {
  describe('loadMapping', () => {
    test('returns empty object when file does not exist', async () => {
      const result = await loadMapping('clickup', testRoot);
      assert.deepStrictEqual(result, {});
    });

    test('returns parsed mapping when file exists', async () => {
      const dir = path.join(testRoot, '.aia', 'integrations', 'clickup');
      await fs.ensureDir(dir);
      await fs.writeFile(
        path.join(dir, 'mapping.json'),
        JSON.stringify({ 'my-story': { taskId: 'abc' } }),
        'utf-8',
      );
      const result = await loadMapping('clickup', testRoot);
      assert.strictEqual(result['my-story'].taskId, 'abc');
    });
  });

  describe('saveMapping', () => {
    test('creates directory and file atomically', async () => {
      const mapping = { 'story-1': { taskId: 't-1', url: 'https://example.com' } };
      await saveMapping('clickup', mapping, testRoot);

      const filePath = path.join(testRoot, '.aia', 'integrations', 'clickup', 'mapping.json');
      assert.ok(await fs.pathExists(filePath));
      const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
      assert.strictEqual(content['story-1'].taskId, 't-1');
    });

    test('temp file is cleaned up after save', async () => {
      await saveMapping('clickup', { test: {} }, testRoot);
      const dir = path.join(testRoot, '.aia', 'integrations', 'clickup');
      const files = await fs.readdir(dir);
      assert.ok(!files.some(f => f.endsWith('.tmp')));
    });
  });

  describe('getMapping', () => {
    test('returns null for non-existent slug', async () => {
      const result = await getMapping('clickup', 'non-existent', testRoot);
      assert.strictEqual(result, null);
    });

    test('returns entry for existing slug', async () => {
      await setMapping('clickup', 'my-story', { taskId: 'abc', url: 'http://x' }, testRoot);
      const result = await getMapping('clickup', 'my-story', testRoot);
      assert.strictEqual(result.taskId, 'abc');
    });
  });

  describe('setMapping', () => {
    test('creates new entry', async () => {
      await setMapping('clickup', 'new-story', { taskId: 't-new' }, testRoot);
      const mapping = await loadMapping('clickup', testRoot);
      assert.strictEqual(mapping['new-story'].taskId, 't-new');
    });

    test('merges with existing entry', async () => {
      await setMapping('clickup', 'story', { taskId: 't-1', url: 'http://a' }, testRoot);
      await setMapping('clickup', 'story', { lastPush: '2026-01-01' }, testRoot);
      const result = await getMapping('clickup', 'story', testRoot);
      assert.strictEqual(result.taskId, 't-1');
      assert.strictEqual(result.lastPush, '2026-01-01');
    });
  });

  describe('removeMapping', () => {
    test('removes an entry', async () => {
      await setMapping('clickup', 'to-remove', { taskId: 'x' }, testRoot);
      await removeMapping('clickup', 'to-remove', testRoot);
      const result = await getMapping('clickup', 'to-remove', testRoot);
      assert.strictEqual(result, null);
    });

    test('does not fail on non-existent slug', async () => {
      await removeMapping('clickup', 'non-existent', testRoot);
      // Should not throw
    });
  });

  describe('findByExternalId', () => {
    test('returns slug for matching taskId', async () => {
      await setMapping('clickup', 'auth-sso', { taskId: 'abc123' }, testRoot);
      await setMapping('clickup', 'payment', { taskId: 'def456' }, testRoot);
      const result = await findByExternalId('clickup', 'def456', testRoot);
      assert.strictEqual(result, 'payment');
    });

    test('returns null when no match', async () => {
      await setMapping('clickup', 'auth-sso', { taskId: 'abc123' }, testRoot);
      const result = await findByExternalId('clickup', 'zzz999', testRoot);
      assert.strictEqual(result, null);
    });
  });
});
