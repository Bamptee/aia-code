'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api/client';
import {
  defaultModelsConfig,
  parseBitbucketSettings,
  parseClickUpSettings,
  parseModelsConfig,
} from '@/lib/api/adapters/settings';
import type {
  BitbucketSettings,
  ClickUpSettings,
  ModelsConfig,
} from '@/lib/types/settings';

function gracefulQuery<T>(path: string, parse: (raw: unknown) => T, fallback: T) {
  return async ({ signal }: { signal: AbortSignal }) => {
    try {
      const raw = await apiFetch<unknown>(path, { signal });
      return parse(raw);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'HTTP_ERROR' && err.status === 404) {
        return fallback;
      }
      throw err;
    }
  };
}

export function useBitbucketSettings() {
  return useQuery<BitbucketSettings>({
    queryKey: ['settings', 'bitbucket'],
    queryFn: gracefulQuery(
      '/api/settings/integrations/bitbucket',
      parseBitbucketSettings,
      parseBitbucketSettings(null),
    ),
  });
}

export function useClickUpSettings() {
  return useQuery<ClickUpSettings>({
    queryKey: ['settings', 'clickup'],
    queryFn: gracefulQuery(
      '/api/settings/integrations/clickup',
      parseClickUpSettings,
      parseClickUpSettings(null),
    ),
  });
}

export function useModelsConfig() {
  return useQuery<ModelsConfig>({
    queryKey: ['settings', 'models'],
    queryFn: gracefulQuery('/api/settings/models', parseModelsConfig, defaultModelsConfig()),
  });
}

interface PatchArgs<T> {
  patch: Partial<T>;
}

/**
 * PATCH peut renvoyer 204/null si le backend ne re-fetch pas l'état. Dans ce cas,
 * on invalide pour forcer un GET frais plutôt que d'overwrite le cache avec les
 * defaults du parser (review Epic 7 P2 / D1).
 */
function isEmptyResponse(raw: unknown): boolean {
  return raw === undefined || raw === null;
}

export function useUpdateBitbucketSettings() {
  const qc = useQueryClient();
  return useMutation<BitbucketSettings | null, Error, PatchArgs<BitbucketSettings>>({
    mutationFn: async ({ patch }) => {
      const raw = await apiFetch<unknown>('/api/settings/integrations/bitbucket', {
        method: 'PATCH',
        body: patch,
      });
      return isEmptyResponse(raw) ? null : parseBitbucketSettings(raw);
    },
    onSuccess: (next) => {
      if (next) qc.setQueryData(['settings', 'bitbucket'], next);
      else qc.invalidateQueries({ queryKey: ['settings', 'bitbucket'] });
    },
  });
}

export function useUpdateClickUpSettings() {
  const qc = useQueryClient();
  return useMutation<ClickUpSettings | null, Error, PatchArgs<ClickUpSettings>>({
    mutationFn: async ({ patch }) => {
      const raw = await apiFetch<unknown>('/api/settings/integrations/clickup', {
        method: 'PATCH',
        body: patch,
      });
      return isEmptyResponse(raw) ? null : parseClickUpSettings(raw);
    },
    onSuccess: (next) => {
      if (next) qc.setQueryData(['settings', 'clickup'], next);
      else qc.invalidateQueries({ queryKey: ['settings', 'clickup'] });
    },
  });
}

export function useUpdateModelsConfig() {
  const qc = useQueryClient();
  return useMutation<ModelsConfig | null, Error, PatchArgs<ModelsConfig>>({
    mutationFn: async ({ patch }) => {
      const raw = await apiFetch<unknown>('/api/settings/models', {
        method: 'PATCH',
        body: patch,
      });
      return isEmptyResponse(raw) ? null : parseModelsConfig(raw);
    },
    onSuccess: (next) => {
      if (next) qc.setQueryData(['settings', 'models'], next);
      else qc.invalidateQueries({ queryKey: ['settings', 'models'] });
    },
  });
}

interface TestConnectionResult {
  ok: boolean;
  message: string;
}

export function useTestConnection(integration: 'bitbucket' | 'clickup') {
  return useMutation<TestConnectionResult, Error>({
    mutationFn: async () => {
      try {
        const raw = await apiFetch<unknown>(`/api/settings/integrations/${integration}/test`, {
          method: 'POST',
        });
        if (raw && typeof raw === 'object') {
          const r = raw as Record<string, unknown>;
          return {
            ok: r.ok === true,
            message: typeof r.message === 'string' ? r.message : 'Connection OK',
          };
        }
        return { ok: true, message: 'Connection OK' };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed';
        return { ok: false, message: msg };
      }
    },
  });
}

export function useDisconnect(integration: 'bitbucket' | 'clickup') {
  const qc = useQueryClient();
  return useMutation<void, Error>({
    mutationFn: async () => {
      await apiFetch<unknown>(`/api/settings/integrations/${integration}/disconnect`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', integration] });
    },
  });
}
