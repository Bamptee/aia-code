/**
 * @fileoverview Validation rules and functions for Epic & Product Management System
 * @module epic/models/validators
 */

import { ValidationError } from '../utils/errors.js';

/**
 * Epic status enum values
 * @readonly
 * @enum {string}
 */
export const EPIC_STATUS = Object.freeze({
  DISCOVERY: 'discovery',
  PLANNING: 'planning',
  IN_PROGRESS: 'in_progress',
  TESTING: 'testing',
  DONE: 'done',
});

/**
 * Story status enum values
 * @readonly
 * @enum {string}
 */
export const STORY_STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING: 'pending',
  READY_FOR_DEV: 'ready_for_dev',
  IN_PROGRESS: 'in_progress',
  TESTING: 'testing',
  QA: 'qa',
  DONE: 'done',
});

/**
 * Mapping for legacy status values (backwards compatibility)
 * These are truly deprecated statuses that should be normalized.
 * Active statuses (ready_for_dev, in_progress, testing) are NOT legacy.
 * @readonly
 * @type {Object<string, string>}
 */
export const LEGACY_STATUS_MAP = Object.freeze({
  // Add truly legacy statuses here if any exist
});

/**
 * Normalizes a status value, mapping legacy values to new ones
 * @param {string} status - Status to normalize
 * @returns {string} Normalized status
 */
export function normalizeStoryStatus(status) {
  return LEGACY_STATUS_MAP[status] || status;
}

/**
 * Story type enum values
 * @readonly
 * @enum {string}
 */
export const STORY_TYPE = Object.freeze({
  FEATURE: 'feature',
  BUG: 'bug',
});

/**
 * Story space enum values
 * @readonly
 * @enum {string}
 */
export const STORY_SPACE = Object.freeze({
  EXPERIMENTATION: 'experimentation',
  DEVELOPMENT: 'development',
});

/**
 * Roadmap granularity enum values
 * @readonly
 * @enum {string}
 */
export const ROADMAP_GRANULARITY = Object.freeze({
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
});

/**
 * Step names for story workflow v3 (7 steps, camelCase for JS)
 * @readonly
 * @type {string[]}
 */
export const STORY_STEPS = Object.freeze([
  'init',
  'brainstorming',
  'specFunc',
  'specTech',
  'devPlan',
  'implement',
  'review',
]);

/**
 * Kebab-case step names (for API/files)
 * @readonly
 * @type {string[]}
 */
export const STORY_STEPS_KEBAB = Object.freeze([
  'init',
  'brainstorming',
  'spec-func',
  'spec-tech',
  'dev-plan',
  'implement',
  'review',
]);

/**
 * Map kebab-case to camelCase (V3 only)
 * @type {Object<string, string>}
 */
export const STEP_KEY_MAP = Object.freeze({
  'init': 'init',
  'brainstorming': 'brainstorming',
  'spec-func': 'specFunc',
  'specFunc': 'specFunc',
  'spec-tech': 'specTech',
  'specTech': 'specTech',
  'dev-plan': 'devPlan',
  'devPlan': 'devPlan',
  'implement': 'implement',
  'review': 'review',
});

/**
 * Map camelCase to kebab-case (for API calls)
 * @type {Object<string, string>}
 */
export const STEP_API_MAP = Object.freeze({
  'init': 'init',
  'brainstorming': 'brainstorming',
  'specFunc': 'spec-func',
  'specTech': 'spec-tech',
  'devPlan': 'dev-plan',
  'implement': 'implement',
  'review': 'review',
});

/**
 * Steps visible in Product context (product phase)
 * @readonly
 * @type {string[]}
 */
export const PRODUCT_STEPS = Object.freeze(['init', 'brainstorming', 'specFunc']);

/**
 * Steps visible in Dev context (dev phase)
 * @readonly
 * @type {string[]}
 */
export const DEV_STEPS = Object.freeze(['specTech', 'devPlan', 'implement', 'review']);

/**
 * HTML tag pattern to prevent XSS in user input
 * @private
 */
const HTML_TAG_PATTERN = /<[^>]*>/;

/**
 * Task status enum values
 * @readonly
 * @enum {string}
 */
export const TASK_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
});

/**
 * Validation rules configuration
 * @type {Object}
 */
