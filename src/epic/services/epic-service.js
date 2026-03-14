/**
 * @fileoverview Epic Service - CRUD operations for Epics
 * @module epic/services/epic-service
 */

import { ValidationError, NotFoundError, BusinessRuleError } from '../utils/errors.js';
import { validateEpic, assertValid, EPIC_STATUS, isValidEpicStatus } from '../models/validators.js';
import {
  createEpic as createEpicModel,
  createGeneralEpic,
  calculateEpicProgress,
  canCompleteEpic,
  canDeleteEpic,
  touchEpic,
} from '../models/epic.js';
import { GENERAL_EPIC_ID } from '../utils/id-generator.js';

/**
 * Service for managing Epics
 */
export class EpicService {
  /**
   * @param {import('../providers/file-storage-provider.js').FileStorageProvider} storage
   * @param {import('./story-index-service.js').StoryIndexService} [storyIndexService]
   */
  constructor(storage, storyIndexService = null) {
    this.storage = storage;
    this.storyIndex = storyIndexService;
  }

  /**
   * Creates a new Epic
   * @param {Object} data - Epic data
   * @param {string} data.name - Epic name (required)
   * @param {string} [data.description] - Epic description
   * @param {string} [data.status='discovery'] - Initial status
   * @param {string} [data.plannedPeriod] - Time period assignment
   * @returns {Promise<import('../models/epic.js').Epic>} Created Epic
   * @throws {ValidationError} If data is invalid
   */
  async create(data) {
    // Validate input
    assertValid(data, validateEpic);

    const epic = createEpicModel(data);
    await this.storage.writeEpic(epic);

    return epic;
  }

  /**
   * Gets an Epic by ID
   * @param {string} epicId - Epic ID
   * @returns {Promise<import('../models/epic.js').Epic>} Epic
   * @throws {NotFoundError} If Epic not found
   */
  async getById(epicId) {
    const epic = await this.storage.readEpic(epicId);

    if (!epic) {
      throw new NotFoundError(`Epic ${epicId} not found`);
    }

    return epic;
  }

  /**
   * Lists all Epics
   * @param {Object} [options] - Filter options
   * @param {boolean} [options.includeArchived=false] - Include archived Epics
   * @param {string} [options.status] - Filter by status
   * @returns {Promise<Array<import('../models/epic.js').Epic>>} Array of Epics
   */
  async list(options = {}) {
    const epics = await this.storage.readAllEpics();

    let filtered = epics;

    // Filter archived
    if (!options.includeArchived) {
      filtered = filtered.filter((e) => !e.isArchived);
    }

    // Filter by status
    if (options.status) {
      filtered = filtered.filter((e) => e.status === options.status);
    }

    // Sort: General first, then alphabetically by name
    filtered.sort((a, b) => {
      if (a.isGeneral) return -1;
      if (b.isGeneral) return 1;
      return a.name.localeCompare(b.name);
    });

    // Calculate progress for each epic
    return filtered.map((epic) => ({
      ...epic,
      progress: calculateEpicProgress(epic),
    }));
  }

