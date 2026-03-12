/**
 * @fileoverview Integration tests for feature soft-delete API routes
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

// Test directory setup
let testRoot;
let router;

/**
 * Creates a mock request object
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

beforeEach(async () => {
  testRoot = path.join(os.tmpdir(), `feature-delete-api-test-${Date.now()}`);
  await fs.ensureDir(path.join(testRoot, '.aia', 'features'));

  router = createRouter();
  registerFeatureRoutes(router);
});

afterEach(async () => {
  if (testRoot) {
    await fs.remove(testRoot);
  }
});

describe('feature soft-delete API routes', () => {
  describe('DELETE /api/features/:name', () => {
    test('soft deletes feature successfully', async () => {
      // Create a feature first
      await createFeature('test-delete', testRoot);

      const { status, body } = await callRoute('DELETE', '/api/features/test-delete');

      assert.strictEqual(status, 200);
      assert.strictEqual(body.ok, true);
      assert.ok(body.deletedAt, 'Should return deletedAt timestamp');
    });

    test('returns 400 for non-existent feature', async () => {
      const { status, body } = await callRoute('DELETE', '/api/features/non-existent');

      assert.strictEqual(status, 400);
      assert.ok(body.error.includes('not found'));
    });

    test('deleted feature is excluded from active list', async () => {
      await createFeature('active-feature', testRoot);
      await createFeature('deleted-feature', testRoot);

      // Delete one feature
      await callRoute('DELETE', '/api/features/deleted-feature');

      // List active features (default filter)
      const { status, body } = await callRoute('GET', '/api/features');

      assert.strictEqual(status, 200);
      assert.strictEqual(body.length, 1);
      assert.strictEqual(body[0].name, 'active-feature');
    });
  });

  describe('POST /api/features/:name/restore', () => {
    test('restores deleted feature successfully', async () => {
      await createFeature('test-restore', testRoot);
      await callRoute('DELETE', '/api/features/test-restore');

      const { status, body } = await callRoute('POST', '/api/features/test-restore/restore');

      assert.strictEqual(status, 200);
      assert.strictEqual(body.ok, true);
    });

    test('restored feature appears in active list', async () => {
      await createFeature('restore-test', testRoot);
      await callRoute('DELETE', '/api/features/restore-test');

      // Verify it's not in active list
      let listResult = await callRoute('GET', '/api/features');
      assert.strictEqual(listResult.body.length, 0);

      // Restore it
      await callRoute('POST', '/api/features/restore-test/restore');

      // Verify it's back in active list
      listResult = await callRoute('GET', '/api/features');
      assert.strictEqual(listResult.body.length, 1);
      assert.strictEqual(listResult.body[0].name, 'restore-test');
    });

    test('returns 400 for non-existent feature', async () => {
      const { status, body } = await callRoute('POST', '/api/features/non-existent/restore');

      assert.strictEqual(status, 400);
      assert.ok(body.error.includes('not found'));
    });
  });

  describe('GET /api/features with filter', () => {
    beforeEach(async () => {
      // Create test features
      await createFeature('active-one', testRoot);
      await createFeature('active-two', testRoot);
      await createFeature('deleted-one', testRoot);

      // Delete one feature
      await callRoute('DELETE', '/api/features/deleted-one');
    });

    test('default filter returns only active features', async () => {
      const { status, body } = await callRoute('GET', '/api/features');

      assert.strictEqual(status, 200);
      assert.strictEqual(body.length, 2);
      const names = body.map(f => f.name);
      assert.ok(names.includes('active-one'));
      assert.ok(names.includes('active-two'));
      assert.ok(!names.includes('deleted-one'));
    });

    test('filter=active returns only active features', async () => {
      const { status, body } = await callRoute('GET', '/api/features?filter=active');

      assert.strictEqual(status, 200);
      assert.strictEqual(body.length, 2);
    });

    test('filter=deleted returns only deleted features', async () => {
      const { status, body } = await callRoute('GET', '/api/features?filter=deleted');

      assert.strictEqual(status, 200);
      assert.strictEqual(body.length, 1);
      assert.strictEqual(body[0].name, 'deleted-one');
      assert.strictEqual(body[0].isDeleted, true);
    });

    test('filter=all returns all features', async () => {
      const { status, body } = await callRoute('GET', '/api/features?filter=all');

      assert.strictEqual(status, 200);
      assert.strictEqual(body.length, 3);
    });

    test('isDeleted flag is set correctly', async () => {
      const { status, body } = await callRoute('GET', '/api/features?filter=all');

      assert.strictEqual(status, 200);

      const activeOne = body.find(f => f.name === 'active-one');
      const deletedOne = body.find(f => f.name === 'deleted-one');

      assert.strictEqual(activeOne.isDeleted, false);
      assert.strictEqual(deletedOne.isDeleted, true);
    });
  });

  describe('full delete-restore workflow', () => {
    test('user can delete feature, view it in deleted filter, and restore it', async () => {
      // Create a feature
      await createFeature('workflow-test', testRoot);

      // Step 1: Feature is in active list
      let result = await callRoute('GET', '/api/features');
      assert.strictEqual(result.body.length, 1);

      // Step 2: Delete the feature
      result = await callRoute('DELETE', '/api/features/workflow-test');
      assert.strictEqual(result.status, 200);

      // Step 3: Feature is no longer in active list
      result = await callRoute('GET', '/api/features');
      assert.strictEqual(result.body.length, 0);

      // Step 4: Feature appears in deleted filter
      result = await callRoute('GET', '/api/features?filter=deleted');
      assert.strictEqual(result.body.length, 1);
      assert.strictEqual(result.body[0].name, 'workflow-test');

      // Step 5: Restore the feature
      result = await callRoute('POST', '/api/features/workflow-test/restore');
      assert.strictEqual(result.status, 200);

      // Step 6: Feature is back in active list
      result = await callRoute('GET', '/api/features');
      assert.strictEqual(result.body.length, 1);
      assert.strictEqual(result.body[0].name, 'workflow-test');

      // Step 7: Feature no longer appears in deleted filter
      result = await callRoute('GET', '/api/features?filter=deleted');
      assert.strictEqual(result.body.length, 0);
    });
  });
});
