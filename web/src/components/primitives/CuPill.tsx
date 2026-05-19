import type { CuSyncState } from '@/lib/types/story';

interface CuPillProps {
  state: CuSyncState;
  taskCount?: number;
}

const CU_STYLES: Record<CuSyncState, { bg: string; text: string; label: string; dot: string }> = {
  synced: { bg: 'var(--green-soft)', text: 'var(--green)', label: 'synced', dot: 'var(--green)' },
  drift: { bg: 'var(--amber-soft)', text: 'var(--amber)', label: 'drift', dot: 'var(--amber)' },
  none: { bg: 'var(--surface-hover)', text: 'var(--text-3)', label: 'none', dot: 'var(--text-3)' },
};

/**
 * ClickUp sync state pill (handoff §13).
 */
export function CuPill({ state, taskCount }: CuPillProps) {
  const s = CU_STYLES[state];
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: s.bg, color: s.text }}
      title={state === 'none' ? 'Not synced to ClickUp' : `ClickUp ${s.label}`}
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: s.dot }}
      />
      <span>CU</span>
      {typeof taskCount === 'number' && taskCount > 0 && (
        <span className="font-mono">{taskCount}</span>
      )}
    </span>
  );
}
