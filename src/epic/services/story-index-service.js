/**
 * @fileoverview Story Index Service for efficient story lookups
 * @module epic/services/story-index-service
 */

import { StorageError } from '../utils/errors.js';

/**
 * Service for managing the story-to-epic index
 * Provides O(1) lookups of which epic contains a story
 */
export class StoryIndexService {
  /**
   * @param {import('../providers/file-storage-provider.js').FileStorageProvider} storage
   */
  constructor(storage) {
    this.storage = storage;
  }

  /**
   * Rebuilds the entire story index from existing epics
   * @returns {Promise<Object<string, string>>} The rebuilt index
   */
  async rebuild() {
    const epics = await this.storage.readAllEpics();
    const index = {};

    for (const epic of epics) {
      for (const story of epic.stories || []) {
        index[story.id] = epic.id;
      }
    }

    await this.storage.writeStoryIndex(index);
    return index;
  }

  /**
   * Adds a story to the index
   * @param {string} storyId - Story ID
   * @param {string} epicId - Epic ID containing the story
   * @returns {Promise<void>}
   */
  async addStory(storyId, epicId) {
    const index = await this.storage.readStoryIndex();
    index[storyId] = epicId;
    await this.storage.writeStoryIndex(index);
  }

  /**
   * Moves a story to a new epic in the index
   * @param {string} storyId - Story ID
   * @param {string} newEpicId - New Epic ID
   * @returns {Promise<void>}
   */
  async moveStory(storyId, newEpicId) {
    const index = await this.storage.readStoryIndex();
    index[storyId] = newEpicId;
    await this.storage.writeStoryIndex(index);
  }

  /**
   * Removes a story from the index
   * @param {string} storyId - Story ID to remove
   * @returns {Promise<void>}
   */
  async removeStory(storyId) {
    const index = await this.storage.readStoryIndex();
    delete index[storyId];
    await this.storage.writeStoryIndex(index);
  }

  /**
   * Gets the Epic ID for a story
   * @param {string} storyId - Story ID to look up
   * @returns {Promise<string|null>} Epic ID or null if not found
   */
  async getEpicIdForStory(storyId) {
    const index = await this.storage.readStoryIndex();
    return index[storyId] || null;
  }

  /**
   * Checks if a story exists in the index
   * @param {string} storyId - Story ID to check
   * @returns {Promise<boolean>}
   */
  async hasStory(storyId) {
    const epicId = await this.getEpicIdForStory(storyId);
    return epicId !== null;
  }

  /**
   * Gets all story IDs for an epic
   * @param {string} epicId - Epic ID to get stories for
   * @returns {Promise<string[]>} Array of story IDs
   */
  async getStoriesForEpic(epicId) {
    const index = await this.storage.readStoryIndex();
    return Object.entries(index)
      .filter(([, eId]) => eId === epicId)
      .map(([storyId]) => storyId);
  }

  /**
   * Validates the index against actual epic data
   * @returns {Promise<{valid: boolean, issues: Array<Object>}>}
   */
  async validate() {
    const index = await this.storage.readStoryIndex();
    const epics = await this.storage.readAllEpics();
    const issues = [];

    // Build a map of actual story locations
    const actualLocations = new Map();
    for (const epic of epics) {
      for (const story of epic.stories || []) {
        actualLocations.set(story.id, epic.id);
      }
    }

    // Check for stories in index but not in epics
    for (const [storyId, indexedEpicId] of Object.entries(index)) {
      const actualEpicId = actualLocations.get(storyId);
      if (!actualEpicId) {
        issues.push({
          type: 'orphaned_index_entry',
          storyId,
          indexedEpicId,
          message: `Story ${storyId} is in index but not found in any epic`,
        });
      } else if (actualEpicId !== indexedEpicId) {
        issues.push({
          type: 'wrong_epic',
          storyId,
          indexedEpicId,
          actualEpicId,
          message: `Story ${storyId} is indexed under ${indexedEpicId} but actually in ${actualEpicId}`,
        });
      }
    }

    // Check for stories in epics but not in index
    for (const [storyId, actualEpicId] of actualLocations) {
      if (!index[storyId]) {
        issues.push({
          type: 'missing_index_entry',
          storyId,
          actualEpicId,
          message: `Story ${storyId} is in epic ${actualEpicId} but not in index`,
        });
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Validates and auto-repairs the index if corrupted
   * @returns {Promise<{repaired: boolean, issues: Array<Object>}>}
   */
  async validateAndRepair() {
    const validation = await this.validate();

    if (!validation.valid) {
      // Rebuild the index from scratch
      await this.rebuild();
      return {
        repaired: true,
        issues: validation.issues,
      };
    }

    return {
      repaired: false,
      issues: [],
    };
  }

  /**
   * Gets the current index
   * @returns {Promise<Object<string, string>>}
   */
  async getIndex() {
    return this.storage.readStoryIndex();
  }

  /**
   * Gets statistics about the index
   * @returns {Promise<{totalStories: number, epicsWithStories: number}>}
   */
  async getStats() {
    const index = await this.storage.readStoryIndex();
    const epicIds = new Set(Object.values(index));

    return {
      totalStories: Object.keys(index).length,
      epicsWithStories: epicIds.size,
    };
  }

  /**
   * Clears all entries from the index
   * @returns {Promise<void>}
   */
  async clear() {
    await this.storage.writeStoryIndex({});
  }
}
