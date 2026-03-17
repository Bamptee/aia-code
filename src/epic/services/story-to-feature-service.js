/**
 * @fileoverview Story to Feature Service - Promotes stories to features
 * @module epic/services/story-to-feature-service
 */

import path from 'node:path';
import fs from 'fs-extra';
import yaml from 'yaml';
import { ValidationError, NotFoundError, BusinessRuleError } from '../utils/errors.js';
import { STORY_STATUS } from '../models/validators.js';
import { AIA_DIR, FEATURE_STEPS } from '../../constants.js';

/**
 * Converts story title to valid feature name
 * @param {string} title - Story title
 * @returns {string} Valid feature name (lowercase, hyphenated)
 */
function titleToFeatureName(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

/**
 * Service for promoting Stories to Features
 */
export class StoryToFeatureService {
  /**
   * @param {import('../providers/file-storage-provider.js').FileStorageProvider} storage
   * @param {import('./story-service.js').StoryService} storyService
   * @param {string} projectRoot - Project root directory
   */
  constructor(storage, storyService, projectRoot = process.cwd()) {
    this.storage = storage;
    this.storyService = storyService;
    this.projectRoot = projectRoot;
  }

  /**
   * Promotes a Story to a Feature
   * Creates a new feature with story content pre-filled
   * @param {string} storyId - Story ID to promote
   * @returns {Promise<{featureName: string, featurePath: string, story: Object}>}
   * @throws {NotFoundError} If story not found
   * @throws {BusinessRuleError} If story is not ready_for_dev
   */
  async promote(storyId) {
    // Get story with epic
    const { epic, story } = await this.storyService.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    // Validate story is ready for dev
    if (story.status !== STORY_STATUS.READY_FOR_DEV) {
      throw new BusinessRuleError(
        `Story must be in '${STORY_STATUS.READY_FOR_DEV}' status to promote. Current status: ${story.status}`
      );
    }

    // Generate feature name from story title
    const featureName = titleToFeatureName(story.title);
    const featureDir = path.join(this.projectRoot, AIA_DIR, 'stories', featureName);

    // Check if feature already exists
    if (await fs.pathExists(featureDir)) {
      throw new BusinessRuleError(`Feature "${featureName}" already exists. Choose a different story title or delete the existing feature.`);
    }

    // Create feature directory
    await fs.ensureDir(featureDir);

    // Build status.yaml with pre-completed steps
    const statusContent = this._buildStatusYaml(featureName, story);
    await fs.writeFile(path.join(featureDir, 'status.yaml'), statusContent, 'utf-8');

    // Create init.md with story description
    const initContent = this._buildInitMd(story);
    await fs.writeFile(path.join(featureDir, 'init.md'), initContent, 'utf-8');

    // Copy story step contents to feature step files
    if (story.steps.init?.content) {
      await fs.writeFile(path.join(featureDir, 'init.md'), story.steps.init.content, 'utf-8');
    }
    if (story.steps.specFunc?.content) {
      await fs.writeFile(path.join(featureDir, 'spec-func.md'), story.steps.specFunc.content, 'utf-8');
    }
    if (story.steps.brainstorming?.content) {
      await fs.writeFile(path.join(featureDir, 'brainstorming.md'), story.steps.brainstorming.content, 'utf-8');
    }

    // Create empty files for remaining steps
    const remainingSteps = FEATURE_STEPS.filter(s => !['init', 'spec-func', 'brainstorming'].includes(s));
    for (const step of remainingSteps) {
      await fs.writeFile(path.join(featureDir, `${step}.md`), '', 'utf-8');
    }

    // Update story status and link to feature
    story.status = STORY_STATUS.IN_PROGRESS;
    story.linkedFeatureId = featureName;
    story.promotedAt = new Date().toISOString();
    story.updatedAt = new Date().toISOString();
    epic.updatedAt = new Date().toISOString();

    await this.storage.writeEpic(epic);

    return {
      featureName,
      featurePath: featureDir,
      story,
    };
  }

  /**
   * Builds status.yaml content for promoted feature
   * @param {string} featureName - Feature name
   * @param {Object} story - Source story
   * @returns {string} YAML content
   * @private
   */
  _buildStatusYaml(featureName, story) {
    const steps = {};
    for (const step of FEATURE_STEPS) {
      if (['init', 'spec-func', 'brainstorming'].includes(step)) {
        // Mark product steps as done if content exists, pending otherwise
        const storyStep = step === 'spec-func' ? 'specFunc' : step;
        const hasContent = story.steps[storyStep]?.content || story.steps[storyStep]?.completed;
        steps[step] = hasContent ? 'done' : 'pending';
      } else {
        steps[step] = 'pending';
      }
    }

    // Determine current step (first pending step after product steps)
    let currentStep = 'spec-tech';
    for (const step of FEATURE_STEPS) {
      if (steps[step] === 'pending') {
        currentStep = step;
        break;
      }
    }

    const status = {
      feature: featureName,
      type: story.type || 'feature',
      flow: 'full',
      current_step: currentStep,
      createdAt: new Date().toISOString(),
      promotedFromStory: story.id,
      steps,
      knowledge: ['backend'],
    };

    return yaml.stringify(status);
  }

  /**
   * Builds init.md content from story
   * @param {Object} story - Source story
   * @returns {string} Markdown content
   * @private
   */
  _buildInitMd(story) {
    let content = `# ${story.title}\n\n`;
    content += `> Promoted from Story: ${story.id}\n\n`;

    if (story.description) {
      content += `## Description\n\n${story.description}\n\n`;
    } else {
      content += `## Description\n\n<!-- Add description -->\n\n`;
    }

    if (story.figmaUrl) {
      content += `## Figma\n\n[Design Link](${story.figmaUrl})\n\n`;
    }

    content += `## Constraints\n\n<!-- Add any constraints -->\n\n`;

    return content;
  }

  /**
   * Checks if a story can be promoted
   * @param {string} storyId - Story ID
   * @returns {Promise<{canPromote: boolean, reason?: string}>}
   */
  async canPromote(storyId) {
    try {
      const { story } = await this.storyService.findStoryWithEpic(storyId);

      if (!story) {
        return { canPromote: false, reason: 'Story not found' };
      }

      if (story.status !== STORY_STATUS.READY_FOR_DEV) {
        return { canPromote: false, reason: `Story must be in '${STORY_STATUS.READY_FOR_DEV}' status` };
      }

      if (story.linkedFeatureId) {
        return { canPromote: false, reason: 'Story already promoted to a feature' };
      }

      const featureName = titleToFeatureName(story.title);
      const featureDir = path.join(this.projectRoot, AIA_DIR, 'stories', featureName);

      if (await fs.pathExists(featureDir)) {
        return { canPromote: false, reason: `Story "${featureName}" already exists` };
      }

      return { canPromote: true };
    } catch (error) {
      return { canPromote: false, reason: error.message };
    }
  }
}
