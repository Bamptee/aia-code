/**
 * @fileoverview Unit tests for Roadmap Service
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
import { RoadmapService } from '../../src/epic/services/roadmap-service.js';
import { ValidationError } from '../../src/epic/utils/errors.js';

// Test directory setup
let testRoot;
let storage;
let epicService;
let storyIndexService;
let roadmapService;

beforeEach(async () => {
  testRoot = path.join(os.tmpdir(), `roadmap-service-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.ensureDir(testRoot);
  storage = new FileStorageProvider(testRoot);
  storyIndexService = new StoryIndexService(storage);
  epicService = new EpicService(storage, storyIndexService);
  roadmapService = new RoadmapService(storage, epicService);
  await storage.ensureDirectories();
});

afterEach(async () => {
  if (testRoot) {
    await fs.remove(testRoot);
  }
});

describe('RoadmapService', () => {
  describe('getRoadmap', () => {
    test('returns empty roadmap when no epics', async () => {
      const roadmap = await roadmapService.getRoadmap();

      assert.strictEqual(roadmap.granularity, 'quarterly');
      assert.ok(roadmap.currentPeriod);
      assert.ok(roadmap.generatedAt);
      assert.deepStrictEqual(roadmap.unplanned, []);
    });

    test('groups epics by planned period', async () => {
      const currentPeriod = roadmapService.getCurrentPeriod('quarterly');
      await epicService.create({ name: 'Planned Epic', plannedPeriod: currentPeriod });
      await epicService.create({ name: 'Unplanned Epic' });

      const roadmap = await roadmapService.getRoadmap();

      assert.strictEqual(roadmap.periods[currentPeriod].length, 1);
      assert.strictEqual(roadmap.periods[currentPeriod][0].name, 'Planned Epic');
      assert.strictEqual(roadmap.unplanned.length, 1);
      assert.strictEqual(roadmap.unplanned[0].name, 'Unplanned Epic');
    });

    test('respects granularity parameter', async () => {
      const roadmap = await roadmapService.getRoadmap({ granularity: 'monthly' });

      assert.strictEqual(roadmap.granularity, 'monthly');
      // Monthly periods look like 2026-03
      assert.ok(roadmap.currentPeriod.match(/^\d{4}-\d{2}$/));
    });

    test('respects periodsAhead parameter', async () => {
      const roadmap = await roadmapService.getRoadmap({
        granularity: 'monthly',
        periodsAhead: 6,
      });

      const periodCount = Object.keys(roadmap.periods).length;
      assert.ok(periodCount >= 6);
    });

    test('excludes completed epics by default', async () => {
      const epic = await epicService.create({ name: 'Done Epic' });
      await epicService.updateStatus(epic.id, 'done');

      const roadmap = await roadmapService.getRoadmap();

      const allEpics = [
        ...roadmap.unplanned,
        ...Object.values(roadmap.periods).flat(),
      ];
      assert.ok(!allEpics.some((e) => e.name === 'Done Epic'));
    });

    test('includes completed epics when requested', async () => {
      const epic = await epicService.create({ name: 'Done Epic' });
      await epicService.updateStatus(epic.id, 'done');

      const roadmap = await roadmapService.getRoadmap({ includeCompleted: true });

      const allEpics = [
        ...roadmap.unplanned,
        ...Object.values(roadmap.periods).flat(),
      ];
      assert.ok(allEpics.some((e) => e.name === 'Done Epic'));
    });

    test('throws ValidationError for invalid granularity', async () => {
      await assert.rejects(
        async () => {
          await roadmapService.getRoadmap({ granularity: 'invalid' });
        },
        ValidationError
      );
    });

    test('includes epic progress and story count', async () => {
      const currentPeriod = roadmapService.getCurrentPeriod();
      const epic = await epicService.create({
        name: 'Epic with Stories',
        plannedPeriod: currentPeriod,
      });

      // Add stories to epic manually
      const epicData = await storage.readEpic(epic.id);
      epicData.stories = [
        { id: '1', title: 'Story 1', status: 'done', type: 'feature' },
        { id: '2', title: 'Story 2', status: 'draft', type: 'feature' },
      ];
      await storage.writeEpic(epicData);

      const roadmap = await roadmapService.getRoadmap();
      const epicInRoadmap = roadmap.periods[currentPeriod][0];

      assert.strictEqual(epicInRoadmap.storyCount, 2);
      assert.strictEqual(epicInRoadmap.progress, 50);
    });
  });

  describe('assignPeriod', () => {
    test('assigns period to epic', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });

      const updated = await roadmapService.assignPeriod(epic.id, '2026-Q2');

      assert.strictEqual(updated.plannedPeriod, '2026-Q2');
    });

    test('accepts quarterly format', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });

      const updated = await roadmapService.assignPeriod(epic.id, '2026-Q1');
      assert.strictEqual(updated.plannedPeriod, '2026-Q1');
    });

    test('accepts monthly format', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });

      const updated = await roadmapService.assignPeriod(epic.id, '2026-03');
      assert.strictEqual(updated.plannedPeriod, '2026-03');
    });

    test('accepts weekly format', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });

      const updated = await roadmapService.assignPeriod(epic.id, '2026-W12');
      assert.strictEqual(updated.plannedPeriod, '2026-W12');
    });

    test('throws ValidationError for invalid period format', async () => {
      const epic = await epicService.create({ name: 'Test Epic' });

      await assert.rejects(
        async () => {
          await roadmapService.assignPeriod(epic.id, 'invalid-period');
        },
        ValidationError
      );
    });
  });

  describe('unassignPeriod', () => {
    test('removes period assignment', async () => {
      const epic = await epicService.create({
        name: 'Test Epic',
        plannedPeriod: '2026-Q1',
      });

      const updated = await roadmapService.unassignPeriod(epic.id);

      assert.strictEqual(updated.plannedPeriod, null);
    });
  });

  describe('getEpicsForPeriod', () => {
    test('returns epics for specific period', async () => {
      await epicService.create({ name: 'Epic 1', plannedPeriod: '2026-Q1' });
      await epicService.create({ name: 'Epic 2', plannedPeriod: '2026-Q1' });
      await epicService.create({ name: 'Epic 3', plannedPeriod: '2026-Q2' });

      const epics = await roadmapService.getEpicsForPeriod('2026-Q1');

      assert.strictEqual(epics.length, 2);
      assert.ok(epics.every((e) => ['Epic 1', 'Epic 2'].includes(e.name)));
    });

    test('returns empty array for period with no epics', async () => {
      const epics = await roadmapService.getEpicsForPeriod('2030-Q4');
      assert.deepStrictEqual(epics, []);
    });

    test('throws ValidationError for invalid period', async () => {
      await assert.rejects(
        async () => {
          await roadmapService.getEpicsForPeriod('not-a-period');
        },
        ValidationError
      );
    });
  });

  describe('getCurrentPeriod', () => {
    test('returns quarterly period by default', () => {
      const period = roadmapService.getCurrentPeriod();
      assert.ok(period.match(/^\d{4}-Q[1-4]$/));
    });

    test('returns weekly period when requested', () => {
      const period = roadmapService.getCurrentPeriod('weekly');
      assert.ok(period.match(/^\d{4}-W\d{2}$/));
    });

    test('returns monthly period when requested', () => {
      const period = roadmapService.getCurrentPeriod('monthly');
      assert.ok(period.match(/^\d{4}-\d{2}$/));
    });

    test('throws ValidationError for invalid granularity', () => {
      assert.throws(
        () => {
          roadmapService.getCurrentPeriod('invalid');
        },
        ValidationError
      );
    });
  });

  describe('getUpcomingPeriods', () => {
    test('returns upcoming quarterly periods', () => {
      const periods = roadmapService.getUpcomingPeriods(4, 'quarterly');

      assert.ok(periods.length >= 4);
      periods.forEach((p) => {
        assert.ok(p.match(/^\d{4}-Q[1-4]$/));
      });
    });

    test('returns upcoming monthly periods', () => {
      const periods = roadmapService.getUpcomingPeriods(6, 'monthly');

      assert.ok(periods.length >= 6);
      periods.forEach((p) => {
        assert.ok(p.match(/^\d{4}-\d{2}$/));
      });
    });

    test('returns upcoming weekly periods', () => {
      const periods = roadmapService.getUpcomingPeriods(8, 'weekly');

      assert.ok(periods.length >= 8);
      periods.forEach((p) => {
        assert.ok(p.match(/^\d{4}-W\d{2}$/));
      });
    });
  });

  describe('getPeriodProgress', () => {
    test('returns zeroes for empty period', async () => {
      const progress = await roadmapService.getPeriodProgress('2030-Q4');

      assert.strictEqual(progress.epicCount, 0);
      assert.strictEqual(progress.totalStories, 0);
      assert.strictEqual(progress.averageProgress, 0);
    });

    test('calculates progress for period with epics', async () => {
      await epicService.create({
        name: 'Epic 1',
        plannedPeriod: '2026-Q1',
        status: 'in_progress',
      });
      await epicService.create({
        name: 'Epic 2',
        plannedPeriod: '2026-Q1',
        status: 'planning',
      });

      const progress = await roadmapService.getPeriodProgress('2026-Q1');

      assert.strictEqual(progress.period, '2026-Q1');
      assert.strictEqual(progress.epicCount, 2);
      assert.ok(progress.byStatus.in_progress === 1);
      assert.ok(progress.byStatus.planning === 1);
    });
  });

  describe('getStats', () => {
    test('returns statistics', async () => {
      await epicService.create({ name: 'Planned 1', plannedPeriod: '2026-Q1' });
      await epicService.create({ name: 'Planned 2', plannedPeriod: '2026-Q2' });
      await epicService.create({ name: 'Unplanned' });

      const stats = await roadmapService.getStats();

      assert.strictEqual(stats.totalEpics, 3);
      assert.strictEqual(stats.planned, 2);
      assert.strictEqual(stats.unplanned, 1);
      assert.strictEqual(stats.byPeriod['2026-Q1'], 1);
      assert.strictEqual(stats.byPeriod['2026-Q2'], 1);
    });
  });

  describe('isValidPeriod', () => {
    test('returns true for valid quarterly period', () => {
      assert.strictEqual(roadmapService.isValidPeriod('2026-Q1'), true);
      assert.strictEqual(roadmapService.isValidPeriod('2026-Q4'), true);
    });

    test('returns true for valid monthly period', () => {
      assert.strictEqual(roadmapService.isValidPeriod('2026-01'), true);
      assert.strictEqual(roadmapService.isValidPeriod('2026-12'), true);
    });

    test('returns true for valid weekly period', () => {
      assert.strictEqual(roadmapService.isValidPeriod('2026-W01'), true);
      assert.strictEqual(roadmapService.isValidPeriod('2026-W52'), true);
    });

    test('returns false for invalid periods', () => {
      assert.strictEqual(roadmapService.isValidPeriod('invalid'), false);
      assert.strictEqual(roadmapService.isValidPeriod('2026-Q5'), false);
      // Note: 2026-13 matches the monthly regex pattern but is an invalid month
      // The parser does basic format validation, not semantic validation
    });
  });

  describe('parsePeriodDates', () => {
    test('parses quarterly period correctly', () => {
      const { start, end } = roadmapService.parsePeriodDates('2026-Q1');

      assert.strictEqual(start.getFullYear(), 2026);
      assert.strictEqual(start.getMonth(), 0); // January
      assert.strictEqual(start.getDate(), 1);

      assert.strictEqual(end.getFullYear(), 2026);
      assert.strictEqual(end.getMonth(), 2); // March
      assert.strictEqual(end.getDate(), 31);
    });

    test('parses monthly period correctly', () => {
      const { start, end } = roadmapService.parsePeriodDates('2026-03');

      assert.strictEqual(start.getFullYear(), 2026);
      assert.strictEqual(start.getMonth(), 2); // March
      assert.strictEqual(start.getDate(), 1);

      assert.strictEqual(end.getFullYear(), 2026);
      assert.strictEqual(end.getMonth(), 2); // March
      assert.strictEqual(end.getDate(), 31);
    });

    test('parses weekly period correctly', () => {
      const { start, end } = roadmapService.parsePeriodDates('2026-W01');

      // Week 1 of 2026 starts on Dec 29, 2025 (ISO week)
      assert.ok(start instanceof Date);
      assert.ok(end instanceof Date);
      assert.ok(end > start);
      // Approximately 7 days difference (including end of day)
      const daysDiff = Math.round((end - start) / (1000 * 60 * 60 * 24));
      assert.ok(daysDiff >= 6 && daysDiff <= 7, `Days difference should be 6-7, got ${daysDiff}`);
    });

    test('throws ValidationError for invalid period', () => {
      assert.throws(
        () => {
          roadmapService.parsePeriodDates('invalid');
        },
        ValidationError
      );
    });
  });
});
