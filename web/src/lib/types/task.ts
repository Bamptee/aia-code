/**
 * Task types (handoff §11 + FR-16/17/18).
 *
 * Tasks sont générées depuis les dev-plan outputs et synchronisées both-ways avec
 * ClickUp. UI: list groupée par status (In progress / Up next / Done this week) +
 * side panel detail avec composer commentaire optimistic.
 */

import type { StepKey } from './step';

export type TaskStatus = 'todo' | 'doing' | 'review' | 'done' | 'blocked';
export type TaskPriority = 'high' | 'med' | 'low';

export interface Assignee {
  initials: string;
  name?: string;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: Assignee | null;
  due: string;
  storySlug: string | null;
  storyTitle: string | null;
  step: StepKey | null;
}

export interface TaskGroup {
  label: string;
  count: number;
  tasks: Task[];
}

export interface TaskComment {
  id: string;
  authorInitials: string;
  authorName: string;
  createdAt: string;
  body: string;
  pending?: boolean;
  failed?: boolean;
}

export interface ClickUpLink {
  id: string;
  list: string;
  url: string;
}

export interface TaskDetail {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: Assignee | null;
  reporter: Assignee | null;
  due: string;
  estimate: string;
  labels: string[];
  storySlug: string | null;
  storyTitle: string | null;
  step: StepKey | null;
  description: string[];
  acceptance: string[];
  comments: TaskComment[];
  clickup: ClickUpLink | null;
}

export type SyncStatus = 'synced' | 'syncing' | 'failed';

export interface ClickUpSyncState {
  status: SyncStatus;
  lastSyncedAt: string | null;
  errorMessage: string | null;
}
