/**
 * API client + React Query setup.
 *
 * Tout fetch vers l'API Express (rewrited de Next.js :3000 → :3001) passe par ici.
 * Architecture D6 : adapter layer obligatoire, aucun composant ne fait fetch direct.
 *
 * QueryClient configuré selon §11 Cross-Cutting NFRs :
 * - staleTime 30s (cache court)
 * - refetchOnWindowFocus true (refresh quand user revient)
 * - retry 1 (1 retry sur erreur, pas plus, évite spam)
 */

import { QueryClient } from '@tanstack/react-query';

export class ApiError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(message: string, opts: { code: string; status?: number; cause?: unknown }) {
    super(message);
    this.name = 'ApiError';
    this.code = opts.code;
    this.status = opts.status;
    if (opts.cause !== undefined) {
      // Standard cause is supported in Node 18+/modern browsers via Error options,
      // but TypeScript's ErrorOptions type isn't always picked up; assign explicitly.
      (this as Error & { cause?: unknown }).cause = opts.cause;
    }
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

/**
 * Wrapper fetch unique. Sérialise body en JSON, ajoute Content-Type, normalise erreurs en ApiError.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { body, headers, ...rest } = options;
  const init: RequestInit = {
    ...rest,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (err) {
    throw new ApiError('Network request failed', { code: 'NETWORK', cause: err });
  }

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = undefined;
    }
    const message =
      (typeof errorBody === 'object' && errorBody && 'error' in errorBody && typeof errorBody.error === 'string')
        ? errorBody.error
        : `HTTP ${response.status}`;
    throw new ApiError(message, { code: String(response.status), status: response.status });
  }

  // Empty body responses (204 etc.)
  if (response.status === 204) return undefined as unknown as T;

  try {
    return (await response.json()) as T;
  } catch (err) {
    throw new ApiError('Invalid JSON response', { code: 'PARSE', cause: err });
  }
}

/**
 * Singleton QueryClient pour l'app. Importé dans web/src/lib/api/Providers.tsx.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
