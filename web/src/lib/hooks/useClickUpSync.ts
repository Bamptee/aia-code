'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api/client';
import { parseClickUpSync } from '@/lib/api/adapters/tasks';
import type { ClickUpSyncState } from '@/lib/types/task';

/**
 * useClickUpSync — query l'état de sync ClickUp (FR-18).
 *
 * Pattern : 30s stale, refetch on focus (déjà géré globalement). 404 = synced
 * gracefully (backend pas encore branché).
 */
export function useClickUpSyncQuery() {
  return useQuery<ClickUpSyncState>({
    queryKey: ['clickup-sync'],
    queryFn: async ({ signal }) => {
      try {
        const raw = await apiFetch<unknown>('/api/integrations/clickup/sync', { signal });
        return parseClickUpSync(raw);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'HTTP_ERROR' && err.status === 404) {
          return { status: 'synced', lastSyncedAt: null, errorMessage: null };
        }
        throw err;
      }
    },
  });
}

/**
 * useTriggerClickUpSync — force un refresh manuel + invalide tasks.
 * Clic sur SyncPill ou bouton "Sync now" déclenche ça.
 */
export function useTriggerClickUpSync() {
  const qc = useQueryClient();

  return useMutation<ClickUpSyncState, Error>({
    mutationFn: async () => {
      const raw = await apiFetch<unknown>('/api/integrations/clickup/sync', { method: 'POST' });
      return parseClickUpSync(raw);
    },
    onMutate: async () => {
      qc.setQueryData<ClickUpSyncState>(['clickup-sync'], (prev) => ({
        status: 'syncing',
        lastSyncedAt: prev?.lastSyncedAt ?? null,
        errorMessage: null,
      }));
    },
    onSuccess: (next) => {
      qc.setQueryData<ClickUpSyncState>(['clickup-sync'], next);
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err) => {
      qc.setQueryData<ClickUpSyncState>(['clickup-sync'], (prev) => ({
        status: 'failed',
        lastSyncedAt: prev?.lastSyncedAt ?? null,
        errorMessage: err instanceof Error ? err.message : 'Sync failed',
      }));
    },
  });
}
