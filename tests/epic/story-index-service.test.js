/**
 * @fileoverview Unit tests for Story Index Service
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';

import { FileStorageProvider } from '../../src/epic/providers/file-storage-provider.js';
import { StoryIndexService } from '../../src/epic/services/story-index-service.js';
import { createEpic } from '../../src/epic/models/epic.js';
import { createStory } from '../../src/epic/models/story.js';

// Test directory setup
let testRoot;
let storage;
let indexService;

beforeEach(async () => {
  testRoot = path.join(os.tmpdir(), `story-index-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.ensureDir(testRoot);
  storage = new FileStorageProvider(testRoot);
  indexService = new StoryIndexService(storage);
  await storage.ensureDirectories();
});

afterEach(async () => {
  if (testRoot) {
    await fs.remove(testRoot);
  }
});

describe('StoryIndexService', () => {
  describe('addStory / getEpicIdForStory', () => {
    test('adds story and retrieves epic ID', async () => {
      await indexService.addStory('story-1', 'epic-1');

      const epicId = await indexService.getEpicIdForStory('story-1');
      assert.strictEqual(epicId, 'epic-1');
    });

    test('returns null for non-existent story', async () => {
      const epicId = await indexService.getEpicIdForStory('non-existent');
      assert.strictEqual(epicId, null);
    });

    test('adds multiple stories to same epic', async () => {
      await indexService.addStory('story-1', 'epic-1');
      await indexService.addStory('story-2', 'epic-1');
      await indexService.addStory('story-3', 'epic-1');

      assert.strictEqual(await indexService.getEpicIdForStory('story-1'), 'epic-1');
      assert.strictEqual(await indexService.getEpicIdForStory('story-2'), 'epic-1');
      assert.strictEqual(await indexService.getEpicIdForStory('story-3'), 'epic-1');
    });

    test('adds stories to different epics', async () => {
      await indexService.addStory('story-1', 'epic-1');
      await indexService.addStory('story-2', 'epic-2');

      assert.strictEqual(await indexService.getEpicIdForStory('story-1'), 'epic-1');
      assert.strictEqual(await indexService.getEpicIdForStory('story-2'), 'epic-2');
    });
  });

  describe('moveStory', () => {
    test('moves story to new epic', async () => {
      await indexService.addStory('story-1', 'epic-1');
      await indexService.moveStory('story-1', 'epic-2');

      const epicId = await indexService.getEpicIdForStory('story-1');
      assert.strictEqual(epicId, 'epic-2');
    });

    test('moving non-existent story creates new entry', async () => {
      await indexService.moveStory('new-story', 'epic-1');

      const epicId = await indexService.getEpicIdForStory('new-story');
      assert.strictEqual(epicId, 'epic-1');
    });
  });

  describe('removeStory', () => {
    test('removes story from index', async () => {
      await indexService.addStory('story-1', 'epic-1');
      await indexService.removeStory('story-1');

      const epicId = await indexService.getEpicIdForStory('story-1');
      assert.strictEqual(epicId, null);
    });

    test('removing non-existent story does not throw', async () => {
      await assert.doesNotReject(async () => {
        await indexService.removeStory('non-existent');
      });
    });
  });

  describe('hasStory', () => {
    test('returns true for existing story', async () => {
      await indexService.addStory('story-1', 'epic-1');
      assert.strictEqual(await indexService.hasStory('story-1'), true);
    });

    test('returns false for non-existent story', async () => {
      assert.strictEqual(await indexService.hasStory('non-existent'), false);
    });
  });

  describe('getStoriesForEpic', () => {
    test('returns all stories for an epic', async () => {
      await indexService.addStory('story-1', 'epic-1');
      await indexService.addStory('story-2', 'epic-1');
      await indexService.addStory('story-3', 'epic-2');

      const stories = await indexService.getStoriesForEpic('epic-1');
      assert.strictEqual(stories.length, 2);
      assert.ok(stories.includes('story-1'));
      assert.ok(stories.includes('story-2'));
    });

    test('returns empty array for epic with no stories', async () => {
      const stories = await indexService.getStoriesForEpic('empty-epic');
      assert.deepStrictEqual(stories, []);
    });
  });

  describe('rebuild', () => {
    test('rebuilds index from existing epics', async () => {
      // Create epics with stories
      const epic1 = createEpic({ name: 'Epic 1' });
      const epic2 = createEpic({ name: 'Epic 2' });

      const story1 = createStory({ title: 'Story 1', type: 'feature' });
      const story2 = createStory({ title: 'Story 2', type: 'feature' });
      const story3 = createStory({ title: 'Story 3', type: 'bug' });

      epic1.stories = [story1, story2];
      epic2.stories = [story3];

      await storage.writeEpic(epic1);
      await storage.writeEpic(epic2);

      // Rebuild index
      const index = await indexService.rebuild();

      assert.strictEqual(index[story1.id], epic1.id);
      assert.strictEqual(index[story2.id], epic1.id);
      assert.strictEqual(index[story3.id], epic2.id);
    });

    test('rebuilds empty index when no epics exist', async () => {
      const index = await indexService.rebuild();
      assert.deepStrictEqual(index, {});
    });

    test('rebuilds empty index when epics have no stories', async () => {
      const epic = createEpic({ name: 'Empty Epic' });
      await storage.writeEpic(epic);

      const index = await indexService.rebuild();
      assert.deepStrictEqual(index, {});
    });
  });

  describe('validate', () => {
    test('returns valid for consistent index', async () => {
      // Create epic with stories
      const epic = createEpic({ name: 'Epic' });
      const story = createStory({ title: 'Story', type: 'feature' });
      epic.stories = [story];
      await storage.writeEpic(epic);

      // Build index correctly
      await indexService.addStory(story.id, epic.id);

      const validation = await indexService.validate();
      assert.strictEqual(validation.valid, true);
      assert.deepStrictEqual(validation.issues, []);
    });

    test('detects orphaned index entry', async () => {
      // Add story to index without corresponding epic
      await indexService.addStory('orphan-story', 'non-existent-epic');

      const validation = await indexService.validate();
      assert.strictEqual(validation.valid, false);
      assert.strictEqual(validation.issues.length, 1);
      assert.strictEqual(validation.issues[0].type, 'orphaned_index_entry');
    });

    test('detects wrong epic in index', async () => {
      // Create epic with story
      const epic1 = createEpic({ name: 'Epic 1' });
      const epic2 = createEpic({ name: 'Epic 2' });
      const story = createStory({ title: 'Story', type: 'feature' });
      epic1.stories = [story];
      await storage.writeEpic(epic1);
      await storage.writeEpic(epic2);

      // Index points to wrong epic
      await indexService.addStory(story.id, epic2.id);

      const validation = await indexService.validate();
      assert.strictEqual(validation.valid, false);
      assert.strictEqual(validation.issues.length, 1);
      assert.strictEqual(validation.issues[0].type, 'wrong_epic');
    });

    test('detects missing index entry', async () => {
      // Create epic with story but no index entry
      const epic = createEpic({ name: 'Epic' });
      const story = createStory({ title: 'Story', type: 'feature' });
      epic.stories = [story];
      await storage.writeEpic(epic);

      const validation = await indexService.validate();
      assert.strictEqual(validation.valid, false);
      assert.strictEqual(validation.issues.length, 1);
      assert.strictEqual(validation.issues[0].type, 'missing_index_entry');
    });
  });

  describe('validateAndRepair', () => {
    test('does not repair valid index', async () => {
      const epic = createEpic({ name: 'Epic' });
      const story = createStory({ title: 'Story', type: 'feature' });
      epic.stories = [story];
      await storage.writeEpic(epic);
      await indexService.addStory(story.id, epic.id);

      const result = await indexService.validateAndRepair();
      assert.strictEqual(result.repaired, false);
      assert.deepStrictEqual(result.issues, []);
    });

    test('repairs corrupted index', async () => {
      // Create epic with story
      const epic = createEpic({ name: 'Epic' });
      const story = createStory({ title: 'Story', type: 'feature' });
      epic.stories = [story];
      await storage.writeEpic(epic);

      // Corrupt the index
      await storage.writeStoryIndex({ 'wrong-id': 'wrong-epic' });

      const result = await indexService.validateAndRepair();
      assert.strictEqual(result.repaired, true);
      assert.ok(result.issues.length > 0);

      // Verify index is now correct
      const epicId = await indexService.getEpicIdForStory(story.id);
      assert.strictEqual(epicId, epic.id);
    });
  });

  describe('getStats', () => {
    test('returns correct statistics', async () => {
      await indexService.addStory('story-1', 'epic-1');
      await indexService.addStory('story-2', 'epic-1');
      await indexService.addStory('story-3', 'epic-2');

      const stats = await indexService.getStats();
      assert.strictEqual(stats.totalStories, 3);
      assert.strictEqual(stats.epicsWithStories, 2);
    });

    test('returns zero stats for empty index', async () => {
      const stats = await indexService.getStats();
      assert.strictEqual(stats.totalStories, 0);
      assert.strictEqual(stats.epicsWithStories, 0);
    });
  });

  describe('getIndex', () => {
    test('returns current index', async () => {
      await indexService.addStory('story-1', 'epic-1');
      await indexService.addStory('story-2', 'epic-2');

      const index = await indexService.getIndex();
      assert.deepStrictEqual(index, {
        'story-1': 'epic-1',
        'story-2': 'epic-2',
      });
    });
  });
});
