import type { TaskStatus } from '@/lib/types/task';

interface StatusChipProps {
  status: TaskStatus;
  withLabel?: boolean;
}

const CONFIG: Record<TaskStatus, { label: string; bg: string; fg: string; dot: string }> = {
  todo: { label: 'Todo', bg: 'var(--surface-2)', fg: 'var(--text-2)', dot: 'var(--text-3)' },
  doing: { label: 'Doing', bg: 'var(--blue-soft)', fg: 'var(--blue)', dot: 'var(--blue)' },
  review: { label: 'In review', bg: 'var(--amber-soft)', fg: 'var(--amber)', dot: 'var(--amber)' },
  done: { label: 'Done', bg: 'var(--green-soft)', fg: 'var(--green)', dot: 'var(--green)' },
  blocked: { label: 'Blocked', bg: 'var(--red-soft)', fg: 'var(--red)', dot: 'var(--red)' },
};

/**
 * StatusChip — 5 variants (todo / doing / review / done / blocked) handoff §11.
 * Mode `withLabel=false` (default) : dot 8px coloré pour les rows de la liste.
 * Mode `withLabel=true` : badge complet pour le side panel detail.
 */
export function StatusChip({ status, withLabel = false }: StatusChipProps) {
  const c = CONFIG[status];

  if (!withLabel) {
    return (
      <span
        aria-label={c.label}
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: c.dot }}
      />
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium"
      style={{ background: c.bg, color: c.fg }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: c.dot }} />
      {c.label}
    </span>
  );
}
