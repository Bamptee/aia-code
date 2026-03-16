/**
 * @fileoverview Integrity Service - Data integrity checks and cleanup
 * @module epic/services/integrity-service
 */

import { StorageError } from '../utils/errors.js';
import { createGeneralEpic } from '../models/epic.js';

/**
 * Issue severity levels
 * @readonly
 * @enum {string}
 */
export const ISSUE_SEVERITY = Object.freeze({
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
});

/**
 * Issue types
 * @readonly
 * @enum {string}
 */
export const ISSUE_TYPE = Object.freeze({
  ORPHANED_STORY: 'orphaned_story',
  MISSING_INDEX: 'missing_index',
  INVALID_REFERENCE: 'invalid_reference',
  MISSING_GENERAL_EPIC: 'missing_general_epic',
  DUPLICATE_ID: 'duplicate_id',
  INVALID_STATUS: 'invalid_status',
  STALE_LOCK: 'stale_lock',
  CORRUPTED_DATA: 'corrupted_data',
});

/**
 * Service for data integrity verification and cleanup
 */
export class IntegrityService {
  /**
   * @param {import('../providers/file-storage-provider.js').FileStorageProvider} storage
   * @param {import('./story-index-service.js').StoryIndexService} storyIndexService
   */
  constructor(storage, storyIndexService) {
    this.storage = storage;
    this.storyIndex = storyIndexService;
  }

  /**
   * Runs a full integrity check
   * @returns {Promise<{healthy: boolean, issues: Array<Object>}>}
   */
  async check() {
    const issues = [];

    // Check General epic exists
    const generalIssues = await this._checkGeneralEpic();
    issues.push(...generalIssues);

    // Check story index integrity
    const indexIssues = await this._checkStoryIndex();
    issues.push(...indexIssues);

    // Check for duplicate IDs
    const duplicateIssues = await this._checkDuplicateIds();
    issues.push(...duplicateIssues);

    // Check linked bug references
    const referenceIssues = await this._checkLinkedReferences();
    issues.push(...referenceIssues);

    // Check for stale locks
    const lockIssues = await this._checkStaleLocks();
    issues.push(...lockIssues);

    // Check story statuses are valid
    const statusIssues = await this._checkStoryStatuses();
    issues.push(...statusIssues);

    const errorCount = issues.filter((i) => i.severity === ISSUE_SEVERITY.ERROR).length;

    return {
      healthy: errorCount === 0,
      issues,
      summary: {
        total: issues.length,
        errors: errorCount,
        warnings: issues.filter((i) => i.severity === ISSUE_SEVERITY.WARNING).length,
        info: issues.filter((i) => i.severity === ISSUE_SEVERITY.INFO).length,
      },
    };
  }

  /**
   * Fixes detected issues where possible
   * @param {Object} [options] - Fix options
   * @param {boolean} [options.dryRun=false] - If true, report fixes without applying
   * @param {string[]} [options.types] - Only fix specific issue types
   * @returns {Promise<{fixed: Array<Object>, skipped: Array<Object>}>}
   */
  async fix(options = {}) {
    const { dryRun = false, types } = options;
    const { issues } = await this.check();

    const fixed = [];
    const skipped = [];

    for (const issue of issues) {
      // Filter by types if specified
      if (types && !types.includes(issue.type)) {
        skipped.push({ ...issue, reason: 'Type not selected for fixing' });
        continue;
      }

      // Try to fix the issue
      const result = await this._fixIssue(issue, dryRun);

      if (result.fixed) {
        fixed.push({ ...issue, fix: result.fix });
      } else {
        skipped.push({ ...issue, reason: result.reason });
      }
    }

    return { fixed, skipped };
  }

