'use client';

import { Check, Sparkles, Bot, Slash, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/primitives/Toast';
import type { StepKey, StepState, StepType } from '@/lib/types/step';

interface ChatActionBarProps {
  step: StepKey;
  state?: StepState;
  hasMessages: boolean;
  onPrimary?: () => void;
}

interface PrimaryAction {
  label: string;
  Icon: typeof Sparkles;
}

const STEP_CONFIG: Record<StepKey, { name: string; type: StepType }> = {
  init: { name: 'Init', type: 'generate' },
  brainstorming: { name: 'Brainstorming', type: 'chat-only' },
  'spec-func': { name: 'Spec Func', type: 'generate' },
  'spec-tech': { name: 'Spec Tech', type: 'generate' },
  'dev-plan': { name: 'Dev Plan', type: 'generate' },
  implement: { name: 'Implement', type: 'generate' },
  review: { name: 'Review', type: 'chat-only' },
};

/**
 * Action bar entre stream et composer (handoff §7.4 chat-col).
 *
 * Layout : context kicker `Step: <name> · <status>` puis row avec
 * CTA primaire step-aware + slash + sync icons.
 *
 * Primary action selon (status, type, hasMessages) — logique handoff
 * views-v3.jsx:430-439.
 */
export function ChatActionBar({ step, state, hasMessages, onPrimary }: ChatActionBarProps) {
  const conf = STEP_CONFIG[step];
  const status = state?.status ?? 'pending';
  const toast = useToast();

  const action = pickPrimary(step, state, hasMessages);

  const handlePrimary = () => {
    if (onPrimary) onPrimary();
    else toast.success(`${action.label} — coming soon`);
  };

  return (
    <>
      {/* Context kicker — sibling au-dessus de l'action bar (handoff CSS lignes 1696-1707) */}
      <div
        className="flex items-center gap-1 border-t border-border bg-surface-2 px-4 pt-1 font-mono text-[11px] text-text-3"
      >
        <Sparkles size={11} />
        <span>
          Step: <span className="text-text-2">{conf.name}</span> · {status}
        </span>
      </div>
      <div className="flex items-center gap-1.5 bg-surface-2 px-4 py-2">
        <button
          type="button"
          onClick={handlePrimary}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm bg-accent px-3 py-[7px] text-[13px] font-medium text-accent-ink transition-opacity hover:opacity-90"
        >
          <action.Icon size={13} />
          {action.label}
        </button>
        <button
          type="button"
          onClick={() => toast.success('Slash commands — Cmd+/')}
          aria-label="Slash commands"
          className="inline-flex items-center justify-center rounded-sm border border-border bg-surface px-2.5 py-[7px] text-text-2 transition-colors hover:bg-surface-hover hover:text-text"
          title="Slash commands"
        >
          <Slash size={13} />
        </button>
        <button
          type="button"
          onClick={() => toast.success('Push to ClickUp — coming soon')}
          aria-label="Push to ClickUp"
          className="inline-flex items-center justify-center rounded-sm border border-border bg-surface px-2.5 py-[7px] text-text-2 transition-colors hover:bg-surface-hover hover:text-text"
          title="Push to ClickUp"
        >
          <RefreshCw size={13} />
        </button>
      </div>
    </>
  );
}

function pickPrimary(step: StepKey, state: StepState | undefined, hasMessages: boolean): PrimaryAction {
  const status = state?.status ?? 'pending';
  const conf = STEP_CONFIG[step];

  if (status === 'done') return { label: 'Apply chat feedback', Icon: Sparkles };
  if (conf.type === 'chat-only') {
    return hasMessages
      ? { label: 'Save summary', Icon: Check }
      : { label: 'Start brainstorming', Icon: Bot };
  }
  if (status === 'in-progress') return { label: `Save ${conf.name}`, Icon: Check };
  return { label: `Generate ${conf.name}`, Icon: Sparkles };
}

export function getComposerPlaceholder(step: StepKey): string {
  return STEP_CONFIG[step]?.type === 'chat-only'
    ? 'Share ideas, ask questions, explore…'
    : 'Iterate, ask, or paste research… (/ for commands)';
}
