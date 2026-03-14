/**
 * @fileoverview QA Booster model definition and factory functions
 * @module epic/models/qa-booster
 */

import { generateUUID } from '../utils/id-generator.js';

/**
 * Test priority levels
 * @readonly
 * @enum {string}
 */
export const TEST_PRIORITY = Object.freeze({
  P0: 'P0',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
});

/**
 * Priority order for sorting (lower = higher priority)
 * @readonly
 * @type {Object<string, number>}
 */
export const PRIORITY_ORDER = Object.freeze({
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
});

/**
 * Test categories for organization
 * @readonly
 * @enum {string}
 */
export const TEST_CATEGORY = Object.freeze({
  FUNCTIONAL: 'functional',
  UI: 'ui',
  API: 'api',
  SECURITY: 'security',
  PERFORMANCE: 'performance',
  ACCESSIBILITY: 'accessibility',
  INTEGRATION: 'integration',
  REGRESSION: 'regression',
});

/**
 * Test execution status
 * @readonly
 * @enum {string}
 */
export const TEST_STATUS = Object.freeze({
  UNCHECKED: 'unchecked',
  CHECKED: 'checked',
  BLOCKED: 'blocked',
  SKIPPED: 'skipped',
});

/**
 * Default QA booster configuration
 * @readonly
 * @type {QABoosterConfig}
 */
export const DEFAULT_QA_CONFIG = Object.freeze({
  outputPath: '',
  outputDir: '',
  includeCategories: [
    TEST_CATEGORY.FUNCTIONAL,
    TEST_CATEGORY.UI,
    TEST_CATEGORY.API,
    TEST_CATEGORY.SECURITY,
  ],
  excludeCategories: [],
  minPriority: TEST_PRIORITY.P3,
  templateStyle: 'detailed',
  generateFromSpecs: true,
  generateFromTech: true,
  includeApiTests: true,
  includeSecurityTests: true,
});

/**
 * Maximum content size for parsing (100KB) to prevent ReDoS
 * @constant {number}
 */
export const MAX_CONTENT_SIZE = 100000;

/**
 * Maximum length for test case titles
 * @constant {number}
 */
export const MAX_TITLE_LENGTH = 200;

/**
 * @typedef {Object} TestStep
 * @property {number} order - Step order number
 * @property {string} action - Action to perform
 * @property {string} [expectedOutcome] - Expected outcome
 */

/**
 * @typedef {Object} TestCase
 * @property {string} id - Unique identifier (e.g., "TC-001")
 * @property {string} title - Short description of the test
 * @property {string} [description] - Detailed test steps
 * @property {Array<string>} [preconditions] - Required setup before test
 * @property {Array<TestStep>} steps - Individual test steps
 * @property {string} expectedResult - Expected outcome
 * @property {string} priority - P0, P1, P2, P3
 * @property {string} category - functional, ui, api, security, etc.
 * @property {string} status - unchecked, checked, blocked, skipped
 * @property {Array<string>} [tags] - Custom tags for filtering
 */

/**
 * @typedef {Object} TestSection
 * @property {string} id - Section identifier
 * @property {string} title - Section title
 * @property {string} [description] - Section description
 * @property {Array<TestCase>} testCases - Test cases in this section
 */

/**
 * @typedef {Object} QAMetadata
 * @property {number} totalTests - Total number of tests
 * @property {number} passedTests - Number of passed tests
 * @property {number} failedTests - Number of failed tests
 * @property {number} blockedTests - Number of blocked tests
 * @property {number} skippedTests - Number of skipped tests
 * @property {Object} coverage - Coverage percentages by category
 * @property {Array<string>} sourceFiles - Source files used for generation
 */

/**
 * @typedef {Object} QAPlan
 * @property {string} version - Plan version (e.g., "1.0.0")
 * @property {string} featureName - Name of the feature being tested
 * @property {string} createdAt - ISO 8601 timestamp
 * @property {string} updatedAt - ISO 8601 timestamp
 * @property {string} cycle - Test cycle identifier
 * @property {Array<TestSection>} sections - Organized test sections
 * @property {QAMetadata} metadata - Plan metadata
 */

/**
 * @typedef {Object} QABoosterConfig
 * @property {string} outputPath - Custom output path
 * @property {string} outputDir - Output directory
 * @property {Array<string>} includeCategories - Categories to include
 * @property {Array<string>} excludeCategories - Categories to exclude
 * @property {string} minPriority - Minimum priority to include
 * @property {string} templateStyle - Template style: detailed, compact, checklist
 * @property {boolean} generateFromSpecs - Auto-generate from specs.md
 * @property {boolean} generateFromTech - Auto-generate from tech.md
 * @property {boolean} includeApiTests - Generate API endpoint tests
 * @property {boolean} includeSecurityTests - Generate security test cases
 */

