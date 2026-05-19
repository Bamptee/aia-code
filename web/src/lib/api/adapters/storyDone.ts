/**
 * Adapter Story Done : payload Read Mode (FR-14, handoff §8).
 *
 * API gap (architecture.md §10) : `GET /api/features/:name/done` n'existe pas
 * encore côté Express. Pour les stories `phase=done`, ce endpoint devra
 * retourner la structure éditoriale complète. En attendant, useStoryDoneQuery
 * gère le 404 gracieusement (placeholder UI dans ReadMode).
 */

import type {
  StoryDone,
  OutcomeKPI,
  Chapter,
  Decision,
  Artifact,
  Learning,
} from '@/lib/types/storyDone';
import type { StepKey } from '@/lib/types/step';

const VALID_STEPS: readonly StepKey[] = [
  'init',
  'brainstorming',
  'spec-func',
  'spec-tech',
  'dev-plan',
  'implement',
  'review',
];

function asStep(raw: unknown): StepKey | null {
  return typeof raw === 'string' && (VALID_STEPS as readonly string[]).includes(raw)
    ? (raw as StepKey)
    : null;
}

function parseOutcomeKPI(raw: unknown): OutcomeKPI | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.label !== 'string' || typeof r.value !== 'string') return null;
  return {
    label: r.label,
    value: r.value,
    delta: typeof r.delta === 'string' ? r.delta : undefined,
  };
}

function parseChapter(raw: unknown): Chapter | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.title !== 'string' || typeof r.body !== 'string') return null;
  return {
    step: asStep(r.step),
    kicker: typeof r.kicker === 'string' ? r.kicker : '',
    when: typeof r.when === 'string' ? r.when : '',
    title: r.title,
    body: r.body,
    callouts: Array.isArray(r.callouts)
      ? r.callouts.filter((c): c is string => typeof c === 'string')
      : undefined,
    commitHash: typeof r.commitHash === 'string' ? r.commitHash : undefined,
  };
}

function parseDecision(raw: unknown): Decision | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.note !== 'string') return null;
  return {
    when: typeof r.when === 'string' ? r.when : '',
    note: r.note,
  };
}

function parseArtifact(raw: unknown): Artifact | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.title !== 'string') return null;
  const type = typeof r.type === 'string' && ['pr', 'commit', 'doc', 'link'].includes(r.type)
    ? (r.type as Artifact['type'])
    : 'link';
  return {
    type,
    title: r.title,
    url: typeof r.url === 'string' ? r.url : undefined,
    meta: typeof r.meta === 'string' ? r.meta : undefined,
  };
}

function parseLearning(raw: unknown): Learning | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.text !== 'string') return null;
  return {
    number: typeof r.number === 'number' ? r.number : 0,
    text: r.text,
  };
}

export function parseStoryDone(raw: unknown): StoryDone | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.hero !== 'string') return null;

  return {
    storyId: typeof r.storyId === 'string' ? r.storyId : '',
    shippedAt: typeof r.shippedAt === 'string' ? r.shippedAt : '',
    durationDays: typeof r.durationDays === 'number' ? r.durationDays : 0,
    crew: Array.isArray(r.crew) ? r.crew.filter((c): c is string => typeof c === 'string') : [],
    kicker: typeof r.kicker === 'string' ? r.kicker : '',
    hero: r.hero,
    lede: typeof r.lede === 'string' ? r.lede : '',
    outcome: Array.isArray(r.outcome)
      ? r.outcome.map(parseOutcomeKPI).filter((k): k is OutcomeKPI => k !== null)
      : [],
    chapters: Array.isArray(r.chapters)
      ? r.chapters.map(parseChapter).filter((c): c is Chapter => c !== null)
      : [],
    decisions: Array.isArray(r.decisions)
      ? r.decisions.map(parseDecision).filter((d): d is Decision => d !== null)
      : [],
    artifacts: Array.isArray(r.artifacts)
      ? r.artifacts.map(parseArtifact).filter((a): a is Artifact => a !== null)
      : [],
    learnings: Array.isArray(r.learnings)
      ? r.learnings.map(parseLearning).filter((l): l is Learning => l !== null)
      : [],
  };
}