  /**
   * Cleans up orphaned data
   * @param {Object} [options] - Cleanup options
   * @param {boolean} [options.dryRun=false] - Report without deleting
   * @returns {Promise<{cleaned: Array<Object>}>}
   */
  async cleanup(options = {}) {
    const { dryRun = false } = options;
    const cleaned = [];

    // Clean orphaned index entries
    const indexResult = await this.storyIndex.validate();
    for (const issue of indexResult.issues) {
      if (issue.type === 'orphaned_index_entry') {
        if (!dryRun) {
          await this.storyIndex.removeStory(issue.storyId);
        }
        cleaned.push({
          type: 'index_entry',
          id: issue.storyId,
          action: 'removed',
        });
      }
    }

    // Clean stale lock files
    const staleLocks = await this._findStaleLocks();
    for (const lock of staleLocks) {
      if (!dryRun) {
        await this._removeLock(lock);
      }
      cleaned.push({
        type: 'lock_file',
        path: lock,
        action: 'removed',
      });
    }

    return { cleaned, dryRun };
  }

  /**
   * Rebuilds the story index from scratch
   * @returns {Promise<{rebuilt: boolean, storyCount: number}>}
   */
  async rebuildIndex() {
    const epics = await this.storage.readAllEpics();
    let storyCount = 0;

    // Clear existing index
    await this.storyIndex.clear();

    // Rebuild from all epics
    for (const epic of epics) {
      for (const story of epic.stories || []) {
        await this.storyIndex.addStory(story.id, epic.id);
        storyCount++;
      }
    }

    return { rebuilt: true, storyCount };
  }

  /**
   * Validates and optionally fixes an epic's data
   * @param {string} epicId - Epic ID to validate
   * @returns {Promise<{valid: boolean, issues: Array<Object>}>}
   */
  async validateEpic(epicId) {
    const issues = [];
    const epic = await this.storage.readEpic(epicId);

    if (!epic) {
      return {
        valid: false,
        issues: [
          {
            type: ISSUE_TYPE.CORRUPTED_DATA,
            severity: ISSUE_SEVERITY.ERROR,
            message: `Epic ${epicId} not found`,
          },
        ],
      };
    }

    // Check required fields
    if (!epic.id) {
      issues.push({
        type: ISSUE_TYPE.CORRUPTED_DATA,
        severity: ISSUE_SEVERITY.ERROR,
        message: 'Epic missing id field',
        epicId,
      });
    }

    if (!epic.name) {
      issues.push({
        type: ISSUE_TYPE.CORRUPTED_DATA,
        severity: ISSUE_SEVERITY.ERROR,
        message: 'Epic missing name field',
        epicId,
      });
    }

    // Check stories
    if (epic.stories) {
      for (const story of epic.stories) {
        const storyIssues = this._validateStoryData(story, epic.id);
        issues.push(...storyIssues);
      }
    }

    return {
      valid: issues.filter((i) => i.severity === ISSUE_SEVERITY.ERROR).length === 0,
      issues,
    };
  }

  /**
   * Gets integrity statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    const epics = await this.storage.readAllEpics();
    const indexData = await this.storyIndex.validate();

    let totalStories = 0;
    let storiesWithIssues = 0;

    for (const epic of epics) {
      for (const story of epic.stories || []) {
        totalStories++;
        const issues = this._validateStoryData(story, epic.id);
        if (issues.length > 0) {
          storiesWithIssues++;
        }
      }
    }

    return {
      epics: {
        total: epics.length,
        archived: epics.filter((e) => e.isArchived).length,
      },
      stories: {
        total: totalStories,
        withIssues: storiesWithIssues,
      },
      index: {
        valid: indexData.valid,
        issueCount: indexData.issues.length,
      },
    };
  }

  // Private methods

  /**
   * @private
   */
  async _checkGeneralEpic() {
    const issues = [];
    const general = await this.storage.getGeneralEpic();

    if (!general) {
      issues.push({
        type: ISSUE_TYPE.MISSING_GENERAL_EPIC,
        severity: ISSUE_SEVERITY.ERROR,
        message: 'General epic not found',
        fixable: true,
      });
    }

    return issues;
  }

