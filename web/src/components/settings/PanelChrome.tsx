import type { ReactNode } from 'react';
import type { ConnectionState } from '@/lib/types/settings';

interface PanelChromeProps {
  logo: ReactNode;
  title: string;
  subtitle?: ReactNode;
  state?: ConnectionState;
  rightSlot?: ReactNode;
  dim?: boolean;
  children: ReactNode;
}

const STATE_LABEL: Record<ConnectionState, { text: string; cls: string }> = {
  connected: { text: 'Connected', cls: 'bg-green-soft text-green' },
  disconnected: { text: 'Disconnected', cls: 'bg-red-soft text-red' },
  unknown: { text: 'Not configured', cls: 'bg-surface-2 text-text-3' },
};

/**
 * PanelChrome — shell des 4 panels Settings (handoff §12).
 * Carte surface, header logo+title+sub+badge state.
 */
export function PanelChrome({
  logo,
  title,
  subtitle,
  state,
  rightSlot,
  dim = false,
  children,
}: PanelChromeProps) {
  return (
    <section
      className={
        'rounded-lg border border-border bg-surface p-5 ' + (dim ? 'opacity-70' : '')
      }
    >
      <header className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-surface-2">
          {logo}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text">{title}</div>
          {subtitle && <div className="text-xs text-text-3">{subtitle}</div>}
        </div>
        {rightSlot ? (
          <div className="ml-auto flex items-center gap-2">{rightSlot}</div>
        ) : state ? (
          <span
            className={
              'ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ' + STATE_LABEL[state].cls
            }
          >
            {STATE_LABEL[state].text}
          </span>
        ) : null}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-text-3">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-text-3">{hint}</span>}
    </label>
  );
}

export function PanelActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">{children}</div>;
}
