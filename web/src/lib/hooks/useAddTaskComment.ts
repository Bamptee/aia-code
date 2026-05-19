'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { TaskComment, TaskDetail } from '@/lib/types/task';

interface AddCommentArgs {
  taskId: string;
  body: string;
  author: { initials: string; name: string };
  /**
   * Si fourni, on retente une mutation in-place sur ce comment failed existant
   * (mute en pending, clear failed) au lieu de créer un nouveau comment optimistic.
   * Évite la duplication silencieuse sur retry (cf. review Epic 5 D2/P2).
   */
  retryCommentId?: string;
}

/**
 * useAddTaskComment — mutation optimistic pour ajouter un commentaire (FR-17).
 *
 * Pattern (architecture §Optimistic Update) :
 * - L'élément optimiste apparaît immédiatement (`pending=true`, opacity 0.6 + spinner)
 * - Confirmation : remplace par le commentaire serveur (transition 200ms côté UI)
 * - Échec : marque `failed=true` (bordure rouge + Retry inline). Jamais de disparition silencieuse.
 */
export function useAddTaskComment() {
  const qc = useQueryClient();

  return useMutation<TaskComment, Error, AddCommentArgs, { previous: TaskDetail | null; tempId: string }>({
    mutationFn: async ({ taskId, body }) => {
      const raw = await apiFetch<unknown>(`/api/tasks/${encodeURIComponent(taskId)}/comments`, {
        method: 'POST',
        body: { body },
      });
      if (!raw || typeof raw !== 'object') throw new Error('Invalid comment response');
      const r = raw as Record<string, unknown>;
      return {
        id: typeof r.id === 'string' ? r.id : `srv-${Date.now()}`,
        body: typeof r.body === 'string' ? r.body : body,
        authorInitials: typeof r.initials === 'string' ? r.initials : '??',
        authorName: typeof r.name === 'string' ? r.name : 'Unknown',
        createdAt: typeof r.time === 'string' ? r.time : new Date().toISOString(),
      };
    },
    onMutate: async ({ taskId, body, author, retryCommentId }) => {
      await qc.cancelQueries({ queryKey: ['task-detail', taskId] });
      const previous = qc.getQueryData<TaskDetail | null>(['task-detail', taskId]) ?? null;
      const tempId = retryCommentId ?? `pending-${Date.now()}`;
      if (previous) {
        const exists = retryCommentId && previous.comments.some((c) => c.id === retryCommentId);
        if (exists) {
          // Retry in-place : mute en pending, clear failed, garde le même id.
          qc.setQueryData<TaskDetail>(['task-detail', taskId], {
            ...previous,
            comments: previous.comments.map((c) =>
              c.id === retryCommentId ? { ...c, pending: true, failed: false } : c,
            ),
          });
        } else {
          const optimistic: TaskComment = {
            id: tempId,
            body,
            authorInitials: author.initials,
            authorName: author.name,
            createdAt: new Date().toISOString(),
            pending: true,
          };
          qc.setQueryData<TaskDetail>(['task-detail', taskId], {
            ...previous,
            comments: [...previous.comments, optimistic],
          });
        }
      }
      return { previous, tempId };
    },
    onSuccess: (serverComment, { taskId }, ctx) => {
      const current = qc.getQueryData<TaskDetail | null>(['task-detail', taskId]);
      if (!current || !ctx) return;
      qc.setQueryData<TaskDetail>(['task-detail', taskId], {
        ...current,
        comments: current.comments.map((c) =>
          c.id === ctx.tempId ? { ...serverComment, pending: false } : c,
        ),
      });
    },
    onError: (_err, { taskId }, ctx) => {
      if (!ctx) return;
      const current = qc.getQueryData<TaskDetail | null>(['task-detail', taskId]);
      if (!current) return;
      qc.setQueryData<TaskDetail>(['task-detail', taskId], {
        ...current,
        comments: current.comments.map((c) =>
          c.id === ctx.tempId ? { ...c, pending: false, failed: true } : c,
        ),
      });
    },
  });
}
