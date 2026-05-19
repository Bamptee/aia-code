/**
 * Adapter Epic : bridge Express `/api/epics` → shape handoff §17.
 */

import type { Epic } from '@/lib/types/epic';

interface RawEpic {
  id?: string;
  slug?: string;
  name?: string;
  displayName?: string;
  color?: string;
  storyCount?: number;
  doneCount?: number;
  status?: string;
  archived?: boolean;
  [key: string]: unknown;
}

export function parseEpic(raw: unknown): Epic {
  if (!raw || typeof raw !== 'object') {
    throw new Error('parseEpic: expected object');
  }
  const e = raw as RawEpic;
  return {
    id: e.slug || e.id || 'unknown',
    name: e.displayName || e.name || 'Untitled epic',
    color: e.color || '#8e8e8b',
    storyCount: typeof e.storyCount === 'number' ? e.storyCount : 0,
    doneCount: typeof e.doneCount === 'number' ? e.doneCount : 0,
    status: e.archived || e.status === 'done' ? 'done' : 'active',
  };
}

export function parseEpicList(raw: unknown): Epic[] {
  if (!Array.isArray(raw)) {
    throw new Error('parseEpicList: expected array');
  }
  return raw
    .filter((entry): entry is RawEpic => !!entry && typeof entry === 'object')
    .map(parseEpic);
}
