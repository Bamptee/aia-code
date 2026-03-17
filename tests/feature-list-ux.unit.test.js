/**
 * @fileoverview Unit tests for feature list UX utility functions
 * Tests sorting, filtering, and helper functions
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

// Re-implement the utility functions for testing (since they're in a frontend React file)
// These match the implementations in src/ui/public/components/dashboard.js

const QUICK_STEPS = ['dev-plan', 'implement', 'review'];

/**
 * Sort features by the specified field and order
 * @param {Array} features - Array of features to sort
 * @param {string} field - 'date' or 'name'
 * @param {string} order - 'asc' or 'desc'
 * @returns {Array} Sorted array (new array, doesn't mutate original)
 */
function sortFeatures(features, field, order) {
  const sorted = [...features];

  sorted.sort((a, b) => {
    let comparison = 0;

    if (field === 'name') {
      comparison = a.name.localeCompare(b.name);
    } else if (field === 'date') {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      comparison = dateA - dateB;
    }

    return order === 'desc' ? -comparison : comparison;
  });

  return sorted;
}

/**
 * Check if a feature is completed (all relevant steps are done)
 * @param {Object} feature - Feature object with steps
 * @returns {boolean}
 */
function isFeatureCompleted(feature) {
  const steps = feature.steps || {};
  const isQuickFlow = feature.flow === 'quick';
  const relevantSteps = isQuickFlow
    ? Object.entries(steps).filter(([k]) => QUICK_STEPS.includes(k))
    : Object.entries(steps);

  if (relevantSteps.length === 0) return false;
  return relevantSteps.every(([_, status]) => status === 'done');
}

/**
 * Simulates localStorage for testing
 */
function createMockStorage() {
  const store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
}

