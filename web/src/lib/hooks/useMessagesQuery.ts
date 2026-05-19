'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api/client';
import { parseMessageList } from '@/lib/api/adapters/messages';
import type { Message } from '@/lib/types/messages';
import type { StepKey } from '@/lib/types/step';

/**
 * useMessagesQuery — fetch chat messages d'une story+step.
 *
 * API gap : endpoint `/api/features/:name/messages?step=...` n'existe pas encore.
 * Le hook tolère 404 (retourne []) pour permettre à ChatPane de render à vide.
 */
export function useMessagesQuery(slug: string | null, step: StepKey | null) {
  return useQuery<Message[]>({
    queryKey: ['messages', slug, step],
    enabled: !!slug && !!step,
    retry: false,
    queryFn: async ({ signal }) => {
      if (!slug || !step) return [];
      try {
        const raw = await apiFetch<unknown>(
          `/api/features/${encodeURIComponent(slug)}/messages?step=${encodeURIComponent(step)}`,
          { signal }
        );
        return parseMessageList(raw);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'HTTP_ERROR' && err.status === 404) {
          return [];
        }
        throw err;
      }
    },
  });
}
