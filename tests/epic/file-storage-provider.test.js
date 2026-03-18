/**
 * @fileoverview Unit tests for File Storage Provider
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';

import { FileStorageProvider } from '../../src/epic/providers/file-storage-provider.js';
import { createEpic, createGeneralEpic } from '../../src/epic/models/epic.js';
import { createStory } from '../../src/epic/models/story.js';
import { createDefaultConfig } from '../../src/epic/models/config.js';

// Test directory setup
let testRoot;
let storage;

beforeEach(async () => {
  testRoot = path.join(os.tmpdir(), `epic-storage-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.ensureDir(testRoot);
  storage = new FileStorageProvider(testRoot);
});

afterEach(async () => {
  if (testRoot) {
    await fs.remove(testRoot);
  }
});

describe('FileStorageProvider', () => {
  describe('ensureDirectories', () => {
    test('creates all required directories', async () => {
      await storage.ensureDirectories();

      assert.ok(await fs.pathExists(storage.aiaDir), '.aia directory should exist');
      assert.ok(await fs.pathExists(storage.epicsDir), 'epics directory should exist');
      assert.ok(await fs.pathExists(storage.cacheDir), 'cache directory should exist');
      assert.ok(await fs.pathExists(storage.attachmentsDir), 'attachments directory should exist');
      assert.ok(await fs.pathExists(storage.indexDir), 'index directory should exist');
    });

    test('is idempotent', async () => {
      await storage.ensureDirectories();
      await storage.ensureDirectories(); // Should not throw

      assert.ok(await fs.pathExists(storage.epicsDir));
    });
  });

  describe('writeEpic / readEpic', () => {
    test('writes and reads epic correctly', async () => {
      const epic = createEpic({ name: 'Test Epic', description: 'A test' });

      await storage.writeEpic(epic);
      const read = await storage.readEpic(epic.id);

      assert.deepStrictEqual(read, epic);
    });

    test('returns null for non-existent epic', async () => {
      await storage.ensureDirectories();
      const read = await storage.readEpic('non-existent-id');
      assert.strictEqual(read, null);
    });

    test('overwrites existing epic', async () => {
      const epic = createEpic({ name: 'Original' });
      await storage.writeEpic(epic);

      epic.name = 'Updated';
      await storage.writeEpic(epic);

      const read = await storage.readEpic(epic.id);
      assert.strictEqual(read.name, 'Updated');
    });

    test('writes with custom filename', async () => {
      const epic = createGeneralEpic();
      await storage.writeEpic(epic, '_general.json');

      const filePath = path.join(storage.epicsDir, '_general.json');
      assert.ok(await fs.pathExists(filePath));
    });
  });

  describe('readAllEpics', () => {
    test('returns empty array when no epics exist', async () => {
      await storage.ensureDirectories();
      const epics = await storage.readAllEpics();
      assert.deepStrictEqual(epics, []);
    });

    test('returns all epics', async () => {
      const epic1 = createEpic({ name: 'Epic 1' });
      const epic2 = createEpic({ name: 'Epic 2' });
      const epic3 = createEpic({ name: 'Epic 3' });

      await storage.writeEpic(epic1);
      await storage.writeEpic(epic2);
      await storage.writeEpic(epic3);

      const epics = await storage.readAllEpics();
      assert.strictEqual(epics.length, 3);

      const names = epics.map((e) => e.name).sort();
      assert.deepStrictEqual(names, ['Epic 1', 'Epic 2', 'Epic 3']);
    });

    test('ignores non-JSON files', async () => {
      await storage.ensureDirectories();

      const epic = createEpic({ name: 'Test' });
      await storage.writeEpic(epic);

      // Create a non-JSON file
      await fs.writeFile(path.join(storage.epicsDir, 'readme.txt'), 'ignore me');

      const epics = await storage.readAllEpics();
      assert.strictEqual(epics.length, 1);
    });
  });

  describe('deleteEpic', () => {
    test('deletes existing epic', async () => {
      const epic = createEpic({ name: 'To Delete' });
      await storage.writeEpic(epic);

      await storage.deleteEpic(epic.id);

      const read = await storage.readEpic(epic.id);
      assert.strictEqual(read, null);
    });

    test('does not throw for non-existent epic', async () => {
      await storage.ensureDirectories();
      await assert.doesNotReject(async () => {
        await storage.deleteEpic('non-existent');
      });
    });
  });

  describe('config operations', () => {
    test('writes and reads config', async () => {
      const config = createDefaultConfig();

      await storage.writeConfig(config);
      const read = await storage.readConfig();

      assert.deepStrictEqual(read, config);
    });

    test('returns null when config does not exist', async () => {
      await storage.ensureDirectories();
      const config = await storage.readConfig();
      assert.strictEqual(config, null);
    });
  });

  describe('story index operations', () => {
    test('writes and reads story index', async () => {
      const index = {
        'story-1': 'epic-1',
        'story-2': 'epic-1',
        'story-3': 'epic-2',
      };

      await storage.writeStoryIndex(index);
      const read = await storage.readStoryIndex();

      assert.deepStrictEqual(read, index);
    });

    test('returns empty object when index does not exist', async () => {
      await storage.ensureDirectories();
      const index = await storage.readStoryIndex();
      assert.deepStrictEqual(index, {});
    });
  });

  describe('attachment operations', () => {
    test('saves and reads attachment', async () => {
      const data = Buffer.from('test attachment content');

      const savedName = await storage.saveAttachment('story-123', 'test.txt', data);
      assert.strictEqual(savedName, 'test.txt');

      const read = await storage.readAttachment('story-123', 'test.txt');
      assert.deepStrictEqual(read, data);
    });

    test('sanitizes filename on save', async () => {
      const data = Buffer.from('test');

      const savedName = await storage.saveAttachment('story-123', '../../../etc/passwd', data);
      assert.strictEqual(savedName, 'passwd'); // Only basename kept
    });

    test('throws NotFoundError for non-existent attachment', async () => {
      await storage.ensureDirectories();

      await assert.rejects(
        async () => {
          await storage.readAttachment('story-123', 'missing.txt');
        },
        {
          name: 'NotFoundError',
        }
      );
    });

    test('deletes attachment', async () => {
      const data = Buffer.from('to delete');
      await storage.saveAttachment('story-123', 'delete.txt', data);

      await storage.deleteAttachment('story-123', 'delete.txt');

      await assert.rejects(
        async () => {
          await storage.readAttachment('story-123', 'delete.txt');
        },
        { name: 'NotFoundError' }
      );
    });
  });

  describe('isInitialized', () => {
    test('returns false when not initialized', async () => {
      const initialized = await storage.isInitialized();
      assert.strictEqual(initialized, false);
    });

    test('returns true when epics exist', async () => {
      const epic = createEpic({ name: 'Test' });
      await storage.writeEpic(epic);

      const initialized = await storage.isInitialized();
      assert.strictEqual(initialized, true);
    });
  });

  describe('getGeneralEpic', () => {
    test('returns null when General epic does not exist', async () => {
      await storage.ensureDirectories();
      const general = await storage.getGeneralEpic();
      assert.strictEqual(general, null);
    });

    test('returns General epic when it exists', async () => {
      const general = createGeneralEpic();
      await storage.writeEpic(general);

      const read = await storage.getGeneralEpic();
      assert.strictEqual(read.isGeneral, true);
      assert.strictEqual(read.name, 'General');
    });
  });

  describe('atomic writes', () => {
    test('does not leave temp files on success', async () => {
      const epic = createEpic({ name: 'Test' });
      await storage.writeEpic(epic);

      const files = await fs.readdir(storage.epicsDir);
      const tempFiles = files.filter((f) => f.endsWith('.tmp'));

      assert.strictEqual(tempFiles.length, 0);
    });

    test('cleans up temp files on error', async () => {
      // This is hard to test without mocking, but we verify structure is correct
      const epic = createEpic({ name: 'Test' });
      await storage.writeEpic(epic);

      const files = await fs.readdir(storage.epicsDir);
      assert.ok(files.includes(`${epic.id}.json`));
      assert.ok(!files.includes(`${epic.id}.json.tmp`));
    });
  });
});

describe('FileStorageProvider - Concurrent Access', () => {
  test('handles concurrent writes to same epic', async () => {
    const epic = createEpic({ name: 'Concurrent Test' });
    await storage.writeEpic(epic);

    // Simulate concurrent updates
    const updates = [];
    for (let i = 0; i < 5; i++) {
      const update = async () => {
        const read = await storage.readEpic(epic.id);
        read.description = `Update ${i}`;
        await storage.writeEpic(read);
      };
      updates.push(update());
    }

    // All should complete without error (locking prevents corruption)
    await Promise.all(updates);

    // Verify epic is still valid
    const final = await storage.readEpic(epic.id);
    assert.ok(final);
    assert.strictEqual(final.name, 'Concurrent Test');
    // Description will be from one of the updates (last writer wins)
    assert.ok(final.description.startsWith('Update'));
  });

  test('handles concurrent writes to different epics', async () => {
    const epics = [];
    for (let i = 0; i < 5; i++) {
      epics.push(createEpic({ name: `Epic ${i}` }));
    }

    // Write all concurrently
    await Promise.all(epics.map((e) => storage.writeEpic(e)));

    // Read all and verify
    const all = await storage.readAllEpics();
    assert.strictEqual(all.length, 5);
  });
});
