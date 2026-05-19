'use client';

import { useState, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';

interface CommentComposerProps {
  onSubmit: (body: string) => void;
  disabled?: boolean;
}

/**
 * CommentComposer — textarea pour ajouter un commentaire (FR-17).
 * Submit : bouton ou ⌘↵ / Ctrl↵. Auto-clear sur submit, ne block pas le hook
 * d'optimistic update qui gère lui-même les états pending/failed.
 */
export function CommentComposer({ onSubmit, disabled }: CommentComposerProps) {
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex items-end gap-2 rounded border border-border bg-surface p-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Comment, or @ to mention…"
        rows={2}
        disabled={disabled}
        className="flex-1 resize-none bg-transparent text-[12.5px] leading-relaxed text-text outline-none placeholder:text-text-3"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!text.trim() || disabled}
        aria-label="Post comment"
        className="rounded bg-accent p-1.5 text-accent-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Send size={12} />
      </button>
    </div>
  );
}
