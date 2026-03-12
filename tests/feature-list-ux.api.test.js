/**
 * @fileoverview Integration tests for feature list UX improvements
 * Tests lazy loading, filtering, sorting, and post-creation navigation
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import http from 'node:http';

import { createRouter, parseBody, json, error } from '../src/ui/router.js';
import { registerFeatureRoutes } from '../src/ui/api/features.js';
import { createFeature } from '../src/services/feature.js';
import { loadStatus, updateStepStatus } from '../src/services/status.js';

// Test directory setup
let testRoot;
let router;

/**
 * Creates a mock request object
 * @param {string} method - HTTP method
 * @param {string} url - URL path with optional query string
 * @param {Object|null} body - Request body
 * @returns {Object} Mock request object
 */
function mockRequest(method, url, body = null) {
  const req = new http.IncomingMessage();
  req.method = method;
  req.url = url;

  // Parse query string
  const urlParts = url.split('?');
  req.pathname = urlParts[0];
  req.query = {};
  if (urlParts[1]) {
    urlParts[1].split('&').forEach(param => {
      const [key, value] = param.split('=');
      req.query[key] = decodeURIComponent(value);
    });
  }

  // Body handling
  if (body) {
    req._body = JSON.stringify(body);
  }

  // Override on method to handle body
  const originalOn = req.on.bind(req);
  req.on = (event, handler) => {
    if (event === 'data' && req._body) {
      setTimeout(() => handler(Buffer.from(req._body)), 0);
      return req;
    }
    if (event === 'end') {
      setTimeout(() => handler(), 0);
      return req;
    }
    return originalOn(event, handler);
  };

  return req;
}

/**
 * Creates a mock response object
 * @returns {Object} Mock response object
 */
function mockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    headersSent: false,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = { ...this.headers, ...headers };
      this.headersSent = true;
    },
    end(data) {
      if (data) this.body = data;
    },
    write(data) {
      this.body += data;
    },
    getBody() {
      try {
        return JSON.parse(this.body);
      } catch {
        return this.body;
      }
    }
  };
  return res;
}

/**
 * Helper to call a route
 * @param {string} method - HTTP method
 * @param {string} url - URL path
 * @param {Object|null} body - Request body
 * @returns {Promise<{status: number, body: Object}>}
 */
async function callRoute(method, url, body = null) {
  const req = mockRequest(method, url, body);
  const res = mockResponse();

  const match = router.match(method, req.pathname);
  if (!match) {
    return { status: 404, body: { error: 'Route not found' } };
  }

  const options = {
    params: match.params,
    root: testRoot,
    query: req.query,
    parseBody: () => parseBody(req),
  };

  await match.handler(req, res, options);

  return { status: res.statusCode, body: res.getBody() };
}

/**
 * Helper to mark all steps as done for a feature
 * @param {string} featureName - Feature name
 * @param {boolean} isQuick - Whether feature is quick flow
 */
async function markFeatureCompleted(featureName, isQuick = false) {
  const steps = isQuick
    ? ['dev-plan', 'implement', 'review']
    : ['brief', 'ba-spec', 'questions', 'tech-spec', 'challenge', 'dev-plan', 'implement', 'review'];

  for (const step of steps) {
    await updateStepStatus(featureName, step, 'done', testRoot);
  }
}

beforeEach(async () => {
  testRoot = path.join(os.tmpdir(), `feature-list-ux-test-${Date.now()}`);
  await fs.ensureDir(path.join(testRoot, '.aia', 'features'));

  router = createRouter();
  registerFeatureRoutes(router);
});

afterEach(async () => {
  if (testRoot) {
    await fs.remove(testRoot);
  }
});

