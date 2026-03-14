/**
 * @fileoverview Migration Service - Data migration and validation
 * @module epic/services/migration-service
 */

import { StorageError, ValidationError } from '../utils/errors.js';
import { createGeneralEpic, createEpic } from '../models/epic.js';
import { createStory } from '../models/story.js';
import { createDefaultConfig } from '../models/config.js';

/**
 * Current data version
 * @type {string}
 */
const CURRENT_VERSION = '1.0.0';

/**
 * Service for data migration and system initialization
 */
export class MigrationService {
  /**
   * @param {import('../providers/file-storage-provider.js').FileStorageProvider} storage
   * @param {import('./story-index-service.js').StoryIndexService} storyIndexService
   */
  constructor(storage, storyIndexService) {
    this.storage = storage;
    this.storyIndex = storyIndexService;
  }

  /**
   * Initializes the epic system
   * @param {Object} [options] - Initialization options
   * @param {boolean} [options.force=false] - Force re-initialization
   * @returns {Promise<{initialized: boolean, created: string[]}>}
   */
  async initialize(options = {}) {
    const { force = false } = options;

    const isInitialized = await this.storage.isInitialized();
    if (isInitialized && !force) {
      return { initialized: false, created: [] };
    }

    await this.storage.ensureDirectories();

    const created = [];

    // Create General epic
    const generalEpic = createGeneralEpic();
    await this.storage.writeEpic(generalEpic);
    created.push('General Epic');

    // Create default config
    const config = createDefaultConfig();
    await this.storage.writeConfig(config);
    created.push('Config');

    // Initialize story index
    await this.storyIndex.rebuild();
    created.push('Story Index');

    return { initialized: true, created };
  }

  /**
   * Checks system integrity and repairs issues
   * @returns {Promise<{status: string, issues: string[], repaired: string[]}>}
   */
  async diagnose() {
    const issues = [];
    const repaired = [];

    try {
      // Check if initialized
      const isInit = await this.storage.isInitialized();
      if (!isInit) {
        issues.push('System not initialized');
      }

      // Check General epic
      const general = await this.storage.getGeneralEpic();
      if (!general) {
        issues.push('General epic missing');
      }

      // Check config
      const config = await this.storage.readConfig();
      if (!config) {
        issues.push('Config file missing');
      }

      // Check story index integrity
      const indexResult = await this.storyIndex.validate();
      if (!indexResult.valid) {
        const orphaned = indexResult.issues.filter((i) => i.type === 'orphaned_index_entry').length;
        const missing = indexResult.issues.filter((i) => i.type === 'missing_index_entry').length;
        issues.push(`Story index has ${orphaned} orphaned entries and ${missing} missing entries`);
      }

      // Check epics structure
      const epics = await this.storage.readAllEpics();
      for (const epic of epics) {
        if (!epic.id) {
          issues.push(`Epic without ID found`);
        }
        if (!epic.name) {
          issues.push(`Epic ${epic.id} has no name`);
        }
        for (const story of epic.stories || []) {
          if (!story.id) {
            issues.push(`Story without ID in epic ${epic.id}`);
          }
          if (!story.title) {
            issues.push(`Story ${story.id} has no title`);
          }
        }
      }

      return {
        status: issues.length === 0 ? 'healthy' : 'issues_found',
        issues,
        repaired,
      };
    } catch (error) {
      issues.push(`Diagnostic error: ${error.message}`);
      return {
        status: 'error',
        issues,
        repaired,
      };
    }
  }

  /**
   * Repairs detected issues
   * @returns {Promise<{repaired: string[], failed: string[]}>}
   */
  async repair() {
    const repaired = [];
    const failed = [];

    try {
      // Ensure directories
      await this.storage.ensureDirectories();
      repaired.push('Directories ensured');

      // Check and create General epic
      const general = await this.storage.getGeneralEpic();
      if (!general) {
        const newGeneral = createGeneralEpic();
        await this.storage.writeEpic(newGeneral);
        repaired.push('General epic created');
      }

      // Check and create config
      const config = await this.storage.readConfig();
      if (!config) {
        const newConfig = createDefaultConfig();
        await this.storage.writeConfig(newConfig);
        repaired.push('Config created');
      }

      // Rebuild story index
      const { added, removed } = await this.storyIndex.rebuild();
      if (added > 0 || removed > 0) {
        repaired.push(`Story index rebuilt (added: ${added}, removed: ${removed})`);
      }

      return { repaired, failed };
    } catch (error) {
      failed.push(`Repair error: ${error.message}`);
      return { repaired, failed };
    }
  }

