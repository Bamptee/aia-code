/**
 * @fileoverview POC Service - Proof of Concept code generation
 * @module epic/services/poc-service
 */

import { NotFoundError, ValidationError, BusinessRuleError } from '../utils/errors.js';
import { STORY_STATUS } from '../models/validators.js';

/**
 * Service for POC code generation
 */
export class POCService {
  /**
   * @param {import('../providers/file-storage-provider.js').FileStorageProvider} storage
   * @param {import('./story-service.js').StoryService} storyService
   * @param {import('../providers/ai-provider.js').AIProvider} aiProvider
   * @param {import('../providers/figma-provider.js').FigmaProvider} [figmaProvider]
   */
  constructor(storage, storyService, aiProvider, figmaProvider = null) {
    this.storage = storage;
    this.storyService = storyService;
    this.aiProvider = aiProvider;
    this.figmaProvider = figmaProvider;
  }

  /**
   * Generates POC code for a story
   * @param {string} storyId - Story ID
   * @param {Object} [options] - Generation options
   * @param {string} [options.context=''] - Additional context for generation
   * @param {boolean} [options.includeFigmaData=true] - Include Figma design data if available
   * @returns {Promise<{story: Object, poc: string, metadata: Object}>} Generated POC
   */
  async generate(storyId, options = {}) {
    const { context = '', includeFigmaData = true } = options;

    const { epic, story } = await this.storyService.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    // Gather specification content
    const specContent = this._buildSpecification(story);

    // Add Figma data if available
    let figmaContext = '';
    if (includeFigmaData && story.figmaUrl && this.figmaProvider) {
      try {
        const figmaData = await this.figmaProvider.getCached(story.figmaUrl);
        if (figmaData) {
          figmaContext = `\n\nFigma Design Data:\n${this.figmaProvider.generateSummary(figmaData)}`;
        }
      } catch {
        // Ignore Figma errors, proceed without design data
      }
    }

    // Generate POC
    const fullContext = [context, figmaContext, this._getCodebaseContext()].filter(Boolean).join('\n\n');

    const poc = await this.aiProvider.generatePOC(specContent, fullContext);

    const metadata = {
      generatedAt: new Date().toISOString(),
      storyId,
      epicId: epic.id,
      epicName: epic.name,
      model: this.aiProvider.getModel(),
      provider: this.aiProvider.getProvider(),
      hadFigmaData: Boolean(figmaContext),
    };

    return { story, poc, metadata };
  }

  /**
   * Generates and saves POC to an attachment
   * @param {string} storyId - Story ID
   * @param {string} filename - Output filename
   * @param {Object} [options] - Generation options
   * @returns {Promise<{poc: string, savedAs: string, metadata: Object}>}
   */
  async generateAndSave(storyId, filename, options = {}) {
    const { story, poc, metadata } = await this.generate(storyId, options);

    // Validate filename
    if (!filename || filename.length === 0) {
      throw new ValidationError('Filename is required');
    }

    // Add header comment to POC
    const pocWithHeader = this._addHeader(poc, metadata);

    // Save as attachment
    const data = Buffer.from(pocWithHeader, 'utf-8');
    const savedAs = await this.storage.saveAttachment(storyId, filename, data);

    // Update story attachments
    const { epic, story: freshStory } = await this.storyService.findStoryWithEpic(storyId);
    if (freshStory) {
      freshStory.attachments = freshStory.attachments || [];
      if (!freshStory.attachments.includes(savedAs)) {
        freshStory.attachments.push(savedAs);
      }
      freshStory.updatedAt = new Date().toISOString();
      epic.updatedAt = new Date().toISOString();
      await this.storage.writeEpic(epic);
    }

    return { poc: pocWithHeader, savedAs, metadata };
  }

  /**
   * Gets previously generated POC for a story
   * @param {string} storyId - Story ID
   * @param {string} filename - POC filename
   * @returns {Promise<string>} POC content
   */
  async getPOC(storyId, filename) {
    const data = await this.storage.readAttachment(storyId, filename);
    return data.toString('utf-8');
  }

