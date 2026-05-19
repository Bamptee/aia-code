'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, X } from 'lucide-react';
import { SlashPopover, type SlashCommand } from '@/components/primitives/SlashPopover';
import type { StreamStatus } from '@/lib/sse/useChatStream';

interface ChatComposerProps {
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
  status: StreamStatus;
  /** Placeholder step-aware (handoff §7.4). Override le défaut générique. */
  placeholder?: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { command: 'generate', description: 'Generate this step from current context', hint: '⌘G' },
  { command: 'save', description: 'Save the current doc and advance', hint: '⌘S' },
  { command: 'skip', description: 'Mark this step as skipped' },
  { command: 'reset', description: 'Reset this step to pending' },
  { command: 'iterate', description: 'Refine the current step output' },
];

/**
 * Composer pour ChatPane (FR-13).
 *
 * - Textarea multi-lignes, focus auto au mount.
 * - ⌘↵ envoie. Echap ferme slash popover.
 * - Tap `/` au début → SlashPopover.
 * - Pendant streaming → bouton X (cancel) à la place de Send.
 */
export function ChatComposer({ onSubmit, onCancel, status, placeholder }: ChatComposerProps) {
  const [value, setValue] = useState('');
  const [forceCloseSlash, setForceCloseSlash] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isStreaming = status === 'streaming';

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Dérive l'état du SlashPopover depuis `value` au render (pas useEffect).
  // Pattern React 19 : éviter setState-in-effect quand le state est synchroniquement
  // calculable depuis les props/state existants.
  const slashOpen =
    !forceCloseSlash && value.startsWith('/') && !value.includes(' ');
  const slashQuery = slashOpen ? value.slice(1) : '';

  // Reset forceCloseSlash quand value devient vide ou ne commence plus par /.
  // Sans ça, l'utilisateur ne pourrait jamais rouvrir le popover après l'avoir fermé.
  if (forceCloseSlash && !value.startsWith('/')) {
    setForceCloseSlash(false);
  }

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;
    onSubmit(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl + Enter → submit
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !slashOpen) {
      e.preventDefault();
      submit();
    }
  };

  const handleSlashSelect = (cmd: SlashCommand) => {
    // Insert command label avec un espace pour fermer le popover automatiquement
    // (slashOpen est dérivé : `value.includes(' ')` → false).
    setValue(`/${cmd.command} `);
    textareaRef.current?.focus();
  };

  return (
    <div className="relative border-t border-border bg-surface px-3 py-2">
      {slashOpen && (
        <SlashPopover
          commands={SLASH_COMMANDS}
          query={slashQuery}
          onSelect={handleSlashSelect}
          onClose={() => setForceCloseSlash(true)}
        />
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder={isStreaming ? 'Streaming…' : (placeholder ?? 'Type a message or / for commands…')}
          disabled={isStreaming}
          className="flex-1 resize-none rounded border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-text-3 focus:border-border-strong focus:outline-none disabled:opacity-50"
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel streaming"
            className="rounded bg-red-soft p-2 text-red transition-colors hover:bg-red-soft/80"
          >
            <X size={14} />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim()}
            aria-label="Send message"
            className="rounded bg-accent p-2 text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send size={14} />
          </button>
        )}
      </div>
      <p className="mt-1 text-[10px] text-text-3">
        <kbd className="rounded border border-border px-1 font-mono">⌘↵</kbd> to send ·{' '}
        <kbd className="rounded border border-border px-1 font-mono">/</kbd> for commands
      </p>
    </div>
  );
}
