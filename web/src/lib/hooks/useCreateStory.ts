'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';

interface CreateStoryInput {
  name: string;
  type?: 'feature' | 'bug' | 'spike' | 'chore';
}

interface CreateStoryResponse {
  ok: boolean;
  name: string;
  slug: string;
  type: string;
}

/**
 * useCreateStory — mutation POST /api/features.
 * Backend Express (`features.js:289`) crée une story avec slug auto-généré
 * et retourne `{ ok, name (=slug), slug, type }`.
 * Sur succès : invalide la query stories pour refetch sidebar + library.
 */
export function useCreateStory() {
  const queryClient = useQueryClient();
  return useMutation<CreateStoryResponse, Error, CreateStoryInput>({
    mutationFn: async (input) => {
      return apiFetch<CreateStoryResponse>('/api/features', {
        method: 'POST',
        body: { name: input.name, type: input.type ?? 'feature' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories'] });
    },
  });
}
