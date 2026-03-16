/**
 * @fileoverview Story Service - CRUD operations for Stories
 * @module epic/services/story-service
 */

import { ValidationError, NotFoundError, BusinessRuleError } from '../utils/errors.js';
import {
  validateStory,
  assertValid,
  STORY_STATUS,
  STORY_SPACE,
  STORY_STEPS,
  STEP_KEY_MAP,
  STEP_API_MAP,
  PRODUCT_STEPS,
  isValidStoryStatus,
  isValidStepName,
  normalizeStepName,
  normalizeStoryStatus,
} from '../models/validators.js';
import {
  createStory as createStoryModel,
  canPromoteStory,
  canDeleteStory,
  touchStory,
  enableTaskMode as enableTaskModeModel,
  updateTaskSummary as updateTaskSummaryModel,
} from '../models/story.js';
import { GENERAL_EPIC_ID } from '../utils/id-generator.js';

/**
 * Service for managing Stories
 */
export class StoryService {
  /**
   * @param {import('../providers/file-storage-provider.js').FileStorageProvider} storage
   * @param {import('./story-index-service.js').StoryIndexService} storyIndexService
   * @param {import('./epic-service.js').EpicService} [epicService]
   */
  constructor(storage, storyIndexService, epicService = null) {
    this.storage = storage;
    this.storyIndex = storyIndexService;
    this.epicService = epicService;
  }

  /**
   * Creates a new Story within an Epic
   * @param {string} epicId - Epic ID to add story to
   * @param {Object} data - Story data
   * @param {string} data.title - Story title (required)
   * @param {string} data.type - Story type: 'feature' or 'bug' (required)
   * @param {string} [data.description] - Story description
   * @param {string} [data.space='experimentation'] - Workflow space
   * @param {string} [data.linkedFeatureId] - Linked feature ID for bugs
   * @returns {Promise<import('../models/story.js').Story>} Created Story
   * @throws {ValidationError} If data is invalid
   * @throws {NotFoundError} If Epic not found
   */
  async create(epicId, data) {
    // Validate input
    assertValid(data, validateStory);

    // Get epic
    const epic = await this.storage.readEpic(epicId);
    if (!epic) {
      throw new NotFoundError(`Epic ${epicId} not found`);
    }

    // Create story
    const story = createStoryModel(data);

    // If Bug linked to Feature, keep in same epic (already using provided epicId)
    // The linking is just for reference
    if (data.type === 'bug' && data.linkedFeatureId) {
      story.linkedFeatureId = data.linkedFeatureId;
    }

    // Add story to epic
    epic.stories = epic.stories || [];
    epic.stories.push(story);
    epic.updatedAt = new Date().toISOString();

    // Save epic
    await this.storage.writeEpic(epic);

    // Update story index
    await this.storyIndex.addStory(story.id, epic.id);

    return story;
  }

  /**
   * Finds a Story by ID with its containing Epic
   * @param {string} storyId - Story ID
   * @returns {Promise<{epic: import('../models/epic.js').Epic|null, story: import('../models/story.js').Story|null}>}
   */
  async findStoryWithEpic(storyId) {
    // Use index for O(1) lookup
    const epicId = await this.storyIndex.getEpicIdForStory(storyId);

    if (!epicId) {
      // Fallback to scanning all epics
      const epics = await this.storage.readAllEpics();
      for (const epic of epics) {
        const story = (epic.stories || []).find((s) => s.id === storyId);
        if (story) {
          // Update index for future lookups
          await this.storyIndex.addStory(storyId, epic.id);
          return { epic, story };
        }
      }
      return { epic: null, story: null };
    }

    const epic = await this.storage.readEpic(epicId);
    if (!epic) {
      return { epic: null, story: null };
    }

    const story = (epic.stories || []).find((s) => s.id === storyId);
    return { epic, story: story || null };
  }

