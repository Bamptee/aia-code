'use client';

import { ExternalLink, RotateCw } from 'lucide-react';
import { Avatar } from '@/components/primitives/Avatar';
import { Skeleton } from '@/components/primitives/Skeleton';
import { useTaskDetailQuery } from '@/lib/hooks/useTaskDetailQuery';
import { useAddTaskComment } from '@/lib/hooks/useAddTaskComment';
import { StatusChip } from './StatusChip';
import { CommentComposer } from './CommentComposer';
import type { TaskComment, TaskDetail } from '@/lib/types/task';

interface TaskDetailPanelProps {
  taskId: string | null;
}

// Author info pour le composer optimistic. Solo-dev v1 : valeurs en dur.
// Story future : récupérer depuis Settings/user profile.
const SELF_AUTHOR = { initials: 'AG', name: 'Anthony' };

/**
 * TaskDetailPanel — side panel 340px droite (FR-17, handoff §11).
 *
 * Layout : status badge + ClickUp link + dl + Description + Acceptance + Comments + composer.
 * Skeleton matching layout durant isLoading (architecture §loading state).
 */
export function TaskDetailPanel({ taskId }: TaskDetailPanelProps) {
  const { data: detail, isLoading } = useTaskDetailQuery(taskId);
  const addComment = useAddTaskComment();

  if (!taskId) {
    return (
      <aside className="flex w-[340px] shrink-0 flex-col items-center justify-center border-l border-border p-6 text-center text-xs text-text-3">
        Select a task to see its detail.
      </aside>
    );
  }

  if (isLoading || !detail) {
    return (
      <aside className="flex w-[340px] shrink-0 flex-col gap-3 border-l border-border p-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-12 w-full" />
      </aside>
    );
  }

  const onCommentSubmit = (body: string) => {
    addComment.mutate({ taskId: detail.id, body, author: SELF_AUTHOR });
  };

  return (
    <aside className="flex w-[340px] shrink-0 flex-col overflow-y-auto border-l border-border">
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="font-mono text-text-3">{detail.id}</span>
          <StatusChip status={detail.status} withLabel />
          {detail.clickup && (
            <a
              href={detail.clickup.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-text-3 transition-colors hover:text-text"
            >
              ClickUp <ExternalLink size={10} />
            </a>
          )}
        </div>
        <h2 className="text-[15px] font-semibold leading-tight text-text [text-wrap:balance]">
          {detail.title}
        </h2>
      </div>

      <DetailFields detail={detail} />

      {detail.description.length > 0 && (
        <Section label="Description">
          <div className="space-y-2 text-[12.5px] leading-relaxed text-text-2">
            {detail.description.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </Section>
      )}

      {detail.acceptance.length > 0 && (
        <Section label="Acceptance criteria">
          <ul className="list-disc space-y-1.5 pl-4 text-[12.5px] leading-relaxed text-text-2 marker:text-text-3">
            {detail.acceptance.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section label="Comments" noBorder>
        <div className="space-y-3">
          {detail.comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              onRetry={c.failed ? () => onCommentSubmit(c.body) : undefined}
            />
          ))}
        </div>
        <div className="mt-3">
          <CommentComposer onSubmit={onCommentSubmit} />
        </div>
      </Section>
    </aside>
  );
}

function DetailFields({ detail }: { detail: TaskDetail }) {
  const rows: Array<[string, React.ReactNode]> = [];
  if (detail.assignee) {
    rows.push([
      'Assignee',
      <span key="a" className="flex items-center gap-1.5">
        <Avatar initials={detail.assignee.initials} size={18} />
        {detail.assignee.name ?? detail.assignee.initials}
      </span>,
    ]);
  }
  if (detail.reporter) {
    rows.push([
      'Reporter',
      <span key="r" className="flex items-center gap-1.5">
        <Avatar initials={detail.reporter.initials} size={18} />
        {detail.reporter.name ?? detail.reporter.initials}
      </span>,
    ]);
  }
  if (detail.due) rows.push(['Due', detail.due]);
  if (detail.estimate) rows.push(['Estimate', <span key="e" className="font-mono">{detail.estimate}</span>]);
  if (detail.storyTitle) rows.push(['Story', detail.storyTitle]);
  if (detail.step) {
    rows.push([
      'From step',
      <span
        key="s"
        className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-2"
      >
        {detail.step}
      </span>,
    ]);
  }
  if (detail.labels.length > 0) {
    rows.push([
      'Labels',
      <span key="l" className="flex flex-wrap gap-1">
        {detail.labels.map((lab) => (
          <span
            key={lab}
            className="rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] text-text-2"
          >
            {lab}
          </span>
        ))}
      </span>,
    ]);
  }

  if (rows.length === 0) return null;

  return (
    <div className="border-b border-border p-4">
      <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 text-[12px]">
        {rows.map(([k, v], i) => (
          <div key={i} className="contents">
            <dt className="text-text-3">{k}</dt>
            <dd className="text-text-2">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Section({
  label,
  children,
  noBorder,
}: {
  label: string;
  children: React.ReactNode;
  noBorder?: boolean;
}) {
  return (
    <div className={'p-4 ' + (noBorder ? '' : 'border-b border-border')}>
      <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-text-3">{label}</h3>
      {children}
    </div>
  );
}

function CommentItem({ comment, onRetry }: { comment: TaskComment; onRetry?: () => void }) {
  return (
    <div
      className={
        'rounded border p-2 transition-opacity ' +
        (comment.failed
          ? 'border-red bg-red-soft/30'
          : 'border-border bg-surface')
      }
      style={comment.pending ? { opacity: 0.6 } : undefined}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[11px]">
        <Avatar initials={comment.authorInitials} size={16} />
        <span className="font-medium text-text">{comment.authorName}</span>
        <span className="text-text-3">{comment.createdAt}</span>
        {comment.pending && (
          <span className="ml-auto inline-block h-2.5 w-2.5 animate-spin rounded-full border border-text-3 border-t-transparent" />
        )}
        {comment.failed && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-auto inline-flex items-center gap-1 text-[10px] text-red hover:underline"
          >
            <RotateCw size={10} /> Retry
          </button>
        )}
      </div>
      <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-text-2">{comment.body}</p>
    </div>
  );
}
