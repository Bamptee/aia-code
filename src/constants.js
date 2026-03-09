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
  'review',
];
