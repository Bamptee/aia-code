/**
 * @fileoverview Type definitions for test-quick feature
 * Uses JSDoc for type definitions in this JavaScript codebase
 */

/**
 * @typedef {Object} TestQuickConfig
 * @property {string} name - Name of the test-quick item
 * @property {string} [description] - Optional description
 * @property {boolean} [enabled=true] - Whether the item is enabled
 * @property {string} [createdAt] - ISO timestamp of creation
 */

/**
 * @typedef {Object} TestQuickItem
 * @property {string} id - Unique identifier
 * @property {string} name - Item name
 * @property {string} [description] - Optional description
 * @property {'pending'|'active'|'completed'|'error'} status - Current status
 * @property {Object} [metadata] - Additional metadata
 * @property {string} createdAt - ISO timestamp of creation
 * @property {string} [updatedAt] - ISO timestamp of last update
 */

/**
 * @typedef {Object} TestQuickResult
 * @property {boolean} success - Whether the operation succeeded
 * @property {string} [message] - Result message
 * @property {TestQuickItem} [data] - Result data
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} TestQuickListResult
 * @property {boolean} success - Whether the operation succeeded
 * @property {TestQuickItem[]} items - List of items
 * @property {number} total - Total count
 */

/**
 * Valid status values for test-quick items
 * @type {Object.<string, string>}
 */
export const TEST_QUICK_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ERROR: 'error',
};

/**
 * Default configuration for test-quick
 * @type {TestQuickConfig}
 */
export const DEFAULT_TEST_QUICK_CONFIG = {
  name: '',
  description: '',
  enabled: true,
  createdAt: null,
};

/**
 * Validates a test-quick item name
 * @param {string} name - Name to validate
 * @returns {boolean} Whether the name is valid
 */
export function isValidTestQuickName(name) {
  if (!name || typeof name !== 'string') return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
}

/**
 * Creates a new test-quick item with defaults
 * @param {Partial<TestQuickItem>} data - Partial item data
 * @returns {TestQuickItem} Complete item with defaults
 */
export function createTestQuickItem(data) {
  const now = new Date().toISOString();
  return {
    id: data.id || `tq-${Date.now()}`,
    name: data.name || '',
    description: data.description || '',
    status: data.status || TEST_QUICK_STATUS.PENDING,
    metadata: data.metadata || {},
    createdAt: data.createdAt || now,
    updatedAt: now,
  };
}