/**
 * @typedef {Object} Requirement
 * @property {string} id - Requirement ID (e.g., "REQ-001")
 * @property {string} description - Requirement description
 * @property {string} type - 'functional' or 'non-functional'
 * @property {string} priority - Test priority
 */

/**
 * @typedef {Object} APIEndpoint
 * @property {string} method - HTTP method (GET, POST, PUT, DELETE, PATCH)
 * @property {string} path - API path
 * @property {string} description - Endpoint description
 * @property {string} [requestBody] - Request body format
 * @property {string} [responseFormat] - Response format
 * @property {Array<number>} statusCodes - Expected status codes
 */

/**
 * @typedef {Object} UIComponent
 * @property {string} name - Component name
 * @property {string} type - Component type (form, button, modal, list, page, other)
 * @property {Array<string>} interactions - Possible interactions
 */

/**
 * @typedef {Object} ParsedFeatureInfo
 * @property {string} featureName - Feature name
 * @property {Array<Requirement>} requirements - Extracted requirements
 * @property {Array<APIEndpoint>} endpoints - Extracted API endpoints
 * @property {Array<UIComponent>} components - Extracted UI components
 * @property {Object} diagnostics - Parsing diagnostics
 */

/**
 * Creates a new test step
 * @param {number} order - Step order
 * @param {string} action - Action to perform
 * @param {string} [expectedOutcome] - Expected outcome
 * @returns {TestStep} New test step
 */
export function createTestStep(order, action, expectedOutcome = null) {
  return {
    order,
    action: action.trim(),
    ...(expectedOutcome && { expectedOutcome: expectedOutcome.trim() }),
  };
}

/**
 * Creates a new test case
 * @param {Object} data - Test case data
 * @param {string} data.id - Test case ID
 * @param {string} data.title - Test case title
 * @param {string} [data.description] - Description
 * @param {Array<string>} [data.preconditions] - Preconditions
 * @param {Array<TestStep>} data.steps - Test steps
 * @param {string} data.expectedResult - Expected result
 * @param {string} data.priority - Priority
 * @param {string} data.category - Category
 * @param {Array<string>} [data.tags] - Tags
 * @returns {TestCase} New test case
 */
export function createTestCase(data) {
  return {
    id: data.id,
    title: sanitizeTestTitle(data.title),
    description: data.description?.trim() || null,
    preconditions: data.preconditions || [],
    steps: data.steps || [],
    expectedResult: data.expectedResult?.trim() || '',
    priority: data.priority || TEST_PRIORITY.P1,
    category: data.category || TEST_CATEGORY.FUNCTIONAL,
    status: TEST_STATUS.UNCHECKED,
    tags: data.tags || [],
  };
}

/**
 * Creates a new test section
 * @param {Object} data - Section data
 * @param {string} data.id - Section ID
 * @param {string} data.title - Section title
 * @param {string} [data.description] - Section description
 * @param {Array<TestCase>} [data.testCases] - Test cases
 * @returns {TestSection} New test section
 */
export function createTestSection(data) {
  return {
    id: data.id,
    title: data.title.trim(),
    description: data.description?.trim() || null,
    testCases: data.testCases || [],
  };
}

/**
 * Creates a new QA plan
 * @param {Object} data - Plan data
 * @param {string} data.featureName - Feature name
 * @param {string} [data.cycle='initial'] - Test cycle
 * @param {Array<TestSection>} [data.sections] - Test sections
 * @returns {QAPlan} New QA plan
 */
export function createQAPlan(data) {
  const now = new Date().toISOString();
  const sections = data.sections || [];

  return {
    version: '1.0.0',
    featureName: data.featureName.trim(),
    createdAt: now,
    updatedAt: now,
    cycle: data.cycle || 'initial',
    sections,
    metadata: calculateMetadata(sections),
  };
}

/**
 * Calculates QA plan metadata from sections
 * @param {Array<TestSection>} sections - Test sections
 * @returns {QAMetadata} Calculated metadata
 */
