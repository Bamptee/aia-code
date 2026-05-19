/**
 * Story shape (handoff §17 + PRD glossary).
 *
 * Cible normalisée que les composants consomment. L'adapter (lib/api/adapters/stories.ts)
 * bridge depuis le shape Express `Feature` (terme historique d'aia-code) vers ce shape.
 */

import type { Phase, StepKey, StepState } from './step';
import type { BitbucketState } from './bitbucket';

export type StoryType = 'feature' | 'bug' | 'spike' | 'chore';
export type CuSyncState = 'synced' | 'drift' | 'none';

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