describe('Feature List UX Improvements', () => {
  describe('Lazy Loading - Minimal Mode API', () => {
    test('minimal=true returns basic feature data without computed states', async () => {
      await createFeature('lazy-load-test', testRoot);

      const { status, body } = await callRoute('GET', '/api/features?minimal=true');

      assert.strictEqual(status, 200);
      assert.strictEqual(body.length, 1);

      const feature = body[0];
      assert.strictEqual(feature.name, 'lazy-load-test');
      assert.ok('type' in feature, 'Should have type field');
      assert.ok('flow' in feature, 'Should have flow field');
      assert.ok('createdAt' in feature, 'Should have createdAt field');
      assert.ok('hasWorktree' in feature, 'Should have hasWorktree field for filtering');
      // Minimal mode should NOT have full steps object
      assert.ok(!feature.steps || Object.keys(feature.steps || {}).length === 0,
        'Minimal mode should not include full steps data');
    });

    test('minimal=false (default) returns full feature data', async () => {
      await createFeature('full-load-test', testRoot);

      const { status, body } = await callRoute('GET', '/api/features');

      assert.strictEqual(status, 200);
      assert.strictEqual(body.length, 1);

      const feature = body[0];
      assert.strictEqual(feature.name, 'full-load-test');
      assert.ok(feature.steps, 'Full mode should include steps');
      assert.ok('agentRunning' in feature, 'Full mode should include agentRunning');
    });

    test('individual feature endpoint returns full data for lazy card loading', async () => {
      await createFeature('card-lazy-load', testRoot);

      const { status, body } = await callRoute('GET', '/api/features/card-lazy-load');

      assert.strictEqual(status, 200);
      assert.strictEqual(body.name, 'card-lazy-load');
      assert.ok(body.steps, 'Individual feature should include steps');
      assert.ok(body.files, 'Individual feature should include files');
    });

    test('minimal mode works with deletion filter', async () => {
      await createFeature('active-minimal', testRoot);
      await createFeature('deleted-minimal', testRoot);
      await callRoute('DELETE', '/api/features/deleted-minimal');

      // Test active filter with minimal
      let result = await callRoute('GET', '/api/features?filter=active&minimal=true');
      assert.strictEqual(result.body.length, 1);
      assert.strictEqual(result.body[0].name, 'active-minimal');

      // Test deleted filter with minimal
      result = await callRoute('GET', '/api/features?filter=deleted&minimal=true');
      assert.strictEqual(result.body.length, 1);
      assert.strictEqual(result.body[0].name, 'deleted-minimal');
      assert.strictEqual(result.body[0].isDeleted, true);
    });
  });

  describe('Sorting Features', () => {
    beforeEach(async () => {
      // Create features with different timestamps by adding delays
      await createFeature('zebra-feature', testRoot);
      await new Promise(r => setTimeout(r, 10)); // Small delay for timestamp difference
      await createFeature('apple-feature', testRoot);
      await new Promise(r => setTimeout(r, 10));
      await createFeature('mango-feature', testRoot);
    });

    test('features have createdAt timestamp for date sorting', async () => {
      const { status, body } = await callRoute('GET', '/api/features?minimal=true');

      assert.strictEqual(status, 200);
      assert.strictEqual(body.length, 3);

      // All features should have createdAt timestamps
      body.forEach(feature => {
        assert.ok(feature.createdAt, `Feature ${feature.name} should have createdAt`);
        assert.ok(!isNaN(new Date(feature.createdAt).getTime()), 'createdAt should be valid date');
      });
    });

    test('features have name field for alphabetical sorting', async () => {
      const { status, body } = await callRoute('GET', '/api/features?minimal=true');

      assert.strictEqual(status, 200);

      const names = body.map(f => f.name);
      assert.ok(names.includes('zebra-feature'));
      assert.ok(names.includes('apple-feature'));
      assert.ok(names.includes('mango-feature'));
    });
  });

  describe('Filtering by Completion Status', () => {
    beforeEach(async () => {
      // Create features with different completion states
      await createFeature('in-progress-feature', testRoot);
      await createFeature('completed-feature', testRoot, { type: 'feature', flow: 'quick' });
      await createFeature('another-active', testRoot);

      // Mark one feature as completed (quick flow: dev-plan, implement, review)
      await markFeatureCompleted('completed-feature', true);
    });

    test('completed features have all steps marked as done', async () => {
      const { status, body } = await callRoute('GET', '/api/features/completed-feature');

      assert.strictEqual(status, 200);
      assert.ok(body.steps, 'Feature should have steps');

      // Quick flow steps should all be done
      const quickSteps = ['dev-plan', 'implement', 'review'];
      quickSteps.forEach(step => {
        assert.strictEqual(body.steps[step], 'done', `Step ${step} should be done`);
      });
    });

    test('in-progress features have pending or in-progress steps', async () => {
      const { status, body } = await callRoute('GET', '/api/features/in-progress-feature');

      assert.strictEqual(status, 200);
      assert.ok(body.steps, 'Feature should have steps');

      // Check that not all steps are done
      const allDone = Object.values(body.steps).every(s => s === 'done');
      assert.ok(!allDone, 'In-progress feature should not have all steps done');
    });

    test('feature data includes flow type for completion checking', async () => {
      const result = await callRoute('GET', '/api/features?minimal=true');

      assert.strictEqual(result.status, 200);
      result.body.forEach(feature => {
        assert.ok('flow' in feature, `Feature ${feature.name} should have flow type`);
        assert.ok(['quick', 'full'].includes(feature.flow), 'Flow should be quick or full');
      });
    });
  });

  describe('Feature Type Filtering', () => {
    beforeEach(async () => {
      await createFeature('feature-one', testRoot, { type: 'feature' });
      await createFeature('bug-one', testRoot, { type: 'bug' });
      await createFeature('feature-two', testRoot, { type: 'feature' });
    });

    test('features have type field for filtering', async () => {
      const { status, body } = await callRoute('GET', '/api/features?minimal=true');

      assert.strictEqual(status, 200);
      assert.strictEqual(body.length, 3);

      const types = body.map(f => f.type);
      assert.ok(types.includes('feature'));
      assert.ok(types.includes('bug'));
    });

    test('feature type is preserved in minimal mode', async () => {
      const { status, body } = await callRoute('GET', '/api/features?minimal=true');

      assert.strictEqual(status, 200);

      const bugFeature = body.find(f => f.name === 'bug-one');
      assert.strictEqual(bugFeature.type, 'bug');

      const regularFeature = body.find(f => f.name === 'feature-one');
      assert.strictEqual(regularFeature.type, 'feature');
    });
  });

  describe('Post-Creation Navigation', () => {
    test('create feature returns feature name for navigation', async () => {
      const { status, body } = await callRoute('POST', '/api/features', {
        name: 'new-navigation-test',
        type: 'feature',
        apps: []
      });

      assert.strictEqual(status, 201);
      assert.strictEqual(body.ok, true);
      assert.strictEqual(body.name, 'new-navigation-test');
    });

    test('create bug returns bug name for navigation', async () => {
      const { status, body } = await callRoute('POST', '/api/features', {
        name: 'new-bug-test',
        type: 'bug',
        apps: []
      });

      assert.strictEqual(status, 201);
      assert.strictEqual(body.ok, true);
      assert.strictEqual(body.name, 'new-bug-test');
      assert.strictEqual(body.type, 'bug');
    });

    test('created feature is immediately accessible by name', async () => {
      await callRoute('POST', '/api/features', {
        name: 'immediate-access',
        type: 'feature',
        apps: []
      });

      // Immediately fetch the created feature
      const { status, body } = await callRoute('GET', '/api/features/immediate-access');

      assert.strictEqual(status, 200);
      assert.strictEqual(body.name, 'immediate-access');
    });
  });

  describe('Worktree Filter Support', () => {
    test('hasWorktree field is included in minimal mode', async () => {
      await createFeature('wt-test-feature', testRoot);

      const { status, body } = await callRoute('GET', '/api/features?minimal=true');

      assert.strictEqual(status, 200);
      assert.strictEqual(body.length, 1);
      assert.ok('hasWorktree' in body[0], 'Should include hasWorktree for filtering');
      assert.strictEqual(typeof body[0].hasWorktree, 'boolean');
    });
  });

  describe('Combined Filtering Scenarios', () => {
    beforeEach(async () => {
      // Create a mix of features for combined filtering tests
      await createFeature('active-feature', testRoot, { type: 'feature' });
      await createFeature('active-bug', testRoot, { type: 'bug' });
      await createFeature('deleted-feature', testRoot, { type: 'feature' });
      await createFeature('completed-feature', testRoot, { type: 'feature', flow: 'quick' });

      // Delete one
      await callRoute('DELETE', '/api/features/deleted-feature');

      // Complete one
      await markFeatureCompleted('completed-feature', true);
    });

    test('can fetch all filter states in minimal mode', async () => {
      // Active features (default)
      let result = await callRoute('GET', '/api/features?filter=active&minimal=true');
      assert.strictEqual(result.status, 200);
      assert.ok(Array.isArray(result.body));

      // Deleted features
      result = await callRoute('GET', '/api/features?filter=deleted&minimal=true');
      assert.strictEqual(result.status, 200);
      assert.ok(Array.isArray(result.body));

      // All features
      result = await callRoute('GET', '/api/features?filter=all&minimal=true');
      assert.strictEqual(result.status, 200);
      assert.ok(Array.isArray(result.body));
    });

    test('deleted features have isDeleted flag in minimal mode', async () => {
      const { body } = await callRoute('GET', '/api/features?filter=deleted&minimal=true');

      assert.strictEqual(body.length, 1);
      assert.strictEqual(body[0].isDeleted, true);
    });

    test('active features have isDeleted=false in minimal mode', async () => {
      const { body } = await callRoute('GET', '/api/features?filter=active&minimal=true');

      body.forEach(feature => {
        assert.strictEqual(feature.isDeleted, false);
      });
    });
  });

  describe('Error Handling', () => {
    test('returns 404 for non-existent feature in lazy load', async () => {
      const { status, body } = await callRoute('GET', '/api/features/non-existent-feature');

      assert.strictEqual(status, 404);
      assert.ok(body.error);
    });

    test('handles invalid filter values gracefully', async () => {
      // Invalid filter should default to 'active'
      const { status, body } = await callRoute('GET', '/api/features?filter=invalid');

      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(body));
    });
  });

  describe('Performance - Minimal vs Full Mode', () => {
    beforeEach(async () => {
      // Create multiple features to test performance difference
      for (let i = 0; i < 5; i++) {
        await createFeature(`perf-test-${i}`, testRoot);
      }
    });

    test('minimal mode returns less data per feature', async () => {
      const minimalResult = await callRoute('GET', '/api/features?minimal=true');
      const fullResult = await callRoute('GET', '/api/features');

      assert.strictEqual(minimalResult.body.length, 5);
      assert.strictEqual(fullResult.body.length, 5);

      // Minimal mode features should have fewer keys
      const minimalKeys = Object.keys(minimalResult.body[0]);
      const fullKeys = Object.keys(fullResult.body[0]);

      assert.ok(minimalKeys.length < fullKeys.length,
        `Minimal mode (${minimalKeys.length} keys) should have fewer keys than full mode (${fullKeys.length} keys)`);
    });
  });
});
