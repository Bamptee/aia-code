/**
 * @fileoverview QA Service - QA approval and rejection workflow
 * @module epic/services/qa-service
 */

import { ValidationError, NotFoundError, BusinessRuleError } from '../utils/errors.js';
import { validateQARejection, assertValid, STORY_STATUS } from '../models/validators.js';
import { createBugFromRejection, createQAAction } from '../models/story.js';

/**
 * Service for managing QA workflow
 */
export class QAService {
  /**
   * @param {import('../providers/file-storage-provider.js').FileStorageProvider} storage
   * @param {import('./story-service.js').StoryService} storyService
   * @param {import('./story-index-service.js').StoryIndexService} storyIndexService
   */
  constructor(storage, storyService, storyIndexService) {
    this.storage = storage;
    this.storyService = storyService;
    this.storyIndex = storyIndexService;
  }

  /**
   * Lists all stories in testing queue
   * @returns {Promise<Array<Object>>} Stories with status 'testing'
   */
  async listTestingQueue() {
    return this.storyService.list({ status: STORY_STATUS.TESTING });
  }

  /**
   * Approves a story in testing
   * @param {string} storyId - Story ID to approve
   * @param {string} [notes] - Optional approval notes
   * @returns {Promise<import('../models/story.js').Story>} Approved story
   * @throws {NotFoundError} If story not found
   * @throws {BusinessRuleError} If story is not in testing status
   */
  async approve(storyId, notes = null) {
    const { epic, story } = await this.storyService.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    if (story.status !== STORY_STATUS.TESTING) {
      throw new BusinessRuleError(
        `Cannot approve: Story must be in 'testing' status, currently '${story.status}'`
      );
    }

    // Create QA action record
    const qaAction = createQAAction('approve', notes, null);
    story.qaHistory = story.qaHistory || [];
    story.qaHistory.push(qaAction);

    // Update status to done
    story.status = STORY_STATUS.DONE;
    story.updatedAt = new Date().toISOString();
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);

    return story;
  }

  /**
   * Rejects a story in testing and creates a linked bug
   * @param {string} storyId - Story ID to reject
   * @param {string} reason - Rejection reason (min 10 chars)
   * @returns {Promise<{story: import('../models/story.js').Story, bug: import('../models/story.js').Story}>}
   * @throws {NotFoundError} If story not found
   * @throws {ValidationError} If reason is too short
   * @throws {BusinessRuleError} If story is not in testing status
   */
  async reject(storyId, reason) {
    // Validate reason
    const validation = validateQARejection(reason);
    if (!validation.valid) {
      throw new ValidationError(
        validation.errors.map((e) => e.message).join('; '),
        validation.errors
      );
    }

    const { epic, story } = await this.storyService.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    if (story.status !== STORY_STATUS.TESTING) {
      throw new BusinessRuleError(
        `Cannot reject: Story must be in 'testing' status, currently '${story.status}'`
      );
    }

    // Create bug from rejection
    const bug = createBugFromRejection(story, reason);

    // Create QA action record with bug reference
    const qaAction = createQAAction('reject', reason, bug.id);
    story.qaHistory = story.qaHistory || [];
    story.qaHistory.push(qaAction);

    // Update story status back to in_progress
    story.status = STORY_STATUS.IN_PROGRESS;
    story.updatedAt = new Date().toISOString();

    // Add bug to same epic
    epic.stories = epic.stories || [];
    epic.stories.push(bug);
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);

    // Update story index for the new bug
    await this.storyIndex.addStory(bug.id, epic.id);

    return { story, bug };
  }

  /**
   * Gets QA history for a story
   * @param {string} storyId - Story ID
   * @returns {Promise<Array<import('../models/story.js').QAAction>>} QA history
   * @throws {NotFoundError} If story not found
   */
  async getHistory(storyId) {
    const story = await this.storyService.getById(storyId);
    return story.qaHistory || [];
  }

  /**
   * Gets statistics about QA workflow
   * @returns {Promise<Object>} QA statistics
   */
  async getStats() {
    const allStories = await this.storyService.list();

    const stats = {
      inTesting: 0,
      approvedToday: 0,
      rejectedToday: 0,
      totalApprovals: 0,
      totalRejections: 0,
      avgRejectionsPerStory: 0,
    };

    const today = new Date().toISOString().split('T')[0];
    let storiesWithRejections = 0;
    let totalRejections = 0;

    for (const story of allStories) {
      if (story.status === STORY_STATUS.TESTING) {
        stats.inTesting++;
      }

      const qaHistory = story.qaHistory || [];
      for (const action of qaHistory) {
        if (action.action === 'approve') {
          stats.totalApprovals++;
          if (action.performedAt && action.performedAt.startsWith(today)) {
            stats.approvedToday++;
          }
        } else if (action.action === 'reject') {
          stats.totalRejections++;
          totalRejections++;
          if (action.performedAt && action.performedAt.startsWith(today)) {
            stats.rejectedToday++;
          }
        }
      }

      if (qaHistory.some((a) => a.action === 'reject')) {
        storiesWithRejections++;
      }
    }

    stats.avgRejectionsPerStory =
      storiesWithRejections > 0
        ? Math.round((totalRejections / storiesWithRejections) * 10) / 10
        : 0;

    return stats;
  }

  /**
   * Moves a story to testing status
   * @param {string} storyId - Story ID
   * @returns {Promise<import('../models/story.js').Story>} Updated story
   * @throws {NotFoundError} If story not found
   * @throws {BusinessRuleError} If story cannot be moved to testing
   */
  async moveToTesting(storyId) {
    const { epic, story } = await this.storyService.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    // Can only move to testing from in_progress
    if (story.status !== STORY_STATUS.IN_PROGRESS) {
      throw new BusinessRuleError(
        `Cannot move to testing: Story must be in 'in_progress' status, currently '${story.status}'`
      );
    }

    story.status = STORY_STATUS.TESTING;
    story.updatedAt = new Date().toISOString();
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);

    return story;
  }

  /**
   * Gets all bugs created from rejections of a specific story
   * @param {string} storyId - Story ID
   * @returns {Promise<Array<Object>>} Linked bugs
   */
  async getLinkedBugs(storyId) {
    return this.storyService.getLinkedBugs(storyId);
  }
}