export const VALIDATION_RULES = {
  epic: {
    name: {
      required: true,
      minLength: 1,
      maxLength: 100,
      noHtml: true,
    },
    description: {
      required: false,
      maxLength: 5000,
    },
    status: {
      required: true,
      enum: Object.values(EPIC_STATUS),
    },
  },
  story: {
    title: {
      required: true,
      minLength: 1,
      maxLength: 200,
      noHtml: true,
    },
    description: {
      required: false,
      maxLength: 10000,
    },
    type: {
      required: true,
      enum: Object.values(STORY_TYPE),
    },
    status: {
      required: true,
      enum: Object.values(STORY_STATUS),
    },
    space: {
      required: true,
      enum: Object.values(STORY_SPACE),
    },
  },
  qa: {
    rejectionReason: {
      required: true,
      minLength: 10,
      maxLength: 2000,
    },
  },
  task: {
    title: {
      required: true,
      minLength: 1,
      maxLength: 200,
      noHtml: true,
    },
    details: {
      required: false,
      maxLength: 10000,
    },
    status: {
      required: true,
      enum: Object.values(TASK_STATUS),
    },
  },
};

/**
 * Validates a string field against rules
 * @private
 * @param {string} value - Value to validate
 * @param {Object} rules - Validation rules
 * @param {string} fieldName - Name of the field for error messages
 * @returns {Array<Object>} Array of validation errors
 */
function validateStringField(value, rules, fieldName) {
  const errors = [];

  // Required check
  if (rules.required) {
    if (value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0)) {
      errors.push({ field: fieldName, message: `${fieldName} is required` });
      return errors; // Return early, no point checking other rules
    }
  }

  // Skip other validations if value is not present and not required
  if (value === undefined || value === null) {
    return errors;
  }

  const trimmedValue = typeof value === 'string' ? value.trim() : String(value);

  // Min length check
  if (rules.minLength !== undefined && trimmedValue.length < rules.minLength) {
    errors.push({
      field: fieldName,
      message: `${fieldName} must be at least ${rules.minLength} characters`,
    });
  }

  // Max length check
  if (rules.maxLength !== undefined && trimmedValue.length > rules.maxLength) {
    errors.push({
      field: fieldName,
      message: `${fieldName} must be ${rules.maxLength} characters or less`,
    });
  }

  // No HTML tags check
  if (rules.noHtml && HTML_TAG_PATTERN.test(trimmedValue)) {
    errors.push({
      field: fieldName,
      message: `${fieldName} cannot contain HTML tags`,
    });
  }

  // Enum check
  if (rules.enum && !rules.enum.includes(trimmedValue)) {
    errors.push({
      field: fieldName,
      message: `${fieldName} must be one of: ${rules.enum.join(', ')}`,
    });
  }

  return errors;
}

/**
 * Validates Epic data
 * @param {Object} data - Epic data to validate
 * @returns {{valid: boolean, errors: Array<Object>}} Validation result
 */
