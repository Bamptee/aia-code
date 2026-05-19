'use client';

import { useSyncExternalStore } from 'react';
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
      <SyncDot isSyncing={isSyncing} isFailed={isFailed} />
      <span className="font-mono">{label}</span>
    </button>
  );
}

/**
 * Dot du SyncPill. En `syncing`, un arc visible (border-t-transparent) tourne ;
 * sinon, dot rond pulsant (success) ou statique rouge (failed).
 */
function SyncDot({ isSyncing, isFailed }: { isSyncing: boolean; isFailed: boolean }) {
  if (isSyncing) {
    return (
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-green border-t-transparent"
      />
    );
  }
  if (isFailed) {
    return <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-red" />;
  }
  return <span aria-hidden className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green" />;
}

/**
 * Tick utilitaire pour rafraîchir un "ago" timestamp chaque interval ms.
 *
 * Pattern useSyncExternalStore : snapshot serveur = 0 (formatRelative gère 0 ms
 * comme "now") évite hydration mismatch. Snapshot client = Date.now(). Le tick
 * intervalle déclenche un re-render via le callback subscribe.
 */
function useNowTick(intervalMs: number): number {
  return useSyncExternalStore(
    (callback) => {
      const id = setInterval(callback, intervalMs);
      return () => clearInterval(id);
    },
    () => Date.now(),
    () => 0,
  );
}
