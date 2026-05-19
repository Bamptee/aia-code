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

/**
 * Codes sémantiques pour ApiError. `status` (HTTP code numérique) est séparé pour
 * permettre des switch consumer-side propres : `err.code === 'NOT_FOUND'` plutôt
 * que de comparer à `'404'`.
 */
export type ApiErrorCode = 'NETWORK' | 'PARSE' | 'INVALID_PATH' | 'HTTP_ERROR';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;

  constructor(message: string, opts: { code: ApiErrorCode; status?: number; cause?: unknown }) {
    super(message);
    this.name = 'ApiError';
    this.code = opts.code;
    this.status = opts.status;
    if (opts.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = opts.cause;
    }
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

/**
 * Wrapper fetch unique. Sérialise body en JSON, ajoute Content-Type, normalise erreurs.
 *
 * Sécurité : `path` doit être relatif (commence par `/`). Évite les open redirects
 * si jamais un callsite passait une URL absolue contrôlée par user.
 *
 * Cancel : si options.signal est fourni (typiquement par React Query queryFn),
 * il est forward à fetch, ce qui annule la requête sur unmount/navigation.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new ApiError('apiFetch: path must start with "/"', { code: 'INVALID_PATH' });
  }

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
    throw new ApiError(message, { code: 'HTTP_ERROR', status: response.status });
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