export function validateEpic(data) {
  const errors = [];

  // Name validation
  errors.push(...validateStringField(data.name, VALIDATION_RULES.epic.name, 'name'));

  // Description validation (optional)
  if (data.description !== undefined && data.description !== null) {
    errors.push(...validateStringField(data.description, VALIDATION_RULES.epic.description, 'description'));
  }

  // Status validation (only if provided)
  if (data.status !== undefined) {
    errors.push(...validateStringField(data.status, VALIDATION_RULES.epic.status, 'status'));
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates Story data
 * @param {Object} data - Story data to validate
 * @returns {{valid: boolean, errors: Array<Object>}} Validation result
 */
export function validateStory(data) {
  const errors = [];

  // Title validation
  errors.push(...validateStringField(data.title, VALIDATION_RULES.story.title, 'title'));

  // Description validation (optional)
  if (data.description !== undefined && data.description !== null) {
    errors.push(...validateStringField(data.description, VALIDATION_RULES.story.description, 'description'));
  }

  // Type validation
  errors.push(...validateStringField(data.type, VALIDATION_RULES.story.type, 'type'));

  // Status validation (only if provided, defaults are set by service)
  if (data.status !== undefined) {
    errors.push(...validateStringField(data.status, VALIDATION_RULES.story.status, 'status'));
  }

  // Space validation (only if provided, defaults are set by service)
  if (data.space !== undefined) {
    errors.push(...validateStringField(data.space, VALIDATION_RULES.story.space, 'space'));
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates QA rejection reason
 * @param {string} reason - Rejection reason to validate
 * @returns {{valid: boolean, errors: Array<Object>}} Validation result
 */
export function validateQARejection(reason) {
  const errors = validateStringField(reason, VALIDATION_RULES.qa.rejectionReason, 'reason');
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates step name (accepts both kebab-case and camelCase)
 * @param {string} stepName - Step name to validate
 * @returns {boolean} True if valid step name
 */
export function isValidStepName(stepName) {
  // Direct match in camelCase
  if (STORY_STEPS.includes(stepName)) {
    return true;
  }
  // Check if it's a valid kebab-case or legacy step
  return stepName in STEP_KEY_MAP;
}

/**
 * Normalizes step name to camelCase
 * @param {string} stepName - Step name (kebab-case or camelCase)
 * @returns {string} Normalized camelCase step name
 */
export function normalizeStepName(stepName) {
  return STEP_KEY_MAP[stepName] || stepName;
}

/**
 * Converts camelCase step name to kebab-case for API
 * @param {string} stepName - Step name in camelCase
 * @returns {string} Kebab-case step name
 */
export function stepToApiName(stepName) {
  return STEP_API_MAP[stepName] || stepName;
}

/**
 * Validates Epic status
 * @param {string} status - Status to validate
 * @returns {boolean} True if valid Epic status
 */
export function isValidEpicStatus(status) {
  return Object.values(EPIC_STATUS).includes(status);
}

/**
 * Validates Story status
 * @param {string} status - Status to validate
 * @returns {boolean} True if valid Story status
 */
export function isValidStoryStatus(status) {
  return Object.values(STORY_STATUS).includes(status);
}

/**
 * Validates Story type
 * @param {string} type - Type to validate
 * @returns {boolean} True if valid Story type
 */
export function isValidStoryType(type) {
  return Object.values(STORY_TYPE).includes(type);
}

/**
 * Validates roadmap granularity
 * @param {string} granularity - Granularity to validate
 * @returns {boolean} True if valid granularity
 */
export function isValidGranularity(granularity) {
  return Object.values(ROADMAP_GRANULARITY).includes(granularity);
}

/**
 * Validates Task status
 * @param {string} status - Status to validate
 * @returns {boolean} True if valid Task status
 */
export function isValidTaskStatus(status) {
  return Object.values(TASK_STATUS).includes(status);
}

/**
 * Validates Task data
 * @param {Object} data - Task data to validate
 * @returns {{valid: boolean, errors: Array<Object>}} Validation result
 */
export function validateTask(data) {
  const errors = [];

  // Title validation
  errors.push(...validateStringField(data.title, VALIDATION_RULES.task.title, 'title'));

  // Details validation (optional)
  if (data.details !== undefined && data.details !== null) {
    errors.push(...validateStringField(data.details, VALIDATION_RULES.task.details, 'details'));
  }

  // Status validation (only if provided)
  if (data.status !== undefined) {
    errors.push(...validateStringField(data.status, VALIDATION_RULES.task.status, 'status'));
  }

  // StoryId validation
  if (!data.storyId || typeof data.storyId !== 'string') {
    errors.push({ field: 'storyId', message: 'storyId is required' });
  }

  // Order validation
  if (data.order !== undefined && (typeof data.order !== 'number' || data.order < 0)) {
    errors.push({ field: 'order', message: 'order must be a non-negative number' });
  }

  // Files validation
  if (data.files !== undefined && !Array.isArray(data.files)) {
    errors.push({ field: 'files', message: 'files must be an array' });
  }

  // Dependencies validation
  if (data.dependencies !== undefined && !Array.isArray(data.dependencies)) {
    errors.push({ field: 'dependencies', message: 'dependencies must be an array' });
  }

  // Tests validation
  if (data.tests !== undefined && !Array.isArray(data.tests)) {
    errors.push({ field: 'tests', message: 'tests must be an array' });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Throws ValidationError if validation fails
 * @param {Object} data - Data to validate
 * @param {Function} validator - Validation function to use
 * @throws {ValidationError} If validation fails
 */
export function assertValid(data, validator) {
  const result = validator(data);
  if (!result.valid) {
    throw new ValidationError(
      result.errors.map((e) => e.message).join('; '),
      result.errors
    );
  }
}
