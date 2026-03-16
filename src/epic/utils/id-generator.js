/**
 * @fileoverview UUID generation utilities for Epic & Product Management System
 * @module epic/utils/id-generator
 */

import { randomUUID } from 'node:crypto';

/**
 * Generates a UUID v4
 * @returns {string} UUID string
 */
export function generateUUID() {
  return randomUUID();
}

/**
 * Fixed UUID for the General Epic (system-managed)
 * @constant {string}
 */
export const GENERAL_EPIC_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Validates if a string is a valid UUID format
 * @param {string} id - String to validate
 * @returns {boolean} True if valid UUID format
 */
export function isValidUUID(id) {
  if (!id || typeof id !== 'string') {
    return false;
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Generates a unique ID with collision checking
 * @param {Function} existsChecker - Async function that returns true if ID exists
 * @param {number} [maxAttempts=5] - Maximum attempts before throwing
 * @returns {Promise<string>} Unique UUID string
 * @throws {Error} If unique ID cannot be generated after maxAttempts
 */
export async function generateUniqueId(existsChecker, maxAttempts = 5) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const id = generateUUID();
    const exists = await existsChecker(id);
    if (!exists) {
      return id;
    }
  }
  throw new Error(`Failed to generate unique ID after ${maxAttempts} attempts`);
}
