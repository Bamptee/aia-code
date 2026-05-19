'use client';

import { useEffect, useRef } from 'react';

interface ShortcutOptions {
  /** Lowercase key, e.g. 'n', 'enter', '/'. */
  key: string;
  /** True if Cmd (Mac) or Ctrl (others) must be held. Auto-detects platform. */
  meta?: boolean;
  /** True if Shift must be held. */
  shift?: boolean;
  /** Callback fired on match. Receives the event so callers can preventDefault. */
  onTrigger: (event: KeyboardEvent) => void;
  /** Set to false to temporarily disable the shortcut. */
  enabled?: boolean;
}

/**
 * Generic keyboard shortcut hook with platform-aware meta key handling and
 * input-focus guard (won't fire if user is typing in an input/textarea/contenteditable/select).
 *
 * Auto-detects Mac vs other for meta key (Cmd on Mac, Ctrl elsewhere).
 *
 * Le callback `onTrigger` est stocké dans un ref pour éviter de re-attacher
 * le listener à chaque render (les callbacks inline créent une nouvelle référence
 * à chaque parent render, ce qui causerait du thrashing add/remove listener).
 *
 * Usage:
 *   useShortcut({ key: 'n', meta: true, onTrigger: () => router.push('/') });
 */
export function useShortcut({ key, meta = false, shift = false, onTrigger, enabled = true }: ShortcutOptions) {
  // Stocke le callback dans un ref pour stabilité — le listener attaché ne change pas
  // quand le parent re-render, même si la fonction onTrigger est inline.
  const onTriggerRef = useRef(onTrigger);
  useEffect(() => {
    onTriggerRef.current = onTrigger;
  });

  useEffect(() => {
    if (!enabled) return;
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

    function handler(event: KeyboardEvent) {
      // Input-focus guard
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName?.toLowerCase();
        if (
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          target.isContentEditable
        ) {
          return;
        }
      }

      // Modifier checks
      const wantedMeta = meta ? (isMac ? event.metaKey : event.ctrlKey) : !event.metaKey && !event.ctrlKey;
      const wantedShift = shift ? event.shiftKey : !event.shiftKey;
      const wantedKey = event.key.toLowerCase() === key.toLowerCase();

      if (wantedKey && wantedMeta && wantedShift) {
        onTriggerRef.current(event);
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, meta, shift, enabled]);
}