  /**
   * Imports data from external source
   * @param {Object} data - Data to import
   * @param {Array<Object>} [data.epics] - Epics to import
   * @param {Object} [options] - Import options
   * @param {boolean} [options.merge=true] - Merge with existing data
   * @param {boolean} [options.dryRun=false] - Preview without saving
   * @returns {Promise<{imported: {epics: number, stories: number}, skipped: number, errors: string[]}>}
   */
  async importData(data, options = {}) {
    const { merge = true, dryRun = false } = options;

    const result = {
      imported: { epics: 0, stories: 0 },
      skipped: 0,
      errors: [],
    };

    if (!data || !data.epics || !Array.isArray(data.epics)) {
      throw new ValidationError('Import data must contain an epics array');
    }

    for (const epicData of data.epics) {
      try {
        // Validate epic
        if (!epicData.name) {
          result.errors.push(`Epic without name skipped`);
          result.skipped++;
          continue;
        }

        // Check if epic exists
        let existingEpic = null;
        if (epicData.id) {
          existingEpic = await this.storage.readEpic(epicData.id);
        }

        if (existingEpic && !merge) {
          result.skipped++;
          continue;
        }

        // Create or update epic
        const epic = existingEpic || createEpic({ name: epicData.name });
        epic.name = epicData.name;
        epic.description = epicData.description || epic.description;
        epic.status = epicData.status || epic.status;
        epic.plannedPeriod = epicData.plannedPeriod || epic.plannedPeriod;

        // Import stories
        if (epicData.stories && Array.isArray(epicData.stories)) {
          for (const storyData of epicData.stories) {
            if (!storyData.title || !storyData.type) {
              result.errors.push(`Story without title/type in epic ${epic.name} skipped`);
              result.skipped++;
              continue;
            }

            // Check if story exists
            const existingStory = epic.stories?.find((s) => s.id === storyData.id);
            if (existingStory && !merge) {
              result.skipped++;
              continue;
            }

            const story = existingStory || createStory({
              title: storyData.title,
              type: storyData.type,
            });

            story.title = storyData.title;
            story.description = storyData.description || story.description;
            story.status = storyData.status || story.status;
            story.space = storyData.space || story.space;

            // Import step content
            if (storyData.steps) {
              for (const [stepName, stepData] of Object.entries(storyData.steps)) {
                if (story.steps[stepName]) {
                  story.steps[stepName].completed = stepData.completed || false;
                  story.steps[stepName].skipped = stepData.skipped || false;
                  story.steps[stepName].content = stepData.content || null;
                }
              }
            }

            if (!existingStory) {
              epic.stories = epic.stories || [];
              epic.stories.push(story);
            }
            result.imported.stories++;
          }
        }

        if (!dryRun) {
          await this.storage.writeEpic(epic);
          if (!existingEpic) {
            result.imported.epics++;
          }
        } else {
          result.imported.epics++;
        }
      } catch (error) {
        result.errors.push(`Failed to import epic ${epicData.name}: ${error.message}`);
      }
    }

    // Rebuild index if not dry run
    if (!dryRun) {
      await this.storyIndex.rebuild();
    }

    return result;
  }

  /**
   * Exports all data
   * @param {Object} [options] - Export options
   * @param {boolean} [options.includeArchived=true] - Include archived epics
   * @returns {Promise<Object>} Exported data
   */
  async exportData(options = {}) {
    const { includeArchived = true } = options;

    const epics = await this.storage.readAllEpics();
    const config = await this.storage.readConfig();

    const exportedEpics = [];

    for (const epic of epics) {
      if (!includeArchived && epic.isArchived) {
        continue;
      }

      exportedEpics.push({
        id: epic.id,
        name: epic.name,
        description: epic.description,
        status: epic.status,
        isGeneral: epic.isGeneral,
        isArchived: epic.isArchived,
        plannedPeriod: epic.plannedPeriod,
        stories: (epic.stories || []).map((story) => ({
          id: story.id,
          type: story.type,
          title: story.title,
          description: story.description,
          status: story.status,
          space: story.space,
          steps: story.steps,
          linkedFeatureId: story.linkedFeatureId,
          figmaUrl: story.figmaUrl,
        })),
        createdAt: epic.createdAt,
        updatedAt: epic.updatedAt,
      });
    }

    return {
      version: CURRENT_VERSION,
      exportedAt: new Date().toISOString(),
      config,
      epics: exportedEpics,
    };
  }

  /**
   * Gets system statistics
   * @returns {Promise<Object>} System stats
   */
  async getStats() {
    const epics = await this.storage.readAllEpics();
    const config = await this.storage.readConfig();

    let totalStories = 0;
    let totalDoneStories = 0;

    for (const epic of epics) {
      totalStories += (epic.stories || []).length;
      totalDoneStories += (epic.stories || []).filter((s) => s.status === 'done').length;
    }

    return {
      version: CURRENT_VERSION,
      initialized: epics.length > 0,
      epics: {
        total: epics.length,
        active: epics.filter((e) => !e.isArchived).length,
        archived: epics.filter((e) => e.isArchived).length,
      },
      stories: {
        total: totalStories,
        done: totalDoneStories,
        completion: totalStories > 0 ? Math.round((totalDoneStories / totalStories) * 100) : 0,
      },
      config: config ? { version: config.version } : null,
    };
  }

  /**
   * Clears all data (destructive)
   * @param {Object} options - Options
   * @param {boolean} options.confirm - Must be true to proceed
   * @returns {Promise<void>}
   */
  async clearAll(options) {
    if (!options || options.confirm !== true) {
      throw new ValidationError('Must confirm with { confirm: true } to clear all data');
    }

    const epics = await this.storage.readAllEpics();

    for (const epic of epics) {
      await this.storage.deleteEpic(epic.id);
    }

    // Reinitialize with fresh data
    await this.initialize({ force: true });
  }
}
