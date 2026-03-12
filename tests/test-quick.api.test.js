/**
 * @fileoverview Integration tests for test-quick API routes
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import http from 'node:http';

import { createRouter, parseBody, json, error } from '../src/ui/router.js';
import { registerTestQuickRoutes } from '../src/ui/api/test-quick.js';

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
  testRoot = path.join(os.tmpdir(), `test-quick-api-test-${Date.now()}`);
  await fs.ensureDir(path.join(testRoot, '.aia'));

  router = createRouter();
  registerTestQuickRoutes(router);
});

afterEach(async () => {
  if (testRoot) {
    await fs.remove(testRoot);
  }
});

describe('test-quick API routes', () => {
  describe('GET /api/test-quick', () => {
    test('returns empty list initially', async () => {
      const { status, body } = await callRoute('GET', '/api/test-quick');

      assert.strictEqual(status, 200);
      assert.strictEqual(body.success, true);
      assert.deepStrictEqual(body.items, []);
    });

    test('returns all items', async () => {
      // Create items first
      await callRoute('POST', '/api/test-quick', { name: 'item-a' });
      await callRoute('POST', '/api/test-quick', { name: 'item-b' });

      const { status, body } = await callRoute('GET', '/api/test-quick');

      assert.strictEqual(status, 200);
      assert.strictEqual(body.items.length, 2);
    });
  });

  describe('POST /api/test-quick', () => {
    test('creates item successfully', async () => {
      const { status, body } = await callRoute('POST', '/api/test-quick', {
        name: 'new-item',
        description: 'Test item',
      });

      assert.strictEqual(status, 201);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.name, 'new-item');
    });

    test('returns 400 for missing name', async () => {
      const { status, body } = await callRoute('POST', '/api/test-quick', {});

      assert.strictEqual(status, 400);
      assert.ok(body.error.includes('Name is required'));
    });

    test('returns 400 for invalid name', async () => {
      const { status, body } = await callRoute('POST', '/api/test-quick', {
        name: 'Invalid Name!',
      });

      assert.strictEqual(status, 400);
      assert.ok(body.error.includes('Invalid name'));
    });

    test('returns 400 for duplicate name', async () => {
      await callRoute('POST', '/api/test-quick', { name: 'duplicate' });
      const { status, body } = await callRoute('POST', '/api/test-quick', { name: 'duplicate' });

      assert.strictEqual(status, 400);
      assert.ok(body.error.includes('already exists'));
    });
  });

  describe('GET /api/test-quick/:name', () => {
    test('returns item when exists', async () => {
      await callRoute('POST', '/api/test-quick', { name: 'get-test' });
      const { status, body } = await callRoute('GET', '/api/test-quick/get-test');

      assert.strictEqual(status, 200);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.name, 'get-test');
    });

    test('returns 404 when item not found', async () => {
      const { status, body } = await callRoute('GET', '/api/test-quick/non-existent');

      assert.strictEqual(status, 404);
      assert.ok(body.error.includes('not found'));
    });
  });

  describe('PUT /api/test-quick/:name', () => {
    test('updates item description', async () => {
      await callRoute('POST', '/api/test-quick', { name: 'update-test' });
      const { status, body } = await callRoute('PUT', '/api/test-quick/update-test', {
        description: 'Updated description',
      });

      assert.strictEqual(status, 200);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.description, 'Updated description');
    });

    test('updates item status', async () => {
      await callRoute('POST', '/api/test-quick', { name: 'status-test' });
      const { status, body } = await callRoute('PUT', '/api/test-quick/status-test', {
        status: 'active',
      });

      assert.strictEqual(status, 200);
      assert.strictEqual(body.data.status, 'active');
    });

    test('returns 400 for invalid status', async () => {
      await callRoute('POST', '/api/test-quick', { name: 'invalid-status' });
      const { status, body } = await callRoute('PUT', '/api/test-quick/invalid-status', {
        status: 'invalid',
      });

      assert.strictEqual(status, 400);
      assert.ok(body.error.includes('Invalid status'));
    });

    test('returns 400 when no updates provided', async () => {
      await callRoute('POST', '/api/test-quick', { name: 'no-update' });
      const { status, body } = await callRoute('PUT', '/api/test-quick/no-update', {});

      assert.strictEqual(status, 400);
      assert.ok(body.error.includes('No valid updates'));
    });
  });

  describe('PATCH /api/test-quick/:name/status', () => {
    test('updates status', async () => {
      await callRoute('POST', '/api/test-quick', { name: 'patch-status' });
      const { status, body } = await callRoute('PATCH', '/api/test-quick/patch-status/status', {
        status: 'completed',
      });

      assert.strictEqual(status, 200);
      assert.strictEqual(body.data.status, 'completed');
    });

    test('returns 400 for missing status', async () => {
      await callRoute('POST', '/api/test-quick', { name: 'missing-status' });
      const { status, body } = await callRoute('PATCH', '/api/test-quick/missing-status/status', {});

      assert.strictEqual(status, 400);
      assert.ok(body.error.includes('Status is required'));
    });
  });

  describe('DELETE /api/test-quick/:name', () => {
    test('deletes item', async () => {
      await callRoute('POST', '/api/test-quick', { name: 'delete-test' });
      const { status, body } = await callRoute('DELETE', '/api/test-quick/delete-test');

      assert.strictEqual(status, 200);
      assert.strictEqual(body.success, true);

      // Verify deletion
      const getResult = await callRoute('GET', '/api/test-quick/delete-test');
      assert.strictEqual(getResult.status, 404);
    });

    test('returns 404 when item not found', async () => {
      const { status, body } = await callRoute('DELETE', '/api/test-quick/non-existent');

      assert.strictEqual(status, 404);
      assert.ok(body.error.includes('not found'));
    });
  });

  describe('POST /api/test-quick/clear-completed', () => {
    test('clears completed items', async () => {
      await callRoute('POST', '/api/test-quick', { name: 'pending-item' });
      await callRoute('POST', '/api/test-quick', { name: 'completed-item' });
      await callRoute('PATCH', '/api/test-quick/completed-item/status', { status: 'completed' });

      const { status, body } = await callRoute('POST', '/api/test-quick/clear-completed');

      assert.strictEqual(status, 200);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.cleared, 1);

      // Verify only pending item remains
      const listResult = await callRoute('GET', '/api/test-quick');
      assert.strictEqual(listResult.body.items.length, 1);
      assert.strictEqual(listResult.body.items[0].name, 'pending-item');
    });
  });

  describe('GET /api/test-quick/statuses', () => {
    test('returns available statuses', async () => {
      const { status, body } = await callRoute('GET', '/api/test-quick/statuses');

      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(body.statuses));
      assert.ok(body.statuses.includes('pending'));
      assert.ok(body.statuses.includes('active'));
      assert.ok(body.statuses.includes('completed'));
      assert.ok(body.statuses.includes('error'));
    });
  });
});
