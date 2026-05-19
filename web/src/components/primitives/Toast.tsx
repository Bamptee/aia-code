'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { X, CircleCheck, CircleAlert } from 'lucide-react';

export type ToastVariant = 'success' | 'error';

interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  closing?: boolean; // true pendant la fade-out de 150ms avant unmount
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Génère un id unique pour chaque toast. `crypto.randomUUID()` est disponible
 * dans tous les browsers modernes ciblés (Chrome/Safari/Firefox récents).
 * Fallback en cas d'environnement bizarre : combo timestamp+random+counter.
 */
let toastCounter = 0;
function generateToastId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  toastCounter++;
  return `toast-${Date.now()}-${toastCounter}`;
}

/**
 * Toast portal (handoff §13, Pattern Error Handling).
 * - Bottom-right discret.
 * - success → 2s slide-out doux (fade-out 150ms avant unmount).
 * - error  → sticky jusqu'à dismiss manuel (idem fade-out 150ms).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // Track tous les setTimeouts en cours pour cleanup à l'unmount du Provider.
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timeoutsRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const dismiss = useCallback((id: string) => {
    // Marque le toast comme `closing` pour déclencher l'animation fade-out CSS,
    // puis remove pour de bon après 150ms.
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, closing: true } : t)));
    const t = setTimeout(() => removeToast(id), 150);
    // Si un timeout d'auto-dismiss existait déjà pour cet id, l'écrase (clean dans removeToast).
    const prev = timeoutsRef.current.get(id);
    if (prev) clearTimeout(prev);
    timeoutsRef.current.set(id, t);
  }, [removeToast]);

  const push = useCallback((variant: ToastVariant, message: string) => {
    const id = generateToastId();
    setToasts((prev) => [...prev, { id, variant, message }]);
    // Auto-dismiss success after 2s ; error stays until manual dismiss.
    if (variant === 'success') {
      const t = setTimeout(() => dismiss(id), 2000);
      timeoutsRef.current.set(id, t);
    }
  }, [dismiss]);

  // Cleanup tous les timeouts en cours quand le Provider unmount.
  useEffect(() => {
    // Copie la ref dans une variable locale capturée par la closure du cleanup.
    // Pattern recommandé par react-hooks/exhaustive-deps : la ref peut être réassignée
    // entre le mount et l'unmount, donc on capture la Map au mount.
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach((t) => clearTimeout(t));
      timeouts.clear();
    };
  }, []);

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
  dismiss: (id: string) => void;
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
        'pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border bg-surface px-3 py-2 text-sm shadow-md transition-opacity duration-150 ' +
        (toast.closing ? 'opacity-0' : 'animate-slide-in-up opacity-100') + ' ' +
        (isError ? 'border-red text-text' : 'border-green text-text')
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