  /**
   * @private
   */
  async _checkStoryIndex() {
    const issues = [];
    const indexResult = await this.storyIndex.validate();

    for (const issue of indexResult.issues) {
      if (issue.type === 'orphaned_index_entry') {
        issues.push({
          type: ISSUE_TYPE.ORPHANED_STORY,
          severity: ISSUE_SEVERITY.WARNING,
          message: `Story ${issue.storyId} in index but not in any epic`,
          storyId: issue.storyId,
          fixable: true,
        });
      } else if (issue.type === 'missing_index_entry') {
        issues.push({
          type: ISSUE_TYPE.MISSING_INDEX,
          severity: ISSUE_SEVERITY.WARNING,
          message: `Story ${issue.storyId} not in index`,
          storyId: issue.storyId,
          epicId: issue.actualEpicId,
          fixable: true,
        });
      }
    }

    return issues;
  }

  /**
   * @private
   */
  async _checkDuplicateIds() {
    const issues = [];
    const epics = await this.storage.readAllEpics();
    const seenStoryIds = new Map();

    for (const epic of epics) {
      for (const story of epic.stories || []) {
        if (seenStoryIds.has(story.id)) {
          issues.push({
            type: ISSUE_TYPE.DUPLICATE_ID,
            severity: ISSUE_SEVERITY.ERROR,
            message: `Duplicate story ID ${story.id} in epics ${seenStoryIds.get(story.id)} and ${epic.id}`,
            storyId: story.id,
            epicIds: [seenStoryIds.get(story.id), epic.id],
            fixable: false,
          });
        } else {
          seenStoryIds.set(story.id, epic.id);
        }
      }
    }

    return issues;
  }

  /**
   * @private
   */
  async _checkLinkedReferences() {
    const issues = [];
    const epics = await this.storage.readAllEpics();
    const allStoryIds = new Set();

    // Collect all story IDs
    for (const epic of epics) {
      for (const story of epic.stories || []) {
        allStoryIds.add(story.id);
      }
    }

    // Check linked references
    for (const epic of epics) {
      for (const story of epic.stories || []) {
        if (story.linkedFeatureId && !allStoryIds.has(story.linkedFeatureId)) {
          issues.push({
            type: ISSUE_TYPE.INVALID_REFERENCE,
            severity: ISSUE_SEVERITY.WARNING,
            message: `Bug ${story.id} references non-existent feature ${story.linkedFeatureId}`,
            storyId: story.id,
            linkedFeatureId: story.linkedFeatureId,
            fixable: true,
          });
        }
      }
    }

    return issues;
  }

  /**
   * @private
   */
  async _checkStaleLocks() {
    const issues = [];
    const staleLocks = await this._findStaleLocks();

    for (const lock of staleLocks) {
      issues.push({
        type: ISSUE_TYPE.STALE_LOCK,
        severity: ISSUE_SEVERITY.WARNING,
        message: `Stale lock file: ${lock}`,
        path: lock,
        fixable: true,
      });
    }

    return issues;
  }

  /**
   * @private
   */
  async _checkStoryStatuses() {
    const issues = [];
    const epics = await this.storage.readAllEpics();
    const validStatuses = ['draft', 'in_progress', 'ready_for_dev', 'in_dev', 'testing', 'done'];

    for (const epic of epics) {
      for (const story of epic.stories || []) {
        if (story.status && !validStatuses.includes(story.status)) {
          issues.push({
            type: ISSUE_TYPE.INVALID_STATUS,
            severity: ISSUE_SEVERITY.ERROR,
            message: `Story ${story.id} has invalid status: ${story.status}`,
            storyId: story.id,
            status: story.status,
            fixable: false,
          });
        }
      }
    }

    return issues;
  }

