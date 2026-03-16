/**
 * @fileoverview Config model definition for Epic & Product Management System
 * @module epic/models/config
 */

import { ROADMAP_GRANULARITY } from './validators.js';

/**
 * @typedef {Object} Config
 * @property {string} version - Config schema version
 * @property {'weekly'|'monthly'|'quarterly'} roadmapGranularity - Roadmap time period granularity
 * @property {boolean} migrationPromptShown - Whether migration prompt has been shown
 * @property {string|null} defaultAiProvider - Default AI provider (claude, codex, gemini)
 * @property {string} updatedAt - ISO 8601 timestamp
 */

/**
 * Current config schema version
 * @constant {string}
 */
export const CONFIG_VERSION = '1.0.0';

/**
 * Creates a default config object
 * @returns {Config} Default config
 */
export function createDefaultConfig() {
  return {
    version: CONFIG_VERSION,
    roadmapGranularity: ROADMAP_GRANULARITY.MONTHLY,
    migrationPromptShown: false,
    defaultAiProvider: 'claude',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Merges partial config with existing config
 * @param {Config} existing - Existing config
 * @param {Partial<Config>} updates - Updates to apply
 * @returns {Config} Merged config
 */
export function mergeConfig(existing, updates) {
  return {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Validates config and returns with defaults for missing fields
 * @param {Object} config - Config to validate
 * @returns {Config} Valid config with defaults
 */
export function normalizeConfig(config) {
  const defaults = createDefaultConfig();

  return {
    version: config.version || defaults.version,
    roadmapGranularity: config.roadmapGranularity || defaults.roadmapGranularity,
    migrationPromptShown: config.migrationPromptShown ?? defaults.migrationPromptShown,
    defaultAiProvider: config.defaultAiProvider || defaults.defaultAiProvider,
    updatedAt: config.updatedAt || defaults.updatedAt,
  };
}
