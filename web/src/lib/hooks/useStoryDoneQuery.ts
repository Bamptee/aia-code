'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api/client';
import { parseStoryDone } from '@/lib/api/adapters/storyDone';
import type { StoryDone } from '@/lib/types/storyDone';

/**
 * useStoryDoneQuery — fetch le payload Read Mode d'une story livrée.
 *
 * API gap : endpoint `/api/features/:name/done` n'existe pas encore. Le hook
 * retourne `null` data + isError=false sur 404 (gracefully degrade — ReadMode
 * affiche son placeholder "hasn't been generated yet").
 */
export function useStoryDoneQuery(slug: string | null) {
  return useQuery<StoryDone | null>({
    queryKey: ['story-done', slug],
    enabled: !!slug,
    retry: false, // 404 attendu, pas la peine de retry
    queryFn: async ({ signal }) => {
      if (!slug) return null;
      try {
        const raw = await apiFetch<unknown>(`/api/features/${encodeURIComponent(slug)}/done`, { signal });
        return parseStoryDone(raw);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'HTTP_ERROR' && err.status === 404) {
          return null; // Pas généré → placeholder UI
        }
        throw err;
      }
    },
  });
}
