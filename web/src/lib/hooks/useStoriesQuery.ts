'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { parseStoryList } from '@/lib/api/adapters/stories';
import type { Story } from '@/lib/types/story';

/**
 * useStoriesQuery — fetch toutes les stories non-deleted.
 *
 * Note : `filter=active` côté Express filtre les stories supprimées (pas les `done`).
 * Les stories en phase `done` sont incluses ; les consumers (Sidebar, RecentStories,
 * LibraryPage) filtrent selon leur besoin client-side.
 *
 * Forward le `signal` AbortController de React Query pour cancel sur navigation rapide.
 */
export function useStoriesQuery() {
  return useQuery<Story[]>({
    queryKey: ['stories', { filter: 'active' }],
    queryFn: async ({ signal }) => {
      const raw = await apiFetch<unknown>('/api/features?filter=active', { signal });
      return parseStoryList(raw);
    },
  });
}