  /**
   * Lists all POC files for a story
   * @param {string} storyId - Story ID
   * @returns {Promise<string[]>} List of POC filenames
   */
  async listPOCs(storyId) {
    const { story } = await this.storyService.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    // Filter attachments that look like code files
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rs', '.vue', '.svelte'];
    const attachments = story.attachments || [];

    return attachments.filter((filename) => codeExtensions.some((ext) => filename.endsWith(ext)));
  }

  /**
   * Deletes a POC file
   * @param {string} storyId - Story ID
   * @param {string} filename - POC filename
   * @returns {Promise<void>}
   */
  async deletePOC(storyId, filename) {
    await this.storage.deleteAttachment(storyId, filename);

    // Update story attachments
    const { epic, story } = await this.storyService.findStoryWithEpic(storyId);
    if (story) {
      story.attachments = (story.attachments || []).filter((f) => f !== filename);
      story.updatedAt = new Date().toISOString();
      epic.updatedAt = new Date().toISOString();
      await this.storage.writeEpic(epic);
    }
  }

  /**
   * Regenerates POC with modifications
   * @param {string} storyId - Story ID
   * @param {string} existingPoc - Existing POC code
   * @param {string} modifications - Requested modifications
   * @returns {Promise<string>} Updated POC
   */
  async regenerate(storyId, existingPoc, modifications) {
    const { story } = await this.storyService.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    const prompt = `You are a senior software engineer. Modify the following POC code based on the requested changes.

Current POC:
\`\`\`
${existingPoc}
\`\`\`

Requested modifications:
${modifications}

Requirements:
- Make only the requested changes
- Preserve the overall structure
- Keep existing functionality intact unless explicitly asked to change it
- Add comments explaining significant changes

Generate the updated POC:`;

    return this.aiProvider.generate(prompt, { maxTokens: 8192 });
  }

  /**
   * Checks if story is ready for POC generation
   * @param {string} storyId - Story ID
   * @returns {Promise<{ready: boolean, issues: string[]}>}
   */
  async checkReadiness(storyId) {
    const { story } = await this.storyService.findStoryWithEpic(storyId);

    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    const issues = [];

    // Check if init is completed
    if (!story.steps.init.completed && !story.steps.init.skipped) {
      issues.push('Init step is not completed or skipped');
    }

    // Spec-func is recommended
    if (!story.steps.specFunc.completed && !story.steps.specFunc.skipped) {
      issues.push('Spec-Func step is not completed or skipped (recommended for better POC)');
    }

    // Check AI provider
    if (!this.aiProvider.isConfigured()) {
      issues.push('AI provider is not configured');
    }

    return {
      ready: issues.length === 0 || (issues.length === 1 && issues[0].includes('recommended')),
      issues,
    };
  }

  /**
   * Builds specification content from story steps
   * @private
   */
  _buildSpecification(story) {
    const parts = [];

    parts.push(`# Story: ${story.title}`);
    if (story.description) {
      parts.push(`\n## Description\n${story.description}`);
    }

    // Add step contents
    if (story.steps.init.completed && story.steps.init.content) {
      parts.push(`\n## Feature Init\n${story.steps.init.content}`);
    }

    if (story.steps.specFunc.completed && story.steps.specFunc.content) {
      parts.push(`\n## Functional Specification\n${story.steps.specFunc.content}`);
    }

    if (story.steps.brainstorming.completed && story.steps.brainstorming.content) {
      parts.push(`\n## Brainstorming & Questions\n${story.steps.brainstorming.content}`);
    }

    return parts.join('\n');
  }

  /**
   * Gets codebase context
   * @private
   */
  _getCodebaseContext() {
    // This could be enhanced to scan the codebase for relevant patterns
    return `Codebase context:
- This is a Node.js project using ES modules
- Use modern JavaScript (ES2020+)
- Follow existing code patterns and conventions`;
  }

  /**
   * Adds header comment to POC
   * @private
   */
  _addHeader(poc, metadata) {
    const header = `/**
 * POC Generated by AIA Code
 * Story: ${metadata.storyId}
 * Epic: ${metadata.epicName}
 * Generated: ${metadata.generatedAt}
 * Model: ${metadata.model}
 *
 * This is proof-of-concept code for validation purposes.
 * Review and refine before using in production.
 */

`;
    return header + poc;
  }
}
