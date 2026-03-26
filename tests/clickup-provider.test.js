/**
 * @fileoverview Unit tests for ClickUpProvider with mock fetch
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ClickUpProvider } from '../src/providers/clickup-provider.js';

function createMockFetch(handlers = {}) {
  return async (url, options = {}) => {
    const method = options.method || 'GET';
    const key = `${method} ${url}`;

    // Find matching handler
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (key.includes(pattern) || url.includes(pattern)) {
        const result = typeof handler === 'function' ? handler(url, options) : handler;
        return {
          ok: result.status >= 200 && result.status < 300,
          status: result.status || 200,
          statusText: result.statusText || 'OK',
          headers: {
            get: (name) => result.headers?.[name] || null,
          },
          json: async () => result.body || {},
          text: async () => JSON.stringify(result.body || {}),
        };
      }
    }

    // Default 404
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: { get: () => null },
      json: async () => ({ err: 'Not Found' }),
      text: async () => '{"err":"Not Found"}',
    };
  };
}

function createProvider(fetchFn, overrides = {}) {
  return new ClickUpProvider({
    apiKey: 'test-api-key',
    workspaceId: 'ws-1',
    spaceId: 'sp-1',
    defaultListId: 'list-1',
    fetchFn,
    timeout: 5000,
    ...overrides,
  });
}

describe('ClickUpProvider', () => {

  describe('testConnection', () => {
    test('returns ok:true when API responds successfully', async () => {
      const mockFetch = createMockFetch({
        '/team': { status: 200, body: { teams: [{ id: 'ws-1', name: 'My Team' }] } },
      });
      const provider = createProvider(mockFetch);
      const result = await provider.testConnection();
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.teams[0].name, 'My Team');
    });

    test('returns ok:false when API returns 401', async () => {
      const mockFetch = createMockFetch({
        '/team': { status: 401, body: { err: 'Unauthorized' } },
      });
      const provider = createProvider(mockFetch);
      const result = await provider.testConnection();
      assert.strictEqual(result.ok, false);
      assert.ok(result.error.includes('auth'));
    });
  });

  describe('_request', () => {
    test('throws RateLimitError on 429', async () => {
      const mockFetch = createMockFetch({
        '/task/x': { status: 429, headers: { 'retry-after': '30' }, body: {} },
      });
      const provider = createProvider(mockFetch);
      await assert.rejects(
        () => provider._request('GET', '/task/x'),
        (err) => err.code === 'RATE_LIMITED' && err.retryAfter === 30,
      );
    });

    test('throws ExternalAPIError on 401', async () => {
      const mockFetch = createMockFetch({
        '/task/x': { status: 401, body: { err: 'Unauthorized' } },
      });
      const provider = createProvider(mockFetch);
      await assert.rejects(
        () => provider._request('GET', '/task/x'),
        (err) => err.code === 'EXTERNAL_API_ERROR' && err.apiStatusCode === 401,
      );
    });

    test('throws ExternalAPIError on 500', async () => {
      const mockFetch = createMockFetch({
        '/task/x': { status: 500, body: { err: 'Server error' } },
      });
      const provider = createProvider(mockFetch);
      await assert.rejects(
        () => provider._request('GET', '/task/x'),
        (err) => err.code === 'EXTERNAL_API_ERROR',
      );
    });

    test('throws TimeoutError on abort', async () => {
      const mockFetch = async () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      };
      const provider = createProvider(mockFetch);
      await assert.rejects(
        () => provider._request('GET', '/task/x'),
        (err) => err.code === 'TIMEOUT',
      );
    });
  });

  describe('browse', () => {
    test('browse workspaces returns workspace items', async () => {
      const mockFetch = createMockFetch({
        '/team': { status: 200, body: { teams: [{ id: 'ws-1', name: 'Workspace' }] } },
      });
      const provider = createProvider(mockFetch);
      const result = await provider.browse('workspaces');
      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.items[0].type, 'workspace');
    });

    test('browse spaces returns space items', async () => {
      const mockFetch = createMockFetch({
        '/space': { status: 200, body: { spaces: [{ id: 'sp-1', name: 'Space 1' }] } },
      });
      const provider = createProvider(mockFetch);
      const result = await provider.browse('spaces', 'ws-1');
      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.items[0].type, 'space');
    });

    test('browse tasks returns task items', async () => {
      const mockFetch = createMockFetch({
        '/list/list-1/task': {
          status: 200,
          body: {
            tasks: [
              { id: 't-1', name: 'Task 1', status: { status: 'to do' }, url: 'https://app.clickup.com/t/t-1', date_updated: '1711234567000' },
            ],
          },
        },
      });
      const provider = createProvider(mockFetch);
      const result = await provider.browse('tasks', 'list-1');
      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.items[0].type, 'task');
      assert.strictEqual(result.items[0].name, 'Task 1');
    });
  });

  describe('pushStory', () => {
    test('creates a new task when no existingTaskId', async () => {
      let createdBody;
      const mockFetch = createMockFetch({
        'POST': (url, opts) => {
          if (url.includes('/list/') && url.includes('/task')) {
            createdBody = opts.body ? JSON.parse(opts.body) : {};
            return { status: 200, body: { id: 'new-task-1', url: 'https://app.clickup.com/t/new-task-1' } };
          }
          if (url.includes('/attachment')) return { status: 200, body: {} };
          return { status: 200, body: {} };
        },
        'GET': { status: 200, body: { attachments: [] } },
      });
      const provider = createProvider(mockFetch);
      const result = await provider.pushStory('my-story', {
        name: 'My Story',
        status: 'pending',
        steps: {
          init: { content: '# My Story\nDescription here' },
        },
      });
      assert.strictEqual(result.taskId, 'new-task-1');
      assert.ok(result.url.includes('new-task-1'));
    });

    test('updates existing task when existingTaskId provided', async () => {
      let updatedUrl;
      const mockFetch = createMockFetch({
        'PUT': (url) => {
          updatedUrl = url;
          return { status: 200, body: { id: 'existing-1' } };
        },
        'POST': { status: 200, body: {} },
        'GET': { status: 200, body: { attachments: [] } },
      });
      const provider = createProvider(mockFetch);
      const result = await provider.pushStory('my-story', {
        name: 'My Story',
        status: 'pending',
        existingTaskId: 'existing-1',
        steps: {},
      });
      assert.ok(updatedUrl.includes('/task/existing-1'));
    });
  });

  describe('pushStep', () => {
    test('skips implement step', async () => {
      const mockFetch = createMockFetch({});
      const provider = createProvider(mockFetch);
      const result = await provider.pushStep('my-story', 'implement', '# code', { taskId: 't-1' });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.skipped, true);
    });

    test('throws when taskId is missing', async () => {
      const mockFetch = createMockFetch({});
      const provider = createProvider(mockFetch);
      await assert.rejects(
        () => provider.pushStep('my-story', 'init', '# Init', {}),
        (err) => err.code === 'NOT_FOUND',
      );
    });
  });

  describe('pullStory', () => {
    test('reconstructs story from task data', async () => {
      const mockFetch = createMockFetch({
        '/task/t-1': {
          status: 200,
          body: {
            id: 't-1',
            name: 'Auth SSO Feature',
            description: '# Auth SSO\nSetup SSO login',
            status: { status: 'to do' },
            url: 'https://app.clickup.com/t/t-1',
            date_updated: '1711234567000',
            attachments: [
              { filename: 'aia--spec-func.md', url: 'https://cdn.clickup.com/att/spec-func.md' },
              { filename: 'human-doc.pdf', url: 'https://cdn.clickup.com/att/doc.pdf' },
            ],
            assignees: [{ username: 'dev1' }],
            tags: [{ name: 'auth' }],
          },
        },
        'cdn.clickup.com': {
          status: 200,
          body: '# Spec Func\nFunctional spec content',
        },
      });
      // Override text() for CDN response
      const originalFetch = mockFetch;
      const patchedFetch = async (url, opts) => {
        const res = await originalFetch(url, opts);
        if (url.includes('cdn.clickup.com')) {
          return { ...res, text: async () => '# Spec Func\nFunctional spec content' };
        }
        return res;
      };

      const provider = createProvider(patchedFetch);
      const result = await provider.pullStory('t-1');

      assert.strictEqual(result.name, 'Auth SSO Feature');
      assert.strictEqual(result.status, 'pending');
      assert.ok(result.steps.init);
      assert.ok(result.steps.init.content.includes('Auth SSO'));
      assert.ok(result.steps['spec-func']);
      assert.strictEqual(result.meta.assignees[0], 'dev1');
      assert.strictEqual(result.meta.tags[0], 'auth');
    });
  });

  describe('pushEpic', () => {
    test('creates folder when epicAs is folder', async () => {
      let createdUrl;
      const mockFetch = createMockFetch({
        'POST': (url) => {
          createdUrl = url;
          return { status: 200, body: { id: 'folder-1' } };
        },
      });
      const provider = createProvider(mockFetch, { epicAs: 'folder' });
      const result = await provider.pushEpic({ name: 'Epic 1' });
      assert.ok(createdUrl.includes('/space/sp-1/folder'));
      assert.strictEqual(result.externalId, 'folder-1');
    });

    test('creates list when epicAs is list', async () => {
      let createdUrl;
      const mockFetch = createMockFetch({
        'POST': (url) => {
          createdUrl = url;
          return { status: 200, body: { id: 'list-new' } };
        },
      });
      const provider = createProvider(mockFetch, { epicAs: 'list' });
      const result = await provider.pushEpic({ name: 'Epic 1' });
      assert.ok(createdUrl.includes('/space/sp-1/list'));
      assert.strictEqual(result.externalId, 'list-new');
    });
  });

  describe('getRemoteUpdatedAt', () => {
    test('returns Date from task date_updated', async () => {
      const ts = '1711234567000';
      const mockFetch = createMockFetch({
        '/task/t-1': { status: 200, body: { date_updated: ts } },
      });
      const provider = createProvider(mockFetch);
      const result = await provider.getRemoteUpdatedAt('t-1');
      assert.ok(result instanceof Date);
      assert.strictEqual(result.getTime(), 1711234567000);
    });

    test('returns null on error', async () => {
      const mockFetch = createMockFetch({
        '/task/t-1': { status: 404, body: { err: 'Not found' } },
      });
      const provider = createProvider(mockFetch);
      const result = await provider.getRemoteUpdatedAt('t-1');
      assert.strictEqual(result, null);
    });
  });
});
