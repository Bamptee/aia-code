/**
 * @fileoverview Unit tests for Integrity Service
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';

import { FileStorageProvider } from '../../src/epic/providers/file-storage-provider.js';
import { StoryIndexService } from '../../src/epic/services/story-index-service.js';
import { IntegrityService, ISSUE_TYPE, ISSUE_SEVERITY } from '../../src/epic/services/integrity-service.js';
import { createGeneralEpic } from '../../src/epic/models/epic.js';

// Helper to create and save General epic
async function createAndSaveGeneralEpic(storage) {
  const epic = createGeneralEpic();
  await storage.writeEpic(epic);
  return epic;
}

// Test directory setup
let testRoot;
let storage;
let storyIndexService;
let integrityService;

beforeEach(async () => {
  testRoot = path.join(os.tmpdir(), `integrity-service-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.ensureDir(testRoot);
  storage = new FileStorageProvider(testRoot);
  storyIndexService = new StoryIndexService(storage);
  integrityService = new IntegrityService(storage, storyIndexService);
});

afterEach(async () => {
  if (testRoot) {
    await fs.remove(testRoot);
  }
});

describe('IntegrityService', () => {
  describe('check', () => {
    test('returns healthy for empty system with General epic', async () => {
      await storage.ensureDirectories();
      await createAndSaveGeneralEpic(storage);

      const result = await integrityService.check();

      assert.strictEqual(result.healthy, true);
      assert.strictEqual(result.summary.errors, 0);
    });

    test('detects missing General epic', async () => {
      await storage.ensureDirectories();

      const result = await integrityService.check();

      assert.strictEqual(result.healthy, false);
      assert.ok(result.issues.some((i) => i.type === ISSUE_TYPE.MISSING_GENERAL_EPIC));
    });

    test('detects orphaned index entries', async () => {
      await storage.ensureDirectories();
      await createAndSaveGeneralEpic(storage);

      // Add a story to index without adding to epic
      await storyIndexService.addStory('orphan-story-1', 'non-existent-epic');

      const result = await integrityService.check();

      assert.ok(result.issues.some((i) => i.type === ISSUE_TYPE.ORPHANED_STORY));
    });

    test('detects missing index entries', async () => {
      await storage.ensureDirectories();
      const general = await createAndSaveGeneralEpic(storage);

      // Add a story directly to epic without indexing
      general.stories = [
        { id: 'unindexed-story', title: 'Test', type: 'feature', status: 'draft' },
      ];
      await storage.writeEpic(general);

      const result = await integrityService.check();

      assert.ok(result.issues.some((i) => i.type === ISSUE_TYPE.MISSING_INDEX));
    });

    test('detects invalid linked references', async () => {
      await storage.ensureDirectories();
      const general = await createAndSaveGeneralEpic(storage);

      // Add a bug with invalid linkedFeatureId
      general.stories = [
        {
          id: 'bug-1',
          title: 'Bug',
          type: 'bug',
          status: 'draft',
          linkedFeatureId: 'non-existent-feature',
        },
      ];
      await storage.writeEpic(general);
      await storyIndexService.addStory('bug-1', general.id);

      const result = await integrityService.check();

      assert.ok(result.issues.some((i) => i.type === ISSUE_TYPE.INVALID_REFERENCE));
    });

    test('detects duplicate story IDs', async () => {
      await storage.ensureDirectories();
      const general = await createAndSaveGeneralEpic(storage);

      // Create another epic
      const epic2 = {
        id: 'epic-2',
        name: 'Epic 2',
        stories: [{ id: 'duplicate-id', title: 'Story 2', type: 'feature', status: 'draft' }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Add same ID to both epics
      general.stories = [{ id: 'duplicate-id', title: 'Story 1', type: 'feature', status: 'draft' }];
      await storage.writeEpic(general);
      await storage.writeEpic(epic2);

      const result = await integrityService.check();

      assert.ok(result.issues.some((i) => i.type === ISSUE_TYPE.DUPLICATE_ID));
    });

    test('includes summary with counts', async () => {
      await storage.ensureDirectories();

      const result = await integrityService.check();

      assert.ok('summary' in result);
      assert.strictEqual(typeof result.summary.total, 'number');
      assert.strictEqual(typeof result.summary.errors, 'number');
      assert.strictEqual(typeof result.summary.warnings, 'number');
    });
  });

  describe('fix', () => {
    test('creates missing General epic', async () => {
      await storage.ensureDirectories();

      const result = await integrityService.fix();

      assert.ok(result.fixed.some((f) => f.type === ISSUE_TYPE.MISSING_GENERAL_EPIC));

      const general = await storage.getGeneralEpic();
      assert.ok(general);
    });

    test('removes orphaned index entries', async () => {
      await storage.ensureDirectories();
      await createAndSaveGeneralEpic(storage);
      await storyIndexService.addStory('orphan-1', 'non-existent-epic');

      const result = await integrityService.fix();

      assert.ok(result.fixed.some((f) => f.type === ISSUE_TYPE.ORPHANED_STORY));

      const epicId = await storyIndexService.getEpicIdForStory('orphan-1');
      assert.strictEqual(epicId, null);
    });

    test('adds missing index entries', async () => {
      await storage.ensureDirectories();
      const general = await createAndSaveGeneralEpic(storage);
      general.stories = [
        { id: 'missing-index-story', title: 'Test', type: 'feature', status: 'draft' },
      ];
      await storage.writeEpic(general);

      const result = await integrityService.fix();

      assert.ok(result.fixed.some((f) => f.type === ISSUE_TYPE.MISSING_INDEX));

      const epicId = await storyIndexService.getEpicIdForStory('missing-index-story');
      assert.strictEqual(epicId, general.id);
    });

    test('supports dry run mode', async () => {
      await storage.ensureDirectories();

      const result = await integrityService.fix({ dryRun: true });

      // Should report what would be fixed
      assert.ok(result.fixed.some((f) => f.type === ISSUE_TYPE.MISSING_GENERAL_EPIC));

      // But General epic should not exist
      const general = await storage.getGeneralEpic();
      assert.strictEqual(general, null);
    });

    test('filters by issue types', async () => {
      await storage.ensureDirectories();
      await storyIndexService.addStory('orphan-1', 'non-existent');

      const result = await integrityService.fix({ types: [ISSUE_TYPE.ORPHANED_STORY] });

      // Orphan should be fixed
      assert.ok(result.fixed.some((f) => f.type === ISSUE_TYPE.ORPHANED_STORY));

      // Missing general epic should be skipped
      assert.ok(result.skipped.some((s) => s.type === ISSUE_TYPE.MISSING_GENERAL_EPIC));
    });

    test('skips non-fixable issues', async () => {
      await storage.ensureDirectories();
      const general = await createAndSaveGeneralEpic(storage);
      const epic2 = {
        id: 'epic-2',
        name: 'Epic 2',
        stories: [{ id: 'dup-id', title: 'S2', type: 'feature', status: 'draft' }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      general.stories = [{ id: 'dup-id', title: 'S1', type: 'feature', status: 'draft' }];
      await storage.writeEpic(general);
      await storage.writeEpic(epic2);

      const result = await integrityService.fix();

      assert.ok(result.skipped.some((s) => s.type === ISSUE_TYPE.DUPLICATE_ID));
    });
  });

  describe('cleanup', () => {
    test('removes orphaned index entries', async () => {
      await storage.ensureDirectories();
      await createAndSaveGeneralEpic(storage);
      await storyIndexService.addStory('orphan-cleanup-1', 'fake-epic');

      const result = await integrityService.cleanup();

      assert.ok(result.cleaned.some((c) => c.type === 'index_entry'));
      assert.strictEqual(result.dryRun, false);
    });

    test('supports dry run', async () => {
      await storage.ensureDirectories();
      await createAndSaveGeneralEpic(storage);
      await storyIndexService.addStory('orphan-dry', 'fake-epic');

      const result = await integrityService.cleanup({ dryRun: true });

      assert.ok(result.cleaned.some((c) => c.type === 'index_entry'));
      assert.strictEqual(result.dryRun, true);

      // Entry should still exist
      const epicId = await storyIndexService.getEpicIdForStory('orphan-dry');
      assert.strictEqual(epicId, 'fake-epic');
    });
  });

  describe('rebuildIndex', () => {
    test('rebuilds index from all epics', async () => {
      await storage.ensureDirectories();
      const general = await createAndSaveGeneralEpic(storage);

      general.stories = [
        { id: 'story-1', title: 'Story 1', type: 'feature', status: 'draft' },
        { id: 'story-2', title: 'Story 2', type: 'feature', status: 'draft' },
      ];
      await storage.writeEpic(general);

      // Add orphaned entry
      await storyIndexService.addStory('orphan', 'fake');

      const result = await integrityService.rebuildIndex();

      assert.strictEqual(result.rebuilt, true);
      assert.strictEqual(result.storyCount, 2);

      // Verify index
      assert.strictEqual(await storyIndexService.getEpicIdForStory('story-1'), general.id);
      assert.strictEqual(await storyIndexService.getEpicIdForStory('story-2'), general.id);
      assert.strictEqual(await storyIndexService.getEpicIdForStory('orphan'), null);
    });

    test('handles empty system', async () => {
      await storage.ensureDirectories();
      await createAndSaveGeneralEpic(storage);

      const result = await integrityService.rebuildIndex();

      assert.strictEqual(result.rebuilt, true);
      assert.strictEqual(result.storyCount, 0);
    });
  });

  describe('validateEpic', () => {
    test('validates a healthy epic', async () => {
      await storage.ensureDirectories();
      const general = await createAndSaveGeneralEpic(storage);

      const result = await integrityService.validateEpic(general.id);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.issues.length, 0);
    });

    test('detects missing epic', async () => {
      await storage.ensureDirectories();

      const result = await integrityService.validateEpic('non-existent');

      assert.strictEqual(result.valid, false);
      assert.ok(result.issues.some((i) => i.type === ISSUE_TYPE.CORRUPTED_DATA));
    });

    test('detects stories with missing fields', async () => {
      await storage.ensureDirectories();
      const general = await createAndSaveGeneralEpic(storage);
      general.stories = [
        { id: 'no-title', type: 'feature', status: 'draft' },
        { title: 'No ID', type: 'feature', status: 'draft' },
      ];
      await storage.writeEpic(general);

      const result = await integrityService.validateEpic(general.id);

      assert.ok(result.issues.length >= 2);
    });
  });

  describe('getStats', () => {
    test('returns integrity statistics', async () => {
      await storage.ensureDirectories();
      const general = await createAndSaveGeneralEpic(storage);
      general.stories = [
        { id: 'story-1', title: 'S1', type: 'feature', status: 'draft' },
      ];
      await storage.writeEpic(general);
      await storyIndexService.addStory('story-1', general.id);

      const stats = await integrityService.getStats();

      assert.ok('epics' in stats);
      assert.ok('stories' in stats);
      assert.ok('index' in stats);
      assert.strictEqual(stats.epics.total, 1);
      assert.strictEqual(stats.stories.total, 1);
    });
  });
});
