'use client';

import { useEffect, useState } from 'react';
import { useClickUpSyncQuery, useTriggerClickUpSync } from '@/lib/hooks/useClickUpSync';
import { formatRelative } from '@/lib/format/date';

/**
 * SyncPill ClickUp (FR-18, handoff §11).
 *
 * États :
 * - synced : dot vert pulsant + "Synced with ClickUp · Ns ago"
 * - syncing : dot vert spin + "Syncing..."
 * - failed : dot rouge + "Sync failed — click to retry"
 *
 * Clic → force refresh manuel (mutation + invalidate ['tasks']).
 * Refetch on focus géré globalement par QueryClient.
 */
export function SyncPill() {
  const { data: sync } = useClickUpSyncQuery();
  const trigger = useTriggerClickUpSync();
  const now = useNowTick(1000);

  const status = sync?.status ?? 'synced';
  const lastSyncedAt = sync?.lastSyncedAt ?? null;

  const isSyncing = status === 'syncing' || trigger.isPending;
  const isFailed = status === 'failed';

  let label: string;
  if (isSyncing) label = 'Syncing…';
  else if (isFailed) label = 'Sync failed — click to retry';
  else label = lastSyncedAt ? `Synced with ClickUp · ${formatRelative(lastSyncedAt, now)}` : 'Synced with ClickUp';

  const onClick = () => {
    if (trigger.isPending) return;
    trigger.mutate();
  };

  const dotClass = isFailed
    ? 'bg-red'
    : isSyncing
      ? 'bg-green animate-spin'
      : 'bg-green animate-pulse';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={trigger.isPending}
      aria-label={label}
      title={label}
      className={
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] transition-colors ' +
        (isFailed
          ? 'border-red-soft bg-red-soft text-red'
          : 'border-border bg-surface text-text-2 hover:bg-surface-hover')
      }
    >
      <span className={'inline-block h-1.5 w-1.5 rounded-full ' + dotClass} />
      <span className="font-mono">{label}</span>
    </button>
  );
}

/** Tick utilitaire pour rafraîchir un "ago" timestamp chaque interval ms. */
function useNowTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
