/**
 * @fileoverview Service layer for test-quick feature
 * Provides business logic for managing test-quick items
 */

import path from 'node:path';
import fs from 'fs-extra';
import yaml from 'yaml';
import { AIA_DIR } from '../constants.js';
import {
  TEST_QUICK_STATUS,
  isValidTestQuickName,
  createTestQuickItem,
} from '../types/test-quick.js';

const TEST_QUICK_DIR = 'test-quick';
const DATA_FILE = 'items.yaml';

/**
 * Gets the test-quick directory path
 * @param {string} root - Project root directory
 * @returns {string} Path to test-quick directory
 */
function getTestQuickDir(root) {
  return path.join(root, AIA_DIR, TEST_QUICK_DIR);
}

/**
 * Gets the data file path
 * @param {string} root - Project root directory
 * @returns {string} Path to data file
 */
function getDataFilePath(root) {
  return path.join(getTestQuickDir(root), DATA_FILE);
}

/**
 * Ensures the test-quick directory exists
 * @param {string} root - Project root directory
 */
async function ensureTestQuickDir(root) {
  await fs.ensureDir(getTestQuickDir(root));
}

/**
 * Loads all test-quick items from storage
 * @param {string} [root=process.cwd()] - Project root directory
 * @returns {Promise<import('../types/test-quick.js').TestQuickItem[]>} List of items
 */
export async function loadItems(root = process.cwd()) {
  const dataPath = getDataFilePath(root);

  if (!(await fs.pathExists(dataPath))) {
    return [];
  }

  const content = await fs.readFile(dataPath, 'utf-8');
  const data = yaml.parse(content);

  return Array.isArray(data?.items) ? data.items : [];
}

/**
 * Saves all test-quick items to storage
 * @param {import('../types/test-quick.js').TestQuickItem[]} items - Items to save
 * @param {string} [root=process.cwd()] - Project root directory
 */
async function saveItems(items, root = process.cwd()) {
  await ensureTestQuickDir(root);
  const dataPath = getDataFilePath(root);
  const content = yaml.stringify({ items, updatedAt: new Date().toISOString() });
  await fs.writeFile(dataPath, content, 'utf-8');
}

/**
 * Creates a new test-quick item
 * @param {Object} data - Item data
 * @param {string} data.name - Item name
 * @param {string} [data.description] - Item description
 * @param {string} [root=process.cwd()] - Project root directory
 * @returns {Promise<import('../types/test-quick.js').TestQuickResult>} Creation result
 */
export async function createItem(data, root = process.cwd()) {
  const { name, description } = data;

  if (!name) {
    return { success: false, error: 'Name is required' };
  }

  if (!isValidTestQuickName(name)) {
    return {
      success: false,
      error: 'Invalid name. Use lowercase alphanumeric with hyphens (e.g., my-item)',
    };
  }

  const items = await loadItems(root);

  if (items.some(item => item.name === name)) {
    return { success: false, error: `Item "${name}" already exists` };
  }

  const newItem = createTestQuickItem({ name, description });
  items.push(newItem);

  await saveItems(items, root);

  return { success: true, message: `Item "${name}" created`, data: newItem };
}

/**
 * Gets a single test-quick item by name
 * @param {string} name - Item name
 * @param {string} [root=process.cwd()] - Project root directory
 * @returns {Promise<import('../types/test-quick.js').TestQuickResult>} Item result
 */
export async function getItem(name, root = process.cwd()) {
  const items = await loadItems(root);
  const item = items.find(i => i.name === name);

  if (!item) {
    return { success: false, error: `Item "${name}" not found` };
  }

  return { success: true, data: item };
}

/**
 * Lists all test-quick items with optional filtering
 * @param {Object} [options={}] - Filter options
 * @param {string} [options.status] - Filter by status
 * @param {string} [root=process.cwd()] - Project root directory
 * @returns {Promise<import('../types/test-quick.js').TestQuickListResult>} List result
 */
export async function listItems(options = {}, root = process.cwd()) {
  let items = await loadItems(root);

  if (options.status) {
    items = items.filter(item => item.status === options.status);
  }

  return { success: true, items, total: items.length };
}

/**
 * Updates an existing test-quick item
 * @param {string} name - Item name to update
 * @param {Object} updates - Fields to update
 * @param {string} [updates.description] - New description
 * @param {string} [updates.status] - New status
 * @param {Object} [updates.metadata] - New metadata
 * @param {string} [root=process.cwd()] - Project root directory
 * @returns {Promise<import('../types/test-quick.js').TestQuickResult>} Update result
 */
export async function updateItem(name, updates, root = process.cwd()) {
  const items = await loadItems(root);
  const index = items.findIndex(i => i.name === name);

  if (index === -1) {
    return { success: false, error: `Item "${name}" not found` };
  }

  const validStatuses = Object.values(TEST_QUICK_STATUS);
  if (updates.status && !validStatuses.includes(updates.status)) {
    return {
      success: false,
      error: `Invalid status. Valid values: ${validStatuses.join(', ')}`,
    };
  }

  const updatedItem = {
    ...items[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  items[index] = updatedItem;
  await saveItems(items, root);

  return { success: true, message: `Item "${name}" updated`, data: updatedItem };
}

/**
 * Deletes a test-quick item
 * @param {string} name - Item name to delete
 * @param {string} [root=process.cwd()] - Project root directory
 * @returns {Promise<import('../types/test-quick.js').TestQuickResult>} Delete result
 */
export async function deleteItem(name, root = process.cwd()) {
  const items = await loadItems(root);
  const index = items.findIndex(i => i.name === name);

  if (index === -1) {
    return { success: false, error: `Item "${name}" not found` };
  }

  const deletedItem = items[index];
  items.splice(index, 1);

  await saveItems(items, root);

  return { success: true, message: `Item "${name}" deleted`, data: deletedItem };
}

/**
 * Updates the status of a test-quick item
 * @param {string} name - Item name
 * @param {string} status - New status
 * @param {string} [root=process.cwd()] - Project root directory
 * @returns {Promise<import('../types/test-quick.js').TestQuickResult>} Update result
 */
export async function updateStatus(name, status, root = process.cwd()) {
  return updateItem(name, { status }, root);
}

/**
 * Clears all completed items
 * @param {string} [root=process.cwd()] - Project root directory
 * @returns {Promise<{success: boolean, cleared: number}>} Clear result
 */
export async function clearCompleted(root = process.cwd()) {
  const items = await loadItems(root);
  const remaining = items.filter(item => item.status !== TEST_QUICK_STATUS.COMPLETED);
  const clearedCount = items.length - remaining.length;

  await saveItems(remaining, root);

  return { success: true, cleared: clearedCount };
}
