/**
 * @fileoverview Unit tests for sync service orchestration
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import yaml from 'yaml';

// We'll test the functions from sync-service.js with a real filesystem
// but mock the sync provider via config
import { loadMapping, saveMapping, setMapping } from '../src/providers/sync-mapping.js';
import { getStoryExternalLink } from '../src/services/sync-service.js';

let testRoot;

beforeEach(async () => {
  testRoot = path.join(os.tmpdir(), `sync-service-test-${Date.now()}`);
  await fs.ensureDir(path.join(testRoot, '.aia', 'stories'));
  await fs.ensureDir(path.join(testRoot, '.aia', 'integrations', 'clickup'));
});

afterEach(async () => {
  if (testRoot) {
    await fs.remove(testRoot);
  }
});

describe('sync-service', () => {
  describe('getStoryExternalLink', () => {
    test('returns null when sync not configured', async () => {
      // No config.yaml means no sync
      const result = await getStoryExternalLink('my-story', testRoot);
      assert.strictEqual(result, null);
    });

    test('returns null when no mapping exists', async () => {
      // Write config with sync
      await fs.writeFile(
        path.join(testRoot, '.aia', 'config.yaml'),
        yaml.stringify({ sync: { provider: 'clickup' } }),
        'utf-8',
      );
      const result = await getStoryExternalLink('my-story', testRoot);
      assert.strictEqual(result, null);
    });

    test('returns link when mapping exists', async () => {
      await fs.writeFile(
        path.join(testRoot, '.aia', 'config.yaml'),
        yaml.stringify({ sync: { provider: 'clickup' } }),
        'utf-8',
      );
      await setMapping('clickup', 'my-story', {
        taskId: 'abc123',
        url: 'https://app.clickup.com/t/abc123',
      }, testRoot);

      const result = await getStoryExternalLink('my-story', testRoot);
      assert.strictEqual(result.taskId, 'abc123');
      assert.strictEqual(result.url, 'https://app.clickup.com/t/abc123');
      assert.strictEqual(result.provider, 'clickup');
    });
  });

  describe('mapping integration', () => {
    test('setMapping creates file and getStoryExternalLink reads it', async () => {
      await fs.writeFile(
        path.join(testRoot, '.aia', 'config.yaml'),
        yaml.stringify({ sync: { provider: 'clickup' } }),
        'utf-8',
      );

      await setMapping('clickup', 'story-a', {
        taskId: 'task-1',
        url: 'https://app.clickup.com/t/task-1',
        lastPush: '2026-03-25T10:00:00Z',
      }, testRoot);

      await setMapping('clickup', 'story-b', {
        taskId: 'task-2',
        url: 'https://app.clickup.com/t/task-2',
        lastPush: '2026-03-25T11:00:00Z',
      }, testRoot);

      const linkA = await getStoryExternalLink('story-a', testRoot);
      assert.strictEqual(linkA.taskId, 'task-1');

      const linkB = await getStoryExternalLink('story-b', testRoot);
      assert.strictEqual(linkB.taskId, 'task-2');
    });
  });
});
