/**
 * @fileoverview Unit tests for QA Service
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';

import { FileStorageProvider } from '../../src/epic/providers/file-storage-provider.js';
import { EpicService } from '../../src/epic/services/epic-service.js';
import { StoryService } from '../../src/epic/services/story-service.js';
import { StoryIndexService } from '../../src/epic/services/story-index-service.js';
import { QAService } from '../../src/epic/services/qa-service.js';
import { ValidationError, NotFoundError, BusinessRuleError } from '../../src/epic/utils/errors.js';

// Test directory setup
let testRoot;
let storage;
let epicService;
let storyService;
let storyIndexService;
let qaService;

beforeEach(async () => {
  testRoot = path.join(os.tmpdir(), `qa-service-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.ensureDir(testRoot);
  storage = new FileStorageProvider(testRoot);
  storyIndexService = new StoryIndexService(storage);
  epicService = new EpicService(storage, storyIndexService);
  storyService = new StoryService(storage, storyIndexService, epicService);
  qaService = new QAService(storage, storyService, storyIndexService);
  await storage.ensureDirectories();
});

afterEach(async () => {
  if (testRoot) {
    await fs.remove(testRoot);
  }
});

describe('QAService', () => {
  describe('listTestingQueue', () => {
    test('returns empty array when no stories in testing', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      await storyService.create(epic.id, { title: 'Draft Story', type: 'feature' });

      const queue = await qaService.listTestingQueue();
      assert.deepStrictEqual(queue, []);
    });

    test('returns stories with testing status', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, { title: 'Test Story', type: 'feature' });

      // Move story to testing status
      await storyService.updateStatus(story.id, 'in_progress');
      await qaService.moveToTesting(story.id);

      const queue = await qaService.listTestingQueue();
      assert.strictEqual(queue.length, 1);
      assert.strictEqual(queue[0].title, 'Test Story');
      assert.strictEqual(queue[0].status, 'testing');
    });

    test('returns multiple stories in testing', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story1 = await storyService.create(epic.id, { title: 'Story 1', type: 'feature' });
      const story2 = await storyService.create(epic.id, { title: 'Story 2', type: 'feature' });
      const story3 = await storyService.create(epic.id, { title: 'Story 3', type: 'feature' });

      // Move some to testing
      await storyService.updateStatus(story1.id, 'in_progress');
      await qaService.moveToTesting(story1.id);
      await storyService.updateStatus(story2.id, 'in_progress');
      await qaService.moveToTesting(story2.id);
      // story3 stays in draft

      const queue = await qaService.listTestingQueue();
      assert.strictEqual(queue.length, 2);
    });
  });

  describe('approve', () => {
    test('approves story in testing', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, { title: 'Test Story', type: 'feature' });
      await storyService.updateStatus(story.id, 'in_progress');
      await qaService.moveToTesting(story.id);

      const approved = await qaService.approve(story.id);

      assert.strictEqual(approved.status, 'done');
      assert.strictEqual(approved.qaHistory.length, 1);
      assert.strictEqual(approved.qaHistory[0].action, 'approve');
    });

    test('approves with notes', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, { title: 'Test Story', type: 'feature' });
      await storyService.updateStatus(story.id, 'in_progress');
      await qaService.moveToTesting(story.id);

      const approved = await qaService.approve(story.id, 'Looks good!');

      assert.strictEqual(approved.qaHistory[0].reason, 'Looks good!');
    });

    test('throws NotFoundError for non-existent story', async () => {
      await assert.rejects(
        async () => {
          await qaService.approve('non-existent');
        },
        NotFoundError
      );
    });

    test('throws BusinessRuleError if not in testing', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, { title: 'Test Story', type: 'feature' });

      await assert.rejects(
        async () => {
          await qaService.approve(story.id);
        },
        BusinessRuleError
      );
    });

    test('throws BusinessRuleError if already done', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, { title: 'Test Story', type: 'feature' });
      await storyService.updateStatus(story.id, 'done');

      await assert.rejects(
        async () => {
          await qaService.approve(story.id);
        },
        BusinessRuleError
      );
    });
  });

  describe('reject', () => {
    test('rejects story and creates linked bug', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, { title: 'Test Story', type: 'feature' });
      await storyService.updateStatus(story.id, 'in_progress');
      await qaService.moveToTesting(story.id);

      const { story: rejected, bug } = await qaService.reject(story.id, 'This feature has a critical bug that needs fixing');

      // Check rejected story
      assert.strictEqual(rejected.status, 'in_progress');
      assert.strictEqual(rejected.qaHistory.length, 1);
      assert.strictEqual(rejected.qaHistory[0].action, 'reject');
      assert.strictEqual(rejected.qaHistory[0].createdBugId, bug.id);

      // Check created bug
      assert.strictEqual(bug.type, 'bug');
      assert.strictEqual(bug.linkedFeatureId, story.id);
      assert.ok(bug.title.includes('QA Rejection'));
      assert.strictEqual(bug.space, 'development');
    });

    test('throws ValidationError for short reason', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, { title: 'Test Story', type: 'feature' });
      await storyService.updateStatus(story.id, 'in_progress');
      await qaService.moveToTesting(story.id);

      await assert.rejects(
        async () => {
          await qaService.reject(story.id, 'Too short');
        },
        ValidationError
      );
    });

    test('throws NotFoundError for non-existent story', async () => {
      await assert.rejects(
        async () => {
          await qaService.reject('non-existent', 'This is a valid rejection reason');
        },
        NotFoundError
      );
    });

    test('throws BusinessRuleError if not in testing', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, { title: 'Test Story', type: 'feature' });

      await assert.rejects(
        async () => {
          await qaService.reject(story.id, 'This is a valid rejection reason');
        },
        BusinessRuleError
      );
    });

    test('bug is indexed correctly', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, { title: 'Test Story', type: 'feature' });
      await storyService.updateStatus(story.id, 'in_progress');
      await qaService.moveToTesting(story.id);

      const { bug } = await qaService.reject(story.id, 'This is a valid rejection reason');

      // Bug should be findable via story service
      const foundBug = await storyService.getById(bug.id);
      assert.strictEqual(foundBug.id, bug.id);
    });
  });

  describe('getHistory', () => {
    test('returns empty array for story with no QA history', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, { title: 'Test Story', type: 'feature' });

      const history = await qaService.getHistory(story.id);
      assert.deepStrictEqual(history, []);
    });

    test('returns QA history', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, { title: 'Test Story', type: 'feature' });
      await storyService.updateStatus(story.id, 'in_progress');
      await qaService.moveToTesting(story.id);

      // First reject
      await qaService.reject(story.id, 'This feature has bugs that need fixing');

      // Move back to testing
      await qaService.moveToTesting(story.id);

      // Then approve
      await qaService.approve(story.id);

      const history = await qaService.getHistory(story.id);
      assert.strictEqual(history.length, 2);
      assert.strictEqual(history[0].action, 'reject');
      assert.strictEqual(history[1].action, 'approve');
    });

    test('throws NotFoundError for non-existent story', async () => {
      await assert.rejects(
        async () => {
          await qaService.getHistory('non-existent');
        },
        NotFoundError
      );
    });
  });

  describe('getStats', () => {
    test('returns zeroes when no stories', async () => {
      const stats = await qaService.getStats();

      assert.strictEqual(stats.inTesting, 0);
      assert.strictEqual(stats.totalApprovals, 0);
      assert.strictEqual(stats.totalRejections, 0);
    });

    test('counts stories in testing', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story1 = await storyService.create(epic.id, { title: 'Story 1', type: 'feature' });
      const story2 = await storyService.create(epic.id, { title: 'Story 2', type: 'feature' });

      await storyService.updateStatus(story1.id, 'in_progress');
      await qaService.moveToTesting(story1.id);
      await storyService.updateStatus(story2.id, 'in_progress');
      await qaService.moveToTesting(story2.id);

      const stats = await qaService.getStats();
      assert.strictEqual(stats.inTesting, 2);
    });

    test('counts approvals and rejections', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, { title: 'Test Story', type: 'feature' });
      await storyService.updateStatus(story.id, 'in_progress');
      await qaService.moveToTesting(story.id);

      // Reject first
      await qaService.reject(story.id, 'This feature needs improvements');

      // Move back to testing
      await qaService.moveToTesting(story.id);

      // Approve
      await qaService.approve(story.id);

      const stats = await qaService.getStats();
      assert.strictEqual(stats.totalApprovals, 1);
      assert.strictEqual(stats.totalRejections, 1);
    });
  });

  describe('moveToTesting', () => {
    test('moves story from in_progress to testing', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, { title: 'Test Story', type: 'feature' });
      await storyService.updateStatus(story.id, 'in_progress');

      const updated = await qaService.moveToTesting(story.id);
      assert.strictEqual(updated.status, 'testing');
    });

    test('throws NotFoundError for non-existent story', async () => {
      await assert.rejects(
        async () => {
          await qaService.moveToTesting('non-existent');
        },
        NotFoundError
      );
    });

    test('throws BusinessRuleError if not in_progress', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, { title: 'Test Story', type: 'feature' });
      // Story is in draft status

      await assert.rejects(
        async () => {
          await qaService.moveToTesting(story.id);
        },
        BusinessRuleError
      );
    });

    test('throws BusinessRuleError if already in testing', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, { title: 'Test Story', type: 'feature' });
      await storyService.updateStatus(story.id, 'in_progress');
      await qaService.moveToTesting(story.id);

      await assert.rejects(
        async () => {
          await qaService.moveToTesting(story.id);
        },
        BusinessRuleError
      );
    });
  });

  describe('getLinkedBugs', () => {
    test('returns linked bugs after rejection', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, { title: 'Test Story', type: 'feature' });
      await storyService.updateStatus(story.id, 'in_progress');
      await qaService.moveToTesting(story.id);

      // Reject twice
      await qaService.reject(story.id, 'First rejection reason that is long enough');
      await qaService.moveToTesting(story.id);
      await qaService.reject(story.id, 'Second rejection reason that is also long');

      const bugs = await qaService.getLinkedBugs(story.id);
      assert.strictEqual(bugs.length, 2);
      bugs.forEach((bug) => {
        assert.strictEqual(bug.type, 'bug');
        assert.strictEqual(bug.linkedFeatureId, story.id);
      });
    });

    test('returns empty array for story with no rejections', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });
      const story = await storyService.create(epic.id, { title: 'Test Story', type: 'feature' });

      const bugs = await qaService.getLinkedBugs(story.id);
      assert.deepStrictEqual(bugs, []);
    });
  });
});
