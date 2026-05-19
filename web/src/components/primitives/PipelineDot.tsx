import type { Check } from '@/lib/types/bitbucket';

interface PipelineDotProps {
  status: Check['status'] | 'in-progress' | 'pending';
  label?: string;
  compact?: boolean;
}

const COLORS: Record<PipelineDotProps['status'], string> = {
  successful: 'var(--pipe-ok)',
  failed: 'var(--pipe-fail)',
  'in-progress': 'var(--pipe-run)',
  pending: 'var(--pipe-pending)',
  skipped: 'var(--pipe-pending)',
};

/**
 * Single pipeline check dot (handoff §13). Animated pulse on in-progress.
 */
export function PipelineDot({ status, label, compact = false }: PipelineDotProps) {
  const color = COLORS[status];
  const isRunning = status === 'in-progress';
  return (
    <span
      className="inline-flex items-center gap-1"
      title={label ? `${label} · ${status}` : status}
    >
      <span
        aria-hidden="true"
        className={'inline-block rounded-full ' + (isRunning ? 'animate-pulse' : '')}
        style={{
          width: compact ? 6 : 8,
          height: compact ? 6 : 8,
          backgroundColor: color,
        }}
      />
      {label && !compact && (
        <span className="font-mono text-[10px] text-text-3">{label}</span>
      )}
    </span>
  );
}
