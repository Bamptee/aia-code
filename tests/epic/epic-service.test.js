/**
 * @fileoverview Unit tests for Epic Service
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';

import { FileStorageProvider } from '../../src/epic/providers/file-storage-provider.js';
import { EpicService } from '../../src/epic/services/epic-service.js';
import { StoryIndexService } from '../../src/epic/services/story-index-service.js';
import { createStory } from '../../src/epic/models/story.js';
import { EPIC_STATUS } from '../../src/epic/models/validators.js';
import { ValidationError, NotFoundError, BusinessRuleError } from '../../src/epic/utils/errors.js';

// Test directory setup
let testRoot;
let storage;
let epicService;
let storyIndexService;

beforeEach(async () => {
  testRoot = path.join(os.tmpdir(), `epic-service-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.ensureDir(testRoot);
  storage = new FileStorageProvider(testRoot);
  storyIndexService = new StoryIndexService(storage);
  epicService = new EpicService(storage, storyIndexService);
  await storage.ensureDirectories();
});

afterEach(async () => {
  if (testRoot) {
    await fs.remove(testRoot);
  }
});

describe('EpicService', () => {
  describe('create', () => {
    test('creates epic with valid data', async () => {
      const epic = await epicService.create({
        name: 'Test Epic',
        description: 'A test epic',
      });

      assert.ok(epic.id);
      assert.strictEqual(epic.name, 'Test Epic');
      assert.strictEqual(epic.description, 'A test epic');
      assert.strictEqual(epic.status, 'discovery');
      assert.strictEqual(epic.isGeneral, false);
      assert.strictEqual(epic.isArchived, false);
      assert.deepStrictEqual(epic.stories, []);
    });

    test('creates epic with minimal data', async () => {
      const epic = await epicService.create({ name: 'Minimal' });

      assert.ok(epic.id);
      assert.strictEqual(epic.name, 'Minimal');
      assert.strictEqual(epic.description, null);
    });

    test('creates epic with custom status', async () => {
      const epic = await epicService.create({
        name: 'Custom Status',
        status: 'planning',
      });

      assert.strictEqual(epic.status, 'planning');
    });

    test('creates epic with planned period', async () => {
      const epic = await epicService.create({
        name: 'Planned Epic',
        plannedPeriod: '2026-Q2',
      });

      assert.strictEqual(epic.plannedPeriod, '2026-Q2');
    });

    test('throws ValidationError for empty name', async () => {
      await assert.rejects(
        async () => {
          await epicService.create({ name: '' });
        },
        ValidationError
      );
    });

    test('throws ValidationError for name over 100 chars', async () => {
      await assert.rejects(
        async () => {
          await epicService.create({ name: 'a'.repeat(101) });
        },
        ValidationError
      );
    });

    test('throws ValidationError for name with HTML', async () => {
      await assert.rejects(
        async () => {
          await epicService.create({ name: '<script>alert("xss")</script>' });
        },
        ValidationError
      );
    });
  });

  describe('getById', () => {
    test('returns epic when found', async () => {
      const created = await epicService.create({ name: 'Find Me' });
      const found = await epicService.getById(created.id);

      assert.strictEqual(found.id, created.id);
      assert.strictEqual(found.name, 'Find Me');
    });

    test('throws NotFoundError when not found', async () => {
      await assert.rejects(
        async () => {
          await epicService.getById('non-existent-id');
        },
        NotFoundError
      );
    });
  });

  describe('list', () => {
    test('returns empty array when no epics', async () => {
      const epics = await epicService.list();
      assert.deepStrictEqual(epics, []);
    });

    test('returns all non-archived epics', async () => {
      await epicService.create({ name: 'Epic 1' });
      await epicService.create({ name: 'Epic 2' });
      const epic3 = await epicService.create({ name: 'Epic 3' });
      await epicService.archive(epic3.id);

      const epics = await epicService.list();
      assert.strictEqual(epics.length, 2);
    });

    test('includes archived when requested', async () => {
      await epicService.create({ name: 'Epic 1' });
      const epic2 = await epicService.create({ name: 'Epic 2' });
      await epicService.archive(epic2.id);

      const epics = await epicService.list({ includeArchived: true });
      assert.strictEqual(epics.length, 2);
    });

    test('filters by status', async () => {
      await epicService.create({ name: 'Discovery', status: 'discovery' });
      await epicService.create({ name: 'Planning', status: 'planning' });
      await epicService.create({ name: 'In Progress', status: 'in_progress' });

      const epics = await epicService.list({ status: 'discovery' });
      assert.strictEqual(epics.length, 1);
      assert.strictEqual(epics[0].name, 'Discovery');
    });

    test('sorts General first, then alphabetically', async () => {
      await epicService.getOrCreateGeneralEpic();
      await epicService.create({ name: 'Zebra' });
      await epicService.create({ name: 'Alpha' });
      await epicService.create({ name: 'Beta' });

      const epics = await epicService.list();
      assert.strictEqual(epics[0].name, 'General');
      assert.strictEqual(epics[1].name, 'Alpha');
      assert.strictEqual(epics[2].name, 'Beta');
      assert.strictEqual(epics[3].name, 'Zebra');
    });

    test('includes progress in results', async () => {
      const epic = await epicService.create({ name: 'With Progress' });

      // Add stories directly to test progress calculation
      const epicData = await storage.readEpic(epic.id);
      epicData.stories = [
        createStory({ title: 'Story 1', type: 'feature' }),
        createStory({ title: 'Story 2', type: 'feature' }),
      ];
      epicData.stories[0].status = 'done';
      await storage.writeEpic(epicData);

      const epics = await epicService.list();
      const found = epics.find((e) => e.id === epic.id);
      assert.strictEqual(found.progress, 50);
    });
  });

  describe('update', () => {
    test('updates name', async () => {
      const epic = await epicService.create({ name: 'Original' });
      const updated = await epicService.update(epic.id, { name: 'Updated' });

      assert.strictEqual(updated.name, 'Updated');
    });

    test('updates description', async () => {
      const epic = await epicService.create({ name: 'Test', description: 'Old' });
      const updated = await epicService.update(epic.id, { description: 'New' });

      assert.strictEqual(updated.description, 'New');
    });

    test('clears description when set to null', async () => {
      const epic = await epicService.create({ name: 'Test', description: 'Has desc' });
      const updated = await epicService.update(epic.id, { description: null });

      assert.strictEqual(updated.description, null);
    });

    test('updates planned period', async () => {
      const epic = await epicService.create({ name: 'Test' });
      const updated = await epicService.update(epic.id, { plannedPeriod: '2026-Q3' });

      assert.strictEqual(updated.plannedPeriod, '2026-Q3');
    });

    test('updates timestamp', async () => {
      const epic = await epicService.create({ name: 'Test' });
      const originalUpdatedAt = epic.updatedAt;

      // Wait a bit to ensure timestamp changes
      await new Promise((r) => setTimeout(r, 10));

      const updated = await epicService.update(epic.id, { description: 'New' });
      assert.notStrictEqual(updated.updatedAt, originalUpdatedAt);
    });

    test('throws NotFoundError for non-existent epic', async () => {
      await assert.rejects(
        async () => {
          await epicService.update('non-existent', { name: 'New' });
        },
        NotFoundError
      );
    });

    test('throws BusinessRuleError when renaming General epic', async () => {
      const general = await epicService.getOrCreateGeneralEpic();

      await assert.rejects(
        async () => {
          await epicService.update(general.id, { name: 'Renamed' });
        },
        BusinessRuleError
      );
    });

    test('throws ValidationError for invalid name', async () => {
      const epic = await epicService.create({ name: 'Test' });

      await assert.rejects(
        async () => {
          await epicService.update(epic.id, { name: '' });
        },
        ValidationError
      );
    });
  });

  describe('updateStatus', () => {
    test('updates status', async () => {
      const epic = await epicService.create({ name: 'Test' });
      const updated = await epicService.updateStatus(epic.id, 'planning');

      assert.strictEqual(updated.status, 'planning');
    });

    test('allows all valid status transitions', async () => {
      const epic = await epicService.create({ name: 'Test' });

      for (const status of Object.values(EPIC_STATUS)) {
        if (status === 'done') continue; // Skip done, needs completed stories
        const updated = await epicService.updateStatus(epic.id, status);
        assert.strictEqual(updated.status, status);
      }
    });

    test('throws ValidationError for invalid status', async () => {
      const epic = await epicService.create({ name: 'Test' });

      await assert.rejects(
        async () => {
          await epicService.updateStatus(epic.id, 'invalid');
        },
        ValidationError
      );
    });

    test('throws BusinessRuleError when moving to done with incomplete stories', async () => {
      const epic = await epicService.create({ name: 'Test' });

      // Add incomplete story
      const epicData = await storage.readEpic(epic.id);
      epicData.stories = [createStory({ title: 'Incomplete', type: 'feature' })];
      await storage.writeEpic(epicData);

      await assert.rejects(
        async () => {
          await epicService.updateStatus(epic.id, 'done');
        },
        BusinessRuleError
      );
    });

    test('allows done status when all stories are done', async () => {
      const epic = await epicService.create({ name: 'Test' });

      // Add done story
      const epicData = await storage.readEpic(epic.id);
      const story = createStory({ title: 'Done', type: 'feature' });
      story.status = 'done';
      epicData.stories = [story];
      await storage.writeEpic(epicData);

      const updated = await epicService.updateStatus(epic.id, 'done');
      assert.strictEqual(updated.status, 'done');
    });

    test('allows done status when no stories', async () => {
      const epic = await epicService.create({ name: 'Empty' });
      const updated = await epicService.updateStatus(epic.id, 'done');

      assert.strictEqual(updated.status, 'done');
    });
  });

  describe('delete', () => {
    test('deletes empty epic', async () => {
      const epic = await epicService.create({ name: 'To Delete' });
      await epicService.delete(epic.id);

      await assert.rejects(
        async () => {
          await epicService.getById(epic.id);
        },
        NotFoundError
      );
    });

    test('throws BusinessRuleError for General epic', async () => {
      const general = await epicService.getOrCreateGeneralEpic();

      await assert.rejects(
        async () => {
          await epicService.delete(general.id);
        },
        BusinessRuleError
      );
    });

    test('throws BusinessRuleError for epic with stories', async () => {
      const epic = await epicService.create({ name: 'Has Stories' });

      const epicData = await storage.readEpic(epic.id);
      epicData.stories = [createStory({ title: 'Story', type: 'feature' })];
      await storage.writeEpic(epicData);

      await assert.rejects(
        async () => {
          await epicService.delete(epic.id);
        },
        BusinessRuleError
      );
    });

    test('throws NotFoundError for non-existent epic', async () => {
      await assert.rejects(
        async () => {
          await epicService.delete('non-existent');
        },
        NotFoundError
      );
    });
  });

  describe('archive', () => {
    test('archives epic', async () => {
      const epic = await epicService.create({ name: 'To Archive' });
      const archived = await epicService.archive(epic.id);

      assert.strictEqual(archived.isArchived, true);
    });

    test('throws BusinessRuleError for General epic', async () => {
      const general = await epicService.getOrCreateGeneralEpic();

      await assert.rejects(
        async () => {
          await epicService.archive(general.id);
        },
        BusinessRuleError
      );
    });

    test('throws NotFoundError for non-existent epic', async () => {
      await assert.rejects(
        async () => {
          await epicService.archive('non-existent');
        },
        NotFoundError
      );
    });
  });

  describe('unarchive', () => {
    test('unarchives epic', async () => {
      const epic = await epicService.create({ name: 'To Unarchive' });
      await epicService.archive(epic.id);
      const unarchived = await epicService.unarchive(epic.id);

      assert.strictEqual(unarchived.isArchived, false);
    });
  });

  describe('calculateProgress', () => {
    test('returns 0 for no stories', async () => {
      const epic = await epicService.create({ name: 'Empty' });
      const progress = epicService.calculateProgress(epic);

      assert.strictEqual(progress, 0);
    });

    test('calculates correct percentage', async () => {
      const epic = await epicService.create({ name: 'Test' });
      const epicData = await storage.readEpic(epic.id);

      const story1 = createStory({ title: 'Story 1', type: 'feature' });
      const story2 = createStory({ title: 'Story 2', type: 'feature' });
      const story3 = createStory({ title: 'Story 3', type: 'feature' });
      story1.status = 'done';
      story3.status = 'done';

      epicData.stories = [story1, story2, story3];
      await storage.writeEpic(epicData);

      const updated = await storage.readEpic(epic.id);
      const progress = epicService.calculateProgress(updated);

      assert.strictEqual(progress, 67); // 2/3 rounded
    });
  });

  describe('getOrCreateGeneralEpic', () => {
    test('creates General epic if not exists', async () => {
      const general = await epicService.getOrCreateGeneralEpic();

      assert.strictEqual(general.name, 'General');
      assert.strictEqual(general.isGeneral, true);
    });

    test('returns existing General epic', async () => {
      const first = await epicService.getOrCreateGeneralEpic();
      const second = await epicService.getOrCreateGeneralEpic();

      assert.strictEqual(first.id, second.id);
    });
  });

  describe('exists', () => {
    test('returns true for existing epic', async () => {
      const epic = await epicService.create({ name: 'Exists' });
      assert.strictEqual(await epicService.exists(epic.id), true);
    });

    test('returns false for non-existent epic', async () => {
      assert.strictEqual(await epicService.exists('non-existent'), false);
    });
  });

  describe('getStats', () => {
    test('returns correct statistics', async () => {
      await epicService.getOrCreateGeneralEpic();
      await epicService.create({ name: 'Epic 1', status: 'discovery' });
      await epicService.create({ name: 'Epic 2', status: 'planning' });
      const epic3 = await epicService.create({ name: 'Epic 3', status: 'in_progress' });
      await epicService.archive(epic3.id);

      const stats = await epicService.getStats();

      assert.strictEqual(stats.total, 4);
      assert.strictEqual(stats.active, 3);
      assert.strictEqual(stats.archived, 1);
      assert.strictEqual(stats.byStatus.discovery, 1);
      assert.strictEqual(stats.byStatus.planning, 1);
      assert.strictEqual(stats.byStatus.in_progress, 1); // General epic
    });
  });
});
