'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Check, AlertCircle } from 'lucide-react';

interface TestBadgeProps {
  result: { ok: boolean; message: string } | undefined;
  pending: boolean;
}

/**
 * TestBadge — affiche le résultat d'un test de connexion 5s puis disparaît
 * (AC §7.1/7.3 spinner + pastille verte/rouge 5s).
 *
 * Utilise un `key={iteration}` côté parent pour remount à chaque nouveau test —
 * évite setState dans useEffect quand result change.
 */
export function TestBadge({ result, pending }: TestBadgeProps) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!result) return;
    const id = setTimeout(() => setHidden(true), 5000);
    return () => clearTimeout(id);
  }, [result]);

  if (pending) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-text-3">
        <RefreshCw size={11} className="animate-spin" />
        Testing…
      </span>
    );
  }
  if (!result || hidden) return null;

  return result.ok ? (
    <span className="inline-flex items-center gap-1 text-[11px] text-green">
      <Check size={11} />
      Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] text-red">
      <AlertCircle size={11} />
      Failed — {result.message}
    </span>
  );
}
