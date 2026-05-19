'use client';

import { useEffect, useState } from 'react';

export interface SlashCommand {
  command: string;
  description: string;
  /** Optional preview de l'effet de la commande. */
  hint?: string;
}

interface SlashPopoverProps {
  commands: SlashCommand[];
  /** Query après le `/`. Filtre les commands. */
  query: string;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

/**
 * Slash command popover (handoff §13, FR-13).
 * Affiché au-dessus du composer quand l'utilisateur tape `/`.
 * Flèches haut/bas naviguent, ↵ insère la commande sélectionnée, Esc ferme.
 */
export function SlashPopover({ commands, query, onSelect, onClose }: SlashPopoverProps) {
  const filtered = commands.filter((c) =>
    c.command.toLowerCase().startsWith(query.toLowerCase())
  );
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection quand le filter change. setState-in-effect accepté ici car
  // selectedIndex doit suivre les variations du query (sinon l'index peut pointer
  // hors du filtered list).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIndex(0);
  }, [query]);

  // Clavier global pour navigation.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        if (filtered[selectedIndex]) {
          e.preventDefault();
          onSelect(filtered[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filtered, selectedIndex, onSelect, onClose]);

  if (filtered.length === 0) {
    return (
      <div className="absolute bottom-full left-0 mb-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
        <div className="px-3 py-2 text-xs text-text-3">No matching commands</div>
      </div>
    );
  }

  return (
    <div className="absolute bottom-full left-0 mb-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
      <ul role="listbox">
        {filtered.map((cmd, i) => {
          const isSelected = i === selectedIndex;
          return (
            <li
              key={cmd.command}
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelect(cmd)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={
                'flex cursor-pointer items-center gap-2 px-3 py-2 text-xs ' +
                (isSelected ? 'bg-surface-hover text-text' : 'text-text-2')
              }
            >
              <span className="font-mono text-text">/{cmd.command}</span>
              <span className="flex-1 text-text-3">{cmd.description}</span>
              {cmd.hint && (
                <span className="font-mono text-[10px] text-text-3">{cmd.hint}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
