import { Check, RefreshCw } from 'lucide-react';
import type { CuSyncState } from '@/lib/types/story';

interface CuPillProps {
  state: CuSyncState;
  taskCount?: number;
}

/**
 * ClickUp sync state pill (handoff §13 + .cu-pill CSS lignes 1742-1752).
 *
 * Labels par état (handoff views-v3.jsx:172-176) :
 * - synced → `<Check> CU` (vert)
 * - drift → `<RefreshCw> drift` (amber)
 * - none → `— not pushed` (text-3)
 *
 * Format : rounded-4px font-mono 11px padding 2px 7px.
 */
export function CuPill({ state, taskCount }: CuPillProps) {
  const showCount = state === 'synced' && typeof taskCount === 'number' && taskCount > 0;

  if (state === 'none') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-[4px] px-[7px] py-0.5 font-mono text-[11px]"
        style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-3)' }}
        title="Not pushed to ClickUp"
      >
        — not pushed
      </span>
    );
  }

  const { bg, fg, label, Icon } =
    state === 'drift'
      ? { bg: 'var(--amber-soft)', fg: 'var(--amber)', label: 'drift', Icon: RefreshCw }
      : { bg: 'var(--green-soft)', fg: 'var(--green)', label: 'CU', Icon: Check };

  return (
    <span
      className="inline-flex items-center gap-1 rounded-[4px] px-[7px] py-0.5 font-mono text-[11px]"
      style={{ backgroundColor: bg, color: fg }}
      title={state === 'synced' ? 'Synced with ClickUp' : 'Drift detected'}
    >
      <Icon size={10} />
      <span>{label}</span>
      {showCount && <span>{taskCount}</span>}
    </span>
  );
}
