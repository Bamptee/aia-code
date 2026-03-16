/**
 * @fileoverview Figma Discovery Service - Analyze Figma designs to discover stories
 * @module epic/services/figma-discovery-service
 */

import { NotFoundError, ValidationError, ExternalServiceError } from '../utils/errors.js';

/**
 * Service for discovering stories from Figma designs
 */
export class FigmaDiscoveryService {
  /**
   * @param {import('../providers/file-storage-provider.js').FileStorageProvider} storage
   * @param {import('../providers/figma-provider.js').FigmaProvider} figmaProvider
   * @param {import('./story-service.js').StoryService} storyService
   * @param {import('../providers/ai-provider.js').AIProvider} [aiProvider]
   */
  constructor(storage, figmaProvider, storyService, aiProvider = null) {
    this.storage = storage;
    this.figmaProvider = figmaProvider;
    this.storyService = storyService;
    this.aiProvider = aiProvider;
  }

  /**
   * Discovers potential stories from a Figma design
   * @param {string} figmaUrl - Figma design URL
   * @param {Object} [options] - Discovery options
   * @param {boolean} [options.useAI=false] - Use AI to enhance discovery
   * @param {string} [options.context=''] - Additional context for AI
   * @returns {Promise<{designName: string, suggestions: Array<{name: string, description: string, type: string, figmaNodeId: string, frameInfo: Object}>}>}
   */
  async discoverStories(figmaUrl, options = {}) {
    const { useAI = false, context = '' } = options;

    if (!this.figmaProvider.isConfigured()) {
      throw new ExternalServiceError('Figma API token not configured. Set FIGMA_TOKEN environment variable.');
    }

    // Fetch design data
    const designData = await this.figmaProvider.fetchDesign(figmaUrl);

    // Extract potential stories from frames
    const suggestions = this._extractSuggestions(designData);

    // Enhance with AI if available and requested
    if (useAI && this.aiProvider?.isConfigured() && suggestions.length > 0) {
      return this._enhanceWithAI(designData.name, suggestions, context);
    }

    return {
      designName: designData.name,
      figmaUrl,
      lastModified: designData.lastModified,
      suggestions,
    };
  }

  /**
   * Imports discovered stories into an epic
   * @param {string} epicId - Target epic ID
   * @param {Array<{name: string, description: string, type: string, figmaNodeId: string}>} stories - Stories to import
   * @param {string} figmaUrl - Original Figma URL
   * @returns {Promise<{imported: number, stories: Array}>}
   */
  async importStories(epicId, stories, figmaUrl) {
    if (!Array.isArray(stories) || stories.length === 0) {
      throw new ValidationError('No stories to import');
    }

    const imported = [];
    const baseUrl = this._getBaseUrl(figmaUrl);

    for (const suggestion of stories) {
      // Build story-specific Figma URL with node ID
      const storyFigmaUrl = suggestion.figmaNodeId
        ? `${baseUrl}?node-id=${encodeURIComponent(suggestion.figmaNodeId)}`
        : figmaUrl;

      try {
        const story = await this.storyService.create(epicId, {
          title: suggestion.name,
          description: suggestion.description || '',
          type: suggestion.type || 'feature',
          figmaUrl: storyFigmaUrl,
          space: 'experimentation',
        });

        // Pre-fill brief with design context if available
        if (suggestion.description) {
          await this.storyService.updateStep(story.id, 'brief', {
            content: this._generateBriefFromSuggestion(suggestion),
            completed: false,
          });
        }

        imported.push(story);
      } catch (err) {
        // Log but continue with other stories
        console.error(`Failed to import story "${suggestion.name}": ${err.message}`);
      }
    }

    return {
      imported: imported.length,
      total: stories.length,
      stories: imported,
    };
  }

  /**
   * Analyzes a Figma design and returns summary
   * @param {string} figmaUrl - Figma design URL
   * @returns {Promise<{name: string, components: number, frames: number, textElements: number, summary: string}>}
   */
  async analyzeDesign(figmaUrl) {
    const designData = await this.figmaProvider.fetchDesign(figmaUrl);

    return {
      name: designData.name,
      lastModified: designData.lastModified,
      components: designData.components?.length || 0,
      frames: designData.frames?.length || 0,
      textElements: designData.textContent?.length || 0,
      summary: this.figmaProvider.generateSummary(designData),
      fromCache: designData.fromCache,
    };
  }

