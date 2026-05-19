'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useCreateStory } from '@/lib/hooks/useCreateStory';
import { useToast } from '@/components/primitives/Toast';

/**
 * Home composer (FR-5).
 * Multi-line textarea, submit via bouton ou ⌘↵.
 * POST /api/features → navigate vers /stories/[slug].
 * Empty → bouton disabled. Erreur → toast sticky, prompt préservé pour retry.
 */
export function Composer() {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const toast = useToast();
  const create = useCreateStory();

  // Auto-focus on mount.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const canSubmit = value.trim().length > 0 && !create.isPending;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      const result = await create.mutateAsync({ name: value.trim() });
      router.push(`/stories/${result.slug}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create story');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // ⌘↵ (Mac) / Ctrl+↵ (others) → submit
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-text-3">
        <Sparkles size={12} />
        <span>Start a new story — describe what you want to build</span>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={4}
        placeholder="Magic link authentication for the mobile onboarding flow…"
        className="w-full resize-none bg-transparent px-4 py-3 text-sm leading-relaxed text-text placeholder:text-text-3 focus:outline-none"
      />
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <span className="text-[11px] text-text-3">
          <kbd className="rounded border border-border px-1 py-0.5 font-mono text-[10px]">⌘↵</kbd>
          {' '}to create
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span>{create.isPending ? 'Creating…' : 'Create story'}</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
