/**
 * @fileoverview Epic model definition and factory functions
 * @module epic/models/epic
 */

import { generateUUID, GENERAL_EPIC_ID } from '../utils/id-generator.js';
import { EPIC_STATUS } from './validators.js';

/**
 * @typedef {Object} Epic
 * @property {string} id - UUID v4
 * @property {string} name - Display name (1-100 characters)
 * @property {string|null} description - Optional detailed description
 * @property {string} status - Current status (discovery, planning, in_progress, testing, done)
 * @property {boolean} isGeneral - True only for system General Epic
 * @property {boolean} isArchived - Archive status
 * @property {string|null} plannedPeriod - Time period assignment (e.g., "2026-Q2", "2026-03", "2026-W12")
 * @property {Array<import('./story.js').Story>} stories - Embedded stories array
 * @property {string} createdAt - ISO 8601 timestamp
 * @property {string} updatedAt - ISO 8601 timestamp
 */

/**
 * Creates a new Epic object
 * @param {Object} data - Epic data
 * @param {string} data.name - Epic name (required)
 * @param {string} [data.description] - Epic description
 * @param {string} [data.status='discovery'] - Initial status
 * @param {string} [data.plannedPeriod] - Time period assignment
 * @returns {Epic} New Epic object
 */
export function createEpic(data) {
  const now = new Date().toISOString();

  return {
    id: generateUUID(),
    name: data.name.trim(),
    description: data.description?.trim() || null,
    status: data.status || EPIC_STATUS.DISCOVERY,
    isGeneral: false,
    isArchived: false,
    plannedPeriod: data.plannedPeriod || null,
    stories: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Creates the system General Epic
 * @returns {Epic} General Epic object
 */
export function createGeneralEpic() {
  const now = new Date().toISOString();

  return {
    id: GENERAL_EPIC_ID,
    name: 'General',
    description: 'Default Epic for unorganized items',
    status: EPIC_STATUS.IN_PROGRESS,
    isGeneral: true,
    isArchived: false,
    plannedPeriod: null,
    stories: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Calculates progress percentage for an Epic
 * @param {Epic} epic - Epic to calculate progress for
 * @returns {number} Progress percentage (0-100)
 */
export function calculateEpicProgress(epic) {
  if (!epic.stories || epic.stories.length === 0) {
    return 0;
  }
  const doneCount = epic.stories.filter((s) => s.status === 'done').length;
  return Math.round((doneCount / epic.stories.length) * 100);
}

/**
 * Checks if an Epic can be moved to 'done' status
 * @param {Epic} epic - Epic to check
 * @returns {{canComplete: boolean, incompleteCount: number}} Result
 */
export function canCompleteEpic(epic) {
  const incompleteStories = epic.stories.filter((s) => s.status !== 'done');
  return {
    canComplete: incompleteStories.length === 0,
    incompleteCount: incompleteStories.length,
  };
}

/**
 * Checks if an Epic can be deleted
 * @param {Epic} epic - Epic to check
 * @returns {{canDelete: boolean, reason: string|null}} Result
 */
export function canDeleteEpic(epic) {
  if (epic.isGeneral) {
    return { canDelete: false, reason: 'Cannot delete the General Epic' };
  }
  if (epic.stories.length > 0) {
    return {
      canDelete: false,
      reason: `Cannot delete Epic with ${epic.stories.length} stories. Move or delete stories first.`,
    };
  }
  return { canDelete: true, reason: null };
}

/**
 * Updates Epic timestamp
 * @param {Epic} epic - Epic to update
 * @returns {Epic} Updated Epic with new timestamp
 */
export function touchEpic(epic) {
  return {
    ...epic,
    updatedAt: new Date().toISOString(),
  };
}
