'use client';

import { MoreHorizontal } from 'lucide-react';
import { Avatar } from '@/components/primitives/Avatar';
import { StatusChip } from './StatusChip';
import { PriorityIcon } from './PriorityIcon';
import type { Task } from '@/lib/types/task';

interface TaskRowProps {
  task: Task;
  active: boolean;
  onSelect: (id: string) => void;
}

/**
 * TaskRow (FR-16, handoff §11).
 * Colonnes : status-chip · ID mono · titre + story/step · priority · assignee · due · kebab.
 */
export function TaskRow({ task, active, onSelect }: TaskRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(task.id)}
      className={
        'flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors ' +
        (active ? 'bg-surface-hover' : 'hover:bg-surface-hover')
      }
    >
      <StatusChip status={task.status} />
      <span className="font-mono text-[11px] text-text-3">{task.id}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] text-text">{task.title}</span>
        {(task.storyTitle || task.step) && (
          <span className="truncate font-mono text-[11px] text-text-3">
            {task.storyTitle ?? ''}
            {task.storyTitle && task.step && ' · '}
            {task.step ?? ''}
          </span>
        )}
      </div>
      <PriorityIcon priority={task.priority} />
      {task.assignee && <Avatar initials={task.assignee.initials} size={22} />}
      <span className="w-16 truncate text-right text-[11px] text-text-3">{task.due}</span>
      <span
        role="button"
        aria-label="Task actions"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="text-text-3 hover:text-text"
      >
        <MoreHorizontal size={14} />
      </span>
    </button>
  );
}
