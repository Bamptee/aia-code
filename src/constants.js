export const AIA_DIR = '.aia';

export const AIA_FOLDERS = [
  'context',
  'knowledge',
  'prompts',
  'epics',
  'stories',
  'logs',
];

// Legacy support
export const LEGACY_FEATURES_DIR = 'features';

export const SCAN_IGNORE = new Set([
  'node_modules',
  'dist',
  '.git',
  '.aia',
]);

export const SCAN_CATEGORIES = {
  services: /\bservices?\b/i,
  models: /\bmodels?\b/i,
  routes: /\broutes?\b/i,
  controllers: /\bcontrollers?\b/i,
  middleware: /\bmiddleware\b/i,
  utils: /\b(utils?|helpers?)\b/i,
  config: /\bconfig\b/i,
};

// ============== V3 FLOW: 7 Steps with Product/Dev phases ==============

/**
 * Step configuration with phases and actions
 * @type {Object<string, {phase: string, required: boolean, type: string}>}
 */
export const STEPS = Object.freeze({
  'init': { phase: 'product', required: true, type: 'generate' },
  'brainstorming': { phase: 'product', required: false, type: 'chat-only' },
  'spec-func': { phase: 'product', required: false, type: 'generate' },
  'spec-tech': { phase: 'dev', required: false, type: 'generate' },
  'dev-plan': { phase: 'dev', required: false, type: 'generate' },
  'implement': { phase: 'dev', required: false, type: 'generate' },
  'review': { phase: 'dev', required: false, type: 'generate' },
});

/**
 * Ordered list of all steps (kebab-case for API/files)
 * @type {string[]}
 */
export const STEP_ORDER = Object.freeze([
  'init', 'brainstorming', 'spec-func',
  'spec-tech', 'dev-plan', 'implement', 'review'
]);

// V3 steps - No legacy mapping needed
export const FEATURE_STEPS = Object.freeze([
  'init',
  'brainstorming',
  'spec-func',
  'spec-tech',
  'dev-plan',
  'implement',
  'review',
]);

export const QUICK_STEPS = Object.freeze(['dev-plan', 'implement', 'review']);

/**
 * Steps that produce code changes (Apply button applies diff)
 * @type {Set<string>}
 */
export const CODE_STEPS = new Set(['implement', 'review']);

// Legacy alias
export const APPLY_STEPS = CODE_STEPS;

export const STEP_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in-progress',
  DONE: 'done',
  ERROR: 'error',
});

export const FEATURE_TYPES = Object.freeze(['feature', 'bug', 'chore', 'spike']);
export const DEFAULT_FEATURE_TYPE = 'feature';

// ============== Phases ==============

/**
 * Story phases
 * @readonly
 */
export const STORY_PHASES = Object.freeze({
  DISCOVERY: 'discovery',
  DEVELOPMENT: 'development',
});

/**
 * Product phase steps (discovery)
 * @type {string[]}
 */
export const PRODUCT_STEPS = Object.freeze(['init', 'brainstorming', 'spec-func']);

/**
 * Dev phase steps
 * @type {string[]}
 */
export const DEV_STEPS = Object.freeze(['spec-tech', 'dev-plan', 'implement', 'review']);

// Legacy aliases
export const DISCOVERY_STEPS = PRODUCT_STEPS;
export const DEVELOPMENT_STEPS = DEV_STEPS;

/**
 * Steps that can be skipped (all except init)
 * @type {string[]}
 */
export const SKIPPABLE_STEPS = Object.freeze([
  'brainstorming', 'spec-func', 'spec-tech', 'dev-plan', 'review'
]);

// ============== Actions ==============

/**
 * Universal actions available on all steps
 * @type {string[]}
 */
export const UNIVERSAL_ACTIONS = Object.freeze(['generate', 'chat', 'review']);

/**
 * Actions per step (brainstorming is chat-only)
 * @type {Object<string, string[]>}
 */
export const STEP_ACTIONS = Object.freeze({
  'brainstorming': ['chat', 'review'],
  'default': ['generate', 'chat', 'review'],
});

/**
 * Phase filters for dashboard
 * @type {Object<string, Function>}
 */
export const PHASE_FILTERS = Object.freeze({
  'all': () => true,
  'product': (step) => STEPS[step]?.phase === 'product',
  'dev': (step) => STEPS[step]?.phase === 'dev',
});

/**
 * Get skip warning based on skipped steps
 * @param {string} fromStep - Current step
 * @param {string} toStep - Target step
 * @returns {{level: string, message: string, autoAnalysis: boolean}|null}
 */
export function getSkipWarning(fromStep, toStep) {
  const fromIndex = STEP_ORDER.indexOf(fromStep);
  const toIndex = STEP_ORDER.indexOf(toStep);

  if (fromIndex === -1 || toIndex === -1 || toIndex <= fromIndex) {
    return null;
  }

  const skipped = STEP_ORDER.slice(fromIndex + 1, toIndex);

  if (skipped.includes('spec-func') && skipped.includes('spec-tech')) {
    return {
      level: 'high',
      message: 'Contexte très limité - Pas de spec fonctionnelle ni technique',
      autoAnalysis: true,
    };
  }
  if (skipped.includes('spec-tech')) {
    return {
      level: 'medium',
      message: 'Pas de spec technique - Analyse automatique du codebase',
      autoAnalysis: true,
    };
  }
  if (skipped.includes('spec-func')) {
    return {
      level: 'low',
      message: 'Pas de spec fonctionnelle - Contexte limité',
      autoAnalysis: false,
    };
  }
  return null;
}

/**
 * Get skipped steps between two steps
 * @param {string} fromStep - Start step (current)
 * @param {string} toStep - Target step
 * @returns {string[]} List of skipped step names
 */
export function getSkippedSteps(fromStep, toStep) {
  const fromIndex = STEP_ORDER.indexOf(fromStep);
  const toIndex = STEP_ORDER.indexOf(toStep);

  if (fromIndex === -1 || toIndex === -1 || toIndex <= fromIndex) {
    return [];
  }

  return STEP_ORDER.slice(fromIndex + 1, toIndex);
}

/**
 * Feature deletion status filter options
 */
export const DELETION_FILTER = Object.freeze({
  ACTIVE: 'active',
  DELETED: 'deleted',
  ALL: 'all',
});

export const APP_ICONS = {
  react: '\u269B',
  vue: '\uD83D\uDC9A',
  angular: '\uD83C\uDD70',
  node: '\uD83D\uDCE6',
  go: '\uD83D\uDD27',
  java: '\u2615',
  python: '\uD83D\uDC0D',
  rust: '\uD83E\uDD80',
  generic: '\uD83D\uDCC1',
};
