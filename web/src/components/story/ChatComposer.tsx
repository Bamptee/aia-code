'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, X, Paperclip, Slash } from 'lucide-react';
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

  const chip =
    'inline-flex items-center justify-center rounded-full border border-border bg-surface px-2 py-1 text-xs text-text-2 transition-colors hover:bg-surface-hover hover:text-text';

  return (
    <div className="relative bg-surface-2 px-4 pt-2 pb-[14px]">
      {slashOpen && (
        <SlashPopover
          commands={SLASH_COMMANDS}
          query={slashQuery}
          onSelect={handleSlashSelect}
          onClose={() => setForceCloseSlash(true)}
        />
      )}
      {/* Inner composer card — bg-surface + border + radius (handoff §7.4 .composer) */}
      <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-sm">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={isStreaming ? 'Streaming…' : (placeholder ?? 'Type a message or / for commands…')}
          disabled={isStreaming}
          className="w-full resize-none border-none bg-transparent text-[13px] leading-[1.5] text-text outline-none placeholder:text-text-3 disabled:opacity-50"
          style={{ minHeight: 22 }}
        />
        <div className="flex items-center gap-1.5 pt-1.5">
          <button
            type="button"
            aria-label="Attach"
            className={chip}
            onClick={() => { /* stub : pas câblé v1 */ }}
          >
            <Paperclip size={13} />
          </button>
          <button
            type="button"
            aria-label="Slash commands"
            className={chip}
            onClick={() => setValue((v) => (v.startsWith('/') ? v : '/'))}
          >
            <Slash size={13} />
          </button>
          <span className="ml-auto font-mono text-[11px] text-text-3">↵</span>
          {isStreaming ? (
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancel streaming"
              className="grid h-[30px] w-[30px] place-items-center rounded-sm bg-red-soft text-red transition-colors hover:bg-red-soft/80"
            >
              <X size={13} />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!value.trim()}
              aria-label="Send message"
              className="grid h-[30px] w-[30px] place-items-center rounded-sm bg-accent text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
