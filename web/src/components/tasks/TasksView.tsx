'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTasksQuery } from '@/lib/hooks/useTasksQuery';
import { setSearchParam } from '@/lib/url/setParam';
import { TaskList } from './TaskList';
import { TaskDetailPanel } from './TaskDetailPanel';
import { SyncPill } from './SyncPill';

/**
 * TasksView — page principale /tasks (FR-16, handoff §11).
 *
 * Two-pane : list (left) + detail side panel 340px (right).
 *
 * Sélection : URL `?task=<id>` quand l'user a explicitement choisi une task.
 * Si pas de `?task`, on dérive la première task disponible côté render (display only,
 * sans push d'URL — évite re-render boucle / set-state-in-effect).
 */
export function TasksView() {
  const { data: groups = [], isLoading } = useTasksQuery();
  const searchParams = useSearchParams();
  const urlTaskId = searchParams?.get('task') ?? null;

  const targetId = useMemo(() => {
    if (urlTaskId) return urlTaskId;
    return groups.flatMap((g) => g.tasks)[0]?.id ?? null;
  }, [urlTaskId, groups]);

  const handleSelect = (id: string) => {
    setSearchParam('task', id);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-6 py-3">
        <h1 className="text-lg font-semibold text-text">Tasks</h1>
        <SyncPill />
        <p className="ml-3 hidden text-xs text-text-3 md:block">
          Generated from <code className="font-mono text-text-2">dev-plan</code> outputs · synced both ways with
          ClickUp.
        </p>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <TaskList groups={groups} isLoading={isLoading} activeTaskId={targetId} onSelect={handleSelect} />
        </div>
        <TaskDetailPanel taskId={targetId} />
      </div>
    </div>
  );
}
