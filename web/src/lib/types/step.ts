/**
 * Pipeline step + phase types (handoff §17).
 */

export type StepKey =
  | 'init'
  | 'brainstorming'
  | 'spec-func'
  | 'spec-tech'
  | 'dev-plan'
  | 'implement'
  | 'review';

export type StepStatus = 'pending' | 'in-progress' | 'done' | 'skipped';

export type StepType = 'generate' | 'chat-only';

export type Phase = 'product' | 'dev' | 'qa' | 'done';

export interface StepState {
  status: StepStatus;
  tokens?: number;
  updated?: string;
}

export const STEP_KEYS: readonly StepKey[] = [
  'init',
  'brainstorming',
  'spec-func',
  'spec-tech',
  'dev-plan',
  'implement',
  'review',
] as const;

export const PRODUCT_STEPS: readonly StepKey[] = ['init', 'brainstorming', 'spec-func'] as const;
export const DEV_STEPS: readonly StepKey[] = ['spec-tech', 'dev-plan', 'implement', 'review'] as const;
