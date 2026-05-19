'use client';

import { useQuery } from '@tanstack/react-query';

/**
 * usePipelinePolling — refetch toutes les 10s tant que le pipeline est `in-progress`.
 *
 * Architecture NFR-3 : "polling 10s sur `pipeline.status='in-progress'`".
 *
 * API gap : l'endpoint `/api/features/:name/bitbucket/pipeline` n'existe pas
 * encore côté Express. Le hook est ready mais inactif tant que `enabled` reste
 * à false (la story 3.4 ne l'enable que si `story.bitbucket.branch !== null`,
 * ce qui n'arrive pas avec l'adapter v1).
 */
export function usePipelinePolling(slug: string | null, enabled: boolean) {
  return useQuery<unknown>({
    queryKey: ['pipeline', slug],
    enabled: !!slug && enabled,
    refetchInterval: (query) => {
      // Polling 10s tant que status est in-progress. S'arrête quand done.
      const data = query.state.data as { status?: string } | undefined;
      return data?.status === 'in-progress' ? 10_000 : false;
    },
    queryFn: async () => {
      // Stub : endpoint à câbler. Pour l'instant retourne pending.
      // Quand Express exposera la route, remplacer par:
      //   const raw = await apiFetch(`/api/features/${slug}/bitbucket/pipeline`, { signal });
      //   return parsePipeline(raw);
      return { status: 'pending', checks: [] };
    },
  });
}
