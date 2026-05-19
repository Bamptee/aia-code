/**
 * Bitbucket / source control types (handoff §17).
 * Réexportés depuis story.ts pour conserver la compat ; nouveaux composants
 * (SourceStrip, PrPill, PipelineStack...) doivent importer depuis ici.
 */

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
