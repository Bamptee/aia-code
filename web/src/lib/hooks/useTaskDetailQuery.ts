'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api/client';
import { parseTaskDetail } from '@/lib/api/adapters/tasks';
import type { TaskDetail } from '@/lib/types/task';

/**
 * useTaskDetailQuery — détail task pour le side panel (FR-17).
 *
 * Cache hit → render < 200ms ; cache miss → Skeleton matching layout 200ms max
 * avant contenu (loading state pattern architecture §loading).
 */
export function useTaskDetailQuery(taskId: string | null) {
  return useQuery<TaskDetail | null>({
    queryKey: ['task-detail', taskId],
    enabled: !!taskId,
    queryFn: async ({ signal }) => {
      if (!taskId) return null;
      try {
        const raw = await apiFetch<unknown>(`/api/tasks/${encodeURIComponent(taskId)}`, { signal });
        return parseTaskDetail(raw);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'HTTP_ERROR' && err.status === 404) {
          return null;
        }
        throw err;
      }
    },
  });
}
