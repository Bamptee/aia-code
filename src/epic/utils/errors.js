/**
 * @fileoverview Custom error classes for Epic & Product Management System
 * @module epic/utils/errors
 */

/**
 * Base application error with code and details support
 * @extends Error
 */
export class AppError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} code - Error code for identification
   * @param {Object} [details={}] - Additional error details
   */
  constructor(message, code, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON representation
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Validation error for invalid input data
 * @extends AppError
 */
export class ValidationError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {Array<Object>} [errors=[]] - Array of validation errors
   */
  constructor(message, errors = []) {
    super(message, 'VALIDATION_ERROR', { errors });
    this.errors = errors;
  }
}

/**
 * Not found error for missing resources
 * @extends AppError
 */
export class NotFoundError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {Object} [details={}] - Additional details about what was not found
   */
  constructor(message, details = {}) {
    super(message, 'NOT_FOUND', details);
  }
}

/**
 * Business rule violation error
 * @extends AppError
 */
export class BusinessRuleError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {Object} [details={}] - Additional details about the violation
   */
  constructor(message, details = {}) {
    super(message, 'BUSINESS_RULE_VIOLATION', details);
  }
}

/**
 * Configuration error for missing or invalid configuration
 * @extends AppError
 */
export class ConfigurationError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {Object} [details={}] - Additional details
   */
  constructor(message, details = {}) {
    super(message, 'CONFIGURATION_ERROR', details);
  }
}

/**
 * External API error for third-party service failures
 * @extends AppError
 */
export class ExternalAPIError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {number} [apiStatusCode] - HTTP status code from external API
   * @param {Object} [details={}] - Additional details
   */
  constructor(message, apiStatusCode, details = {}) {
    super(message, 'EXTERNAL_API_ERROR', { ...details, apiStatusCode });
    this.apiStatusCode = apiStatusCode;
  }
}

/**
 * External service error (alias for ExternalAPIError without status code)
 * @extends AppError
 */
export class ExternalServiceError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {Object} [details={}] - Additional details
   */
  constructor(message, details = {}) {
    super(message, 'EXTERNAL_SERVICE_ERROR', details);
  }
}

/**
 * Rate limit error when API quota is exceeded
 * @extends AppError
 */
export class RateLimitError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {number} [retryAfterSeconds] - Seconds until rate limit resets
   */
  constructor(message, retryAfterSeconds) {
    super(message, 'RATE_LIMITED', { retryAfter: retryAfterSeconds });
    this.retryAfter = retryAfterSeconds;
  }
}

/**
 * Security error for security violations
 * @extends AppError
 */
export class SecurityError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {Object} [details={}] - Additional details
   */
  constructor(message, details = {}) {
    super(message, 'SECURITY_ERROR', details);
  }
}

/**
 * Storage error for file system operations
 * @extends AppError
 */
export class StorageError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {Object} [details={}] - Additional details
   */
  constructor(message, details = {}) {
    super(message, 'STORAGE_ERROR', details);
  }
}

/**
 * AI response error for malformed AI outputs
 * @extends AppError
 */
export class AIResponseError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {Object} [details={}] - Additional details
   */
  constructor(message, details = {}) {
    super(message, 'AI_RESPONSE_ERROR', details);
  }
}

/**
 * AI unavailable error when all providers fail
 * @extends AppError
 */
export class AIUnavailableError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {Object} [details={}] - Additional details
   */
  constructor(message, details = {}) {
    super(message, 'AI_UNAVAILABLE', details);
  }
}

/**
 * Timeout error for operations that exceed time limits
 * @extends AppError
 */
export class TimeoutError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {number} [timeoutMs] - Timeout duration in milliseconds
   */
  constructor(message, timeoutMs) {
    super(message, 'TIMEOUT', { timeoutMs });
    this.timeoutMs = timeoutMs;
  }
}

/**
 * QA parsing error for issues parsing source documents
 * @extends AppError
 */
export class QAParseError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {Object} [details={}] - Parsing details (sections found, patterns matched, etc.)
   */
  constructor(message, details = {}) {
    super(message, 'QA_PARSE_ERROR', details);
  }
}

/**
 * QA generation error for issues generating test cases
 * @extends AppError
 */
export class QAGenerationError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {Object} [details={}] - Generation details (test count, sections, etc.)
   */
  constructor(message, details = {}) {
    super(message, 'QA_GENERATION_ERROR', details);
  }
}

/**
 * QA validation error for invalid QA configuration or content
 * @extends AppError
 */
export class QAValidationError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {Array<Object>} [errors=[]] - Array of validation errors
   */
  constructor(message, errors = []) {
    super(message, 'QA_VALIDATION_ERROR', { errors });
    this.errors = errors;
  }
}
