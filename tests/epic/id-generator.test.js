/**
 * @fileoverview Unit tests for ID generator utilities
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

import {
  generateUUID,
  GENERAL_EPIC_ID,
  isValidUUID,
  generateUniqueId,
} from '../../src/epic/utils/id-generator.js';

describe('id-generator', () => {
  describe('generateUUID', () => {
    test('returns a valid UUID format', () => {
      const uuid = generateUUID();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      assert.ok(uuidRegex.test(uuid), `${uuid} should match UUID format`);
    });

    test('generates unique UUIDs', () => {
      const uuids = new Set();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUID());
      }
      assert.strictEqual(uuids.size, 100, 'All 100 UUIDs should be unique');
    });

    test('returns lowercase UUIDs', () => {
      const uuid = generateUUID();
      assert.strictEqual(uuid, uuid.toLowerCase());
    });
  });

  describe('GENERAL_EPIC_ID', () => {
    test('is a valid UUID format', () => {
      assert.ok(isValidUUID(GENERAL_EPIC_ID));
    });

    test('is the zero UUID', () => {
      assert.strictEqual(GENERAL_EPIC_ID, '00000000-0000-0000-0000-000000000000');
    });
  });

  describe('isValidUUID', () => {
    test('returns true for valid UUID', () => {
      assert.strictEqual(isValidUUID('550e8400-e29b-41d4-a716-446655440000'), true);
    });

    test('returns true for uppercase UUID', () => {
      assert.strictEqual(isValidUUID('550E8400-E29B-41D4-A716-446655440000'), true);
    });

    test('returns false for empty string', () => {
      assert.strictEqual(isValidUUID(''), false);
    });

    test('returns false for null', () => {
      assert.strictEqual(isValidUUID(null), false);
    });

    test('returns false for undefined', () => {
      assert.strictEqual(isValidUUID(undefined), false);
    });

    test('returns false for invalid format', () => {
      assert.strictEqual(isValidUUID('not-a-uuid'), false);
    });

    test('returns false for truncated UUID', () => {
      assert.strictEqual(isValidUUID('550e8400-e29b-41d4'), false);
    });

    test('returns false for UUID with invalid characters', () => {
      assert.strictEqual(isValidUUID('550g8400-e29b-41d4-a716-446655440000'), false);
    });
  });

  describe('generateUniqueId', () => {
    test('generates ID when no conflicts', async () => {
      const checker = async () => false; // Never exists
      const id = await generateUniqueId(checker);
      assert.ok(isValidUUID(id));
    });

    test('throws after max attempts when always conflicts', async () => {
      const checker = async () => true; // Always exists
      await assert.rejects(
        async () => {
          await generateUniqueId(checker, 3);
        },
        {
          message: /Failed to generate unique ID after 3 attempts/,
        }
      );
    });

    test('succeeds on second attempt when first conflicts', async () => {
      let attempts = 0;
      const checker = async () => {
        attempts++;
        return attempts === 1; // Only first attempt exists
      };
      const id = await generateUniqueId(checker);
      assert.ok(isValidUUID(id));
      assert.strictEqual(attempts, 2);
    });

    test('respects custom max attempts', async () => {
      let attempts = 0;
      const checker = async () => {
        attempts++;
        return true; // Always exists
      };
      try {
        await generateUniqueId(checker, 2);
      } catch {
        // Expected
      }
      assert.strictEqual(attempts, 2);
    });
  });
});
