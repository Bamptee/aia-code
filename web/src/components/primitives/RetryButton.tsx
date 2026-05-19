'use client';

import { useState } from 'react';
import { RotateCw, ChevronDown, ChevronUp } from 'lucide-react';

interface RetryButtonProps {
  onRetry: () => void;
  failureCount?: number;
  /** Optional error detail shown in the disclosure after 2 échecs. */
  errorDetail?: string;
}

/**
 * Retry button avec mémoire (handoff §15 + Sally recos).
 * - failureCount = 0 → simple "Retry"
 * - failureCount = 1 → "Retry (1 échec)"
 * - failureCount ≥ 2 → "Retry (N échecs) — voir détails" + disclosure du errorDetail
 */
export function RetryButton({
  onRetry,
  failureCount = 0,
  errorDetail,
}: RetryButtonProps) {
  const [open, setOpen] = useState(false);
  const showDetails = failureCount >= 2 && errorDetail;

  const label =
    failureCount === 0
      ? 'Retry'
      : failureCount === 1
        ? 'Retry (1 échec)'
        : `Retry (${failureCount} échecs)`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-2.5 py-1 text-sm text-text transition-colors hover:bg-surface-hover"
        >
          <RotateCw size={12} />
          <span>{label}</span>
        </button>
        {showDetails && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 text-xs text-text-3 transition-colors hover:text-text-2"
          >
            <span>{open ? 'Hide details' : 'See details'}</span>
            {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        )}
      </div>
      {showDetails && open && (
        <pre className="mt-1 max-h-32 overflow-auto rounded border border-border bg-surface-2 p-2 font-mono text-[11px] leading-snug text-text-2">
          {errorDetail}
        </pre>
      )}
    </div>
  );
}
