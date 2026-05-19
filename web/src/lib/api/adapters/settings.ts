/**
 * Adapter Settings : payloads Express → types normalisés.
 *
 * Endpoints `/api/settings/integrations/bitbucket`, `…/clickup`, `/api/settings/models`
 * n'existent pas tous encore. Le hook degrade gracefully sur 404 → defaults.
 */

import type { Phase, StepKey } from '@/lib/types/step';
import type {
  BitbucketSettings,
  ClickUpSettings,
  ConnectionState,
  EpicMappingMode,
  ModelAssignment,
  ModelsConfig,
} from '@/lib/types/settings';

const VALID_PHASES: readonly Phase[] = ['product', 'dev', 'qa', 'done'];
const VALID_STEPS: readonly StepKey[] = [
  'init',
  'brainstorming',
  'spec-func',
  'spec-tech',
  'dev-plan',
  'implement',
  'review',
];
const VALID_EPIC_MAPPING: readonly EpicMappingMode[] = ['folder', 'list', 'tag'];

function asState(raw: unknown): ConnectionState {
  if (raw === 'connected' || raw === 'disconnected') return raw;
  return 'unknown';
}

function asString(raw: unknown, fallback = ''): string {
  return typeof raw === 'string' ? raw : fallback;
}

function asStringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

export function parseBitbucketSettings(raw: unknown): BitbucketSettings {
  if (!raw || typeof raw !== 'object') {
    return defaultBitbucketSettings();
  }
  const r = raw as Record<string, unknown>;

  const phaseTargets: Record<Phase, string> = {
    product: '',
    dev: '',
    qa: '',
    done: '',
  };
  if (r.phaseTargets && typeof r.phaseTargets === 'object') {
    for (const phase of VALID_PHASES) {
      const v = (r.phaseTargets as Record<string, unknown>)[phase];
      if (typeof v === 'string') phaseTargets[phase] = v;
    }
  }

  const stepPipelines: Partial<Record<StepKey, string[]>> = {};
  if (r.stepPipelines && typeof r.stepPipelines === 'object') {
    for (const step of VALID_STEPS) {
      const v = (r.stepPipelines as Record<string, unknown>)[step];
      if (Array.isArray(v)) {
        stepPipelines[step] = asStringArray(v);
      }
    }
  }

  return {
    state: asState(r.state),
    lastVerifiedAt: typeof r.lastVerifiedAt === 'string' ? r.lastVerifiedAt : null,
    workspace: asString(r.workspace),
    repo: asString(r.repo),
    branchPattern: asString(r.branchPattern, '{type}/{slug}'),
    phaseTargets,
    stepPipelines,
  };
}

function defaultBitbucketSettings(): BitbucketSettings {
  return {
    state: 'unknown',
    lastVerifiedAt: null,
    workspace: '',
    repo: '',
    branchPattern: '{type}/{slug}',
    phaseTargets: { product: '', dev: '', qa: '', done: '' },
    stepPipelines: {},
  };
}

export function parseClickUpSettings(raw: unknown): ClickUpSettings {
  if (!raw || typeof raw !== 'object') return defaultClickUpSettings();
  const r = raw as Record<string, unknown>;

  let epicMapping: EpicMappingMode = 'folder';
  if (typeof r.epicMapping === 'string' && (VALID_EPIC_MAPPING as readonly string[]).includes(r.epicMapping)) {
    epicMapping = r.epicMapping as EpicMappingMode;
  }

  let statusMapping: Array<{ aia: string; clickup: string }> = [];
  if (Array.isArray(r.statusMapping)) {
    statusMapping = r.statusMapping
      .map((entry): { aia: string; clickup: string } | null => {
        if (!entry || typeof entry !== 'object') return null;
        const e = entry as Record<string, unknown>;
        if (typeof e.aia !== 'string' || typeof e.clickup !== 'string') return null;
        return { aia: e.aia, clickup: e.clickup };
      })
      .filter((e): e is { aia: string; clickup: string } => e !== null);
  }

  return {
    state: asState(r.state),
    lastVerifiedAt: typeof r.lastVerifiedAt === 'string' ? r.lastVerifiedAt : null,
    apiKey: asString(r.apiKey),
    workspace: asString(r.workspace),
    list: asString(r.list),
    epicMapping,
    statusMapping,
  };
}

function defaultClickUpSettings(): ClickUpSettings {
  return {
    state: 'unknown',
    lastVerifiedAt: null,
    apiKey: '',
    workspace: '',
    list: '',
    epicMapping: 'folder',
    statusMapping: [
      { aia: 'Pending', clickup: 'to do' },
      { aia: 'In progress', clickup: 'in progress' },
      { aia: 'In review', clickup: 'review' },
      { aia: 'Done', clickup: 'complete' },
      { aia: 'Blocked', clickup: 'blocked' },
    ],
  };
}

function parseModelAssignment(raw: unknown): ModelAssignment | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== 'string') return null;
  const w = typeof r.weight === 'number' ? r.weight : 1;
  return { name: r.name, weight: Math.max(0, w) };
}

export function parseModelsConfig(raw: unknown): ModelsConfig {
  const empty = defaultModelsConfig();
  if (!raw || typeof raw !== 'object') return empty;
  const r = raw as Record<string, unknown>;
  const out: ModelsConfig = { ...empty };
  for (const step of VALID_STEPS) {
    const v = r[step];
    if (Array.isArray(v)) {
      out[step] = v.map(parseModelAssignment).filter((m): m is ModelAssignment => m !== null);
    }
  }
  return out;
}

export function defaultModelsConfig(): ModelsConfig {
  return {
    init: [{ name: 'claude-opus-4-6', weight: 1 }],
    brainstorming: [{ name: 'gemini-2.5-flash', weight: 1 }],
    'spec-func': [
      { name: 'claude-sonnet-4-6', weight: 0.5 },
      { name: 'gpt-5', weight: 0.5 },
    ],
    'spec-tech': [{ name: 'claude-opus-4-6', weight: 1 }],
    'dev-plan': [{ name: 'claude-opus-4-6', weight: 1 }],
    implement: [{ name: 'claude-opus-4-6', weight: 1 }],
    review: [{ name: 'codex-default', weight: 1 }],
  };
}

/**
 * Normalise les poids pour qu'ils somment à 1. Pas mutate.
 * Si tous à 0 (edge case validation côté UI), retourne 1/N.
 */
export function normalizeWeights(assignments: ModelAssignment[]): ModelAssignment[] {
  if (assignments.length === 0) return [];
  const total = assignments.reduce((s, a) => s + a.weight, 0);
  if (total <= 0) {
    return assignments.map((a) => ({ ...a, weight: 1 / assignments.length }));
  }
  return assignments.map((a) => ({ ...a, weight: a.weight / total }));
}