function loadFromStorage(storage, key, defaultValue) {
  try {
    const stored = storage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveToStorage(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors
  }
}

describe('sortFeatures utility', () => {
  const sampleFeatures = [
    { name: 'zebra-feature', createdAt: '2024-01-03T10:00:00Z' },
    { name: 'apple-feature', createdAt: '2024-01-01T10:00:00Z' },
    { name: 'mango-feature', createdAt: '2024-01-02T10:00:00Z' },
  ];

  describe('sorting by name', () => {
    test('sorts by name ascending (A-Z)', () => {
      const sorted = sortFeatures(sampleFeatures, 'name', 'asc');

      assert.strictEqual(sorted[0].name, 'apple-feature');
      assert.strictEqual(sorted[1].name, 'mango-feature');
      assert.strictEqual(sorted[2].name, 'zebra-feature');
    });

    test('sorts by name descending (Z-A)', () => {
      const sorted = sortFeatures(sampleFeatures, 'name', 'desc');

      assert.strictEqual(sorted[0].name, 'zebra-feature');
      assert.strictEqual(sorted[1].name, 'mango-feature');
      assert.strictEqual(sorted[2].name, 'apple-feature');
    });
  });

  describe('sorting by date', () => {
    test('sorts by date ascending (oldest first)', () => {
      const sorted = sortFeatures(sampleFeatures, 'date', 'asc');

      assert.strictEqual(sorted[0].name, 'apple-feature');  // Jan 1
      assert.strictEqual(sorted[1].name, 'mango-feature');  // Jan 2
      assert.strictEqual(sorted[2].name, 'zebra-feature');  // Jan 3
    });

    test('sorts by date descending (newest first)', () => {
      const sorted = sortFeatures(sampleFeatures, 'date', 'desc');

      assert.strictEqual(sorted[0].name, 'zebra-feature');  // Jan 3
      assert.strictEqual(sorted[1].name, 'mango-feature');  // Jan 2
      assert.strictEqual(sorted[2].name, 'apple-feature');  // Jan 1
    });
  });

  describe('edge cases', () => {
    test('does not mutate original array', () => {
      const original = [...sampleFeatures];
      const originalNames = original.map(f => f.name);

      sortFeatures(original, 'name', 'asc');

      const afterNames = original.map(f => f.name);
      assert.deepStrictEqual(originalNames, afterNames);
    });

    test('handles empty array', () => {
      const sorted = sortFeatures([], 'name', 'asc');
      assert.deepStrictEqual(sorted, []);
    });

    test('handles single element', () => {
      const single = [{ name: 'only-one', createdAt: '2024-01-01T00:00:00Z' }];
      const sorted = sortFeatures(single, 'name', 'asc');
      assert.strictEqual(sorted.length, 1);
      assert.strictEqual(sorted[0].name, 'only-one');
    });

    test('handles features without createdAt (treats as epoch)', () => {
      const withoutDate = [
        { name: 'no-date', createdAt: null },
        { name: 'has-date', createdAt: '2024-01-01T00:00:00Z' },
      ];

      const sorted = sortFeatures(withoutDate, 'date', 'asc');
      assert.strictEqual(sorted[0].name, 'no-date');  // epoch (0) comes first
      assert.strictEqual(sorted[1].name, 'has-date');
    });
  });
});

describe('isFeatureCompleted utility', () => {
  describe('full flow features', () => {
    test('returns true when all full flow steps are done', () => {
      const feature = {
        flow: 'full',
        steps: {
          init: 'done',
          brainstorming: 'done',
          'spec-func': 'done',
          'spec-tech': 'done',
          'dev-plan': 'done',
          implement: 'done',
          review: 'done',
        },
      };

      assert.strictEqual(isFeatureCompleted(feature), true);
    });

    test('returns false when some steps are pending', () => {
      const feature = {
        flow: 'full',
        steps: {
          init: 'done',
          brainstorming: 'done',
          'spec-func': 'pending',
          'spec-tech': 'pending',
          'dev-plan': 'pending',
          implement: 'pending',
          review: 'pending',
        },
      };

      assert.strictEqual(isFeatureCompleted(feature), false);
    });

    test('returns false when some steps are in-progress', () => {
      const feature = {
        flow: 'full',
        steps: {
          init: 'done',
          brainstorming: 'in-progress',
          'spec-func': 'pending',
          'spec-tech': 'pending',
          'dev-plan': 'pending',
          implement: 'pending',
          review: 'pending',
        },
      };

      assert.strictEqual(isFeatureCompleted(feature), false);
    });

    test('returns false when some steps have error', () => {
      const feature = {
        flow: 'full',
        steps: {
          init: 'done',
          brainstorming: 'error',
          'spec-func': 'done',
          'spec-tech': 'done',
          'dev-plan': 'done',
          implement: 'done',
          review: 'done',
        },
      };

      assert.strictEqual(isFeatureCompleted(feature), false);
    });
  });

  describe('quick flow features', () => {
    test('returns true when all quick flow steps are done', () => {
      const feature = {
        flow: 'quick',
        steps: {
          'dev-plan': 'done',
          implement: 'done',
          review: 'done',
        },
      };

      assert.strictEqual(isFeatureCompleted(feature), true);
    });

    test('ignores non-quick steps when flow is quick', () => {
      const feature = {
        flow: 'quick',
        steps: {
          brief: 'pending',        // Should be ignored
          'ba-spec': 'pending',    // Should be ignored
          'dev-plan': 'done',
          implement: 'done',
          review: 'done',
        },
      };

      assert.strictEqual(isFeatureCompleted(feature), true);
    });

    test('returns false when quick steps are incomplete', () => {
      const feature = {
        flow: 'quick',
        steps: {
          'dev-plan': 'done',
          implement: 'in-progress',
          review: 'pending',
        },
      };

      assert.strictEqual(isFeatureCompleted(feature), false);
    });
  });

  describe('edge cases', () => {
    test('returns false when steps is empty', () => {
      const feature = {
        flow: 'full',
        steps: {},
      };

      assert.strictEqual(isFeatureCompleted(feature), false);
    });

    test('returns false when steps is undefined', () => {
      const feature = {
        flow: 'full',
      };

      assert.strictEqual(isFeatureCompleted(feature), false);
    });

    test('handles undefined flow as full flow', () => {
      const feature = {
        steps: {
          brief: 'done',
          'ba-spec': 'done',
          questions: 'done',
          'tech-spec': 'done',
          challenge: 'done',
          'dev-plan': 'done',
          implement: 'done',
          review: 'done',
        },
      };

      assert.strictEqual(isFeatureCompleted(feature), true);
    });
  });
});

describe('localStorage helpers', () => {
  describe('loadFromStorage', () => {
    test('returns stored value when present', () => {
      const storage = createMockStorage();
      storage.setItem('test-key', JSON.stringify({ foo: 'bar' }));

      const result = loadFromStorage(storage, 'test-key', null);
      assert.deepStrictEqual(result, { foo: 'bar' });
    });

    test('returns default value when key not present', () => {
      const storage = createMockStorage();

      const result = loadFromStorage(storage, 'missing-key', 'default');
      assert.strictEqual(result, 'default');
    });

    test('returns default value on parse error', () => {
      const storage = createMockStorage();
      storage.setItem('bad-json', 'not valid json {{{');

      const result = loadFromStorage(storage, 'bad-json', 'fallback');
      assert.strictEqual(result, 'fallback');
    });

    test('handles null storage value', () => {
      const storage = createMockStorage();

      const result = loadFromStorage(storage, 'null-key', []);
      assert.deepStrictEqual(result, []);
    });
  });

  describe('saveToStorage', () => {
    test('saves value as JSON string', () => {
      const storage = createMockStorage();

      saveToStorage(storage, 'save-test', { value: 123 });

      const raw = storage.getItem('save-test');
      assert.strictEqual(raw, '{"value":123}');
    });

    test('handles arrays', () => {
      const storage = createMockStorage();

      saveToStorage(storage, 'array-test', ['a', 'b', 'c']);

      const result = loadFromStorage(storage, 'array-test', []);
      assert.deepStrictEqual(result, ['a', 'b', 'c']);
    });

    test('handles boolean values', () => {
      const storage = createMockStorage();

      saveToStorage(storage, 'bool-test', true);

      const result = loadFromStorage(storage, 'bool-test', false);
      assert.strictEqual(result, true);
    });

    test('handles string values', () => {
      const storage = createMockStorage();

      saveToStorage(storage, 'string-test', 'DATE_DESC');

      const result = loadFromStorage(storage, 'string-test', 'DATE_ASC');
      assert.strictEqual(result, 'DATE_DESC');
    });
  });

  describe('persistence patterns', () => {
    test('sort preference round-trip', () => {
      const storage = createMockStorage();

      // User changes sort to name ascending
      saveToStorage(storage, 'aia-feature-list-sort', 'NAME_ASC');

      // Page reload - should restore preference
      const sortKey = loadFromStorage(storage, 'aia-feature-list-sort', 'DATE_DESC');
      assert.strictEqual(sortKey, 'NAME_ASC');
    });

    test('filter preferences round-trip', () => {
      const storage = createMockStorage();

      // User enables show completed
      saveToStorage(storage, 'aia-feature-list-show-completed', true);

      // User selects specific apps
      saveToStorage(storage, 'aia-feature-list-apps-filter', ['frontend', 'api']);

      // User selects type filter
      saveToStorage(storage, 'aia-feature-list-type-filter', 'bug');

      // Page reload - should restore all preferences
      assert.strictEqual(
        loadFromStorage(storage, 'aia-feature-list-show-completed', false),
        true
      );
      assert.deepStrictEqual(
        loadFromStorage(storage, 'aia-feature-list-apps-filter', []),
        ['frontend', 'api']
      );
      assert.strictEqual(
        loadFromStorage(storage, 'aia-feature-list-type-filter', 'all'),
        'bug'
      );
    });
  });
});

describe('Filter logic', () => {
  // Simulate the filter logic from the useMemo in Dashboard

  function filterFeatures(features, { showCompleted, typeFilter, appsFilter, wtFilter }) {
    return features.filter(f => {
      // Completion filter
      if (!showCompleted && isFeatureCompleted(f)) return false;

      // Type filter
      const fType = f.type || 'feature';
      if (typeFilter !== 'all' && fType !== typeFilter) return false;

      // Apps filter
      if (appsFilter.length > 0) {
        const fApps = f.apps || [];
        if (!appsFilter.some(a => fApps.includes(a))) return false;
      }

      // Worktree filter
      if (wtFilter === 'with-wt' && !f.hasWorktree) return false;
      if (wtFilter === 'without-wt' && f.hasWorktree) return false;

      return true;
    });
  }

  const sampleData = [
    {
      name: 'active-feature',
      type: 'feature',
      flow: 'full',
      apps: ['frontend'],
      hasWorktree: true,
      steps: { brief: 'done', 'ba-spec': 'pending', questions: 'pending', 'tech-spec': 'pending', challenge: 'pending', 'dev-plan': 'pending', implement: 'pending', review: 'pending' },
    },
    {
      name: 'completed-feature',
      type: 'feature',
      flow: 'quick',
      apps: ['api'],
      hasWorktree: false,
      steps: { 'dev-plan': 'done', implement: 'done', review: 'done' },
    },
    {
      name: 'active-bug',
      type: 'bug',
      flow: 'quick',
      apps: ['frontend', 'api'],
      hasWorktree: true,
      steps: { 'dev-plan': 'done', implement: 'in-progress', review: 'pending' },
    },
  ];

  test('filters out completed features by default', () => {
    const result = filterFeatures(sampleData, {
      showCompleted: false,
      typeFilter: 'all',
      appsFilter: [],
      wtFilter: 'all',
    });

    assert.strictEqual(result.length, 2);
    assert.ok(!result.find(f => f.name === 'completed-feature'));
  });

  test('shows completed features when enabled', () => {
    const result = filterFeatures(sampleData, {
      showCompleted: true,
      typeFilter: 'all',
      appsFilter: [],
      wtFilter: 'all',
    });

    assert.strictEqual(result.length, 3);
  });

  test('filters by type', () => {
    const result = filterFeatures(sampleData, {
      showCompleted: true,
      typeFilter: 'bug',
      appsFilter: [],
      wtFilter: 'all',
    });

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, 'active-bug');
  });

  test('filters by apps', () => {
    const result = filterFeatures(sampleData, {
      showCompleted: true,
      typeFilter: 'all',
      appsFilter: ['api'],
      wtFilter: 'all',
    });

    assert.strictEqual(result.length, 2);
    const names = result.map(f => f.name);
    assert.ok(names.includes('completed-feature'));
    assert.ok(names.includes('active-bug'));
  });

  test('filters by worktree', () => {
    const withWt = filterFeatures(sampleData, {
      showCompleted: true,
      typeFilter: 'all',
      appsFilter: [],
      wtFilter: 'with-wt',
    });

    assert.strictEqual(withWt.length, 2);
    withWt.forEach(f => assert.ok(f.hasWorktree));

    const withoutWt = filterFeatures(sampleData, {
      showCompleted: true,
      typeFilter: 'all',
      appsFilter: [],
      wtFilter: 'without-wt',
    });

    assert.strictEqual(withoutWt.length, 1);
    withoutWt.forEach(f => assert.ok(!f.hasWorktree));
  });

  test('combines multiple filters', () => {
    const result = filterFeatures(sampleData, {
      showCompleted: false,
      typeFilter: 'feature',
      appsFilter: ['frontend'],
      wtFilter: 'with-wt',
    });

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, 'active-feature');
  });

  test('returns empty array when no features match', () => {
    const result = filterFeatures(sampleData, {
      showCompleted: false,
      typeFilter: 'bug',
      appsFilter: ['nonexistent'],
      wtFilter: 'all',
    });

    assert.strictEqual(result.length, 0);
  });
});

