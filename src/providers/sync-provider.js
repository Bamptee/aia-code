/**
 * @fileoverview Abstract sync provider base class for external integrations
 * @module providers/sync-provider
 */

/**
 * Abstract base class for sync providers (ClickUp, Linear, etc.)
 * All methods throw 'Not implemented' unless overridden.
 */
export class SyncProvider {
  /**
   * @param {string} name - Provider name (e.g., 'clickup')
   */
  constructor(name) {
    this.name = name;
    this.isConfigured = false;
  }

  getProviderName() {
    return this.name;
  }

  /** @returns {Promise<{ok: boolean, error?: string}>} */
  async testConnection() {
    throw new Error('Not implemented');
  }

  /** @returns {Promise<{taskId: string, url: string}>} */
  async pushStory(_slug, _storyData) {
    throw new Error('Not implemented');
  }

  /** @returns {Promise<{slug: string, name: string, status: string, steps: Object, meta: Object}>} */
  async pullStory(_externalId) {
    throw new Error('Not implemented');
  }

  /** @returns {Promise<{ok: boolean}>} */
  async pushStep(_slug, _step, _content, _meta) {
    throw new Error('Not implemented');
  }

  /** @returns {Promise<{externalId: string, url: string}>} */
  async pushEpic(_epicData) {
    throw new Error('Not implemented');
  }

  /** @returns {Promise<{name: string, description: string, status: string, stories: Array}>} */
  async pullEpic(_externalId) {
    throw new Error('Not implemented');
  }

  /** @returns {Promise<{ok: boolean}>} */
  async updateStatus(_externalId, _status) {
    throw new Error('Not implemented');
  }

  /** @returns {Promise<Date|null>} */
  async getRemoteUpdatedAt(_externalId) {
    throw new Error('Not implemented');
  }

  /** @returns {Promise<{items: Array<{id: string, name: string, type: string, children?: Array}>}>} */
  async browse(_level, _parentId) {
    throw new Error('Not implemented');
  }

  /** @returns {Promise<{tasks: Array}>} */
  async searchTasks(_query, _options) {
    throw new Error('Not implemented');
  }
}
