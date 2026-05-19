'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  confirmTone?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal de confirmation (utilisé par Disconnect Bitbucket/ClickUp, AC §7.1/7.3).
 * Portal vers `document.body`, esc-to-cancel, focus le cancel button par défaut.
 */
export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  confirmTone = 'default',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    cancelRef.current?.focus();
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const confirmClass =
    confirmTone === 'danger'
      ? 'bg-red text-white hover:opacity-90'
      : 'bg-accent text-accent-ink hover:opacity-90';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-base font-semibold text-text">
          {title}
        </h2>
        {body && <p className="mt-2 text-sm text-text-2">{body}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded border border-border bg-surface px-3 py-1.5 text-xs text-text-2 transition-colors hover:bg-surface-hover hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={'rounded px-3 py-1.5 text-xs font-medium transition-opacity ' + confirmClass}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
