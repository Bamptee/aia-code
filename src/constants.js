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

export const FEATURE_STEPS = [
  'brief',
  'ba-spec',
  'questions',
  'tech-spec',
  'challenge',
  'dev-plan',
  'implement',
  'review',
];

export const QUICK_STEPS = ['dev-plan', 'implement', 'review'];

export const APPLY_STEPS = new Set([
  'implement',
  'review',
]);

export const STEP_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in-progress',
  DONE: 'done',
  ERROR: 'error',
};

export const FEATURE_TYPES = Object.freeze(['feature', 'bug', 'chore', 'spike']);
export const DEFAULT_FEATURE_TYPE = 'feature';

// Story phases
export const STORY_PHASES = Object.freeze({
  DISCOVERY: 'discovery',
  DEVELOPMENT: 'development',
});

// Discovery steps (first 3)
export const DISCOVERY_STEPS = ['brief', 'ba-spec', 'questions'];

// Development steps (remaining)
export const DEVELOPMENT_STEPS = ['tech-spec', 'challenge', 'dev-plan', 'implement', 'review'];

// Steps that can be skipped (not init, dev-plan, implement)
export const SKIPPABLE_STEPS = ['brief', 'ba-spec', 'questions', 'tech-spec', 'challenge', 'review'];

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
