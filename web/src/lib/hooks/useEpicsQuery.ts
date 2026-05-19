'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { parseEpicList } from '@/lib/api/adapters/epics';
import type { Epic } from '@/lib/types/epic';

/**
 * useEpicsQuery — fetch tous les epics (incluant archived).
 * Backed by Express `/api/epics` → adapter → Epic[].
 */
export function useEpicsQuery() {
  return useQuery<Epic[]>({
    queryKey: ['epics'],
    queryFn: async ({ signal }) => {
      const raw = await apiFetch<unknown>('/api/epics', { signal });
      return parseEpicList(raw);
    },
  });
}
