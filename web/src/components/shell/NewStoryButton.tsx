'use client';

import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useShortcut } from '@/lib/hooks/useShortcut';

/**
 * New story button (FR-4).
 * - Clic → navigate vers / (Home) où le composer vit (Story 2.4)
 * - ⌘N (Mac) / Ctrl+N (autres) → même comportement
 * - Pas trigger si focus dans input (géré par useShortcut)
 */
export function NewStoryButton() {
  const router = useRouter();
  const goHome = () => router.push('/');

  useShortcut({
    key: 'n',
    meta: true,
    onTrigger: (event) => {
      event.preventDefault();
      goHome();
    },
  });

  return (
    <button
      type="button"
      onClick={goHome}
      className="flex w-full items-center justify-between rounded bg-surface px-3 py-2 text-sm text-text shadow-sm transition-colors hover:bg-surface-hover"
    >
      <span className="flex items-center gap-2">
        <Plus size={14} />
        <span>New story</span>
      </span>
      <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-text-3">
        ⌘N
      </kbd>
    </button>
  );
}
