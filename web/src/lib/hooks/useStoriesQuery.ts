'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { parseStoryList } from '@/lib/api/adapters/stories';
import type { Story } from '@/lib/types/story';

/**
 * useStoriesQuery — fetch toutes les stories actives.
 * Backed by Express `/api/features?filter=active` → adapter → Story[].
 */
export function useStoriesQuery() {
  return useQuery<Story[]>({
    queryKey: ['stories', { filter: 'active' }],
    queryFn: async () => {
      const raw = await apiFetch<unknown>('/api/features?filter=active');
      return parseStoryList(raw);
    },
  });
}
