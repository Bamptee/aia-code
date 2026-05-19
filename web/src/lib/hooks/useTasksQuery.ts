'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api/client';
import { parseTaskGroups } from '@/lib/api/adapters/tasks';
import type { TaskGroup } from '@/lib/types/task';

/**
 * useTasksQuery — liste des tasks groupées par status (FR-16).
 *
 * Refetch on window focus géré globalement via QueryClient.
 * 404 backward-compat : retourne [] gracefully (API gap durant Epic 5 bring-up).
 */
export function useTasksQuery() {
  return useQuery<TaskGroup[]>({
    queryKey: ['tasks'],
    queryFn: async ({ signal }) => {
      try {
        const raw = await apiFetch<unknown>('/api/tasks', { signal });
        return parseTaskGroups(raw);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'HTTP_ERROR' && err.status === 404) {
          return [];
        }
        throw err;
      }
    },
  });
}
