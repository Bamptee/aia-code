/**
 * @fileoverview Unit tests for SyncProvider abstract class
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { SyncProvider } from '../src/providers/sync-provider.js';

describe('SyncProvider', () => {
  test('getProviderName returns the name set in constructor', () => {
    const provider = new SyncProvider('test-provider');
    assert.strictEqual(provider.getProviderName(), 'test-provider');
  });

  test('isConfigured defaults to false', () => {
    const provider = new SyncProvider('test');
    assert.strictEqual(provider.isConfigured, false);
  });

  const abstractMethods = [
    ['testConnection', []],
    ['pushStory', ['slug', {}]],
    ['pullStory', ['ext-id']],
    ['pushStep', ['slug', 'init', 'content', {}]],
    ['pushEpic', [{}]],
    ['pullEpic', ['ext-id']],
    ['updateStatus', ['ext-id', 'done']],
    ['getRemoteUpdatedAt', ['ext-id']],
    ['browse', ['workspaces']],
    ['searchTasks', ['query']],
  ];

  for (const [method, args] of abstractMethods) {
    test(`${method}() throws 'Not implemented'`, async () => {
      const provider = new SyncProvider('test');
      await assert.rejects(
        () => provider[method](...args),
        { message: 'Not implemented' },
      );
    });
  }
});
