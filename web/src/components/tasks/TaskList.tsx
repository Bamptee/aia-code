'use client';

import { ChevronDown } from 'lucide-react';
import { Skeleton } from '@/components/primitives/Skeleton';
import { TaskRow } from './TaskRow';
import type { TaskGroup } from '@/lib/types/task';

interface TaskListProps {
  groups: TaskGroup[];
  isLoading: boolean;
  activeTaskId: string | null;
  onSelect: (id: string) => void;
}

/**
 * TaskList — sections groupées par status (FR-16, handoff §11).
 * Empty state si pas de cache : "Push tasks from a dev-plan step".
 */
export function TaskList({ groups, isLoading, activeTaskId, onSelect }: TaskListProps) {
  if (isLoading && groups.length === 0) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-32" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
        <p className="text-sm font-medium text-text">No tasks yet</p>
        <p className="max-w-xs text-xs text-text-3">
          Push tasks from a <code className="font-mono text-text-2">dev-plan</code> step. They&apos;ll appear here once
          synced with ClickUp.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {groups.map((g) => (
        <section key={g.label} className="flex flex-col">
          <header className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-1.5 text-[11px] uppercase tracking-wider text-text-3">
            <ChevronDown size={12} />
            <span className="font-medium">{g.label}</span>
            <span className="ml-1 font-mono">{g.count}</span>
          </header>
          {g.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              active={task.id === activeTaskId}
              onSelect={onSelect}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
