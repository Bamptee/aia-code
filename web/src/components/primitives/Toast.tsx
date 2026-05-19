'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { X, CircleCheck, CircleAlert } from 'lucide-react';

export type ToastVariant = 'success' | 'error';

interface ToastItem {
  id: number;
  variant: ToastVariant;
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Toast portal (handoff §13, Pattern Error Handling).
 * - Bottom-right discret.
 * - success → 2s slide-out doux.
 * - error  → sticky jusqu'à dismiss manuel.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((variant: ToastVariant, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, variant, message }]);
    // Auto-dismiss success after 2s ; error stays until manual dismiss.
    if (variant === 'success') {
      setTimeout(() => dismiss(id), 2000);
    }
  }, [dismiss]);

  const value: ToastContextValue = {
    success: (message) => push('success', message),
    error: (message) => push('error', message),
    dismiss,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastPortal toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastPortal({
  toasts,
  dismiss,
}: {
  toasts: ToastItem[];
  dismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: () => void;
}) {
  const isError = toast.variant === 'error';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={
        'pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border bg-surface px-3 py-2 text-sm shadow-md animate-slide-in-up ' +
        (isError
          ? 'border-red text-text'
          : 'border-green text-text')
      }
    >
      {isError ? (
        <CircleAlert size={16} className="mt-0.5 shrink-0 text-red" />
      ) : (
        <CircleCheck size={16} className="mt-0.5 shrink-0 text-green" />
      )}
      <span className="flex-1 leading-snug">{toast.message}</span>
      {isError && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="-mr-1 -mt-1 rounded p-1 text-text-3 hover:bg-surface-hover hover:text-text"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within <ToastProvider>');
  }
  return ctx;
}

/**
 * Optional helper that auto-dismisses a toast based on an `isOpen` prop
 * (less common than the imperative API above, kept here for completeness).
 */
export function useAutoDismiss(isOpen: boolean, ms: number, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(onClose, ms);
    return () => clearTimeout(t);
  }, [isOpen, ms, onClose]);
}
