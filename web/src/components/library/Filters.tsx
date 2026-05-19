'use client';

import type { Phase } from '@/lib/types/step';

export type LibraryFilter = 'all' | 'product' | 'dev' | 'done';

interface FiltersProps {
  active: LibraryFilter;
  counts: Record<LibraryFilter, number>;
  onChange: (filter: LibraryFilter) => void;
}

const TABS: { key: LibraryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'product', label: 'Product' },
  { key: 'dev', label: 'Dev' },
  { key: 'done', label: 'Done' },
];

/**
 * Library filter tabs (FR-8).
 * Counts en mono, stables (calculés sur la liste totale, indépendants de la search).
 */
export function Filters({ active, counts, onChange }: FiltersProps) {
  return (
    <div className="flex items-center gap-1">
      {TABS.map(({ key, label }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={
              'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm transition-colors ' +
              (isActive
                ? 'bg-surface font-semibold text-text shadow-sm'
                : 'text-text-2 hover:bg-surface-hover hover:text-text')
            }
          >
            <span>{label}</span>
            <span className="font-mono text-[10px] text-text-3">{counts[key]}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Map d'une story Phase vers le tab filter qu'elle satisfait.
 * - 'done' → tab 'done'
 * - 'product' / 'qa' → tab 'product' (product side du pipeline)
 * - 'dev' → tab 'dev'
 */
export function phaseToFilter(phase: Phase): LibraryFilter {
  if (phase === 'done') return 'done';
  if (phase === 'dev') return 'dev';
  return 'product'; // product + qa lumped sous product side
}
