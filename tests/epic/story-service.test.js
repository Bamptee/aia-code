/**
 * @fileoverview Unit tests for Story Service
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';

import { FileStorageProvider } from '../../src/epic/providers/file-storage-provider.js';
import { StoryService } from '../../src/epic/services/story-service.js';
import { StoryIndexService } from '../../src/epic/services/story-index-service.js';
import { EpicService } from '../../src/epic/services/epic-service.js';
import { createEpic } from '../../src/epic/models/epic.js';
import { STORY_STATUS, STORY_SPACE } from '../../src/epic/models/validators.js';
import { ValidationError, NotFoundError, BusinessRuleError } from '../../src/epic/utils/errors.js';

// Test directory setup
let testRoot;
let storage;
let storyIndex;
let epicService;
let storyService;

beforeEach(async () => {
  testRoot = path.join(os.tmpdir(), `story-service-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.ensureDir(testRoot);
  storage = new FileStorageProvider(testRoot);
  storyIndex = new StoryIndexService(storage);
  epicService = new EpicService(storage, storyIndex);
  storyService = new StoryService(storage, storyIndex, epicService);
  await storage.ensureDirectories();
});

afterEach(async () => {
  if (testRoot) {
    await fs.remove(testRoot);
  }
});

describe('StoryService - Basic Operations', () => {
  describe('create', () => {
    test('creates feature story with valid data', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Test Feature',
        type: 'feature',
        description: 'A test feature',
      });

      assert.ok(story.id);
      assert.strictEqual(story.title, 'Test Feature');
      assert.strictEqual(story.type, 'feature');
      assert.strictEqual(story.description, 'A test feature');
      assert.strictEqual(story.status, 'draft');
      assert.strictEqual(story.space, 'experimentation');
    });

    test('creates bug story', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Test Bug',
        type: 'bug',
      });

      assert.strictEqual(story.type, 'bug');
    });

    test('creates story with minimal data', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Minimal',
        type: 'feature',
      });

      assert.ok(story.id);
      assert.strictEqual(story.description, null);
    });

    test('creates bug linked to feature', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const feature = await storyService.create(epic.id, {
        title: 'Feature',
        type: 'feature',
      });
      const bug = await storyService.create(epic.id, {
        title: 'Bug',
        type: 'bug',
        linkedFeatureId: feature.id,
      });

      assert.strictEqual(bug.linkedFeatureId, feature.id);
    });

    test('updates story index on create', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      const indexedEpicId = await storyIndex.getEpicIdForStory(story.id);
      assert.strictEqual(indexedEpicId, epic.id);
    });

    test('throws ValidationError for empty title', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });

      await assert.rejects(
        async () => {
          await storyService.create(epic.id, { title: '', type: 'feature' });
        },
        ValidationError
      );
    });

    test('throws ValidationError for invalid type', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });

      await assert.rejects(
        async () => {
          await storyService.create(epic.id, { title: 'Test', type: 'invalid' });
        },
        ValidationError
      );
    });

    test('throws NotFoundError for non-existent epic', async () => {
      await assert.rejects(
        async () => {
          await storyService.create('non-existent', { title: 'Test', type: 'feature' });
        },
        NotFoundError
      );
    });
  });

  describe('getById / findStoryWithEpic', () => {
    test('returns story when found', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const created = await storyService.create(epic.id, {
        title: 'Find Me',
        type: 'feature',
      });

      const found = await storyService.getById(created.id);
      assert.strictEqual(found.id, created.id);
      assert.strictEqual(found.title, 'Find Me');
    });

    test('throws NotFoundError when not found', async () => {
      await assert.rejects(
        async () => {
          await storyService.getById('non-existent');
        },
        NotFoundError
      );
    });

    test('findStoryWithEpic returns epic and story', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      const result = await storyService.findStoryWithEpic(story.id);
      assert.strictEqual(result.epic.id, epic.id);
      assert.strictEqual(result.story.id, story.id);
    });

    test('findStoryWithEpic returns nulls for non-existent story', async () => {
      const result = await storyService.findStoryWithEpic('non-existent');
      assert.strictEqual(result.epic, null);
      assert.strictEqual(result.story, null);
    });
  });

  describe('list', () => {
    test('returns all stories with epic info', async () => {
      const epic1 = await epicService.create({ name: 'Epic 1' });
      const epic2 = await epicService.create({ name: 'Epic 2' });

      await storyService.create(epic1.id, { title: 'Story 1', type: 'feature' });
      await storyService.create(epic1.id, { title: 'Story 2', type: 'bug' });
      await storyService.create(epic2.id, { title: 'Story 3', type: 'feature' });

      const stories = await storyService.list();
      assert.strictEqual(stories.length, 3);
      assert.ok(stories.every((s) => s.epicId && s.epicName));
    });

    test('filters by epicId', async () => {
      const epic1 = await epicService.create({ name: 'Epic 1' });
      const epic2 = await epicService.create({ name: 'Epic 2' });

      await storyService.create(epic1.id, { title: 'Story 1', type: 'feature' });
      await storyService.create(epic2.id, { title: 'Story 2', type: 'feature' });

      const stories = await storyService.list({ epicId: epic1.id });
      assert.strictEqual(stories.length, 1);
      assert.strictEqual(stories[0].title, 'Story 1');
    });

    test('filters by space', async () => {
      const epic = await epicService.create({ name: 'Epic' });

      const story1 = await storyService.create(epic.id, { title: 'Story 1', type: 'feature' });
      await storyService.create(epic.id, { title: 'Story 2', type: 'feature' });

      // Promote one to development
      await storyService.updateStep(story1.id, 'brief', { skipped: true });
      await storyService.updateStep(story1.id, 'baSpec', { skipped: true });
      await storyService.updateStep(story1.id, 'questions', { skipped: true });
      await storyService.promote(story1.id);

      const devStories = await storyService.list({ space: 'development' });
      assert.strictEqual(devStories.length, 1);
    });

    test('filters by status', async () => {
      const epic = await epicService.create({ name: 'Epic' });

      await storyService.create(epic.id, { title: 'Draft', type: 'feature' });
      const story2 = await storyService.create(epic.id, { title: 'In Progress', type: 'feature' });
      await storyService.updateStatus(story2.id, 'in_progress');

      const inProgress = await storyService.list({ status: 'in_progress' });
      assert.strictEqual(inProgress.length, 1);
      assert.strictEqual(inProgress[0].title, 'In Progress');
    });

    test('filters by type', async () => {
      const epic = await epicService.create({ name: 'Epic' });

      await storyService.create(epic.id, { title: 'Feature', type: 'feature' });
      await storyService.create(epic.id, { title: 'Bug', type: 'bug' });

      const bugs = await storyService.list({ type: 'bug' });
      assert.strictEqual(bugs.length, 1);
      assert.strictEqual(bugs[0].title, 'Bug');
    });
  });

  describe('update', () => {
    test('updates title', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Original',
        type: 'feature',
      });

      const updated = await storyService.update(story.id, { title: 'Updated' });
      assert.strictEqual(updated.title, 'Updated');
    });

    test('updates description', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      const updated = await storyService.update(story.id, { description: 'New desc' });
      assert.strictEqual(updated.description, 'New desc');
    });

    test('updates status', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      const updated = await storyService.update(story.id, { status: 'in_progress' });
      assert.strictEqual(updated.status, 'in_progress');
    });

    test('throws NotFoundError for non-existent story', async () => {
      await assert.rejects(
        async () => {
          await storyService.update('non-existent', { title: 'New' });
        },
        NotFoundError
      );
    });

    test('throws ValidationError for invalid status', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      await assert.rejects(
        async () => {
          await storyService.update(story.id, { status: 'invalid' });
        },
        ValidationError
      );
    });
  });

  describe('delete', () => {
    test('deletes story', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'To Delete',
        type: 'feature',
      });

      await storyService.delete(story.id);

      await assert.rejects(
        async () => {
          await storyService.getById(story.id);
        },
        NotFoundError
      );
    });

    test('removes from story index', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      await storyService.delete(story.id);

      const indexedEpicId = await storyIndex.getEpicIdForStory(story.id);
      assert.strictEqual(indexedEpicId, null);
    });

    test('throws NotFoundError for non-existent story', async () => {
      await assert.rejects(
        async () => {
          await storyService.delete('non-existent');
        },
        NotFoundError
      );
    });

    test('throws BusinessRuleError when linked bugs exist', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const feature = await storyService.create(epic.id, {
        title: 'Feature',
        type: 'feature',
      });
      await storyService.create(epic.id, {
        title: 'Bug',
        type: 'bug',
        linkedFeatureId: feature.id,
      });

      await assert.rejects(
        async () => {
          await storyService.delete(feature.id);
        },
        BusinessRuleError
      );
    });

    test('allows deletion when linked bugs are done', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const feature = await storyService.create(epic.id, {
        title: 'Feature',
        type: 'feature',
      });
      const bug = await storyService.create(epic.id, {
        title: 'Bug',
        type: 'bug',
        linkedFeatureId: feature.id,
      });

      // Mark bug as done
      await storyService.updateStatus(bug.id, 'done');

      await assert.doesNotReject(async () => {
        await storyService.delete(feature.id);
      });
    });
  });
});

describe('StoryService - Steps and Promotion', () => {
  describe('updateStep', () => {
    test('completes step with content', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      const updated = await storyService.updateStep(story.id, 'brief', {
        completed: true,
        content: 'This is the brief content',
      });

      assert.strictEqual(updated.steps.brief.completed, true);
      assert.strictEqual(updated.steps.brief.skipped, false);
      assert.strictEqual(updated.steps.brief.content, 'This is the brief content');
    });

    test('skips step', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      const updated = await storyService.updateStep(story.id, 'baSpec', {
        skipped: true,
      });

      assert.strictEqual(updated.steps.baSpec.skipped, true);
      assert.strictEqual(updated.steps.baSpec.completed, false);
      assert.strictEqual(updated.steps.baSpec.content, null);
    });

    test('skipping clears completed', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      // Complete first
      await storyService.updateStep(story.id, 'brief', {
        completed: true,
        content: 'Content',
      });

      // Then skip
      const updated = await storyService.updateStep(story.id, 'brief', {
        skipped: true,
      });

      assert.strictEqual(updated.steps.brief.completed, false);
      assert.strictEqual(updated.steps.brief.content, null);
    });

    test('completing clears skipped', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      // Skip first
      await storyService.updateStep(story.id, 'brief', { skipped: true });

      // Then complete
      const updated = await storyService.updateStep(story.id, 'brief', {
        completed: true,
        content: 'New content',
      });

      assert.strictEqual(updated.steps.brief.skipped, false);
      assert.strictEqual(updated.steps.brief.completed, true);
    });

    test('throws ValidationError for invalid step name', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      await assert.rejects(
        async () => {
          await storyService.updateStep(story.id, 'invalid', { completed: true });
        },
        ValidationError
      );
    });
  });

  describe('canPromote', () => {
    test('returns false with incomplete steps', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      const result = await storyService.canPromote(story.id);
      assert.strictEqual(result.canPromote, false);
      assert.deepStrictEqual(result.missingSteps.sort(), ['baSpec', 'brief', 'questions']);
    });

    test('returns true with all steps completed', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      await storyService.updateStep(story.id, 'brief', { completed: true, content: 'Brief' });
      await storyService.updateStep(story.id, 'baSpec', { completed: true, content: 'Spec' });
      await storyService.updateStep(story.id, 'questions', { completed: true, content: 'Q&A' });

      const result = await storyService.canPromote(story.id);
      assert.strictEqual(result.canPromote, true);
      assert.deepStrictEqual(result.missingSteps, []);
    });

    test('returns true with all steps skipped', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      await storyService.updateStep(story.id, 'brief', { skipped: true });
      await storyService.updateStep(story.id, 'baSpec', { skipped: true });
      await storyService.updateStep(story.id, 'questions', { skipped: true });

      const result = await storyService.canPromote(story.id);
      assert.strictEqual(result.canPromote, true);
    });

    test('returns true with mixed completed/skipped', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      await storyService.updateStep(story.id, 'brief', { completed: true, content: 'Brief' });
      await storyService.updateStep(story.id, 'baSpec', { skipped: true });
      await storyService.updateStep(story.id, 'questions', { completed: true, content: 'Q&A' });

      const result = await storyService.canPromote(story.id);
      assert.strictEqual(result.canPromote, true);
    });
  });

  describe('promote', () => {
    test('promotes story to development', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      // Complete all steps
      await storyService.updateStep(story.id, 'brief', { skipped: true });
      await storyService.updateStep(story.id, 'baSpec', { skipped: true });
      await storyService.updateStep(story.id, 'questions', { skipped: true });

      const promoted = await storyService.promote(story.id);

      assert.strictEqual(promoted.status, 'ready_for_dev');
      assert.strictEqual(promoted.space, 'development');
    });

    test('preserves step data after promotion', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      await storyService.updateStep(story.id, 'brief', { completed: true, content: 'Brief content' });
      await storyService.updateStep(story.id, 'baSpec', { skipped: true });
      await storyService.updateStep(story.id, 'questions', { completed: true, content: 'Q&A' });

      const promoted = await storyService.promote(story.id);

      assert.strictEqual(promoted.steps.brief.content, 'Brief content');
      assert.strictEqual(promoted.steps.baSpec.skipped, true);
      assert.strictEqual(promoted.steps.questions.content, 'Q&A');
    });

    test('throws BusinessRuleError for incomplete steps', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      // Only complete one step
      await storyService.updateStep(story.id, 'brief', { completed: true, content: 'Brief' });

      await assert.rejects(
        async () => {
          await storyService.promote(story.id);
        },
        BusinessRuleError
      );
    });

    test('throws NotFoundError for non-existent story', async () => {
      await assert.rejects(
        async () => {
          await storyService.promote('non-existent');
        },
        NotFoundError
      );
    });
  });
});

describe('StoryService - Movement Between Epics', () => {
  describe('move', () => {
    test('moves story to different epic', async () => {
      const epic1 = await epicService.create({ name: 'Epic 1' });
      const epic2 = await epicService.create({ name: 'Epic 2' });

      const story = await storyService.create(epic1.id, {
        title: 'Story',
        type: 'feature',
      });

      const moved = await storyService.move(story.id, epic2.id);

      assert.strictEqual(moved.id, story.id);

      // Verify in correct epic
      const { epic: foundEpic } = await storyService.findStoryWithEpic(story.id);
      assert.strictEqual(foundEpic.id, epic2.id);
    });

    test('preserves all story data', async () => {
      const epic1 = await epicService.create({ name: 'Epic 1' });
      const epic2 = await epicService.create({ name: 'Epic 2' });

      const story = await storyService.create(epic1.id, {
        title: 'Story',
        type: 'feature',
        description: 'Description',
      });

      // Modify the story
      await storyService.updateStep(story.id, 'brief', { completed: true, content: 'Brief' });
      await storyService.updateStatus(story.id, 'in_progress');

      const moved = await storyService.move(story.id, epic2.id);

      assert.strictEqual(moved.title, 'Story');
      assert.strictEqual(moved.description, 'Description');
      assert.strictEqual(moved.status, 'in_progress');
      assert.strictEqual(moved.steps.brief.completed, true);
    });

    test('updates story index', async () => {
      const epic1 = await epicService.create({ name: 'Epic 1' });
      const epic2 = await epicService.create({ name: 'Epic 2' });

      const story = await storyService.create(epic1.id, {
        title: 'Story',
        type: 'feature',
      });

      await storyService.move(story.id, epic2.id);

      const indexedEpicId = await storyIndex.getEpicIdForStory(story.id);
      assert.strictEqual(indexedEpicId, epic2.id);
    });

    test('removes from source epic', async () => {
      const epic1 = await epicService.create({ name: 'Epic 1' });
      const epic2 = await epicService.create({ name: 'Epic 2' });

      const story = await storyService.create(epic1.id, {
        title: 'Story',
        type: 'feature',
      });

      await storyService.move(story.id, epic2.id);

      const updatedEpic1 = await storage.readEpic(epic1.id);
      assert.strictEqual(updatedEpic1.stories.length, 0);
    });

    test('adds to target epic', async () => {
      const epic1 = await epicService.create({ name: 'Epic 1' });
      const epic2 = await epicService.create({ name: 'Epic 2' });

      const story = await storyService.create(epic1.id, {
        title: 'Story',
        type: 'feature',
      });

      await storyService.move(story.id, epic2.id);

      const updatedEpic2 = await storage.readEpic(epic2.id);
      assert.strictEqual(updatedEpic2.stories.length, 1);
      assert.strictEqual(updatedEpic2.stories[0].id, story.id);
    });

    test('no-op when moving to same epic', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      const moved = await storyService.move(story.id, epic.id);
      assert.strictEqual(moved.id, story.id);

      const updatedEpic = await storage.readEpic(epic.id);
      assert.strictEqual(updatedEpic.stories.length, 1);
    });

    test('throws NotFoundError for non-existent story', async () => {
      const epic = await epicService.create({ name: 'Epic' });

      await assert.rejects(
        async () => {
          await storyService.move('non-existent', epic.id);
        },
        NotFoundError
      );
    });

    test('throws NotFoundError for non-existent target epic', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      await assert.rejects(
        async () => {
          await storyService.move(story.id, 'non-existent');
        },
        NotFoundError
      );
    });
  });
});

describe('StoryService - Utilities', () => {
  describe('exists', () => {
    test('returns true for existing story', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      assert.strictEqual(await storyService.exists(story.id), true);
    });

    test('returns false for non-existent story', async () => {
      assert.strictEqual(await storyService.exists('non-existent'), false);
    });
  });

  describe('getLinkedBugs', () => {
    test('returns linked bugs', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const feature = await storyService.create(epic.id, {
        title: 'Feature',
        type: 'feature',
      });
      await storyService.create(epic.id, {
        title: 'Bug 1',
        type: 'bug',
        linkedFeatureId: feature.id,
      });
      await storyService.create(epic.id, {
        title: 'Bug 2',
        type: 'bug',
        linkedFeatureId: feature.id,
      });
      await storyService.create(epic.id, {
        title: 'Unlinked Bug',
        type: 'bug',
      });

      const linkedBugs = await storyService.getLinkedBugs(feature.id);
      assert.strictEqual(linkedBugs.length, 2);
    });

    test('returns empty array for feature with no bugs', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const feature = await storyService.create(epic.id, {
        title: 'Feature',
        type: 'feature',
      });

      const linkedBugs = await storyService.getLinkedBugs(feature.id);
      assert.deepStrictEqual(linkedBugs, []);
    });
  });

  describe('getStats', () => {
    test('returns correct statistics', async () => {
      const epic = await epicService.create({ name: 'Epic' });

      await storyService.create(epic.id, { title: 'Feature 1', type: 'feature' });
      await storyService.create(epic.id, { title: 'Feature 2', type: 'feature' });
      await storyService.create(epic.id, { title: 'Bug 1', type: 'bug' });

      const stats = await storyService.getStats();

      assert.strictEqual(stats.total, 3);
      assert.strictEqual(stats.byType.feature, 2);
      assert.strictEqual(stats.byType.bug, 1);
      assert.strictEqual(stats.byStatus.draft, 3);
      assert.strictEqual(stats.bySpace.experimentation, 3);
    });
  });

  describe('setInitEnriched', () => {
    test('sets enriched content on story with no init', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      const enrichedContent = '# Discovery Document\n\n## Summary\nTest summary';
      const model = 'claude-test';

      const updated = await storyService.setInitEnriched(story.id, enrichedContent, model);

      assert.ok(updated.init);
      assert.strictEqual(updated.init.enriched, enrichedContent);
      assert.strictEqual(updated.init.model, model);
      assert.ok(updated.init.enrichedAt);
      assert.ok(updated.updatedAt);
    });

    test('updates enriched content on story with existing init', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      // Set initial enriched content
      await storyService.setInitEnriched(story.id, 'Initial content', 'model-1');

      // Update with new enriched content
      const newContent = '# Updated Discovery Document';
      const updated = await storyService.setInitEnriched(story.id, newContent, 'model-2');

      assert.strictEqual(updated.init.enriched, newContent);
      assert.strictEqual(updated.init.model, 'model-2');
    });

    test('preserves init.input when setting enriched', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      // Set input first via setInitInput
      await storyService.setInitInput(story.id, 'User input description');

      // Set enriched content
      const enrichedContent = '# Discovery Document';
      const updated = await storyService.setInitEnriched(story.id, enrichedContent, 'claude');

      assert.strictEqual(updated.init.input, 'User input description');
      assert.strictEqual(updated.init.enriched, enrichedContent);
    });

    test('throws NotFoundError for non-existent story', async () => {
      await assert.rejects(
        async () => {
          await storyService.setInitEnriched('non-existent-id', 'content', 'model');
        },
        NotFoundError
      );
    });

    test('sets valid enrichedAt timestamp', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Story',
        type: 'feature',
      });

      const before = new Date().toISOString();
      const updated = await storyService.setInitEnriched(story.id, 'content', 'model');
      const after = new Date().toISOString();

      assert.ok(updated.init.enrichedAt >= before);
      assert.ok(updated.init.enrichedAt <= after);
    });

    test('returns full story object with updated init', async () => {
      const epic = await epicService.create({ name: 'Epic' });
      const story = await storyService.create(epic.id, {
        title: 'Test Story',
        type: 'feature',
        description: 'Original description',
      });

      const updated = await storyService.setInitEnriched(story.id, 'Enriched', 'model');

      // Verify the returned story has all expected properties
      assert.strictEqual(updated.id, story.id);
      assert.strictEqual(updated.title, 'Test Story');
      assert.strictEqual(updated.type, 'feature');
      assert.strictEqual(updated.description, 'Original description');
      assert.ok(updated.init);
      assert.strictEqual(updated.init.enriched, 'Enriched');
    });
  });
});
