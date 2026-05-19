import type { Check } from '@/lib/types/bitbucket';

interface PipelineDotProps {
  status: Check['status'] | 'in-progress' | 'pending';
  label?: string;
  compact?: boolean;
}

/**
 * Single pipeline check dot (handoff §13 + .pipe-dot CSS lignes 210-235).
 *
 * Dot 8px border 1.5px par défaut (border-strong). Variantes :
 * - successful/failed/in-progress : background = couleur, border = couleur
 * - pending : transparent, border dashed pipe-pending
 * - skipped : background surface-2, border border-strong
 * Animation in-progress : pulse jaune (box-shadow expand).
 */
export function PipelineDot({ status, label, compact = false }: PipelineDotProps) {
  const dotStyle = buildDotStyle(status);
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[10.5px] text-text-2"
      title={label ? `${label} · ${status}` : status}
    >
      <span
        aria-hidden
        className={'inline-block rounded-full ' + (status === 'in-progress' ? 'animate-pulse' : '')}
        style={dotStyle}
      />
      {label && !compact && <span className="text-text-3">{label}</span>}
    </span>
  );
}

function buildDotStyle(status: PipelineDotProps['status']): React.CSSProperties {
  const base: React.CSSProperties = { width: 8, height: 8 };
  if (status === 'successful') {
    return { ...base, background: 'var(--pipe-ok)', border: '1.5px solid var(--pipe-ok)' };
  }
  if (status === 'failed') {
    return { ...base, background: 'var(--pipe-fail)', border: '1.5px solid var(--pipe-fail)' };
  }
  if (status === 'in-progress') {
    return {
      ...base,
      background: 'var(--pipe-run)',
      border: '1.5px solid var(--pipe-run)',
      boxShadow: '0 0 0 4px rgba(179,131,32,0.15)',
    };
  }
  if (status === 'pending') {
    return {
      ...base,
      background: 'transparent',
      border: '1.5px dashed var(--pipe-pending)',
    };
  }
  // skipped
  return {
    ...base,
    background: 'var(--surface-2)',
    border: '1.5px solid var(--border-strong)',
  };
}
