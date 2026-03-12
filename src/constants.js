export const AIA_DIR = '.aia';

export const AIA_FOLDERS = [
  'context',
  'knowledge',
  'prompts',
  'features',
  'logs',
];

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
]);

export const STEP_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in-progress',
  DONE: 'done',
  ERROR: 'error',
};

export const FEATURE_TYPES = Object.freeze(['feature', 'bug']);
export const DEFAULT_FEATURE_TYPE = 'feature';

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
