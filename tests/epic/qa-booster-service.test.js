/**
 * @fileoverview Unit tests for QA Booster Service (AI-powered)
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';

import { QABoosterService } from '../../src/epic/services/qa-booster-service.js';
import {
  TEST_PRIORITY,
  TEST_CATEGORY,
  TEST_STATUS,
  sanitizeTestTitle,
  sanitizeMarkdown,
  calculateMetadata,
  MAX_TITLE_LENGTH,
} from '../../src/epic/models/qa-booster.js';

// Test directory setup
let testRoot;
let promptsDir;

beforeEach(async () => {
  testRoot = path.join(
    os.tmpdir(),
    `qa-booster-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await fs.ensureDir(testRoot);

  // Create .aia/prompts directory with qa.md prompt
  promptsDir = path.join(testRoot, '.aia', 'prompts');
  await fs.ensureDir(promptsDir);
  await fs.writeFile(
    path.join(promptsDir, 'qa.md'),
    `You are a QA engineer. Generate a test plan.

## Output Format
Generate markdown with test cases using:
- [ ] **[TC-F001]** 🔴 Test title

Include sections for Functional, API, UI, Security, and Edge Cases.`
  );
});

afterEach(async () => {
  if (testRoot) {
    await fs.remove(testRoot);
  }
});

describe('QABoosterService', () => {
  let service;

  beforeEach(() => {
    service = new QABoosterService();
    service.setRoot(testRoot);
  });

  describe('loadSourceDocuments', () => {
    test('loads dev-plan.md, implement.md, review.md', async () => {
      const featurePath = path.join(testRoot, 'my-feature');
      await fs.ensureDir(featurePath);

      await fs.writeFile(path.join(featurePath, 'dev-plan.md'), '# Dev Plan\n\nTask 1: Create API');
      await fs.writeFile(path.join(featurePath, 'implement.md'), '# Implementation\n\nAdded endpoint');
      await fs.writeFile(path.join(featurePath, 'review.md'), '# Review\n\nLooks good');

      const docs = await service.loadSourceDocuments(featurePath);

      assert.ok(docs.devPlan.includes('Dev Plan'));
      assert.ok(docs.implement.includes('Implementation'));
      assert.ok(docs.review.includes('Review'));
    });

    test('loads fallback documents when primary are missing', async () => {
      const featurePath = path.join(testRoot, 'legacy-feature');
      await fs.ensureDir(featurePath);

      await fs.writeFile(path.join(featurePath, 'tech-spec.md'), '# Tech Spec');
      await fs.writeFile(path.join(featurePath, 'ba-spec.md'), '# BA Spec');

      const docs = await service.loadSourceDocuments(featurePath);

      assert.ok(docs.techSpec.includes('Tech Spec'));
      assert.ok(docs.baSpec.includes('BA Spec'));
      assert.strictEqual(docs.devPlan, '');
      assert.strictEqual(docs.implement, '');
    });

    test('returns empty strings for missing files', async () => {
      const featurePath = path.join(testRoot, 'empty-feature');
      await fs.ensureDir(featurePath);

      const docs = await service.loadSourceDocuments(featurePath);

      assert.strictEqual(docs.devPlan, '');
      assert.strictEqual(docs.implement, '');
      assert.strictEqual(docs.review, '');
      assert.strictEqual(docs.techSpec, '');
      assert.strictEqual(docs.baSpec, '');
      assert.strictEqual(docs.spec, '');
    });
  });

  describe('validate', () => {
    test('returns true when at least one document exists', () => {
      assert.strictEqual(service.validate({ devPlan: '# Content' }), true);
      assert.strictEqual(service.validate({ implement: '# Content' }), true);
      assert.strictEqual(service.validate({ review: '# Content' }), true);
      assert.strictEqual(service.validate({ techSpec: '# Content' }), true);
    });

    test('returns false when no documents exist', () => {
      assert.strictEqual(service.validate({}), false);
      assert.strictEqual(service.validate({
        devPlan: '',
        implement: '',
        review: '',
        techSpec: '',
        baSpec: '',
        spec: '',
      }), false);
    });
  });

  describe('buildPrompt', () => {
    test('includes all available source documents', () => {
      const docs = {
        devPlan: '# Dev Plan Content',
        implement: '# Implement Content',
        review: '# Review Content',
      };
      const promptTemplate = 'Generate QA tests';

      const prompt = service.buildPrompt(docs, 'Test Feature', promptTemplate);

      assert.ok(prompt.includes('Feature: Test Feature'));
      assert.ok(prompt.includes('=== DEV PLAN ==='));
      assert.ok(prompt.includes('Dev Plan Content'));
      assert.ok(prompt.includes('=== IMPLEMENTATION NOTES ==='));
      assert.ok(prompt.includes('=== CODE REVIEW ==='));
      assert.ok(prompt.includes('=== TASK ==='));
      assert.ok(prompt.includes('Generate QA tests'));
    });

    test('uses fallback docs when primary are missing', () => {
      const docs = {
        devPlan: '',
        implement: '',
        techSpec: '# Tech Spec',
        baSpec: '# BA Spec',
      };
      const promptTemplate = 'Generate QA tests';

      const prompt = service.buildPrompt(docs, 'Test Feature', promptTemplate);

      assert.ok(prompt.includes('=== TECH SPEC ==='));
      assert.ok(prompt.includes('=== BA SPEC ==='));
    });
  });

  describe('resolveOutputPath', () => {
    test('returns default qa.md path', () => {
      const featurePath = '/some/feature/path';
      const outputPath = service.resolveOutputPath(featurePath);

      assert.strictEqual(outputPath, path.join(featurePath, 'qa.md'));
    });

    test('respects custom outputPath config', () => {
      service.updateConfig({ outputPath: 'tests/qa-plan.md' });
      const featurePath = '/some/feature/path';
      const outputPath = service.resolveOutputPath(featurePath);

      assert.strictEqual(outputPath, path.join(featurePath, 'tests/qa-plan.md'));
    });

    test('throws on path traversal attempt', () => {
      service.updateConfig({ outputPath: '../../../etc/passwd' });

      assert.throws(() => {
        service.resolveOutputPath('/some/feature/path');
      }, /Output path must be within feature directory/);
    });
  });

  describe('parseCheckboxStates', () => {
    test('extracts checkbox states from markdown', () => {
      const markdown = `
# QA Plan

## Tests

- [ ] **[TC-F001]** 🔴 Unchecked test
- [x] **[TC-F002]** 🟠 Checked test
- [ ] **[TC-A001]** 🟡 Another unchecked
`;

      const states = service.parseCheckboxStates(markdown);

      assert.strictEqual(states.size, 3);
      assert.strictEqual(states.get('TC-F001'), ' ');
      assert.strictEqual(states.get('TC-F002'), 'x');
      assert.strictEqual(states.get('TC-A001'), ' ');
    });

    test('returns empty map for content without checkboxes', () => {
      const markdown = '# No checkboxes here';
      const states = service.parseCheckboxStates(markdown);

      assert.strictEqual(states.size, 0);
    });
  });

  describe('preserveCheckboxStates', () => {
    test('preserves checked states in new content', async () => {
      const featurePath = path.join(testRoot, 'preserve-test');
      await fs.ensureDir(featurePath);

      // Create existing file with checked checkbox
      const existingContent = `
# QA Plan

- [x] **[TC-F001]** 🔴 Completed test
- [ ] **[TC-F002]** 🟠 Pending test
`;
      await fs.writeFile(path.join(featurePath, 'qa.md'), existingContent);

      // New content with same test IDs but unchecked
      const newContent = `
# QA Plan (Regenerated)

- [ ] **[TC-F001]** 🔴 Test one
- [ ] **[TC-F002]** 🟠 Test two
- [ ] **[TC-F003]** 🟡 New test
`;

      service.updateConfig({});
      const result = await service.preserveCheckboxStates(
        path.join(featurePath, 'qa.md'),
        newContent
      );

      // TC-F001 should be preserved as checked
      assert.ok(result.includes('- [x] **[TC-F001]**'));
      // TC-F002 was unchecked, stays unchecked
      assert.ok(result.includes('- [ ] **[TC-F002]**'));
      // TC-F003 is new, stays unchecked
      assert.ok(result.includes('- [ ] **[TC-F003]**'));
    });
  });

  describe('writeAtomically', () => {
    test('writes file atomically', async () => {
      const outputPath = path.join(testRoot, 'atomic-test.md');
      const content = '# Test Content';

      await service.writeAtomically(outputPath, content);

      assert.ok(await fs.pathExists(outputPath));
      const written = await fs.readFile(outputPath, 'utf-8');
      assert.strictEqual(written, content);
    });

    test('creates parent directories', async () => {
      const outputPath = path.join(testRoot, 'nested', 'dir', 'test.md');
      const content = '# Nested Content';

      await service.writeAtomically(outputPath, content);

      assert.ok(await fs.pathExists(outputPath));
    });

    test('cleans up temp file on error', async () => {
      // Create a directory where the file should be (will cause rename to fail)
      const outputPath = path.join(testRoot, 'conflict-dir');
      await fs.ensureDir(outputPath);

      await assert.rejects(async () => {
        await service.writeAtomically(outputPath, 'content');
      }, /Failed to write QA file/);

      // Check no temp files left
      const files = await fs.readdir(testRoot);
      const tempFiles = files.filter(f => f.includes('.tmp.'));
      assert.strictEqual(tempFiles.length, 0);
    });
  });

  describe('getStats', () => {
    test('returns stats for existing QA file', async () => {
      const featurePath = path.join(testRoot, 'stats-test');
      await fs.ensureDir(featurePath);

      const qaContent = `
# QA Plan

## Functional Tests
- [x] **[TC-F001]** 🔴 Test 1
- [ ] **[TC-F002]** 🟠 Test 2
- [x] **[TC-F003]** 🟡 Test 3

## API Tests
- [ ] **[TC-A001]** 🔴 API Test 1
- [x] **[TC-A002]** 🟠 API Test 2

## Security Tests
- [ ] **[TC-S001]** 🔴 Security Test
`;
      await fs.writeFile(path.join(featurePath, 'qa.md'), qaContent);

      const stats = await service.getStats(featurePath);

      assert.strictEqual(stats.exists, true);
      assert.strictEqual(stats.totalTests, 6);
      assert.strictEqual(stats.completed, 3);
      assert.strictEqual(stats.pending, 3);
      assert.strictEqual(stats.byCategory.functional.total, 3);
      assert.strictEqual(stats.byCategory.functional.completed, 2);
      assert.strictEqual(stats.byCategory.api.total, 2);
      assert.strictEqual(stats.byCategory.api.completed, 1);
      assert.strictEqual(stats.byCategory.security.total, 1);
      assert.strictEqual(stats.byCategory.security.completed, 0);
    });

    test('returns exists: false when file does not exist', async () => {
      const featurePath = path.join(testRoot, 'no-qa');
      await fs.ensureDir(featurePath);

      const stats = await service.getStats(featurePath);

      assert.strictEqual(stats.exists, false);
      assert.strictEqual(stats.totalTests, 0);
    });
  });

  describe('config management', () => {
    test('updateConfig merges new config', () => {
      service.updateConfig({ model: 'gpt-4' });
      const config = service.getConfig();

      assert.strictEqual(config.model, 'gpt-4');
    });

    test('getConfig returns a copy', () => {
      const config1 = service.getConfig();
      config1.model = 'modified';
      const config2 = service.getConfig();

      assert.notStrictEqual(config2.model, 'modified');
    });
  });
});

describe('QA Model Functions', () => {
  test('sanitizeTestTitle removes markdown special chars', () => {
    const sanitized = sanitizeTestTitle('Test [with] *markdown* `chars`');
    assert.ok(!sanitized.includes('['));
    assert.ok(!sanitized.includes(']'));
    assert.ok(!sanitized.includes('*'));
    assert.ok(!sanitized.includes('`'));
  });

  test('sanitizeTestTitle removes HTML tags', () => {
    const sanitized = sanitizeTestTitle('Test <script>alert("xss")</script>');
    assert.ok(!sanitized.includes('<script>'));
    assert.ok(!sanitized.includes('</script>'));
  });

  test('sanitizeTestTitle limits length', () => {
    const longTitle = 'x'.repeat(300);
    const sanitized = sanitizeTestTitle(longTitle);
    assert.strictEqual(sanitized.length, MAX_TITLE_LENGTH);
  });

  test('sanitizeTestTitle handles null/undefined', () => {
    assert.strictEqual(sanitizeTestTitle(null), '');
    assert.strictEqual(sanitizeTestTitle(undefined), '');
    assert.strictEqual(sanitizeTestTitle(''), '');
  });

  test('sanitizeMarkdown removes script tags', () => {
    const content = '<script>alert("xss")</script>Safe content';
    const sanitized = sanitizeMarkdown(content);
    assert.ok(!sanitized.includes('<script>'));
    assert.ok(sanitized.includes('Safe content'));
  });

  test('sanitizeMarkdown removes javascript: URLs', () => {
    const content = 'Click here: javascript:alert("xss")';
    const sanitized = sanitizeMarkdown(content);
    assert.ok(!sanitized.includes('javascript:'));
  });

  test('calculateMetadata computes correct counts', () => {
    const sections = [
      {
        id: 'SEC-1',
        title: 'Test',
        testCases: [
          { status: TEST_STATUS.CHECKED, category: TEST_CATEGORY.FUNCTIONAL },
          { status: TEST_STATUS.UNCHECKED, category: TEST_CATEGORY.API },
          { status: TEST_STATUS.BLOCKED, category: TEST_CATEGORY.SECURITY },
        ],
      },
    ];

    const metadata = calculateMetadata(sections);
    assert.strictEqual(metadata.totalTests, 3);
    assert.strictEqual(metadata.passedTests, 1);
    assert.strictEqual(metadata.blockedTests, 1);
  });

  test('calculateMetadata handles empty sections', () => {
    const metadata = calculateMetadata([]);
    assert.strictEqual(metadata.totalTests, 0);
    assert.strictEqual(metadata.passedTests, 0);
    assert.strictEqual(metadata.coverage.functional, 0);
  });
});

describe('Security', () => {
  let service;

  beforeEach(() => {
    service = new QABoosterService();
    service.setRoot(testRoot);
  });

  test('prevents path traversal in output path', () => {
    service.updateConfig({ outputPath: '../../../outside/qa.md' });

    assert.throws(() => {
      service.resolveOutputPath('/project/features/my-feature');
    }, /Output path must be within feature directory/);
  });

  test('prevents path traversal in output dir', () => {
    service.updateConfig({ outputDir: '../../outside' });

    assert.throws(() => {
      service.resolveOutputPath('/project/features/my-feature');
    }, /Output directory must be within feature directory/);
  });
});
