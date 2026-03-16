/**
 * @fileoverview Tests for SlugService
 */

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert';
import { generateSlug, validateSlug, sanitizeForSlug, SlugService } from '../../src/epic/services/slug-service.js';

describe('generateSlug', () => {
  test('should generate a basic slug from title', () => {
    const slug = generateSlug('My Story Title', []);
    assert.strictEqual(slug, 'my-story-title');
  });

  test('should handle special characters', () => {
    const slug = generateSlug('Story with émojis 🚀 & symbols!', []);
    assert.strictEqual(slug, 'story-with-emojis-symbols');
  });

  test('should handle accents and diacritics', () => {
    const slug = generateSlug('Café résumé naïve', []);
    assert.strictEqual(slug, 'cafe-resume-naive');
  });

  test('should handle collisions with numeric suffix', () => {
    const existing = ['my-story', 'my-story-1', 'my-story-2'];
    const slug = generateSlug('My Story', existing);
    assert.strictEqual(slug, 'my-story-3');
  });

  test('should return base slug if no collision', () => {
    const existing = ['other-story'];
    const slug = generateSlug('My Story', existing);
    assert.strictEqual(slug, 'my-story');
  });

  test('should truncate long titles to 50 characters', () => {
    const longTitle = 'A'.repeat(100);
    const slug = generateSlug(longTitle, []);
    assert.ok(slug.length <= 50);
  });

  test('should handle empty-ish titles with fallback', () => {
    const slug = generateSlug('   ', []);
    assert.strictEqual(slug, 'story');
  });

  test('should handle titles with only special characters', () => {
    const slug = generateSlug('!@#$%^&*()', []);
    assert.strictEqual(slug, 'story');
  });

  test('should remove multiple consecutive hyphens', () => {
    const slug = generateSlug('Hello   World   Test', []);
    assert.strictEqual(slug, 'hello-world-test');
  });

  test('should remove leading and trailing hyphens', () => {
    const slug = generateSlug('  -Hello World-  ', []);
    assert.strictEqual(slug, 'hello-world');
  });

  test('should handle numbers in title', () => {
    const slug = generateSlug('Feature 123 Test', []);
    assert.strictEqual(slug, 'feature-123-test');
  });

  test('should throw error for null title', () => {
    assert.throws(() => generateSlug(null, []), /Title is required/);
  });

  test('should throw error for undefined title', () => {
    assert.throws(() => generateSlug(undefined, []), /Title is required/);
  });
});

describe('validateSlug', () => {
  test('should accept valid slugs', () => {
    assert.strictEqual(validateSlug('my-story'), true);
    assert.strictEqual(validateSlug('story-123'), true);
    assert.strictEqual(validateSlug('ab'), true);
    assert.strictEqual(validateSlug('a1b2c3'), true);
  });

  test('should reject slugs with uppercase', () => {
    assert.strictEqual(validateSlug('My-Story'), false);
  });

  test('should reject slugs with spaces', () => {
    assert.strictEqual(validateSlug('my story'), false);
  });

  test('should reject slugs that are too short', () => {
    assert.strictEqual(validateSlug('a'), false);
  });

  test('should reject slugs with underscores', () => {
    assert.strictEqual(validateSlug('story_name'), false);
  });

  test('should reject slugs with consecutive hyphens', () => {
    assert.strictEqual(validateSlug('my--story'), false);
  });

  test('should reject slugs starting with hyphen', () => {
    assert.strictEqual(validateSlug('-my-story'), false);
  });

  test('should reject slugs ending with hyphen', () => {
    assert.strictEqual(validateSlug('my-story-'), false);
  });

  test('should reject null', () => {
    assert.strictEqual(validateSlug(null), false);
  });

  test('should reject undefined', () => {
    assert.strictEqual(validateSlug(undefined), false);
  });

  test('should reject non-string', () => {
    assert.strictEqual(validateSlug(123), false);
  });
});

describe('sanitizeForSlug', () => {
  test('should strip HTML tags', () => {
    const result = sanitizeForSlug('<script>alert("xss")</script>Hello');
    // Quotes are also removed by sanitizeForSlug as they are dangerous characters
    assert.strictEqual(result, 'alert(xss)Hello');
  });

  test('should remove dangerous characters', () => {
    const result = sanitizeForSlug('Hello<>&"\'World');
    assert.strictEqual(result, 'HelloWorld');
  });

  test('should truncate to 255 characters', () => {
    const long = 'A'.repeat(300);
    const result = sanitizeForSlug(long);
    assert.strictEqual(result.length, 255);
  });

  test('should return empty string for null', () => {
    assert.strictEqual(sanitizeForSlug(null), '');
  });

  test('should return empty string for undefined', () => {
    assert.strictEqual(sanitizeForSlug(undefined), '');
  });
});

describe('SlugService', () => {
  let service;

  beforeEach(() => {
    service = new SlugService();
  });

  test('should generate unique slug asynchronously', async () => {
    const getExistingSlugs = async () => ['existing-slug'];
    const slug = await service.generateUniqueSlug('Test Title', getExistingSlugs);
    assert.strictEqual(slug, 'test-title');
  });

  test('should handle collision with async check', async () => {
    const getExistingSlugs = async () => ['test-title', 'test-title-1'];
    const slug = await service.generateUniqueSlug('Test Title', getExistingSlugs);
    assert.strictEqual(slug, 'test-title-2');
  });

  test('should validate slugs', () => {
    assert.strictEqual(service.validateSlug('valid-slug'), true);
    assert.strictEqual(service.validateSlug('INVALID'), false);
  });
});
