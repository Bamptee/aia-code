/**
 * @fileoverview Unit tests for Epic model validators
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

import {
  validateEpic,
  validateStory,
  validateQARejection,
  isValidStepName,
  isValidEpicStatus,
  isValidStoryStatus,
  isValidStoryType,
  isValidGranularity,
  assertValid,
  EPIC_STATUS,
  STORY_STATUS,
  STORY_TYPE,
  ROADMAP_GRANULARITY,
} from '../../src/epic/models/validators.js';

import { ValidationError } from '../../src/epic/utils/errors.js';

describe('validators', () => {
  describe('validateEpic', () => {
    test('accepts valid epic data', () => {
      const result = validateEpic({
        name: 'Test Epic',
        description: 'A test epic',
        status: 'discovery',
      });
      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.errors, []);
    });

    test('accepts epic with only required fields', () => {
      const result = validateEpic({ name: 'Test Epic' });
      assert.strictEqual(result.valid, true);
    });

    test('rejects empty name', () => {
      const result = validateEpic({ name: '' });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].field, 'name');
      assert.ok(result.errors[0].message.includes('required'));
    });

    test('rejects null name', () => {
      const result = validateEpic({ name: null });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors[0].field, 'name');
    });

    test('rejects undefined name', () => {
      const result = validateEpic({});
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors[0].field, 'name');
    });

    test('rejects name over 100 characters', () => {
      const longName = 'a'.repeat(101);
      const result = validateEpic({ name: longName });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors[0].message.includes('100 characters'));
    });

    test('accepts name at exactly 100 characters', () => {
      const maxName = 'a'.repeat(100);
      const result = validateEpic({ name: maxName });
      assert.strictEqual(result.valid, true);
    });

    test('rejects name with HTML tags', () => {
      const result = validateEpic({ name: '<script>alert("xss")</script>' });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors[0].message.includes('HTML'));
    });

    test('rejects name with simple HTML tag', () => {
      const result = validateEpic({ name: '<b>Bold</b>' });
      assert.strictEqual(result.valid, false);
    });

    test('rejects invalid status', () => {
      const result = validateEpic({ name: 'Test', status: 'invalid' });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors[0].field, 'status');
    });

    test('accepts all valid statuses', () => {
      for (const status of Object.values(EPIC_STATUS)) {
        const result = validateEpic({ name: 'Test', status });
        assert.strictEqual(result.valid, true, `Status ${status} should be valid`);
      }
    });

    test('rejects description over 5000 characters', () => {
      const longDesc = 'a'.repeat(5001);
      const result = validateEpic({ name: 'Test', description: longDesc });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors[0].field, 'description');
    });
  });

  describe('validateStory', () => {
    test('accepts valid story data', () => {
      const result = validateStory({
        title: 'Test Story',
        type: 'feature',
      });
      assert.strictEqual(result.valid, true);
    });

    test('rejects empty title', () => {
      const result = validateStory({ title: '', type: 'feature' });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors[0].field, 'title');
    });

    test('rejects title over 200 characters', () => {
      const longTitle = 'a'.repeat(201);
      const result = validateStory({ title: longTitle, type: 'feature' });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors[0].message.includes('200 characters'));
    });

    test('rejects invalid type', () => {
      const result = validateStory({ title: 'Test', type: 'invalid' });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors[0].field, 'type');
    });

    test('accepts feature type', () => {
      const result = validateStory({ title: 'Test', type: 'feature' });
      assert.strictEqual(result.valid, true);
    });

    test('accepts bug type', () => {
      const result = validateStory({ title: 'Test', type: 'bug' });
      assert.strictEqual(result.valid, true);
    });

    test('accepts valid status', () => {
      for (const status of Object.values(STORY_STATUS)) {
        const result = validateStory({ title: 'Test', type: 'feature', status });
        assert.strictEqual(result.valid, true, `Status ${status} should be valid`);
      }
    });

    test('rejects invalid status', () => {
      const result = validateStory({ title: 'Test', type: 'feature', status: 'invalid' });
      assert.strictEqual(result.valid, false);
    });
  });

  describe('validateQARejection', () => {
    test('accepts valid rejection reason', () => {
      const result = validateQARejection('This feature has a bug in the login form');
      assert.strictEqual(result.valid, true);
    });

    test('rejects reason under 10 characters', () => {
      const result = validateQARejection('Too short');
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors[0].message.includes('10 characters'));
    });

    test('rejects empty reason', () => {
      const result = validateQARejection('');
      assert.strictEqual(result.valid, false);
    });

    test('accepts reason at exactly 10 characters', () => {
      const result = validateQARejection('1234567890');
      assert.strictEqual(result.valid, true);
    });

    test('rejects reason over 2000 characters', () => {
      const longReason = 'a'.repeat(2001);
      const result = validateQARejection(longReason);
      assert.strictEqual(result.valid, false);
    });
  });

  describe('isValidStepName', () => {
    test('accepts init', () => {
      assert.strictEqual(isValidStepName('init'), true);
    });

    test('accepts brainstorming', () => {
      assert.strictEqual(isValidStepName('brainstorming'), true);
    });

    test('accepts specFunc', () => {
      assert.strictEqual(isValidStepName('specFunc'), true);
    });

    test('accepts specTech', () => {
      assert.strictEqual(isValidStepName('specTech'), true);
    });

    test('accepts devPlan', () => {
      assert.strictEqual(isValidStepName('devPlan'), true);
    });

    test('accepts implement', () => {
      assert.strictEqual(isValidStepName('implement'), true);
    });

    test('accepts review', () => {
      assert.strictEqual(isValidStepName('review'), true);
    });

    test('rejects invalid step name', () => {
      assert.strictEqual(isValidStepName('invalid'), false);
    });

    test('rejects empty step name', () => {
      assert.strictEqual(isValidStepName(''), false);
    });

    test('rejects legacy step names', () => {
      assert.strictEqual(isValidStepName('brief'), false);
      assert.strictEqual(isValidStepName('baSpec'), false);
      assert.strictEqual(isValidStepName('questions'), false);
      assert.strictEqual(isValidStepName('challenge'), false);
    });
  });

  describe('isValidEpicStatus', () => {
    test('accepts all valid statuses', () => {
      for (const status of Object.values(EPIC_STATUS)) {
        assert.strictEqual(isValidEpicStatus(status), true);
      }
    });

    test('rejects invalid status', () => {
      assert.strictEqual(isValidEpicStatus('invalid'), false);
    });
  });

  describe('isValidStoryStatus', () => {
    test('accepts all valid statuses', () => {
      for (const status of Object.values(STORY_STATUS)) {
        assert.strictEqual(isValidStoryStatus(status), true);
      }
    });

    test('rejects invalid status', () => {
      assert.strictEqual(isValidStoryStatus('invalid'), false);
    });
  });

  describe('isValidStoryType', () => {
    test('accepts feature', () => {
      assert.strictEqual(isValidStoryType('feature'), true);
    });

    test('accepts bug', () => {
      assert.strictEqual(isValidStoryType('bug'), true);
    });

    test('rejects invalid type', () => {
      assert.strictEqual(isValidStoryType('invalid'), false);
    });
  });

  describe('isValidGranularity', () => {
    test('accepts all valid granularities', () => {
      for (const granularity of Object.values(ROADMAP_GRANULARITY)) {
        assert.strictEqual(isValidGranularity(granularity), true);
      }
    });

    test('rejects invalid granularity', () => {
      assert.strictEqual(isValidGranularity('invalid'), false);
    });
  });

  describe('assertValid', () => {
    test('does not throw for valid data', () => {
      assert.doesNotThrow(() => {
        assertValid({ name: 'Test Epic' }, validateEpic);
      });
    });

    test('throws ValidationError for invalid data', () => {
      assert.throws(
        () => {
          assertValid({ name: '' }, validateEpic);
        },
        ValidationError
      );
    });

    test('error message contains field info', () => {
      try {
        assertValid({ name: '' }, validateEpic);
        assert.fail('Should have thrown');
      } catch (error) {
        assert.ok(error instanceof ValidationError);
        assert.ok(error.message.includes('name'));
        assert.ok(error.errors.length > 0);
      }
    });
  });
});
