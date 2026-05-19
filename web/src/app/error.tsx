'use client';

import { useEffect } from 'react';
import { RotateCw } from 'lucide-react';

/**
 * Root error boundary (NFR-10).
 * Filet de sécurité ultime — capture toute uncaught error qui aurait traversé
 * les error.tsx par-route. Affiche un fallback minimal avec retry.
 *
 * En dev (process.env.NODE_ENV === 'development'), affiche aussi le message
 * d'erreur brut pour debug. En prod, message générique.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console pour visibility en dev. En prod, brancher Sentry/etc. plus tard.
    console.error('[GlobalError]', error);
  }, [error]);

  const isDev = process.env.NODE_ENV === 'development';

  return (
    <div className="flex h-screen items-center justify-center bg-bg p-8">
      <div className="max-w-md rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-text">Something went wrong</h1>
        <p className="mt-2 text-sm text-text-2">
          Une erreur inattendue est survenue. Tu peux essayer de recharger la vue.
          Si ça persiste, vérifie la console du navigateur.
        </p>
        {isDev && (
          <pre className="mt-4 max-h-48 overflow-auto rounded border border-border bg-surface-2 p-3 font-mono text-[11px] leading-snug text-text-2">
            {error.message}
            {error.digest ? `\n\nDigest: ${error.digest}` : ''}
          </pre>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-4 inline-flex items-center gap-1.5 rounded border border-border bg-surface px-3 py-1.5 text-sm text-text transition-colors hover:bg-surface-hover"
        >
          <RotateCw size={12} />
          <span>Try again</span>
        </button>
      </div>
    </div>
  );
}
