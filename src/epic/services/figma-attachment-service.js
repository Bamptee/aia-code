/**
 * @fileoverview Figma Attachment Service - Attaching Figma designs to stories
 * @module epic/services/figma-attachment-service
 */

import { NotFoundError, ValidationError } from '../utils/errors.js';
import { isValidFigmaUrl } from '../models/validators.js';

/**
 * Service for attaching Figma designs to stories
 */
export class FigmaAttachmentService {
  /**
   * @param {import('../providers/file-storage-provider.js').FileStorageProvider} storage
   * @param {import('./story-service.js').StoryService} storyService
   * @param {import('../providers/figma-provider.js').FigmaProvider} figmaProvider
   */
  constructor(storage, storyService, figmaProvider) {
    this.storage = storage;
    this.storyService = storyService;
    this.figmaProvider = figmaProvider;
  }

  /**
   * Attaches a Figma design to a story
   * @param {string} storyId - Story ID
   * @param {string} figmaUrl - Figma design URL
   * @param {Object} [options] - Options
   * @param {boolean} [options.fetchData=true] - Fetch and cache Figma data
   * @returns {Promise<{story: Object, cachedData: Object|null}>}
   */
  async attach(storyId, figmaUrl, options = {}) {
    const { fetchData = true } = options;

    // Validate URL
    if (!isValidFigmaUrl(figmaUrl)) {
      throw new ValidationError(`Invalid Figma URL: ${figmaUrl}`);
    }

    const { epic, story } = await this.storyService.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    // Update story with Figma URL
    story.figmaUrl = figmaUrl;
    story.figmaCacheKey = this.figmaProvider.getCacheKey(figmaUrl);
    story.updatedAt = new Date().toISOString();
    epic.updatedAt = new Date().toISOString();

    // Fetch and cache Figma data
    let cachedData = null;
    if (fetchData && this.figmaProvider.isConfigured()) {
      try {
        cachedData = await this.figmaProvider.fetchDesign(figmaUrl);
      } catch (error) {
        // Continue without cached data, URL is still attached
        console.warn(`Failed to fetch Figma data: ${error.message}`);
      }
    }

    await this.storage.writeEpic(epic);

    return { story, cachedData };
  }

  /**
   * Detaches Figma design from a story
   * @param {string} storyId - Story ID
   * @returns {Promise<Object>} Updated story
   */
  async detach(storyId) {
    const { epic, story } = await this.storyService.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    // Clear Figma URL and cache key
    const oldUrl = story.figmaUrl;
    story.figmaUrl = null;
    story.figmaCacheKey = null;
    story.updatedAt = new Date().toISOString();
    epic.updatedAt = new Date().toISOString();

    // Invalidate cache
    if (oldUrl) {
      try {
        await this.figmaProvider.invalidateCache(oldUrl);
      } catch {
        // Ignore cache invalidation errors
      }
    }

    await this.storage.writeEpic(epic);

    return story;
  }

  /**
   * Gets cached Figma data for a story
   * @param {string} storyId - Story ID
   * @returns {Promise<Object|null>} Cached Figma data or null
   */
  async getCachedData(storyId) {
    const { story } = await this.storyService.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    if (!story.figmaUrl) {
      return null;
    }

    return this.figmaProvider.getCached(story.figmaUrl);
  }

  /**
   * Refreshes cached Figma data for a story
   * @param {string} storyId - Story ID
   * @returns {Promise<Object>} Fresh Figma data
   */
  async refreshCache(storyId) {
    const { story } = await this.storyService.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    if (!story.figmaUrl) {
      throw new ValidationError('Story has no attached Figma design');
    }

    if (!this.figmaProvider.isConfigured()) {
      throw new ValidationError('Figma provider is not configured');
    }

    return this.figmaProvider.fetchDesign(story.figmaUrl, { forceRefresh: true });
  }

  /**
   * Gets Figma summary for a story
   * @param {string} storyId - Story ID
   * @returns {Promise<string|null>} Summary text or null
   */
  async getSummary(storyId) {
    const cachedData = await this.getCachedData(storyId);

    if (!cachedData) {
      return null;
    }

    return this.figmaProvider.generateSummary(cachedData);
  }

  /**
   * Lists all stories with Figma attachments
   * @param {Object} [filters] - Filter options
   * @param {string} [filters.epicId] - Filter by epic
   * @returns {Promise<Array<Object>>} Stories with Figma data
   */
  async listWithFigma(filters = {}) {
    const stories = await this.storyService.list(filters);

    return stories.filter((story) => story.figmaUrl);
  }

  /**
   * Validates Figma attachment
   * @param {string} storyId - Story ID
   * @returns {Promise<{valid: boolean, issues: string[]}>}
   */
  async validate(storyId) {
    const { story } = await this.storyService.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    const issues = [];

    if (!story.figmaUrl) {
      return { valid: true, issues: [] }; // No attachment, nothing to validate
    }

    // Validate URL format
    if (!isValidFigmaUrl(story.figmaUrl)) {
      issues.push('Invalid Figma URL format');
    }

    // Check cache
    const cached = await this.figmaProvider.getCached(story.figmaUrl);
    if (!cached) {
      issues.push('No cached Figma data (may be expired or not fetched)');
    }

    // Check cache key matches
    const expectedCacheKey = this.figmaProvider.getCacheKey(story.figmaUrl);
    if (story.figmaCacheKey && story.figmaCacheKey !== expectedCacheKey) {
      issues.push('Cache key mismatch');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Bulk attaches Figma designs from a mapping
   * @param {Object<string, string>} mapping - Story ID to Figma URL mapping
   * @returns {Promise<{attached: number, failed: Array<{storyId: string, error: string}>}>}
   */
  async bulkAttach(mapping) {
    const result = {
      attached: 0,
      failed: [],
    };

    for (const [storyId, figmaUrl] of Object.entries(mapping)) {
      try {
        await this.attach(storyId, figmaUrl, { fetchData: false });
        result.attached++;
      } catch (error) {
        result.failed.push({ storyId, error: error.message });
      }
    }

    return result;
  }

  /**
   * Gets Figma statistics
   * @returns {Promise<Object>} Statistics
   */
  async getStats() {
    const stories = await this.storyService.list();

    const storiesWithFigma = stories.filter((s) => s.figmaUrl);
    let cachedCount = 0;

    for (const story of storiesWithFigma) {
      const cached = await this.figmaProvider.getCached(story.figmaUrl);
      if (cached) {
        cachedCount++;
      }
    }

    return {
      totalStories: stories.length,
      withFigma: storiesWithFigma.length,
      withCachedData: cachedCount,
      percentage: stories.length > 0
        ? Math.round((storiesWithFigma.length / stories.length) * 100)
        : 0,
    };
  }
}