export function calculateMetadata(sections) {
  let totalTests = 0;
  let passedTests = 0;
  let blockedTests = 0;
  let skippedTests = 0;

  const categoryCounts = {
    [TEST_CATEGORY.FUNCTIONAL]: 0,
    [TEST_CATEGORY.UI]: 0,
    [TEST_CATEGORY.API]: 0,
    [TEST_CATEGORY.SECURITY]: 0,
    [TEST_CATEGORY.PERFORMANCE]: 0,
    [TEST_CATEGORY.ACCESSIBILITY]: 0,
    [TEST_CATEGORY.INTEGRATION]: 0,
    [TEST_CATEGORY.REGRESSION]: 0,
  };

  for (const section of sections) {
    for (const tc of section.testCases) {
      totalTests++;
      if (categoryCounts[tc.category] !== undefined) {
        categoryCounts[tc.category]++;
      }

      switch (tc.status) {
        case TEST_STATUS.CHECKED:
          passedTests++;
          break;
        case TEST_STATUS.BLOCKED:
          blockedTests++;
          break;
        case TEST_STATUS.SKIPPED:
          skippedTests++;
          break;
      }
    }
  }

  return {
    totalTests,
    passedTests,
    failedTests: 0,
    blockedTests,
    skippedTests,
    coverage: {
      functional: totalTests > 0 ? Math.round((categoryCounts[TEST_CATEGORY.FUNCTIONAL] / totalTests) * 100) : 0,
      ui: totalTests > 0 ? Math.round((categoryCounts[TEST_CATEGORY.UI] / totalTests) * 100) : 0,
      api: totalTests > 0 ? Math.round((categoryCounts[TEST_CATEGORY.API] / totalTests) * 100) : 0,
      security: totalTests > 0 ? Math.round((categoryCounts[TEST_CATEGORY.SECURITY] / totalTests) * 100) : 0,
    },
    sourceFiles: [],
  };
}

/**
 * Sanitizes a test title to prevent markdown injection
 * @param {string} title - Title to sanitize
 * @returns {string} Sanitized title
 */
export function sanitizeTestTitle(title) {
  if (!title || typeof title !== 'string') {
    return '';
  }
  return title
    .replace(/[[\]()#*`]/g, '') // Remove markdown special chars
    .replace(/\n/g, ' ') // No newlines in titles
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .slice(0, MAX_TITLE_LENGTH) // Limit length
    .trim();
}

/**
 * Sanitizes markdown content to prevent injection
 * @param {string} content - Content to sanitize
 * @returns {string} Sanitized content
 */
export function sanitizeMarkdown(content) {
  if (!content || typeof content !== 'string') {
    return '';
  }
  return content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}

/**
 * Gets the priority badge for display
 * @param {string} priority - Priority level
 * @returns {string} Priority badge string
 */
export function getPriorityBadge(priority) {
  const badges = {
    [TEST_PRIORITY.P0]: 'P0 (Critical)',
    [TEST_PRIORITY.P1]: 'P1 (High)',
    [TEST_PRIORITY.P2]: 'P2 (Medium)',
    [TEST_PRIORITY.P3]: 'P3 (Low)',
  };
  return badges[priority] || 'P1 (High)';
}

/**
 * Checks if a priority meets the minimum threshold
 * @param {string} priority - Priority to check
 * @param {string} minPriority - Minimum priority threshold
 * @returns {boolean} True if priority meets threshold
 */
export function meetsPriorityThreshold(priority, minPriority) {
  const order = PRIORITY_ORDER[priority] ?? 3;
  const minOrder = PRIORITY_ORDER[minPriority] ?? 3;
  return order <= minOrder;
}

/**
 * Validates a test priority
 * @param {string} priority - Priority to validate
 * @returns {boolean} True if valid
 */
export function isValidTestPriority(priority) {
  return Object.values(TEST_PRIORITY).includes(priority);
}

/**
 * Validates a test category
 * @param {string} category - Category to validate
 * @returns {boolean} True if valid
 */
export function isValidTestCategory(category) {
  return Object.values(TEST_CATEGORY).includes(category);
}

/**
 * Validates a test status
 * @param {string} status - Status to validate
 * @returns {boolean} True if valid
 */
export function isValidTestStatus(status) {
  return Object.values(TEST_STATUS).includes(status);
}

/**
 * Merges preserved checkbox states into a new QA plan
 * @param {QAPlan} newPlan - Newly generated plan
 * @param {Map<string, string>} preservedStates - Map of test ID to status
 * @returns {QAPlan} Plan with preserved states
 */
export function mergePreservedStates(newPlan, preservedStates) {
  if (!preservedStates || preservedStates.size === 0) {
    return newPlan;
  }

  const updatedSections = newPlan.sections.map((section) => ({
    ...section,
    testCases: section.testCases.map((tc) => {
      const preservedStatus = preservedStates.get(tc.id);
      if (preservedStatus && isValidTestStatus(preservedStatus)) {
        return { ...tc, status: preservedStatus };
      }
      return tc;
    }),
  }));

  return {
    ...newPlan,
    sections: updatedSections,
    metadata: calculateMetadata(updatedSections),
    updatedAt: new Date().toISOString(),
  };
}
