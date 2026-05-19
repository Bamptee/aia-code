/**
 * Adapter Tasks : payload Express → types normalisés.
 *
 * API gap (architecture.md §10) : endpoints `/api/tasks`, `/api/tasks/:id`,
 * `/api/tasks/:id/comments`, `/api/integrations/clickup/sync` n'existent pas
 * encore côté Express. Quand le backend les expose, ce parser absorbe les
 * variations de shape (clickup task fields rendus à plat vs imbriqués).
 */

import type { StepKey } from '@/lib/types/step';
import type {
  Assignee,
  ClickUpLink,
  ClickUpSyncState,
  SyncStatus,
  Task,
  TaskComment,
  TaskDetail,
  TaskGroup,
  TaskPriority,
  TaskStatus,
} from '@/lib/types/task';

const VALID_STATUSES: readonly TaskStatus[] = ['todo', 'doing', 'review', 'done', 'blocked'];
const VALID_PRIORITIES: readonly TaskPriority[] = ['high', 'med', 'low'];
const VALID_STEPS: readonly StepKey[] = [
  'init',
  'brainstorming',
  'spec-func',
  'spec-tech',
  'dev-plan',
  'implement',
  'review',
];
const VALID_SYNC: readonly SyncStatus[] = ['synced', 'syncing', 'failed'];

function asStatus(raw: unknown): TaskStatus {
  return typeof raw === 'string' && (VALID_STATUSES as readonly string[]).includes(raw)
    ? (raw as TaskStatus)
    : 'todo';
}

function asPriority(raw: unknown): TaskPriority {
  return typeof raw === 'string' && (VALID_PRIORITIES as readonly string[]).includes(raw)
    ? (raw as TaskPriority)
    : 'med';
}

function asStep(raw: unknown): StepKey | null {
  return typeof raw === 'string' && (VALID_STEPS as readonly string[]).includes(raw)
    ? (raw as StepKey)
    : null;
}

function asAssignee(raw: unknown): Assignee | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    return raw.length > 0 ? { initials: raw } : null;
  }
  if (typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    const initials = typeof r.initials === 'string' ? r.initials : null;
    if (!initials) return null;
    return {
      initials,
      name: typeof r.name === 'string' ? r.name : undefined,
    };
  }
  return null;
}

function asString(raw: unknown, fallback = ''): string {
  return typeof raw === 'string' ? raw : fallback;
}

function asStringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

export function parseTask(raw: unknown): Task | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.title !== 'string') return null;
  return {
    id: r.id,
    title: r.title,
    status: asStatus(r.status),
    priority: asPriority(r.priority),
    assignee: asAssignee(r.assignee),
    due: asString(r.due),
    storySlug: typeof r.story === 'string' ? r.story : null,
    storyTitle: typeof r.storyTitle === 'string' ? r.storyTitle : null,
    step: asStep(r.step),
  };
}

export function parseTaskGroups(raw: unknown): TaskGroup[] {
  if (!Array.isArray(raw)) {
    if (typeof console !== 'undefined') {
      console.warn('[adapters/tasks] parseTaskGroups: expected array, got', typeof raw);
    }
    return [];
  }
  return raw
    .map((g): TaskGroup | null => {
      if (!g || typeof g !== 'object') return null;
      const grp = g as Record<string, unknown>;
      const label = asString(grp.label);
      if (!label) return null;
      const tasks = Array.isArray(grp.tasks)
        ? grp.tasks.map(parseTask).filter((t): t is Task => t !== null)
        : [];
      const count = typeof grp.count === 'number' ? grp.count : tasks.length;
      return { label, count, tasks };
    })
    .filter((g): g is TaskGroup => g !== null);
}

function parseComment(raw: unknown): TaskComment | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.body !== 'string') return null;
  return {
    id: typeof r.id === 'string' ? r.id : `local-${Math.random().toString(36).slice(2)}`,
    authorInitials: typeof r.initials === 'string' ? r.initials : asString(r.authorInitials, '??'),
    authorName: typeof r.name === 'string' ? r.name : asString(r.authorName, 'Unknown'),
    createdAt: typeof r.time === 'string' ? r.time : asString(r.createdAt, ''),
    body: r.body,
  };
}

function parseClickUpLink(raw: unknown): ClickUpLink | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string') return null;
  return {
    id: r.id,
    list: asString(r.list),
    url: asString(r.url),
  };
}

export function parseTaskDetail(raw: unknown): TaskDetail | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.title !== 'string') return null;
  return {
    id: r.id,
    title: r.title,
    status: asStatus(r.status),
    priority: asPriority(typeof r.priority === 'string' ? r.priority.toLowerCase() : r.priority),
    assignee: asAssignee(r.assignee),
    reporter: asAssignee(r.reporter),
    due: asString(r.due),
    estimate: asString(r.estimate),
    labels: asStringArray(r.labels),
    storySlug: typeof r.storySlug === 'string' ? r.storySlug : null,
    storyTitle: typeof r.story === 'string' ? r.story : asString(r.storyTitle) || null,
    step: asStep(r.step),
    description: asStringArray(r.description),
    acceptance: asStringArray(r.acceptance),
    comments: Array.isArray(r.comments)
      ? r.comments.map(parseComment).filter((c): c is TaskComment => c !== null)
      : [],
    clickup: parseClickUpLink(r.clickup),
  };
}

export function parseClickUpSync(raw: unknown): ClickUpSyncState {
  if (!raw || typeof raw !== 'object') {
    return { status: 'synced', lastSyncedAt: null, errorMessage: null };
  }
  const r = raw as Record<string, unknown>;
  const status: SyncStatus =
    typeof r.status === 'string' && (VALID_SYNC as readonly string[]).includes(r.status)
      ? (r.status as SyncStatus)
      : 'synced';
  return {
    status,
    lastSyncedAt: typeof r.lastSyncedAt === 'string' ? r.lastSyncedAt : null,
    errorMessage: typeof r.errorMessage === 'string' ? r.errorMessage : null,
  };
}
