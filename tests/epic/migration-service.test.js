/**
 * @fileoverview Unit tests for Migration Service
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';

import { FileStorageProvider } from '../../src/epic/providers/file-storage-provider.js';
import { StoryIndexService } from '../../src/epic/services/story-index-service.js';
import { MigrationService } from '../../src/epic/services/migration-service.js';
import { ValidationError } from '../../src/epic/utils/errors.js';

// Test directory setup
let testRoot;
let storage;
let storyIndexService;
let migrationService;

beforeEach(async () => {
  testRoot = path.join(os.tmpdir(), `migration-service-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.ensureDir(testRoot);
  storage = new FileStorageProvider(testRoot);
  storyIndexService = new StoryIndexService(storage);
  migrationService = new MigrationService(storage, storyIndexService);
});

afterEach(async () => {
  if (testRoot) {
    await fs.remove(testRoot);
  }
});

describe('MigrationService', () => {
  describe('initialize', () => {
    test('initializes system with General epic', async () => {
      const result = await migrationService.initialize();

      assert.strictEqual(result.initialized, true);
      assert.ok(result.created.includes('General Epic'));
      assert.ok(result.created.includes('Config'));
    });

    test('skips initialization if already initialized', async () => {
      await migrationService.initialize();
      const result = await migrationService.initialize();

      assert.strictEqual(result.initialized, false);
    });

    test('force re-initializes when requested', async () => {
      await migrationService.initialize();
      const result = await migrationService.initialize({ force: true });

      assert.strictEqual(result.initialized, true);
    });
  });

  describe('diagnose', () => {
    test('returns healthy for properly initialized system', async () => {
      await migrationService.initialize();
      const result = await migrationService.diagnose();

      assert.strictEqual(result.status, 'healthy');
      assert.strictEqual(result.issues.length, 0);
    });

    test('detects missing General epic', async () => {
      await storage.ensureDirectories();
      const result = await migrationService.diagnose();

      assert.strictEqual(result.status, 'issues_found');
      assert.ok(result.issues.some((i) => i.includes('General epic')));
    });
  });

  describe('repair', () => {
    test('creates missing General epic', async () => {
      await storage.ensureDirectories();

      const result = await migrationService.repair();

      assert.ok(result.repaired.some((r) => r.includes('General epic')));

      const general = await storage.getGeneralEpic();
      assert.ok(general);
    });

    test('creates missing config', async () => {
      await storage.ensureDirectories();

      const result = await migrationService.repair();

      assert.ok(result.repaired.some((r) => r.includes('Config')));

      const config = await storage.readConfig();
      assert.ok(config);
    });
  });

  describe('importData', () => {
    test('imports epics', async () => {
      await migrationService.initialize();

      const data = {
        epics: [
          { name: 'Imported Epic 1' },
          { name: 'Imported Epic 2' },
        ],
      };

      const result = await migrationService.importData(data);

      assert.strictEqual(result.imported.epics, 2);
      assert.strictEqual(result.errors.length, 0);
    });

    test('imports epics with stories', async () => {
      await migrationService.initialize();

      const data = {
        epics: [
          {
            name: 'Epic with Stories',
            stories: [
              { title: 'Story 1', type: 'feature' },
              { title: 'Story 2', type: 'bug' },
            ],
          },
        ],
      };

      const result = await migrationService.importData(data);

      assert.strictEqual(result.imported.epics, 1);
      assert.strictEqual(result.imported.stories, 2);
    });

    test('skips invalid epics', async () => {
      await migrationService.initialize();

      const data = {
        epics: [
          { name: 'Valid Epic' },
          { description: 'No name' }, // Invalid - no name
        ],
      };

      const result = await migrationService.importData(data);

      assert.strictEqual(result.imported.epics, 1);
      assert.strictEqual(result.skipped, 1);
    });

    test('supports dry run', async () => {
      await migrationService.initialize();

      const data = {
        epics: [{ name: 'Test Epic' }],
      };

      const result = await migrationService.importData(data, { dryRun: true });

      assert.strictEqual(result.imported.epics, 1);

      // Epic should not actually exist
      const epics = await storage.readAllEpics();
      assert.ok(!epics.some((e) => e.name === 'Test Epic'));
    });

    test('throws for invalid data format', async () => {
      await assert.rejects(
        async () => {
          await migrationService.importData({ invalid: true });
        },
        ValidationError
      );
    });
  });

  describe('exportData', () => {
    test('exports all epics', async () => {
      await migrationService.initialize();

      // Add an epic with story
      const { epics } = await migrationService.importData({
        epics: [
          {
            name: 'Test Epic',
            stories: [{ title: 'Test Story', type: 'feature' }],
          },
        ],
      });

      const exported = await migrationService.exportData();

      assert.ok(exported.version);
      assert.ok(exported.exportedAt);
      assert.ok(exported.epics.length >= 2); // General + Test
      assert.ok(exported.epics.some((e) => e.name === 'Test Epic'));
    });

    test('excludes archived when requested', async () => {
      await migrationService.initialize();

      // Import and archive an epic
      await migrationService.importData({
        epics: [{ name: 'To Archive' }],
      });

      const epics = await storage.readAllEpics();
      const toArchive = epics.find((e) => e.name === 'To Archive');
      toArchive.isArchived = true;
      await storage.writeEpic(toArchive);

      const exported = await migrationService.exportData({ includeArchived: false });

      assert.ok(!exported.epics.some((e) => e.name === 'To Archive'));
    });
  });

  describe('getStats', () => {
    test('returns system statistics', async () => {
      await migrationService.initialize();

      await migrationService.importData({
        epics: [
          {
            name: 'Test Epic',
            stories: [
              { title: 'Story 1', type: 'feature' },
              { title: 'Story 2', type: 'feature' },
            ],
          },
        ],
      });

      const stats = await migrationService.getStats();

      assert.ok(stats.version);
      assert.strictEqual(stats.initialized, true);
      assert.strictEqual(stats.epics.total, 2); // General + Test
      assert.strictEqual(stats.stories.total, 2);
    });
  });

  describe('clearAll', () => {
    test('clears all data when confirmed', async () => {
      await migrationService.initialize();

      await migrationService.importData({
        epics: [{ name: 'Test Epic' }],
      });

      await migrationService.clearAll({ confirm: true });

      const stats = await migrationService.getStats();
      assert.strictEqual(stats.epics.total, 1); // Only General remains after re-init
    });

    test('throws without confirmation', async () => {
      await migrationService.initialize();

      await assert.rejects(
        async () => {
          await migrationService.clearAll({});
        },
        ValidationError
      );
    });
  });
});
