/**
 * @fileoverview Utils index - exports all utility functions
 * @module epic/utils
 */

// Error classes
export {
  AppError,
  ValidationError,
  NotFoundError,
  BusinessRuleError,
  ConfigurationError,
  ExternalAPIError,
  RateLimitError,
  SecurityError,
  StorageError,
  AIResponseError,
  AIUnavailableError,
  TimeoutError,
} from './errors.js';

// ID generation
export {
  generateUUID,
  GENERAL_EPIC_ID,
  isValidUUID,
  generateUniqueId,
} from './id-generator.js';

// Path utilities
export {
  AIA_EPIC_DIR,
  getAiaDir,
  getEpicsDir,
  getCacheDir,
  getFigmaCacheDir,
  getAttachmentsDir,
  getPocDir,
  getIndexDir,
  getConfigPath,
  sanitizePath,
  isPathWithinDir,
  getEpicFilePath,
  getGeneralEpicFilePath,
  getStoryIndexPath,
} from './path-utils.js';
