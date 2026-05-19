/**
 * Adapter Bitbucket : bridge Express → types handoff §17.
 *
 * API gap (architecture.md §10) : Express ne semble pas exposer encore les
 * endpoints Bitbucket en clair (`GET /api/features/:name/bitbucket/*`). Les
 * adapters ici acceptent un payload null/empty et retournent des defaults
 * proprement typés. Story 3.4 utilisera ce qui est disponible.
 */

import type {
  PullRequest,
  Pipeline,
  Reviewer,
  Check,
  Commit,
  BitbucketState,
  PrState,
} from '@/lib/types/bitbucket';

const PR_STATES: readonly PrState[] = ['draft', 'open', 'approved', 'merged', 'declined'] as const;
const REVIEWER_STATUSES: readonly Reviewer['status'][] = ['approved', 'requested-changes', 'pending'] as const;
const PIPELINE_STATUSES: readonly Pipeline['status'][] = ['successful', 'failed', 'in-progress', 'pending'] as const;
const CHECK_STATUSES: readonly Check['status'][] = ['successful', 'failed', 'in-progress', 'pending', 'skipped'] as const;

function parsePrState(raw: unknown): PrState {
  if (typeof raw === 'string' && (PR_STATES as readonly string[]).includes(raw)) {
    return raw as PrState;
  }
  return 'open';
}

export function parseCheck(raw: unknown): Check | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const status = typeof r.status === 'string' && (CHECK_STATUSES as readonly string[]).includes(r.status)
    ? (r.status as Check['status'])
    : 'pending';
  return {
    name: typeof r.name === 'string' ? r.name : 'check',
    status,
    duration: typeof r.duration === 'string' ? r.duration : '',
  };
}

export function parsePipeline(raw: unknown): Pipeline | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const status = typeof r.status === 'string' && (PIPELINE_STATUSES as readonly string[]).includes(r.status)
    ? (r.status as Pipeline['status'])
    : 'pending';
  const checks: Check[] = Array.isArray(r.checks)
    ? r.checks.map(parseCheck).filter((c): c is Check => c !== null)
    : [];
  return {
    status,
    buildId: typeof r.buildId === 'string' ? r.buildId : null,
    duration: typeof r.duration === 'string' ? r.duration : '',
    checks,
  };
}

export function parseReviewer(raw: unknown): Reviewer | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const status = typeof r.status === 'string' && (REVIEWER_STATUSES as readonly string[]).includes(r.status)
    ? (r.status as Reviewer['status'])
    : 'pending';
  return {
    initials: typeof r.initials === 'string' ? r.initials : '??',
    name: typeof r.name === 'string' ? r.name : 'Unknown',
    status,
    at: typeof r.at === 'string' ? r.at : null,
  };
}

export function parseCommit(raw: unknown): Commit | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    hash: typeof r.hash === 'string' ? r.hash : '',
    msg: typeof r.msg === 'string' ? r.msg : '',
    author: typeof r.author === 'string' ? r.author : '',
    when: typeof r.when === 'string' ? r.when : '',
  };
}

export function parsePullRequest(raw: unknown): PullRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.number !== 'number') return null;

  return {
    number: r.number,
    title: typeof r.title === 'string' ? r.title : '(untitled)',
    state: parsePrState(r.state),
    target: typeof r.target === 'string' ? r.target : 'main',
    author: typeof r.author === 'string' ? r.author : '',
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : '',
    additions: typeof r.additions === 'number' ? r.additions : 0,
    deletions: typeof r.deletions === 'number' ? r.deletions : 0,
    reviewers: Array.isArray(r.reviewers)
      ? r.reviewers.map(parseReviewer).filter((x): x is Reviewer => x !== null)
      : undefined,
    pipeline: parsePipeline(r.pipeline) ?? undefined,
    commits: Array.isArray(r.commits)
      ? r.commits.map(parseCommit).filter((x): x is Commit => x !== null)
      : undefined,
  };
}

export function parseBitbucketState(raw: unknown): BitbucketState {
  if (!raw || typeof raw !== 'object') {
    return { branch: null, commits: 0, pr: null };
  }
  const r = raw as Record<string, unknown>;
  return {
    branch: typeof r.branch === 'string' ? r.branch : null,
    commits: typeof r.commits === 'number' ? r.commits : 0,
    pr: parsePullRequest(r.pr),
  };
}