  /**
   * @private
   */
  _validateStoryData(story, epicId) {
    const issues = [];

    if (!story.id) {
      issues.push({
        type: ISSUE_TYPE.CORRUPTED_DATA,
        severity: ISSUE_SEVERITY.ERROR,
        message: 'Story missing id field',
        epicId,
      });
    }

    if (!story.title) {
      issues.push({
        type: ISSUE_TYPE.CORRUPTED_DATA,
        severity: ISSUE_SEVERITY.WARNING,
        message: `Story ${story.id || 'unknown'} missing title`,
        storyId: story.id,
        epicId,
      });
    }

    if (!story.type || !['feature', 'bug'].includes(story.type)) {
      issues.push({
        type: ISSUE_TYPE.CORRUPTED_DATA,
        severity: ISSUE_SEVERITY.WARNING,
        message: `Story ${story.id || 'unknown'} has invalid type: ${story.type}`,
        storyId: story.id,
        epicId,
      });
    }

    return issues;
  }

  /**
   * @private
   */
  async _fixIssue(issue, dryRun) {
    switch (issue.type) {
      case ISSUE_TYPE.MISSING_GENERAL_EPIC:
        if (!dryRun) {
          const generalEpic = createGeneralEpic();
          await this.storage.writeEpic(generalEpic);
        }
        return { fixed: true, fix: 'Created General epic' };

      case ISSUE_TYPE.ORPHANED_STORY:
        if (!dryRun) {
          await this.storyIndex.removeStory(issue.storyId);
        }
        return { fixed: true, fix: 'Removed orphaned index entry' };

      case ISSUE_TYPE.MISSING_INDEX:
        if (!dryRun) {
          await this.storyIndex.addStory(issue.storyId, issue.epicId);
        }
        return { fixed: true, fix: 'Added missing index entry' };

      case ISSUE_TYPE.INVALID_REFERENCE:
        if (!dryRun) {
          // Clear the invalid reference
          const epic = await this.storage.readEpic(
            await this.storyIndex.getEpicIdForStory(issue.storyId)
          );
          if (epic) {
            const story = epic.stories?.find((s) => s.id === issue.storyId);
            if (story) {
              story.linkedFeatureId = null;
              await this.storage.writeEpic(epic);
            }
          }
        }
        return { fixed: true, fix: 'Cleared invalid feature reference' };

      case ISSUE_TYPE.STALE_LOCK:
        if (!dryRun) {
          await this._removeLock(issue.path);
        }
        return { fixed: true, fix: 'Removed stale lock' };

      case ISSUE_TYPE.DUPLICATE_ID:
        return { fixed: false, reason: 'Duplicate IDs require manual resolution' };

      case ISSUE_TYPE.INVALID_STATUS:
        return { fixed: false, reason: 'Invalid status requires manual review' };

      case ISSUE_TYPE.CORRUPTED_DATA:
        return { fixed: false, reason: 'Corrupted data requires manual repair' };

      default:
        return { fixed: false, reason: 'Unknown issue type' };
    }
  }

  /**
   * @private
   */
  async _findStaleLocks() {
    // Look for .lock files older than 5 minutes
    const staleLocks = [];
    const lockAge = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();

    try {
      const locksPath = this.storage.basePath;
      const fs = await import('fs-extra');
      const path = await import('path');

      const files = await fs.readdir(locksPath);
      for (const file of files) {
        if (file.endsWith('.lock')) {
          const lockPath = path.join(locksPath, file);
          const stat = await fs.stat(lockPath);
          if (now - stat.mtimeMs > lockAge) {
            staleLocks.push(lockPath);
          }
        }
      }

      // Check epics directory
      const epicsPath = path.join(locksPath, 'epics');
      if (await fs.pathExists(epicsPath)) {
        const epicFiles = await fs.readdir(epicsPath);
        for (const file of epicFiles) {
          if (file.endsWith('.lock')) {
            const lockPath = path.join(epicsPath, file);
            const stat = await fs.stat(lockPath);
            if (now - stat.mtimeMs > lockAge) {
              staleLocks.push(lockPath);
            }
          }
        }
      }
    } catch {
      // Ignore errors in lock checking
    }

    return staleLocks;
  }

  /**
   * @private
   */
  async _removeLock(lockPath) {
    try {
      const fs = await import('fs-extra');
      await fs.remove(lockPath);
    } catch {
      // Ignore removal errors
    }
  }
}