  /**
   * Updates an Epic
   * @param {string} epicId - Epic ID
   * @param {Object} data - Update data
   * @param {string} [data.name] - New name
   * @param {string} [data.description] - New description
   * @param {string} [data.plannedPeriod] - New planned period
   * @returns {Promise<import('../models/epic.js').Epic>} Updated Epic
   * @throws {NotFoundError} If Epic not found
   * @throws {ValidationError} If data is invalid
   * @throws {BusinessRuleError} If trying to modify immutable fields on General Epic
   */
  async update(epicId, data) {
    const epic = await this.getById(epicId);

    // Validate name if provided
    if (data.name !== undefined) {
      if (epic.isGeneral) {
        throw new BusinessRuleError('Cannot rename the General Epic');
      }
      const validation = validateEpic({ name: data.name });
      if (!validation.valid) {
        throw new ValidationError(
          validation.errors.map((e) => e.message).join('; '),
          validation.errors
        );
      }
      epic.name = data.name.trim();
    }

    // Update description
    if (data.description !== undefined) {
      epic.description = data.description?.trim() || null;
    }

    // Update planned period
    if (data.plannedPeriod !== undefined) {
      epic.plannedPeriod = data.plannedPeriod || null;
    }

    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);
    return epic;
  }

  /**
   * Updates Epic status
   * @param {string} epicId - Epic ID
   * @param {string} newStatus - New status
   * @returns {Promise<import('../models/epic.js').Epic>} Updated Epic
   * @throws {NotFoundError} If Epic not found
   * @throws {ValidationError} If status is invalid
   * @throws {BusinessRuleError} If cannot move to 'done' with incomplete stories
   */
  async updateStatus(epicId, newStatus) {
    if (!isValidEpicStatus(newStatus)) {
      throw new ValidationError(`Invalid status: ${newStatus}. Must be one of: ${Object.values(EPIC_STATUS).join(', ')}`);
    }

    const epic = await this.getById(epicId);

    // Business rule: Cannot move to 'done' if stories aren't done
    if (newStatus === EPIC_STATUS.DONE) {
      const { canComplete, incompleteCount } = canCompleteEpic(epic);
      if (!canComplete) {
        throw new BusinessRuleError(
          `Cannot mark Epic as done: ${incompleteCount} stories are not completed`
        );
      }
    }

    epic.status = newStatus;
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);
    return epic;
  }

  /**
   * Deletes an Epic (if empty and not General)
   * @param {string} epicId - Epic ID
   * @returns {Promise<void>}
   * @throws {NotFoundError} If Epic not found
   * @throws {BusinessRuleError} If Epic cannot be deleted
   */
  async delete(epicId) {
    const epic = await this.getById(epicId);

    const { canDelete, reason } = canDeleteEpic(epic);
    if (!canDelete) {
      throw new BusinessRuleError(reason);
    }

    await this.storage.deleteEpic(epicId);
  }

  /**
   * Archives an Epic
   * @param {string} epicId - Epic ID
   * @returns {Promise<import('../models/epic.js').Epic>} Archived Epic
   * @throws {NotFoundError} If Epic not found
   * @throws {BusinessRuleError} If trying to archive General Epic
   */
  async archive(epicId) {
    const epic = await this.getById(epicId);

    if (epic.isGeneral) {
      throw new BusinessRuleError('Cannot archive the General Epic');
    }

    epic.isArchived = true;
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);
    return epic;
  }

  /**
   * Unarchives an Epic
   * @param {string} epicId - Epic ID
   * @returns {Promise<import('../models/epic.js').Epic>} Unarchived Epic
   * @throws {NotFoundError} If Epic not found
   */
  async unarchive(epicId) {
    const epic = await this.getById(epicId);

    epic.isArchived = false;
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);
    return epic;
  }

  /**
   * Calculates progress for an Epic
   * @param {import('../models/epic.js').Epic} epic - Epic
   * @returns {number} Progress percentage (0-100)
   */
  calculateProgress(epic) {
    return calculateEpicProgress(epic);
  }

  /**
   * Gets or creates the General Epic
   * @returns {Promise<import('../models/epic.js').Epic>} General Epic
   */
  async getOrCreateGeneralEpic() {
    let general = await this.storage.getGeneralEpic();

    if (!general) {
      general = createGeneralEpic();
      await this.storage.writeEpic(general, '_general.json');
    }

    return general;
  }

  /**
   * Gets the General Epic ID
   * @returns {string}
   */
  getGeneralEpicId() {
    return GENERAL_EPIC_ID;
  }

  /**
   * Checks if an Epic exists
   * @param {string} epicId - Epic ID
   * @returns {Promise<boolean>}
   */
  async exists(epicId) {
    const epic = await this.storage.readEpic(epicId);
    return epic !== null;
  }

  /**
   * Gets Epic statistics
   * @returns {Promise<Object>} Statistics
   */
  async getStats() {
    const epics = await this.storage.readAllEpics();

    const stats = {
      total: epics.length,
      active: 0,
      archived: 0,
      byStatus: {},
      totalStories: 0,
      completedStories: 0,
    };

    for (const status of Object.values(EPIC_STATUS)) {
      stats.byStatus[status] = 0;
    }

    for (const epic of epics) {
      if (epic.isArchived) {
        stats.archived++;
      } else {
        stats.active++;
        stats.byStatus[epic.status] = (stats.byStatus[epic.status] || 0) + 1;
      }

      stats.totalStories += epic.stories?.length || 0;
      stats.completedStories += (epic.stories || []).filter((s) => s.status === 'done').length;
    }

    return stats;
  }
}
