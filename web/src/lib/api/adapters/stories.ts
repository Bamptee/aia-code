/**
 * Adapter Story : bridge entre le shape Express `/api/features` (terme historique
 * d'aia-code) et le shape normalisé `Story` (handoff §17 / PRD glossary).
 *
 * Aucun composant React ne consomme de Feature brute — toujours `parseStory()` first.
 * Champs manquants côté Express → defaults raisonnables (cf. comments).
 *
 * Cette première implémentation couvre le minimum pour Stories 2.2/2.4/2.5
 * (Sidebar, Home, Library). Story 3.x enrichira avec PR/pipeline/reviewers
 * une fois que l'API Express expose ces données.
 */

import type { Story, StoryType } from '@/lib/types/story';
import type { Phase, StepKey } from '@/lib/types/step';

/** Raw shape returned by Express `/api/features` and `/api/features/:name`. */
interface RawFeature {
  name?: string;
  slug?: string;
  displayName?: string;
  type?: string;
  flow?: string;
  phase?: string;
  createdAt?: string;
  deletedAt?: string;
  isDeleted?: boolean;
  isCompleted?: boolean;
  epicId?: string | null;
  hasWorktree?: boolean;
  agentRunning?: boolean;
  currentStep?: string;
  // Many other fields exist in full mode; we ignore them for now.
  [key: string]: unknown;
}

const STORY_TYPES: readonly StoryType[] = ['feature', 'bug', 'spike', 'chore'] as const;
const VALID_PHASES: readonly Phase[] = ['product', 'dev', 'qa', 'done'] as const;
const VALID_STEPS: readonly StepKey[] = [
  'init',
  'brainstorming',
  'spec-func',
  'spec-tech',
  'dev-plan',
  'implement',
  'review',
] as const;

function normalizeType(raw: unknown): StoryType {
  if (typeof raw === 'string' && (STORY_TYPES as readonly string[]).includes(raw)) {
    return raw as StoryType;
  }
  return 'feature';
}

function normalizePhase(raw: unknown, isCompleted: boolean): Phase {
  if (isCompleted) return 'done';
  if (typeof raw === 'string') {
    // Express utilise 'development' / 'product' / etc., handoff utilise 'dev'.
    if (raw === 'development') return 'dev';
    if (raw === 'product') return 'product';
    if (raw === 'qa') return 'qa';
    if (raw === 'done') return 'done';
    if ((VALID_PHASES as readonly string[]).includes(raw)) return raw as Phase;
  }
  return 'product';
}

function normalizeStep(raw: unknown): StepKey {
  if (typeof raw === 'string' && (VALID_STEPS as readonly string[]).includes(raw)) {
    return raw as StepKey;
  }
  return 'init';
}

/** Convertit un slug en ID display style "STORY-024" — simple hash stable. */
function deriveId(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = ((hash << 5) - hash + slug.charCodeAt(i)) | 0;
  }
  const n = Math.abs(hash) % 1000;
  return `STORY-${String(n).padStart(3, '0')}`;
}

export function parseStory(raw: unknown): Story {
  if (!raw || typeof raw !== 'object') {
    throw new Error('parseStory: expected object');
  }
  const f = raw as RawFeature;
  const slug = f.slug || f.name || 'unknown';

  return {
    id: deriveId(slug),
    slug,
    title: f.displayName || f.name || slug,
    snippet: '', // Pas exposé par Express pour l'instant (Story 3.x).
    type: normalizeType(f.type),
    epicId: typeof f.epicId === 'string' && f.epicId.length > 0 ? f.epicId : null,
    phase: normalizePhase(f.phase, Boolean(f.isCompleted)),
    currentStep: normalizeStep(f.currentStep),
    cu: 'none', // ClickUp sync pas encore exposé (Story 5.4).
    cuTaskCount: 0,
    steps: {}, // Status par step pas exposé par /api/features minimal (Story 3.x).
    collaborators: [],
    updated: typeof f.createdAt === 'string' ? f.createdAt : new Date(0).toISOString(),
    tasksTotal: 0,
    tasksDone: 0,
    messages: 0,
    roadmap: null,
    bitbucket: {
      branch: null,
      commits: 0,
      pr: null,
    },
  };
}

export function parseStoryList(raw: unknown): Story[] {
  if (!Array.isArray(raw)) {
    throw new Error('parseStoryList: expected array');
  }
  return raw
    .filter((entry): entry is RawFeature => !!entry && typeof entry === 'object' && !('error' in entry))
    .map(parseStory);
}
