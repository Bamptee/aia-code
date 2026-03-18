/**
 * @fileoverview End-to-End Workflow Tests for Epic & Product Management System
 * Tests complete workflows from creation to completion
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';

import { FileStorageProvider } from '../../src/epic/providers/file-storage-provider.js';
import { StoryIndexService } from '../../src/epic/services/story-index-service.js';
import { EpicService } from '../../src/epic/services/epic-service.js';
import { StoryService } from '../../src/epic/services/story-service.js';
import { QAService } from '../../src/epic/services/qa-service.js';
import { MigrationService } from '../../src/epic/services/migration-service.js';
import { IntegrityService } from '../../src/epic/services/integrity-service.js';
import { STORY_STATUS, STORY_SPACE } from '../../src/epic/models/validators.js';

// Test directory setup
let testRoot;
let storage;
let storyIndexService;
let epicService;
let storyService;
let qaService;
let migrationService;
let integrityService;

beforeEach(async () => {
  testRoot = path.join(os.tmpdir(), `e2e-workflow-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.ensureDir(testRoot);
  storage = new FileStorageProvider(testRoot);
  storyIndexService = new StoryIndexService(storage);
  epicService = new EpicService(storage, storyIndexService);
  storyService = new StoryService(storage, storyIndexService, epicService);
  qaService = new QAService(storage, storyService, storyIndexService);
  migrationService = new MigrationService(storage, storyIndexService);
  integrityService = new IntegrityService(storage, storyIndexService);
});

afterEach(async () => {
  if (testRoot) {
    await fs.remove(testRoot);
  }
});

describe('E2E Workflows', () => {
  describe('Complete Feature Workflow', () => {
    test('feature from creation to done', async () => {
      // Step 1: Initialize the system
      const initResult = await migrationService.initialize();
      assert.strictEqual(initResult.initialized, true);

      // Step 2: Create an epic
      const epic = await epicService.create({
        name: 'User Authentication',
        description: 'Complete user auth system',
      });
      assert.ok(epic.id);

      // Step 3: Create a feature story
      const story = await storyService.create(epic.id, {
        title: 'Implement Login Form',
        type: 'feature',
        description: 'Create a login form with email and password',
      });
      assert.strictEqual(story.status, STORY_STATUS.DRAFT);
      assert.strictEqual(story.space, STORY_SPACE.EXPERIMENTATION);

      // Step 4: Complete experimentation steps
      await storyService.updateStep(story.id, 'init', {
        completed: true,
        content: 'Login form with validation and error handling',
      });
      await storyService.updateStep(story.id, 'specFunc', {
        completed: true,
        content: 'AC: 1. Email validation, 2. Password min 8 chars, 3. Error messages',
      });
      await storyService.updateStep(story.id, 'brainstorming', {
        skipped: true,
      });

      // Verify steps
      const updatedStory = await storyService.getById(story.id);
      assert.strictEqual(updatedStory.steps.init.completed, true);
      assert.strictEqual(updatedStory.steps.specFunc.completed, true);
      assert.strictEqual(updatedStory.steps.brainstorming.skipped, true);

      // Step 5: Promote to development
      const promotedStory = await storyService.promote(story.id);
      assert.strictEqual(promotedStory.status, STORY_STATUS.READY_FOR_DEV);
      assert.strictEqual(promotedStory.space, STORY_SPACE.DEVELOPMENT);

      // Step 6: Start development
      await storyService.updateStatus(story.id, STORY_STATUS.IN_PROGRESS);

      // Step 7: Submit for testing
      await qaService.moveToTesting(story.id);
      const testingStory = await storyService.getById(story.id);
      assert.strictEqual(testingStory.status, STORY_STATUS.TESTING);

      // Step 8: QA approves
      const approvedStory = await qaService.approve(story.id, 'All tests passed');
      assert.strictEqual(approvedStory.status, STORY_STATUS.DONE);

      // Verify final state
      const finalStory = await storyService.getById(story.id);
      assert.strictEqual(finalStory.status, STORY_STATUS.DONE);

      // Verify data integrity
      const integrity = await integrityService.check();
      assert.strictEqual(integrity.healthy, true);
    });

    test('feature with QA rejection and bug creation', async () => {
      // Initialize
      await migrationService.initialize();

      // Create epic and story
      const epic = await epicService.create({ name: 'Payment System' });
      const story = await storyService.create(epic.id, {
        title: 'Checkout Flow',
        type: 'feature',
      });

      // Fast-track through experimentation (skip all)
      await storyService.updateStep(story.id, 'init', { skipped: true });
      await storyService.updateStep(story.id, 'specFunc', { skipped: true });
      await storyService.updateStep(story.id, 'brainstorming', { skipped: true });

      // Promote and move to testing
      await storyService.promote(story.id);
      await storyService.updateStatus(story.id, STORY_STATUS.IN_PROGRESS);
      await qaService.moveToTesting(story.id);

      // QA rejects with a bug
      const rejectResult = await qaService.reject(story.id, 'Payment fails on mobile');

      // Story should be back to in_progress
      assert.strictEqual(rejectResult.story.status, STORY_STATUS.IN_PROGRESS);

      // Bug should be created
      assert.ok(rejectResult.bug);
      assert.strictEqual(rejectResult.bug.type, 'bug');
      assert.strictEqual(rejectResult.bug.linkedFeatureId, story.id);

      // Verify bug is in testing queue (bugs start as draft, not in testing)
      const allStories = await storyService.list();
      assert.ok(allStories.some((s) => s.id === rejectResult.bug.id));
    });
  });

  describe('Multi-Epic Story Movement', () => {
    test('moving stories between epics preserves integrity', async () => {
      // Initialize
      await migrationService.initialize();

      // Create two epics
      const epicA = await epicService.create({ name: 'Epic A' });
      const epicB = await epicService.create({ name: 'Epic B' });

      // Create stories in Epic A
      const story1 = await storyService.create(epicA.id, { title: 'Story 1', type: 'feature' });
      const story2 = await storyService.create(epicA.id, { title: 'Story 2', type: 'feature' });

      // Move story1 to Epic B
      await storyService.move(story1.id, epicB.id);

      // Verify story locations
      const storiesInA = await storyService.list({ epicId: epicA.id });
      const storiesInB = await storyService.list({ epicId: epicB.id });

      assert.strictEqual(storiesInA.length, 1);
      assert.strictEqual(storiesInA[0].id, story2.id);
      assert.strictEqual(storiesInB.length, 1);
      assert.strictEqual(storiesInB[0].id, story1.id);

      // Verify index integrity
      const indexValidation = await storyIndexService.validate();
      assert.strictEqual(indexValidation.valid, true);

      // Verify overall integrity
      const integrity = await integrityService.check();
      assert.strictEqual(integrity.healthy, true);
    });
  });

  describe('Bug Workflow', () => {
    test('bug linked to feature follows correct workflow', async () => {
      // Initialize
      await migrationService.initialize();

      // Create epic with feature and bug
      const epic = await epicService.create({ name: 'API Development' });
      const feature = await storyService.create(epic.id, {
        title: 'REST Endpoint',
        type: 'feature',
      });
      const bug = await storyService.create(epic.id, {
        title: 'Endpoint returns 500',
        type: 'bug',
        linkedFeatureId: feature.id,
      });

      // Verify linked bug
      const linkedBugs = await storyService.getLinkedBugs(feature.id);
      assert.strictEqual(linkedBugs.length, 1);
      assert.strictEqual(linkedBugs[0].id, bug.id);

      // Bug workflow - skip experimentation steps
      await storyService.updateStep(bug.id, 'init', { skipped: true });
      await storyService.updateStep(bug.id, 'specFunc', { skipped: true });
      await storyService.updateStep(bug.id, 'brainstorming', { skipped: true });

      // Promote and fix
      await storyService.promote(bug.id);
      await storyService.updateStatus(bug.id, STORY_STATUS.IN_PROGRESS);
      await qaService.moveToTesting(bug.id);
      await qaService.approve(bug.id, 'Bug fixed');

      // Bug should be done
      const doneBug = await storyService.getById(bug.id);
      assert.strictEqual(doneBug.status, STORY_STATUS.DONE);
    });
  });

  describe('Data Import/Export', () => {
    test('export and reimport preserves all data', async () => {
      // Initialize
      await migrationService.initialize();

      // Create some data
      const epic = await epicService.create({ name: 'Test Epic' });
      await storyService.create(epic.id, { title: 'Story 1', type: 'feature' });
      await storyService.create(epic.id, { title: 'Story 2', type: 'bug' });

      // Export
      const exported = await migrationService.exportData();
      assert.ok(exported.epics.length >= 2); // General + Test

      // Clear all
      await migrationService.clearAll({ confirm: true });

      // Reimport (but need to re-initialize first)
      await migrationService.initialize();
      const importResult = await migrationService.importData(exported);

      // Verify we got our epic back
      // Note: General epic already exists after init, so we skip it in import
      const allEpics = await epicService.list();
      assert.ok(allEpics.some((e) => e.name === 'Test Epic'));
    });
  });

  describe('Concurrent Operations', () => {
    test('handles multiple story creations without conflicts', async () => {
      // Initialize
      await migrationService.initialize();
      const general = await epicService.getOrCreateGeneralEpic();

      // Create multiple stories concurrently
      const storyPromises = Array.from({ length: 10 }, (_, i) =>
        storyService.create(general.id, {
          title: `Concurrent Story ${i + 1}`,
          type: 'feature',
        })
      );

      const stories = await Promise.all(storyPromises);

      // All should have unique IDs
      const ids = stories.map((s) => s.id);
      const uniqueIds = new Set(ids);
      assert.strictEqual(uniqueIds.size, 10);

      // All should be in index
      for (const story of stories) {
        const epicId = await storyIndexService.getEpicIdForStory(story.id);
        assert.strictEqual(epicId, general.id);
      }

      // Integrity should be maintained
      const integrity = await integrityService.check();
      assert.strictEqual(integrity.healthy, true);
    });
  });

  describe('Index Rebuild', () => {
    test('rebuilding index repairs corrupted state', async () => {
      // Initialize
      await migrationService.initialize();
      const epic = await epicService.create({ name: 'Test Epic' });

      // Create stories
      const story1 = await storyService.create(epic.id, { title: 'Story 1', type: 'feature' });
      const story2 = await storyService.create(epic.id, { title: 'Story 2', type: 'feature' });

      // Corrupt the index by adding an orphan
      await storyIndexService.addStory('orphan-id', 'non-existent-epic');

      // Check should detect issues (orphan is a warning, not error)
      let integrity = await integrityService.check();
      assert.ok(integrity.issues.length > 0, 'Should have at least one issue');

      // Rebuild index
      const rebuildResult = await integrityService.rebuildIndex();
      assert.strictEqual(rebuildResult.rebuilt, true);
      assert.strictEqual(rebuildResult.storyCount, 2);

      // Should now have no issues
      integrity = await integrityService.check();
      assert.strictEqual(integrity.issues.length, 0, 'Should have no issues after rebuild');

      // Stories should still be findable
      assert.strictEqual(await storyIndexService.getEpicIdForStory(story1.id), epic.id);
      assert.strictEqual(await storyIndexService.getEpicIdForStory(story2.id), epic.id);
      assert.strictEqual(await storyIndexService.getEpicIdForStory('orphan-id'), null);
    });
  });

  describe('Epic Archival', () => {
    test('archiving epic preserves stories', async () => {
      // Initialize
      await migrationService.initialize();
      const epic = await epicService.create({ name: 'To Archive' });
      const story = await storyService.create(epic.id, { title: 'Story', type: 'feature' });

      // Archive epic
      await epicService.archive(epic.id);

      // Stories should still be accessible
      const retrievedStory = await storyService.getById(story.id);
      assert.strictEqual(retrievedStory.title, 'Story');

      // Epic should be archived
      const retrievedEpic = await epicService.getById(epic.id);
      assert.strictEqual(retrievedEpic.isArchived, true);

      // Should not appear in active list
      const activeEpics = await epicService.list({ activeOnly: true });
      assert.ok(!activeEpics.some((e) => e.id === epic.id));
    });
  });

  describe('Statistics Consistency', () => {
    test('story stats match actual data', async () => {
      // Initialize
      await migrationService.initialize();
      const epic = await epicService.create({ name: 'Stats Test' });

      // Create various stories
      await storyService.create(epic.id, { title: 'Feature 1', type: 'feature' });
      await storyService.create(epic.id, { title: 'Feature 2', type: 'feature' });
      await storyService.create(epic.id, { title: 'Bug 1', type: 'bug' });

      // Get stats
      const stats = await storyService.getStats({ epicId: epic.id });

      assert.strictEqual(stats.total, 3);
      assert.strictEqual(stats.byType.feature, 2);
      assert.strictEqual(stats.byType.bug, 1);
      assert.strictEqual(stats.byStatus.draft, 3);
    });
  });

  describe('Error Recovery', () => {
    test('system recovers from missing General epic', async () => {
      // Initialize
      await migrationService.initialize();

      // Manually corrupt by removing General epic
      const general = await storage.getGeneralEpic();
      await storage.deleteEpic(general.id);

      // System should detect the issue
      let integrity = await integrityService.check();
      assert.strictEqual(integrity.healthy, false);

      // Auto-fix should restore it
      await integrityService.fix();

      // Should now be healthy
      integrity = await integrityService.check();
      assert.strictEqual(integrity.healthy, true);

      // General epic should exist
      const restoredGeneral = await storage.getGeneralEpic();
      assert.ok(restoredGeneral);
    });
  });
});
