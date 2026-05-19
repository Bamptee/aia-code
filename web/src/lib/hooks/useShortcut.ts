'use client';

import { useEffect } from 'react';

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
 * input-focus guard (won't fire if user is typing in an input/textarea/contenteditable).
 *
 * Auto-detects Mac vs other for meta key (Cmd on Mac, Ctrl elsewhere).
 *
 * Usage:
 *   useShortcut({ key: 'n', meta: true, onTrigger: () => router.push('/') });
 */
export function useShortcut({ key, meta = false, shift = false, onTrigger, enabled = true }: ShortcutOptions) {
  useEffect(() => {
    if (!enabled) return;
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

    function handler(event: KeyboardEvent) {
      // Input-focus guard
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return;
      }

      // Modifier checks
      const wantedMeta = meta ? (isMac ? event.metaKey : event.ctrlKey) : !event.metaKey && !event.ctrlKey;
      const wantedShift = shift ? event.shiftKey : !event.shiftKey;
      const wantedKey = event.key.toLowerCase() === key.toLowerCase();

      if (wantedKey && wantedMeta && wantedShift) {
        onTrigger(event);
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, meta, shift, onTrigger, enabled]);
}
