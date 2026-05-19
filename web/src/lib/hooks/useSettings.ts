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

export function useUpdateBitbucketSettings() {
  const qc = useQueryClient();
  return useMutation<BitbucketSettings, Error, PatchArgs<BitbucketSettings>>({
    mutationFn: async ({ patch }) => {
      const raw = await apiFetch<unknown>('/api/settings/integrations/bitbucket', {
        method: 'PATCH',
        body: patch,
      });
      return parseBitbucketSettings(raw);
    },
    onSuccess: (next) => {
      qc.setQueryData(['settings', 'bitbucket'], next);
    },
  });
}

export function useUpdateClickUpSettings() {
  const qc = useQueryClient();
  return useMutation<ClickUpSettings, Error, PatchArgs<ClickUpSettings>>({
    mutationFn: async ({ patch }) => {
      const raw = await apiFetch<unknown>('/api/settings/integrations/clickup', {
        method: 'PATCH',
        body: patch,
      });
      return parseClickUpSettings(raw);
    },
    onSuccess: (next) => {
      qc.setQueryData(['settings', 'clickup'], next);
    },
  });
}

export function useUpdateModelsConfig() {
  const qc = useQueryClient();
  return useMutation<ModelsConfig, Error, PatchArgs<ModelsConfig>>({
    mutationFn: async ({ patch }) => {
      const raw = await apiFetch<unknown>('/api/settings/models', {
        method: 'PATCH',
        body: patch,
      });
      return parseModelsConfig(raw);
    },
    onSuccess: (next) => {
      qc.setQueryData(['settings', 'models'], next);
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
