/**
 * @fileoverview Figma Provider - API integration with caching
 * @module epic/providers/figma-provider
 */

import { ValidationError, ExternalServiceError, NotFoundError } from '../utils/errors.js';
import { isValidFigmaUrl } from '../models/validators.js';

/**
 * Default cache TTL in milliseconds (24 hours)
 * @type {number}
 */
const DEFAULT_CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * Extracts Figma file key and node ID from URL
 * @param {string} url - Figma URL
 * @returns {{fileKey: string, nodeId: string|null}} Extracted identifiers
 */
function parseFigmaUrl(url) {
  if (!isValidFigmaUrl(url)) {
    throw new ValidationError(`Invalid Figma URL: ${url}`);
  }

  // Match file/design key
  const keyMatch = url.match(/(?:file|design)\/([a-zA-Z0-9]+)/);
  const fileKey = keyMatch ? keyMatch[1] : null;

  // Match node ID from query params
  const nodeIdMatch = url.match(/node-id=([^&]+)/);
  const nodeId = nodeIdMatch ? decodeURIComponent(nodeIdMatch[1]) : null;

  if (!fileKey) {
    throw new ValidationError(`Could not extract file key from Figma URL: ${url}`);
  }

  return { fileKey, nodeId };
}

/**
 * Generates cache key for a Figma URL
 * @param {string} url - Figma URL
 * @returns {string} Cache key
 */
function generateCacheKey(url) {
  const { fileKey, nodeId } = parseFigmaUrl(url);
  return nodeId ? `figma_${fileKey}_${nodeId.replace(/[:/]/g, '_')}` : `figma_${fileKey}`;
}

/**
 * Provider for Figma API integration
 */
export class FigmaProvider {
  /**
   * @param {import('./file-storage-provider.js').FileStorageProvider} storage
   * @param {Object} [options] - Configuration options
   * @param {string} [options.apiToken] - Figma API personal access token
   * @param {number} [options.cacheTTL] - Cache TTL in milliseconds
   * @param {Function} [options.fetchFn] - Custom fetch function (for testing)
   */
  constructor(storage, options = {}) {
    this.storage = storage;
    this.apiToken = options.apiToken || process.env.FIGMA_TOKEN;
    this.cacheTTL = options.cacheTTL || DEFAULT_CACHE_TTL;
    this.fetchFn = options.fetchFn || globalThis.fetch;
  }

  /**
   * Checks if API token is configured
   * @returns {boolean}
   */
  isConfigured() {
    return Boolean(this.apiToken);
  }

  /**
   * Validates Figma URL format
   * @param {string} url - URL to validate
   * @returns {boolean}
   */
  isValidUrl(url) {
    return isValidFigmaUrl(url);
  }

  /**
   * Parses Figma URL into components
   * @param {string} url - Figma URL
   * @returns {{fileKey: string, nodeId: string|null}}
   */
  parseUrl(url) {
    return parseFigmaUrl(url);
  }

  /**
   * Generates cache key for URL
   * @param {string} url - Figma URL
   * @returns {string}
   */
  getCacheKey(url) {
    return generateCacheKey(url);
  }

  /**
   * Fetches design data from Figma API or cache
   * @param {string} url - Figma design URL
   * @param {Object} [options] - Options
   * @param {boolean} [options.forceRefresh=false] - Bypass cache
   * @returns {Promise<Object>} Design data
   */
  async fetchDesign(url, options = {}) {
    const { forceRefresh = false } = options;

    if (!this.isConfigured()) {
      throw new ExternalServiceError('Figma API token not configured. Set FIGMA_TOKEN environment variable.');
    }

    const cacheKey = generateCacheKey(url);

    // Check cache first
    if (!forceRefresh) {
      const cached = await this.storage.readFigmaCache(cacheKey);
      if (cached) {
        return {
          ...cached.extractedData,
          fromCache: true,
          cachedAt: cached.cachedAt,
        };
      }
    }

    // Fetch from API
    const { fileKey, nodeId } = parseFigmaUrl(url);
    const data = await this._fetchFromApi(fileKey, nodeId);

    // Cache the result
    const cacheEntry = {
      cacheKey,
      figmaUrl: url,
      extractedData: data,
      cachedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.cacheTTL).toISOString(),
    };
    await this.storage.writeFigmaCache(cacheEntry);

