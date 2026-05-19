import type { TaskPriority } from '@/lib/types/task';

interface PriorityIconProps {
  priority: TaskPriority;
}

const CONFIG: Record<TaskPriority, { color: string; bars: number; label: string }> = {
  high: { color: 'var(--red)', bars: 3, label: 'High' },
  med: { color: 'var(--amber)', bars: 2, label: 'Med' },
  low: { color: 'var(--text-3)', bars: 1, label: 'Low' },
};

/**
 * PriorityIcon — 3 mini-barres ascendantes, N actives selon high/med/low.
 */
export function PriorityIcon({ priority }: PriorityIconProps) {
  const { color, bars, label } = CONFIG[priority];
  return (
    <span
      aria-label={`Priority: ${label}`}
      className="inline-flex h-3 items-end gap-[2px]"
    >
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-sm"
          style={{
            height: `${i * 3 + 2}px`,
            background: i <= bars ? color : 'var(--border-strong)',
          }}
        />
      ))}
    </span>
  );
}
