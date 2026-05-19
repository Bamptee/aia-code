'use client';

import { ChevronRight, RotateCw, Check } from 'lucide-react';

interface CancelActionBarProps {
  onContinue: () => void;
  onRegenerate: () => void;
  onKeep: () => void;
}

/**
 * Cancel streaming → bifurcation bar (Sally finding, architecture pattern).
 *
 * Au lieu d'un froid "partial" badge, l'utilisateur a 3 options après cancel :
 * - Continuer depuis ici (resume le stream là où il s'est arrêté)
 * - Régénérer (recommence le stream from scratch)
 * - Garder tel quel (accepte le contenu partiel comme final)
 *
 * Transforme un cancel en outil de contrôle créatif, pas un bouton d'urgence.
 */
export function CancelActionBar({ onContinue, onRegenerate, onKeep }: CancelActionBarProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-surface-2 px-3 py-2 text-xs">
      <span className="text-text-3">Stream cancelled.</span>
      <button
        type="button"
        onClick={onContinue}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-text-2 transition-colors hover:bg-surface-hover hover:text-text"
      >
        <ChevronRight size={10} />
        <span>Continuer depuis ici</span>
      </button>
      <button
        type="button"
        onClick={onRegenerate}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-text-2 transition-colors hover:bg-surface-hover hover:text-text"
      >
        <RotateCw size={10} />
        <span>Régénérer</span>
      </button>
      <button
        type="button"
        onClick={onKeep}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-text-2 transition-colors hover:bg-surface-hover hover:text-text"
      >
        <Check size={10} />
        <span>Garder tel quel</span>
      </button>
    </div>
  );
}
