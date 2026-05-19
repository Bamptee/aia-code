/**
 * Story shape (handoff §17 + PRD glossary).
 *
 * Cible normalisée que les composants consomment. L'adapter (lib/api/adapters/stories.ts)
 * bridge depuis le shape Express `Feature` (terme historique d'aia-code) vers ce shape.
 */

import type { Phase, StepKey, StepState } from './step';

export type StoryType = 'feature' | 'bug' | 'spike' | 'chore';
export type CuSyncState = 'synced' | 'drift' | 'none';
export type PrState = 'draft' | 'open' | 'approved' | 'merged' | 'declined';

export interface Check {
  name: string;
  status: 'successful' | 'failed' | 'in-progress' | 'pending' | 'skipped';
  duration: string;
}

export interface Pipeline {
  status: 'successful' | 'failed' | 'in-progress' | 'pending';
  buildId: string | null;
  duration: string;
  checks: Check[];
}

export interface Reviewer {
  initials: string;
  name: string;
  status: 'approved' | 'requested-changes' | 'pending';
  at: string | null;
}

export interface Commit {
  hash: string;
  msg: string;
  author: string;
  when: string;
}

export interface PullRequest {
  number: number;
  title: string;
  state: PrState;
  target: string;
  author: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  reviewers?: Reviewer[];
  pipeline?: Pipeline;
  commits?: Commit[];
}

export interface BitbucketState {
  branch: string | null;
  commits: number;
  pr: PullRequest | null;
}

export interface RoadmapPosition {
  start: number;
  end: number;
  target?: number;
}

export interface Story {
  id: string;
  slug: string;
  title: string;
  snippet: string;
  type: StoryType;
  epicId: string | null;
  phase: Phase;
  currentStep: StepKey;
  cu: CuSyncState;
  cuTaskCount: number;
  steps: Partial<Record<StepKey, StepState>>;
  collaborators: string[];
  updated: string;
  tasksTotal: number;
  tasksDone: number;
  messages: number;
  roadmap: RoadmapPosition | null;
  bitbucket: BitbucketState;
}
