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

  // Shadow box-shadow handoff (custom, plus subtil que shadow-lg Tailwind).
  const shadowStyle: React.CSSProperties = {
    boxShadow: '0 8px 24px -4px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.04)',
  };

  if (filtered.length === 0) {
    return (
      <div
        className="absolute bottom-full left-0 mb-1.5 min-w-[260px] overflow-hidden rounded border border-border bg-surface p-1"
        style={shadowStyle}
      >
        <div className="px-2.5 py-1.5 text-[12.5px] text-text-3">No matching commands</div>
      </div>
    );
  }

  return (
    <div
      className="absolute bottom-full left-0 mb-1.5 max-h-60 min-w-[260px] overflow-y-auto rounded border border-border bg-surface p-1"
      style={shadowStyle}
    >
      <ul role="listbox" className="flex flex-col gap-0.5">
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
                'grid cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[12.5px] ' +
                (isSelected ? 'bg-surface-hover text-text' : 'text-text-2')
              }
              style={{ gridTemplateColumns: '18px 1fr auto' }}
            >
              <span className="font-mono text-[11px] text-text-3">/</span>
              <span className="flex flex-col">
                <span className="font-mono text-text">{cmd.command}</span>
                <span className="text-[11px] text-text-3">{cmd.description}</span>
              </span>
              {cmd.hint && (
                <span className="font-mono text-[10.5px] text-text-3">{cmd.hint}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