  /**
   * Extracts story suggestions from design data
   * @private
   */
  _extractSuggestions(designData) {
    const suggestions = [];
    const seenNames = new Set();

    // Extract from frames (primary source for stories)
    if (designData.frames && designData.frames.length > 0) {
      for (const frame of designData.frames) {
        // Skip if we've seen a similar name
        const normalizedName = this._normalizeName(frame.name);
        if (seenNames.has(normalizedName)) continue;
        seenNames.add(normalizedName);

        // Determine story type from frame name
        const type = this._inferTypeFromName(frame.name);

        suggestions.push({
          name: this._frameNameToStoryTitle(frame.name),
          description: this._generateDescriptionFromFrame(frame),
          type,
          figmaNodeId: frame.id,
          frameInfo: {
            width: frame.width,
            height: frame.height,
            originalName: frame.name,
          },
        });
      }
    }

    // Extract from components (secondary source)
    if (designData.components && designData.components.length > 0) {
      for (const component of designData.components) {
        const normalizedName = this._normalizeName(component.name);
        if (seenNames.has(normalizedName)) continue;
        seenNames.add(normalizedName);

        // Components often represent reusable UI elements
        if (this._isLikelyStory(component.name)) {
          suggestions.push({
            name: this._componentNameToStoryTitle(component.name),
            description: component.description || this._generateDescriptionFromComponent(component),
            type: 'feature',
            figmaNodeId: component.id,
            frameInfo: {
              originalName: component.name,
              componentType: component.type,
            },
          });
        }
      }
    }

    // Sort by relevance (frames first, then components)
    return suggestions.slice(0, 20); // Limit to 20 suggestions
  }

  /**
   * Enhance suggestions using AI
   * @private
   */
  async _enhanceWithAI(designName, suggestions, context) {
    const prompt = `You are analyzing a Figma design called "${designName}" for product story extraction.

Here are the discovered UI elements:
${suggestions.map((s, i) => `${i + 1}. ${s.name}: ${s.description}`).join('\n')}

${context ? `Additional context: ${context}` : ''}

For each element, enhance the description with:
1. User story format ("As a user, I want...")
2. Key acceptance criteria (2-3 points)
3. Any technical considerations

Return JSON array with enhanced suggestions:
[{"name": "...", "description": "enhanced description...", "type": "feature|bug", "acceptanceCriteria": ["...", "..."]}]

Only output the JSON array, no other text.`;

    try {
      const response = await this.aiProvider.generate(prompt, { maxTokens: 4096 });
      const enhanced = JSON.parse(response);

      // Merge enhanced data with original suggestions
      return {
        designName,
        suggestions: suggestions.map((s, i) => ({
          ...s,
          description: enhanced[i]?.description || s.description,
          acceptanceCriteria: enhanced[i]?.acceptanceCriteria || [],
        })),
      };
    } catch {
      // Fall back to original suggestions if AI fails
      return { designName, suggestions };
    }
  }

  /**
   * Generate brief content from suggestion
   * @private
   */
  _generateBriefFromSuggestion(suggestion) {
    const lines = [];
    lines.push(`# ${suggestion.name}`);
    lines.push('');
    lines.push('## Description');
    lines.push(suggestion.description || 'Imported from Figma design.');
    lines.push('');

    if (suggestion.acceptanceCriteria?.length > 0) {
      lines.push('## Acceptance Criteria');
      for (const criteria of suggestion.acceptanceCriteria) {
        lines.push(`- [ ] ${criteria}`);
      }
      lines.push('');
    }

    if (suggestion.frameInfo) {
      lines.push('## Design Reference');
      lines.push(`- Figma Frame: ${suggestion.frameInfo.originalName}`);
      if (suggestion.frameInfo.width && suggestion.frameInfo.height) {
        lines.push(`- Dimensions: ${Math.round(suggestion.frameInfo.width)}x${Math.round(suggestion.frameInfo.height)}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get base Figma URL without node-id
   * @private
   */
  _getBaseUrl(url) {
    return url.split('?')[0];
  }

  /**
   * Normalize name for deduplication
   * @private
   */
  _normalizeName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /**
   * Convert frame name to story title
   * @private
   */
  _frameNameToStoryTitle(frameName) {
    // Remove common prefixes and format nicely
    return frameName
      .replace(/^(screen|page|view|frame|component)[\s_-]*/i, '')
      .replace(/[\s_-]+/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim() || frameName;
  }

  /**
   * Convert component name to story title
   * @private
   */
  _componentNameToStoryTitle(componentName) {
    return componentName
      .replace(/^(btn|button|comp|component|ui|icon)[\s_-]*/i, '')
      .replace(/[\s_-]+/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim() || componentName;
  }

  /**
   * Generate description from frame
   * @private
   */
  _generateDescriptionFromFrame(frame) {
    const parts = [];

    if (frame.width && frame.height) {
      // Infer device type from dimensions
      if (frame.width >= 1200) {
        parts.push('Desktop view');
      } else if (frame.width >= 768) {
        parts.push('Tablet view');
      } else if (frame.width >= 320) {
        parts.push('Mobile view');
      }
    }

    parts.push(`UI screen: ${frame.name}`);

    return parts.join(' - ');
  }

  /**
   * Generate description from component
   * @private
   */
  _generateDescriptionFromComponent(component) {
    return `Reusable UI component: ${component.name}`;
  }

  /**
   * Check if name likely represents a story-worthy item
   * @private
   */
  _isLikelyStory(name) {
    const storyIndicators = /screen|page|view|modal|dialog|form|card|list|detail|dashboard|profile|settings|login|signup|checkout|cart|search|filter|navigation|header|footer/i;
    return storyIndicators.test(name);
  }

  /**
   * Infer story type from name
   * @private
   */
  _inferTypeFromName(name) {
    const bugIndicators = /fix|bug|error|issue|broken/i;
    return bugIndicators.test(name) ? 'bug' : 'feature';
  }
}