describe('Combined filter and sort', () => {
  function filterAndSort(features, filters, sortField, sortOrder) {
    // Filter first
    let result = features.filter(f => {
      if (!filters.showCompleted && isFeatureCompleted(f)) return false;
      const fType = f.type || 'feature';
      if (filters.typeFilter !== 'all' && fType !== filters.typeFilter) return false;
      return true;
    });

    // Then sort
    return sortFeatures(result, sortField, sortOrder);
  }

  const testData = [
    { name: 'zebra', type: 'feature', flow: 'quick', createdAt: '2024-01-03T00:00:00Z', steps: { 'dev-plan': 'done', implement: 'done', review: 'done' } },
    { name: 'apple', type: 'bug', flow: 'quick', createdAt: '2024-01-01T00:00:00Z', steps: { 'dev-plan': 'pending', implement: 'pending', review: 'pending' } },
    { name: 'mango', type: 'feature', flow: 'quick', createdAt: '2024-01-02T00:00:00Z', steps: { 'dev-plan': 'in-progress', implement: 'pending', review: 'pending' } },
  ];

  test('filters then sorts by name', () => {
    const result = filterAndSort(testData, {
      showCompleted: false,
      typeFilter: 'all',
    }, 'name', 'asc');

    // Should exclude zebra (completed) and sort remaining by name
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].name, 'apple');
    assert.strictEqual(result[1].name, 'mango');
  });

  test('filters by type then sorts by date', () => {
    const result = filterAndSort(testData, {
      showCompleted: true,
      typeFilter: 'feature',
    }, 'date', 'desc');

    // Should include only features, sorted newest first
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].name, 'zebra');  // Jan 3
    assert.strictEqual(result[1].name, 'mango');  // Jan 2
  });
});