  /**
   * Gets a Story by ID
   * @param {string} storyId - Story ID
   * @returns {Promise<import('../models/story.js').Story>}
   * @throws {NotFoundError} If Story not found
   */
  async getById(storyId) {
    const { story } = await this.findStoryWithEpic(storyId);
    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }
    return story;
  }

  /**
   * Lists Stories by filter criteria
   * @param {Object} [filters] - Filter options
   * @param {string} [filters.epicId] - Filter by Epic ID
   * @param {string} [filters.space] - Filter by space (experimentation, development)
   * @param {string} [filters.status] - Filter by status
   * @param {string} [filters.type] - Filter by type (feature, bug)
   * @returns {Promise<Array<Object>>} Stories with epicId and epicName
   */
  async list(filters = {}) {
    const epics = await this.storage.readAllEpics();
    let stories = [];

    for (const epic of epics) {
      for (const story of epic.stories || []) {
        stories.push({
          ...story,
          epicId: epic.id,
          epicName: epic.name,
        });
      }
    }

    // Apply filters
    if (filters.epicId) {
      stories = stories.filter((s) => s.epicId === filters.epicId);
    }
    if (filters.space) {
      stories = stories.filter((s) => s.space === filters.space);
    }
    if (filters.status) {
      stories = stories.filter((s) => s.status === filters.status);
    }
    if (filters.type) {
      stories = stories.filter((s) => s.type === filters.type);
    }

    return stories;
  }

  /**
   * Updates a Story
   * @param {string} storyId - Story ID
   * @param {Object} data - Update data
   * @param {string} [data.title] - New title
   * @param {string} [data.description] - New description
   * @param {string} [data.status] - New status
   * @returns {Promise<import('../models/story.js').Story>} Updated Story
   * @throws {NotFoundError} If Story not found
   * @throws {ValidationError} If data is invalid
   */
  async update(storyId, data) {
    const { epic, story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    // Validate title if provided
    if (data.title !== undefined) {
      const validation = validateStory({ title: data.title, type: story.type });
      if (!validation.valid) {
        throw new ValidationError(
          validation.errors.map((e) => e.message).join('; '),
          validation.errors
        );
      }
      story.title = data.title.trim();
    }

    // Update description
    if (data.description !== undefined) {
      story.description = data.description?.trim() || null;
    }

    // Update status
    if (data.status !== undefined) {
      if (!isValidStoryStatus(data.status)) {
        throw new ValidationError(`Invalid status: ${data.status}`);
      }
      story.status = data.status;
    }

    story.updatedAt = new Date().toISOString();
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);
    return story;
  }

  /**
   * Deletes a Story
   * @param {string} storyId - Story ID
   * @returns {Promise<void>}
   * @throws {NotFoundError} If Story not found
   * @throws {BusinessRuleError} If Story has linked bugs in non-done status
   */
  async delete(storyId) {
    const { epic, story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    // Get all stories to check for linked bugs
    const allStories = await this.list();
    const { canDelete, reason } = canDeleteStory(story, allStories);

    if (!canDelete) {
      throw new BusinessRuleError(reason);
    }

    // Remove story from epic
    epic.stories = epic.stories.filter((s) => s.id !== storyId);
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);

    // Update story index
    await this.storyIndex.removeStory(storyId);
  }

  /**
   * Updates a Story step
   * @param {string} storyId - Story ID
   * @param {string} stepName - Step name: 'brief', 'baSpec', or 'questions'
   * @param {Object} stepData - Step data
   * @param {boolean} [stepData.completed] - Mark as completed
   * @param {boolean} [stepData.skipped] - Mark as skipped
   * @param {string} [stepData.content] - Step content (when completing)
   * @returns {Promise<import('../models/story.js').Story>} Updated Story
   * @throws {NotFoundError} If Story not found
   * @throws {ValidationError} If step name is invalid
   */
  async updateStep(storyId, stepName, stepData) {
    if (!isValidStepName(stepName)) {
      throw new ValidationError(`Invalid step name: ${stepName}. Must be one of: ${STORY_STEPS.join(', ')}`);
    }

    const { epic, story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    // Ensure step exists (backwards compatibility for stories created before 8 steps)
    if (!story.steps[stepName]) {
      story.steps[stepName] = {
        completed: false,
        skipped: false,
        content: null,
        history: [],
        currentVersion: 0,
      };
    }

    const step = story.steps[stepName];

    if (stepData.completed !== undefined) {
      step.completed = stepData.completed;
      if (stepData.completed) {
        step.skipped = false;
        step.content = stepData.content || null;
      }
    }

    if (stepData.skipped !== undefined) {
      step.skipped = stepData.skipped;
      if (stepData.skipped) {
        step.completed = false;
        step.content = null;
      }
    }

    story.updatedAt = new Date().toISOString();
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);
    return story;
  }

  /**
   * Checks if a Story can be promoted
   * @param {string} storyId - Story ID
   * @returns {Promise<{canPromote: boolean, missingSteps: string[]}>}
   * @throws {NotFoundError} If Story not found
   */
  async canPromote(storyId) {
    const { story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    return canPromoteStory(story);
  }

  /**
   * Promotes a Story from experimentation to development
   * @param {string} storyId - Story ID
   * @returns {Promise<import('../models/story.js').Story>} Promoted Story
   * @throws {NotFoundError} If Story not found
   * @throws {BusinessRuleError} If promotion requirements not met
   */
  async promote(storyId) {
    const { epic, story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    // Check promotion requirements
    const { canPromote: canProm, missingSteps } = canPromoteStory(story);

    if (!canProm) {
      throw new BusinessRuleError(
        `Cannot promote: Steps ${missingSteps.join(', ')} must be completed or explicitly skipped`
      );
    }

    story.status = STORY_STATUS.PENDING;
    story.space = STORY_SPACE.DEVELOPMENT;
    story.updatedAt = new Date().toISOString();
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);
    return story;
  }

  /**
   * Moves a Story between Epics
   * @param {string} storyId - Story ID
   * @param {string} targetEpicId - Target Epic ID
   * @returns {Promise<import('../models/story.js').Story>} Moved Story
   * @throws {NotFoundError} If Story or target Epic not found
   */
  async move(storyId, targetEpicId) {
    const { epic: sourceEpic, story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    const targetEpic = await this.storage.readEpic(targetEpicId);
    if (!targetEpic) {
      throw new NotFoundError(`Target Epic ${targetEpicId} not found`);
    }

    // If same epic, no-op
    if (sourceEpic.id === targetEpic.id) {
      return story;
    }

    // Remove from source
    sourceEpic.stories = sourceEpic.stories.filter((s) => s.id !== storyId);
    sourceEpic.updatedAt = new Date().toISOString();

    // Add to target
    story.updatedAt = new Date().toISOString();
    targetEpic.stories = targetEpic.stories || [];
    targetEpic.stories.push(story);
    targetEpic.updatedAt = new Date().toISOString();

    // Save both epics atomically (write temp files first, then rename)
    // For simplicity, we write sequentially with locking
    await this.storage.writeEpic(sourceEpic);
    await this.storage.writeEpic(targetEpic);

    // Update story index
    await this.storyIndex.moveStory(storyId, targetEpicId);

    return story;
  }

  /**
   * Updates Story status
   * @param {string} storyId - Story ID
   * @param {string} newStatus - New status
   * @returns {Promise<import('../models/story.js').Story>} Updated Story
   * @throws {NotFoundError} If Story not found
   * @throws {ValidationError} If status is invalid
   */
  async updateStatus(storyId, newStatus) {
    if (!isValidStoryStatus(newStatus)) {
      throw new ValidationError(
        `Invalid status: ${newStatus}. Must be one of: ${Object.values(STORY_STATUS).join(', ')}`
      );
    }

    return this.update(storyId, { status: newStatus });
  }

  /**
   * Checks if a Story exists
   * @param {string} storyId - Story ID
   * @returns {Promise<boolean>}
   */
  async exists(storyId) {
    const { story } = await this.findStoryWithEpic(storyId);
    return story !== null;
  }

  /**
   * Gets all linked bugs for a feature
   * @param {string} featureId - Feature ID
   * @returns {Promise<Array<Object>>} Linked bugs with epic info
   */
  async getLinkedBugs(featureId) {
    const allStories = await this.list();
    return allStories.filter(
      (s) => s.type === 'bug' && s.linkedFeatureId === featureId
    );
  }

  /**
   * Gets Story statistics
   * @param {Object} [filters] - Optional filters
   * @returns {Promise<Object>} Statistics
   */
  async getStats(filters = {}) {
    const stories = await this.list(filters);

    const stats = {
      total: stories.length,
      byType: { feature: 0, bug: 0 },
      byStatus: {},
      bySpace: { experimentation: 0, development: 0 },
    };

    for (const status of Object.values(STORY_STATUS)) {
      stats.byStatus[status] = 0;
    }

    for (const story of stories) {
      stats.byType[story.type] = (stats.byType[story.type] || 0) + 1;
      stats.byStatus[story.status] = (stats.byStatus[story.status] || 0) + 1;
      stats.bySpace[story.space] = (stats.bySpace[story.space] || 0) + 1;
    }

    return stats;
  }

  /**
   * Enables task mode for a story
   * @param {string} storyId - Story ID
   * @returns {Promise<import('../models/story.js').Story>} Updated story
   * @throws {NotFoundError} If Story not found
   */
  async enableTaskMode(storyId) {
    const { epic, story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    if (story.taskMode) {
      return story; // Already enabled
    }

    // Find the story in the epic and update it
    const storyIndex = epic.stories.findIndex((s) => s.id === storyId);
    if (storyIndex === -1) {
      throw new NotFoundError(`Story ${storyId} not found in epic`);
    }

    epic.stories[storyIndex] = enableTaskModeModel(story);
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);
    return epic.stories[storyIndex];
  }

  /**
   * Updates task summary for a story
   * @param {string} storyId - Story ID
   * @param {Object} summary - Task summary object
   * @returns {Promise<import('../models/story.js').Story>} Updated story
   * @throws {NotFoundError} If Story not found
   */
  async updateTaskSummary(storyId, summary) {
    const { epic, story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    // Find the story in the epic and update it
    const storyIndex = epic.stories.findIndex((s) => s.id === storyId);
    if (storyIndex === -1) {
      throw new NotFoundError(`Story ${storyId} not found in epic`);
    }

    epic.stories[storyIndex] = updateTaskSummaryModel(story, summary);
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);
    return epic.stories[storyIndex];
  }

  /**
   * Gets task summary for a story
   * @param {string} storyId - Story ID
   * @returns {Promise<Object|null>} Task summary or null
   * @throws {NotFoundError} If Story not found
   */
  async getTaskSummary(storyId) {
    const { story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    return story.taskSummary;
  }

  /**
   * Checks if task mode is enabled for a story
   * @param {string} storyId - Story ID
   * @returns {Promise<boolean>} True if task mode is enabled
   * @throws {NotFoundError} If Story not found
   */
  async isTaskModeEnabled(storyId) {
    const { story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    return story.taskMode === true;
  }

  /**
   * Sets the initial input for a story
   * @param {string} storyId - Story ID
   * @param {string} input - User's initial input
   * @returns {Promise<import('../models/story.js').Story>} Updated story
   * @throws {NotFoundError} If Story not found
   */
  async setInitInput(storyId, input) {
    const { epic, story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    // Ensure init object exists (for backwards compatibility)
    if (!story.init) {
      story.init = { input: null, enriched: null, model: null, enrichedAt: null };
    }

    story.init.input = input;
    story.updatedAt = new Date().toISOString();
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);
    return story;
  }

  /**
   * Sets the enriched init content for a story
   * @param {string} storyId - Story ID
   * @param {string} enriched - Enriched content
   * @param {string} model - Model used
   * @returns {Promise<import('../models/story.js').Story>} Updated story
   * @throws {NotFoundError} If Story not found
   */
  async setInitEnriched(storyId, enriched, model) {
    const { epic, story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    // Ensure init object exists
    if (!story.init) {
      story.init = { input: null, enriched: null, model: null, enrichedAt: null };
    }

    story.init.enriched = enriched;
    story.init.model = model;
    story.init.enrichedAt = new Date().toISOString();
    story.updatedAt = new Date().toISOString();
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);
    return story;
  }

  /**
   * Adds a version to step history
   * @param {string} storyId - Story ID
   * @param {string} stepName - Step name
   * @param {string} content - Generated content
   * @param {string|null} instructions - User instructions
   * @param {string} model - Model used
   * @returns {Promise<import('../models/story.js').Story>} Updated story
   * @throws {NotFoundError} If Story not found
   * @throws {ValidationError} If step name is invalid
   */
  async addStepVersion(storyId, stepName, content, instructions, model) {
    if (!isValidStepName(stepName)) {
      throw new ValidationError(`Invalid step name: ${stepName}. Must be one of: ${STORY_STEPS.join(', ')}`);
    }

    const { epic, story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    // Ensure step exists (backwards compatibility for stories created before 8 steps)
    if (!story.steps[stepName]) {
      story.steps[stepName] = {
        completed: false,
        skipped: false,
        content: null,
        history: [],
        currentVersion: 0,
      };
    }

    const step = story.steps[stepName];

    // Ensure history array exists (for backwards compatibility)
    if (!step.history) {
      step.history = [];
    }

    // Add new version
    const versionNumber = step.history.length + 1;
    step.history.push({
      version: versionNumber,
      content,
      instructions,
      model,
      generatedAt: new Date().toISOString(),
    });

    // Update current version and content
    step.currentVersion = versionNumber;
    step.content = content;
    step.completed = true;
    step.skipped = false;

    story.updatedAt = new Date().toISOString();
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);
    return story;
  }

  /**
   * Reverts step to a previous version
   * @param {string} storyId - Story ID
   * @param {string} stepName - Step name
   * @param {number} version - Version number to revert to
   * @returns {Promise<import('../models/story.js').Story>} Updated story
   * @throws {NotFoundError} If Story not found or version not found
   * @throws {ValidationError} If step name is invalid
   */
  async revertStepToVersion(storyId, stepName, version) {
    if (!isValidStepName(stepName)) {
      throw new ValidationError(`Invalid step name: ${stepName}. Must be one of: ${STORY_STEPS.join(', ')}`);
    }

    const { epic, story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    // Ensure step exists (backwards compatibility)
    if (!story.steps[stepName]) {
      throw new NotFoundError(`Step ${stepName} not found for story ${storyId}`);
    }

    const step = story.steps[stepName];
    const targetVersion = step.history?.find((v) => v.version === version);

    if (!targetVersion) {
      throw new NotFoundError(`Version ${version} not found for step ${stepName}`);
    }

    // Update current version and content
    step.currentVersion = version;
    step.content = targetVersion.content;

    story.updatedAt = new Date().toISOString();
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);
    return story;
  }

  /**
   * Gets step history for a story
   * @param {string} storyId - Story ID
   * @param {string} stepName - Step name
   * @returns {Promise<Array<Object>>} Step history
   * @throws {NotFoundError} If Story not found
   * @throws {ValidationError} If step name is invalid
   */
  async getStepHistory(storyId, stepName) {
    if (!isValidStepName(stepName)) {
      throw new ValidationError(`Invalid step name: ${stepName}. Must be one of: ${STORY_STEPS.join(', ')}`);
    }

    const { story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    return story.steps[stepName]?.history || [];
  }

  // ============== V3 Phase Methods ==============

  /**
   * Gets the current phase of a story based on its current step
   * @param {string} storyId - Story ID
   * @returns {Promise<string>} Phase: 'product' or 'dev'
   * @throws {NotFoundError} If Story not found
   */
  async getCurrentPhase(storyId) {
    const { story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    // Determine current step (first incomplete step)
    for (const stepName of STORY_STEPS) {
      const step = story.steps[stepName];
      if (!step?.completed && !step?.skipped) {
        return PRODUCT_STEPS.includes(stepName) ? 'product' : 'dev';
      }
    }

    // All steps completed - dev phase
    return 'dev';
  }

  /**
   * Gets list of skipped steps for a story
   * @param {string} storyId - Story ID
   * @returns {Promise<string[]>} List of skipped step names
   * @throws {NotFoundError} If Story not found
   */
  async getSkippedSteps(storyId) {
    const { story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    const skipped = [];
    for (const stepName of STORY_STEPS) {
      if (story.steps[stepName]?.skipped) {
        skipped.push(stepName);
      }
    }
    return skipped;
  }

  /**
   * Skips to a target step, marking intermediate steps as skipped
   * @param {string} storyId - Story ID
   * @param {string} targetStep - Target step name
   * @returns {Promise<{story: Object, warning: Object|null}>} Updated story and skip warning
   * @throws {NotFoundError} If Story not found
   * @throws {ValidationError} If step name is invalid
   */
  async skipToStep(storyId, targetStep) {
    // Normalize step name
    const normalizedTarget = normalizeStepName(targetStep);

    if (!STORY_STEPS.includes(normalizedTarget)) {
      throw new ValidationError(`Invalid step name: ${targetStep}. Must be one of: ${STORY_STEPS.join(', ')}`);
    }

    const { epic, story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    // Find current step (first non-completed, non-skipped)
    let currentStepIndex = -1;
    for (let i = 0; i < STORY_STEPS.length; i++) {
      const stepName = STORY_STEPS[i];
      const step = story.steps[stepName];
      if (!step?.completed && !step?.skipped) {
        currentStepIndex = i;
        break;
      }
    }

    const targetIndex = STORY_STEPS.indexOf(normalizedTarget);

    // Can't skip backwards
    if (targetIndex <= currentStepIndex) {
      return { story, warning: null };
    }

    // Mark intermediate steps as skipped
    const skippedSteps = [];
    for (let i = currentStepIndex; i < targetIndex; i++) {
      if (i >= 0) {
        const stepName = STORY_STEPS[i];
        // init cannot be skipped
        if (stepName === 'init') continue;

        if (!story.steps[stepName]) {
          story.steps[stepName] = {
            completed: false,
            skipped: false,
            content: null,
            history: [],
            currentVersion: 0,
          };
        }
        story.steps[stepName].skipped = true;
        story.steps[stepName].completed = false;
        skippedSteps.push(stepName);
      }
    }

    // Track skipped steps in story metadata
    story.skippedSteps = story.skippedSteps || [];
    story.skippedSteps = [...new Set([...story.skippedSteps, ...skippedSteps])];

    story.updatedAt = new Date().toISOString();
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);

    // Calculate warning
    let warning = null;
    if (skippedSteps.includes('specFunc') && skippedSteps.includes('specTech')) {
      warning = {
        level: 'high',
        message: 'Contexte tres limite - Pas de spec fonctionnelle ni technique',
        autoAnalysis: true,
      };
    } else if (skippedSteps.includes('specTech')) {
      warning = {
        level: 'medium',
        message: 'Pas de spec technique - Analyse automatique du codebase',
        autoAnalysis: true,
      };
    } else if (skippedSteps.includes('specFunc')) {
      warning = {
        level: 'low',
        message: 'Pas de spec fonctionnelle - Contexte limite',
        autoAnalysis: false,
      };
    }

    return { story, warning, skippedSteps };
  }

  /**
   * Checks if skip to target step is allowed
   * @param {string} storyId - Story ID
   * @param {string} targetStep - Target step name
   * @returns {Promise<{canSkip: boolean, warning: Object|null}>}
   */
  async canSkipTo(storyId, targetStep) {
    const normalizedTarget = normalizeStepName(targetStep);

    if (!STORY_STEPS.includes(normalizedTarget)) {
      return { canSkip: false, warning: null };
    }

    // init cannot be the target of a skip
    if (normalizedTarget === 'init') {
      return { canSkip: false, warning: null };
    }

    const { story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      return { canSkip: false, warning: null };
    }

    // Check if init is completed (required before any skip)
    if (!story.steps?.init?.completed) {
      return { canSkip: false, warning: { level: 'error', message: 'Init must be completed first' } };
    }

    // Calculate warning for what would be skipped
    let currentStepIndex = -1;
    for (let i = 0; i < STORY_STEPS.length; i++) {
      const stepName = STORY_STEPS[i];
      const step = story.steps[stepName];
      if (!step?.completed && !step?.skipped) {
        currentStepIndex = i;
        break;
      }
    }

    const targetIndex = STORY_STEPS.indexOf(normalizedTarget);

    if (targetIndex <= currentStepIndex) {
      return { canSkip: false, warning: null };
    }

    const wouldSkip = STORY_STEPS.slice(currentStepIndex + 1, targetIndex).filter(s => s !== 'init');

    let warning = null;
    if (wouldSkip.includes('specFunc') && wouldSkip.includes('specTech')) {
      warning = { level: 'high', message: 'Contexte tres limite', autoAnalysis: true };
    } else if (wouldSkip.includes('specTech')) {
      warning = { level: 'medium', message: 'Pas de spec technique', autoAnalysis: true };
    }

    return { canSkip: true, warning, wouldSkip };
  }

  /**
   * Adds a Figma link to story init
   * @param {string} storyId - Story ID
   * @param {string} url - Figma URL
   * @param {string|null} label - Optional label
   * @param {string|null} cacheKey - Optional cache key
   * @returns {Promise<import('../models/story.js').Story>} Updated story
   * @throws {NotFoundError} If Story not found
   */
  async addFigmaLink(storyId, url, label = null, cacheKey = null) {
    const { epic, story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    // Ensure init object exists
    if (!story.init) {
      story.init = { input: null, enriched: null, model: null, enrichedAt: null, attachments: [], figmaLinks: [] };
    }
    if (!story.init.figmaLinks) {
      story.init.figmaLinks = [];
    }

    // Check if already exists
    if (story.init.figmaLinks.some((l) => l.url === url)) {
      throw new ValidationError('This Figma link is already attached');
    }

    story.init.figmaLinks.push({
      url,
      label,
      cacheKey,
      addedAt: new Date().toISOString(),
    });

    story.updatedAt = new Date().toISOString();
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);
    return story;
  }

  /**
   * Removes a Figma link from story init
   * @param {string} storyId - Story ID
   * @param {string} url - Figma URL to remove
   * @returns {Promise<import('../models/story.js').Story>} Updated story
   * @throws {NotFoundError} If Story not found
   */
  async removeFigmaLink(storyId, url) {
    const { epic, story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    if (!story.init?.figmaLinks) {
      return story;
    }

    story.init.figmaLinks = story.init.figmaLinks.filter((l) => l.url !== url);
    story.updatedAt = new Date().toISOString();
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);
    return story;
  }

  /**
   * Adds an attachment to story init
   * @param {string} storyId - Story ID
   * @param {Object} attachment - Attachment data
   * @param {string} attachment.filename - Original filename
   * @param {string} attachment.path - Relative path
   * @param {string} attachment.type - MIME type
   * @param {number} attachment.size - File size in bytes
   * @returns {Promise<import('../models/story.js').Story>} Updated story
   * @throws {NotFoundError} If Story not found
   */
  async addAttachment(storyId, attachment) {
    const { epic, story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    // Ensure init object exists
    if (!story.init) {
      story.init = { input: null, enriched: null, model: null, enrichedAt: null, attachments: [], figmaLinks: [] };
    }
    if (!story.init.attachments) {
      story.init.attachments = [];
    }

    story.init.attachments.push({
      ...attachment,
      uploadedAt: new Date().toISOString(),
    });

    story.updatedAt = new Date().toISOString();
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);
    return story;
  }

  /**
   * Removes an attachment from story init
   * @param {string} storyId - Story ID
   * @param {string} filename - Filename to remove
   * @returns {Promise<import('../models/story.js').Story>} Updated story
   * @throws {NotFoundError} If Story not found
   */
  async removeAttachment(storyId, filename) {
    const { epic, story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    if (!story.init?.attachments) {
      return story;
    }

    story.init.attachments = story.init.attachments.filter((a) => a.filename !== filename);
    story.updatedAt = new Date().toISOString();
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);
    return story;
  }

  /**
   * Gets init attachments and Figma links
   * @param {string} storyId - Story ID
   * @returns {Promise<{attachments: Array, figmaLinks: Array}>}
   * @throws {NotFoundError} If Story not found
   */
  async getInitAssets(storyId) {
    const { story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    return {
      attachments: story.init?.attachments || [],
      figmaLinks: story.init?.figmaLinks || [],
    };
  }

  /**
   * Gets the conversation file path for a step
   * @private
   * @param {string} storyId - Story ID
   * @param {string} stepName - Step name
   * @returns {string} Path to conversation file
   */
  _getConversationPath(storyId, stepName) {
    return `.aia/stories/${storyId}/${stepName}.conversation.json`;
  }

  /**
   * Adds a message to step conversation history
   * @param {string} storyId - Story ID
   * @param {string} stepName - Step name
   * @param {'user'|'assistant'} role - Message role
   * @param {string} content - Message content
   * @param {string} [translatedContent] - Translated content (for assistant messages)
   * @returns {Promise<Object>} The added message
   * @throws {NotFoundError} If Story not found
   * @throws {ValidationError} If step name is invalid
   */
  async addConversationMessage(storyId, stepName, role, content, translatedContent = null) {
    if (!isValidStepName(stepName)) {
      throw new ValidationError(`Invalid step name: ${stepName}. Must be one of: ${STORY_STEPS.join(', ')}`);
    }

    // Verify story exists
    const { story } = await this.findStoryWithEpic(storyId);
    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    const conversationPath = this._getConversationPath(storyId, stepName);

    // Read existing conversation or create new one
    let conversation;
    try {
      const raw = await this.storage.readFile(conversationPath);
      conversation = JSON.parse(raw);
    } catch {
      conversation = {
        storyId,
        stepName,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    // Add new message
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      role,
      content,
      translatedContent,
      createdAt: new Date().toISOString(),
    };

    conversation.messages.push(message);
    conversation.updatedAt = new Date().toISOString();

    // Write back
    await this.storage.writeFile(conversationPath, JSON.stringify(conversation, null, 2));

    return message;
  }

  /**
   * Gets conversation history for a step
   * @param {string} storyId - Story ID
   * @param {string} stepName - Step name
   * @returns {Promise<Object>} Conversation with messages array
   * @throws {NotFoundError} If Story not found
   * @throws {ValidationError} If step name is invalid
   */
  async getConversation(storyId, stepName) {
    if (!isValidStepName(stepName)) {
      throw new ValidationError(`Invalid step name: ${stepName}. Must be one of: ${STORY_STEPS.join(', ')}`);
    }

    // Verify story exists
    const { story } = await this.findStoryWithEpic(storyId);
    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    const conversationPath = this._getConversationPath(storyId, stepName);

    try {
      const raw = await this.storage.readFile(conversationPath);
      return JSON.parse(raw);
    } catch {
      // Return empty conversation if file doesn't exist
      return {
        storyId,
        stepName,
        messages: [],
        createdAt: null,
        updatedAt: null,
      };
    }
  }

  /**
   * Clears conversation history for a step
   * @param {string} storyId - Story ID
   * @param {string} stepName - Step name
   * @returns {Promise<void>}
   * @throws {NotFoundError} If Story not found
   * @throws {ValidationError} If step name is invalid
   */
  async clearConversation(storyId, stepName) {
    if (!isValidStepName(stepName)) {
      throw new ValidationError(`Invalid step name: ${stepName}. Must be one of: ${STORY_STEPS.join(', ')}`);
    }

    // Verify story exists
    const { story } = await this.findStoryWithEpic(storyId);
    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    const conversationPath = this._getConversationPath(storyId, stepName);

    try {
      await this.storage.deleteFile(conversationPath);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Publishes a story (draft -> pending)
   * @param {string} storyId - Story ID
   * @returns {Promise<import('../models/story.js').Story>} Updated story
   * @throws {NotFoundError} If Story not found
   * @throws {BusinessRuleError} If story is not in draft status
   */
  async publish(storyId) {
    const { epic, story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    const normalizedStatus = normalizeStoryStatus(story.status);
    if (normalizedStatus !== STORY_STATUS.DRAFT) {
      throw new BusinessRuleError(`Cannot publish: story is not in draft status (current: ${story.status})`);
    }

    story.status = STORY_STATUS.PENDING;
    story.space = STORY_SPACE.DEVELOPMENT;
    story.updatedAt = new Date().toISOString();
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);
    return story;
  }

  /**
   * Unpublishes a story (pending -> draft)
   * @param {string} storyId - Story ID
   * @returns {Promise<import('../models/story.js').Story>} Updated story
   * @throws {NotFoundError} If Story not found
   * @throws {BusinessRuleError} If story is not in pending status
   */
  async unpublish(storyId) {
    const { epic, story } = await this.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    const normalizedStatus = normalizeStoryStatus(story.status);
    if (normalizedStatus !== STORY_STATUS.PENDING) {
      throw new BusinessRuleError(`Cannot unpublish: story is not in pending status (current: ${story.status})`);
    }

    story.status = STORY_STATUS.DRAFT;
    story.space = STORY_SPACE.EXPERIMENTATION;
    story.updatedAt = new Date().toISOString();
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);
    return story;
  }
}
