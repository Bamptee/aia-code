/**
 * @fileoverview Unit tests for Figma Provider
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';

import { FileStorageProvider } from '../../src/epic/providers/file-storage-provider.js';
import { FigmaProvider } from '../../src/epic/providers/figma-provider.js';
import { ValidationError, ExternalServiceError, NotFoundError } from '../../src/epic/utils/errors.js';

// Test directory setup
let testRoot;
let storage;
let figmaProvider;

// Mock fetch function
function createMockFetch(response) {
  return async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => response,
  });
}

function createMockFetchWithError(status, statusText) {
  return async () => ({
    ok: false,
    status,
    statusText,
    json: async () => ({}),
  });
}

beforeEach(async () => {
  testRoot = path.join(os.tmpdir(), `figma-provider-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.ensureDir(testRoot);
  storage = new FileStorageProvider(testRoot);
  await storage.ensureDirectories();
  figmaProvider = new FigmaProvider(storage, {
    apiToken: 'test-token',
    cacheTTL: 60000,
  });
});

afterEach(async () => {
  if (testRoot) {
    await fs.remove(testRoot);
  }
});

describe('FigmaProvider', () => {
  describe('isConfigured', () => {
    test('returns true when API token is set', () => {
      assert.strictEqual(figmaProvider.isConfigured(), true);
    });

    test('returns false when API token is not set', () => {
      const provider = new FigmaProvider(storage, { apiToken: null });
      assert.strictEqual(provider.isConfigured(), false);
    });
  });

  describe('isValidUrl', () => {
    test('returns true for valid file URL', () => {
      assert.strictEqual(
        figmaProvider.isValidUrl('https://www.figma.com/file/abc123/Design-Name'),
        true
      );
    });

    test('returns true for valid design URL', () => {
      assert.strictEqual(
        figmaProvider.isValidUrl('https://figma.com/design/xyz789/Another-Design'),
        true
      );
    });

    test('returns false for invalid URL', () => {
      assert.strictEqual(figmaProvider.isValidUrl('https://google.com'), false);
      assert.strictEqual(figmaProvider.isValidUrl('not-a-url'), false);
    });
  });

  describe('parseUrl', () => {
    test('extracts file key from URL', () => {
      const result = figmaProvider.parseUrl('https://www.figma.com/file/abc123/Design-Name');
      assert.strictEqual(result.fileKey, 'abc123');
      assert.strictEqual(result.nodeId, null);
    });

    test('extracts node ID from URL with node-id param', () => {
      const result = figmaProvider.parseUrl(
        'https://www.figma.com/file/abc123/Design?node-id=1%3A2'
      );
      assert.strictEqual(result.fileKey, 'abc123');
      assert.strictEqual(result.nodeId, '1:2');
    });

    test('throws ValidationError for invalid URL', () => {
      assert.throws(
        () => figmaProvider.parseUrl('https://google.com'),
        ValidationError
      );
    });
  });

  describe('getCacheKey', () => {
    test('generates cache key from URL', () => {
      const key = figmaProvider.getCacheKey('https://www.figma.com/file/abc123/Design');
      assert.strictEqual(key, 'figma_abc123');
    });

    test('includes node ID in cache key', () => {
      const key = figmaProvider.getCacheKey(
        'https://www.figma.com/file/abc123/Design?node-id=1:2'
      );
      assert.strictEqual(key, 'figma_abc123_1_2');
    });
  });

  describe('fetchDesign', () => {
    test('throws error when not configured', async () => {
      const provider = new FigmaProvider(storage, { apiToken: null });

      await assert.rejects(
        async () => {
          await provider.fetchDesign('https://www.figma.com/file/abc123/Design');
        },
        ExternalServiceError
      );
    });

    test('fetches from API when cache is empty', async () => {
      const mockResponse = {
        name: 'Test Design',
        lastModified: '2026-01-01T00:00:00Z',
        version: '1',
        document: {
          id: '0:0',
          name: 'Document',
          type: 'DOCUMENT',
          children: [
            {
              id: '1:0',
              name: 'Page 1',
              type: 'CANVAS',
              children: [
                {
                  id: '1:1',
                  name: 'Frame',
                  type: 'FRAME',
                  absoluteBoundingBox: { width: 100, height: 200 },
                  children: [
                    {
                      id: '1:2',
                      name: 'Title',
                      type: 'TEXT',
                      characters: 'Hello World',
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const provider = new FigmaProvider(storage, {
        apiToken: 'test-token',
        fetchFn: createMockFetch(mockResponse),
      });

      const result = await provider.fetchDesign('https://www.figma.com/file/abc123/Design');

      assert.strictEqual(result.name, 'Test Design');
      assert.strictEqual(result.fromCache, false);
      assert.ok(result.frames.length > 0);
      assert.ok(result.textContent.length > 0);
    });

    test('returns cached data when available', async () => {
      // Pre-populate cache
      const cacheEntry = {
        cacheKey: 'figma_abc123',
        figmaUrl: 'https://www.figma.com/file/abc123/Design',
        extractedData: {
          name: 'Cached Design',
          components: [],
          frames: [],
          textContent: [],
        },
        cachedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };
      await storage.writeFigmaCache(cacheEntry);

      // Mock fetch should NOT be called
      let fetchCalled = false;
      const provider = new FigmaProvider(storage, {
        apiToken: 'test-token',
        fetchFn: async () => {
          fetchCalled = true;
          return { ok: true, json: async () => ({}) };
        },
      });

      const result = await provider.fetchDesign('https://www.figma.com/file/abc123/Design');

      assert.strictEqual(result.name, 'Cached Design');
      assert.strictEqual(result.fromCache, true);
      assert.strictEqual(fetchCalled, false);
    });

    test('bypasses cache when forceRefresh is true', async () => {
      // Pre-populate cache
      const cacheEntry = {
        cacheKey: 'figma_abc123',
        figmaUrl: 'https://www.figma.com/file/abc123/Design',
        extractedData: { name: 'Cached Design' },
        cachedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };
      await storage.writeFigmaCache(cacheEntry);

      const mockResponse = {
        name: 'Fresh Design',
        document: { children: [] },
      };

      const provider = new FigmaProvider(storage, {
        apiToken: 'test-token',
        fetchFn: createMockFetch(mockResponse),
      });

      const result = await provider.fetchDesign(
        'https://www.figma.com/file/abc123/Design',
        { forceRefresh: true }
      );

      assert.strictEqual(result.name, 'Fresh Design');
      assert.strictEqual(result.fromCache, false);
    });

    test('handles 404 error', async () => {
      const provider = new FigmaProvider(storage, {
        apiToken: 'test-token',
        fetchFn: createMockFetchWithError(404, 'Not Found'),
      });

      await assert.rejects(
        async () => {
          await provider.fetchDesign('https://www.figma.com/file/notfound/Design');
        },
        NotFoundError
      );
    });

    test('handles 403 error', async () => {
      const provider = new FigmaProvider(storage, {
        apiToken: 'test-token',
        fetchFn: createMockFetchWithError(403, 'Forbidden'),
      });

      await assert.rejects(
        async () => {
          await provider.fetchDesign('https://www.figma.com/file/forbidden/Design');
        },
        ExternalServiceError
      );
    });
  });

  describe('invalidateCache', () => {
    test('removes cached data', async () => {
      const url = 'https://www.figma.com/file/abc123/Design';

      // Pre-populate cache
      const cacheEntry = {
        cacheKey: 'figma_abc123',
        figmaUrl: url,
        extractedData: { name: 'Cached' },
        cachedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };
      await storage.writeFigmaCache(cacheEntry);

      await figmaProvider.invalidateCache(url);

      const cached = await storage.readFigmaCache('figma_abc123');
      assert.strictEqual(cached, null);
    });
  });

  describe('getCached', () => {
    test('returns cached data', async () => {
      const url = 'https://www.figma.com/file/abc123/Design';

      const cacheEntry = {
        cacheKey: 'figma_abc123',
        figmaUrl: url,
        extractedData: { name: 'Cached Design' },
        cachedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };
      await storage.writeFigmaCache(cacheEntry);

      const result = await figmaProvider.getCached(url);

      assert.strictEqual(result.name, 'Cached Design');
      assert.strictEqual(result.fromCache, true);
    });

    test('returns null when not cached', async () => {
      const result = await figmaProvider.getCached('https://www.figma.com/file/notcached/Design');
      assert.strictEqual(result, null);
    });
  });

  describe('generateSummary', () => {
    test('generates summary from design data', () => {
      const designData = {
        name: 'Test Design',
        lastModified: '2026-01-01T00:00:00Z',
        components: [
          { id: '1', name: 'Button', type: 'COMPONENT', description: 'Primary button' },
          { id: '2', name: 'Input', type: 'COMPONENT' },
        ],
        frames: [
          { id: '3', name: 'Login Page', width: 1920, height: 1080 },
        ],
        textContent: [
          { id: '4', name: 'Title', text: 'Welcome to the app' },
        ],
      };

      const summary = figmaProvider.generateSummary(designData);

      assert.ok(summary.includes('Test Design'));
      assert.ok(summary.includes('Button: Primary button'));
      assert.ok(summary.includes('Input'));
      assert.ok(summary.includes('Login Page'));
      assert.ok(summary.includes('Welcome to the app'));
    });

    test('truncates long text content', () => {
      const designData = {
        name: 'Test',
        textContent: [
          { id: '1', name: 'Long Text', text: 'A'.repeat(100) },
        ],
        components: [],
        frames: [],
      };

      const summary = figmaProvider.generateSummary(designData);

      assert.ok(summary.includes('...'));
      assert.ok(summary.length < 200);
    });

    test('limits number of items shown', () => {
      const designData = {
        name: 'Test',
        components: Array.from({ length: 20 }, (_, i) => ({
          id: String(i),
          name: `Component ${i}`,
          type: 'COMPONENT',
        })),
        frames: [],
        textContent: [],
      };

      const summary = figmaProvider.generateSummary(designData);

      assert.ok(summary.includes('... and 10 more'));
    });
  });

  describe('_extractDesignData', () => {
    test('extracts components from API response', () => {
      const apiResponse = {
        name: 'Design',
        document: {
          children: [
            {
              id: '1',
              type: 'CANVAS',
              children: [
                {
                  id: '2',
                  name: 'Button',
                  type: 'COMPONENT',
                  description: 'A button component',
                  children: [],
                },
              ],
            },
          ],
        },
      };

      const result = figmaProvider._extractDesignData(apiResponse, null);

      assert.strictEqual(result.components.length, 1);
      assert.strictEqual(result.components[0].name, 'Button');
      assert.strictEqual(result.components[0].description, 'A button component');
    });

    test('extracts frames with dimensions', () => {
      const apiResponse = {
        name: 'Design',
        document: {
          children: [
            {
              id: '1',
              type: 'CANVAS',
              children: [
                {
                  id: '2',
                  name: 'Mobile Frame',
                  type: 'FRAME',
                  absoluteBoundingBox: { width: 375, height: 812 },
                  children: [],
                },
              ],
            },
          ],
        },
      };

      const result = figmaProvider._extractDesignData(apiResponse, null);

      assert.strictEqual(result.frames.length, 1);
      assert.strictEqual(result.frames[0].name, 'Mobile Frame');
      assert.strictEqual(result.frames[0].width, 375);
      assert.strictEqual(result.frames[0].height, 812);
    });

    test('extracts text content', () => {
      const apiResponse = {
        name: 'Design',
        document: {
          children: [
            {
              id: '1',
              type: 'CANVAS',
              children: [
                {
                  id: '2',
                  name: 'Heading',
                  type: 'TEXT',
                  characters: 'Welcome!',
                },
              ],
            },
          ],
        },
      };

      const result = figmaProvider._extractDesignData(apiResponse, null);

      assert.strictEqual(result.textContent.length, 1);
      assert.strictEqual(result.textContent[0].name, 'Heading');
      assert.strictEqual(result.textContent[0].text, 'Welcome!');
    });

    test('handles node-specific response', () => {
      const apiResponse = {
        nodes: {
          '1:2': {
            document: {
              id: '1:2',
              name: 'Specific Node',
              type: 'FRAME',
              absoluteBoundingBox: { width: 100, height: 100 },
              children: [],
            },
          },
        },
      };

      const result = figmaProvider._extractDesignData(apiResponse, '1:2');

      assert.strictEqual(result.name, 'Specific Node');
      assert.strictEqual(result.frames.length, 1);
    });
  });
});
