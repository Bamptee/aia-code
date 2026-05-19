'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { parseStory } from '@/lib/api/adapters/stories';
import type { Story } from '@/lib/types/story';

/**
 * useStoryQuery — fetch une story unique par slug.
 * Backed by Express `/api/features/:name` → adapter → Story.
 *
 * Cache séparé par slug (queryKey: ['story', slug]).
 * Refetch on focus actif (cf. createQueryClient).
 */
export function useStoryQuery(slug: string | null) {
  return useQuery<Story>({
    queryKey: ['story', slug],
    enabled: !!slug,
    queryFn: async ({ signal }) => {
      if (!slug) throw new Error('useStoryQuery: slug required');
      const raw = await apiFetch<unknown>(`/api/features/${encodeURIComponent(slug)}`, { signal });
      return parseStory(raw);
    },
  });
}