    return {
      ...data,
      fromCache: false,
    };
  }

  /**
   * Fetches data from Figma API
   * @private
   * @param {string} fileKey - Figma file key
   * @param {string|null} nodeId - Optional node ID
   * @returns {Promise<Object>} API response data
   */
  async _fetchFromApi(fileKey, nodeId) {
    const baseUrl = 'https://api.figma.com/v1';
    let endpoint = `${baseUrl}/files/${fileKey}`;

    // If node ID specified, get specific node
    if (nodeId) {
      endpoint = `${baseUrl}/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`;
    }

    try {
      const response = await this.fetchFn(endpoint, {
        headers: {
          'X-Figma-Token': this.apiToken,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new NotFoundError(`Figma file not found: ${fileKey}`);
        }
        if (response.status === 403) {
          throw new ExternalServiceError('Figma API access denied. Check your API token permissions.');
        }
        throw new ExternalServiceError(`Figma API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return this._extractDesignData(data, nodeId);
    } catch (error) {
      if (error.name === 'NotFoundError' || error.name === 'ExternalServiceError') {
        throw error;
      }
      throw new ExternalServiceError(`Failed to fetch from Figma API: ${error.message}`);
    }
  }

  /**
   * Extracts relevant design data from API response
   * @private
   * @param {Object} apiResponse - Raw API response
   * @param {string|null} nodeId - Node ID if fetching specific node
   * @returns {Object} Extracted design data
   */
  _extractDesignData(apiResponse, nodeId) {
    const extracted = {
      name: apiResponse.name || 'Untitled',
      lastModified: apiResponse.lastModified,
      version: apiResponse.version,
      components: [],
      frames: [],
      textContent: [],
    };

    // For specific node
    if (nodeId && apiResponse.nodes) {
      const nodeData = apiResponse.nodes[nodeId];
      if (nodeData && nodeData.document) {
        this._traverseNode(nodeData.document, extracted);
        extracted.name = nodeData.document.name || extracted.name;
      }
      return extracted;
    }

    // For full file
    if (apiResponse.document) {
      this._traverseNode(apiResponse.document, extracted);
    }

    return extracted;
  }

  /**
   * Recursively traverses Figma node tree
   * @private
   * @param {Object} node - Figma node
   * @param {Object} extracted - Accumulated extracted data
   */
  _traverseNode(node, extracted) {
    if (!node) return;

    // Extract components
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
      extracted.components.push({
        id: node.id,
        name: node.name,
        type: node.type,
        description: node.description || null,
      });
    }

    // Extract frames
    if (node.type === 'FRAME') {
      extracted.frames.push({
        id: node.id,
        name: node.name,
        width: node.absoluteBoundingBox?.width,
        height: node.absoluteBoundingBox?.height,
      });
    }

    // Extract text content
    if (node.type === 'TEXT' && node.characters) {
      extracted.textContent.push({
        id: node.id,
        name: node.name,
        text: node.characters,
      });
    }

    // Recurse into children
    if (node.children) {
      for (const child of node.children) {
        this._traverseNode(child, extracted);
      }
    }
  }

  /**
   * Invalidates cached data for a URL
   * @param {string} url - Figma URL
   * @returns {Promise<void>}
   */
  async invalidateCache(url) {
    const cacheKey = generateCacheKey(url);
    await this.storage.deleteFigmaCache(cacheKey);
  }

  /**
   * Gets cached data without fetching
   * @param {string} url - Figma URL
   * @returns {Promise<Object|null>} Cached data or null
   */
  async getCached(url) {
    const cacheKey = generateCacheKey(url);
    const cached = await this.storage.readFigmaCache(cacheKey);
    if (cached) {
      return {
        ...cached.extractedData,
        fromCache: true,
        cachedAt: cached.cachedAt,
        expiresAt: cached.expiresAt,
      };
    }
    return null;
  }

  /**
   * Generates design summary for AI processing
   * @param {Object} designData - Extracted design data
   * @returns {string} Summary text
   */
  generateSummary(designData) {
    const lines = [];

    lines.push(`Design: ${designData.name}`);
    if (designData.lastModified) {
      lines.push(`Last modified: ${designData.lastModified}`);
    }

    if (designData.components && designData.components.length > 0) {
      lines.push(`\nComponents (${designData.components.length}):`);
      for (const comp of designData.components.slice(0, 10)) {
        lines.push(`  - ${comp.name}${comp.description ? `: ${comp.description}` : ''}`);
      }
      if (designData.components.length > 10) {
        lines.push(`  ... and ${designData.components.length - 10} more`);
      }
    }

    if (designData.frames && designData.frames.length > 0) {
      lines.push(`\nFrames (${designData.frames.length}):`);
      for (const frame of designData.frames.slice(0, 10)) {
        const size = frame.width && frame.height ? ` (${Math.round(frame.width)}x${Math.round(frame.height)})` : '';
        lines.push(`  - ${frame.name}${size}`);
      }
      if (designData.frames.length > 10) {
        lines.push(`  ... and ${designData.frames.length - 10} more`);
      }
    }

    if (designData.textContent && designData.textContent.length > 0) {
      lines.push(`\nText content samples (${designData.textContent.length}):`);
      for (const text of designData.textContent.slice(0, 5)) {
        const truncated = text.text.length > 50 ? text.text.substring(0, 50) + '...' : text.text;
        lines.push(`  - ${text.name}: "${truncated}"`);
      }
      if (designData.textContent.length > 5) {
        lines.push(`  ... and ${designData.textContent.length - 5} more`);
      }
    }

    return lines.join('\n');
  }
}
