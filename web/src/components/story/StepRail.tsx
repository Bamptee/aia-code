'use client';

import { useSearchParams } from 'next/navigation';
import { setSearchParam } from '@/lib/url/setParam';
import { PRODUCT_STEPS, DEV_STEPS } from '@/lib/types/step';
import type { StepKey, StepState, Phase } from '@/lib/types/step';
import type { Story } from '@/lib/types/story';

interface StepRailProps {
  story: Story;
}

const STEP_LABEL: Record<StepKey, string> = {
  init: 'Init',
  brainstorming: 'Brainstorming',
  'spec-func': 'Spec Func',
  'spec-tech': 'Spec Tech',
  'dev-plan': 'Dev Plan',
  implement: 'Implement',
  review: 'Review',
};

/**
 * Step Rail (FR-9, handoff §7.3 + CSS .phase-cluster / .step-pill).
 *
 * Layout : 2 phase-clusters rounded-999px (border 1px, bg-bg), chaque cluster
 * contient son label PRODUCT/DEV (mono uppercase 10.5px coloré phase) + ses
 * step-pills inside. Phase-sep `→` text-3 entre les deux clusters.
 *
 * Dev cluster collapse si `phase === 'product'` (handoff §7.3).
 *
 * State pills :
 * - default : transparent, text-2
 * - hover : bg-surface-hover, text
 * - active : bg-accent text-accent-ink font-medium
 * - done : color green + step-dot bg green
 * - in-progress : step-dot bg blue (animate pulse)
 * - skipped : text-3 + step-dot dashed
 */
export function StepRail({ story }: StepRailProps) {
  const searchParams = useSearchParams();
  const activeStep = (searchParams?.get('step') as StepKey | null) || story.currentStep;
  const showDev = story.phase !== 'product';

  return (
    <nav
      aria-label="Story pipeline steps"
      className="flex items-center gap-1 overflow-x-auto border-b border-border bg-surface px-6 py-2.5"
      style={{ scrollbarWidth: 'none' }}
    >
      <PhaseCluster
        label="PRODUCT"
        phase="product"
        steps={PRODUCT_STEPS}
        story={story}
        activeStep={activeStep}
      />
      {showDev && (
        <>
          <span className="mx-1 shrink-0 text-[11px] text-text-3">→</span>
          <PhaseCluster
            label="DEV"
            phase="dev"
            steps={DEV_STEPS}
            story={story}
            activeStep={activeStep}
          />
        </>
      )}
    </nav>
  );
}

interface PhaseClusterProps {
  label: string;
  phase: Phase;
  steps: readonly StepKey[];
  story: Story;
  activeStep: StepKey;
}

function PhaseCluster({ label, phase, steps, story, activeStep }: PhaseClusterProps) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-bg py-0.5 pl-2 pr-1.5"
    >
      <span
        className="mr-1 font-mono text-[10.5px] font-medium uppercase tracking-[0.06em]"
        style={{
          color: phase === 'product' ? 'var(--phase-product)' : 'var(--phase-dev)',
        }}
      >
        {label}
      </span>
      {steps.map((step) => (
        <StepPill
          key={step}
          step={step}
          state={story.steps[step]}
          isActive={step === activeStep}
        />
      ))}
    </span>
  );
}

interface StepPillProps {
  step: StepKey;
  state?: StepState;
  isActive: boolean;
}

function StepPill({ step, state, isActive }: StepPillProps) {
  const status = state?.status ?? 'pending';
  const tokens = state?.tokens;

  const handleClick = () => setSearchParam('step', step);

  let pillClass =
    'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-transparent px-2.5 py-0.5 text-xs transition-colors whitespace-nowrap ';
  if (isActive) {
    pillClass += 'bg-accent font-medium text-accent-ink';
  } else if (status === 'done') {
    pillClass += 'text-green hover:bg-surface-hover';
  } else if (status === 'skipped') {
    pillClass += 'text-text-3 hover:bg-surface-hover';
  } else {
    pillClass += 'text-text-2 hover:bg-surface-hover hover:text-text';
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isActive}
      title={`${STEP_LABEL[step]}${tokens ? ` · ${tokens} tokens` : ''} · ${status}`}
      className={pillClass}
    >
      <StatusDot status={status} isActive={isActive} />
      <span>{STEP_LABEL[step]}</span>
      {typeof tokens === 'number' && tokens > 0 && (
        <span className={'font-mono text-[10px] ' + (isActive ? 'text-accent-ink/80' : 'text-text-3')}>
          {tokens}
        </span>
      )}
    </button>
  );
}

function StatusDot({ status, isActive }: { status: StepState['status']; isActive: boolean }) {
  const base: React.CSSProperties = {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  };

  if (isActive) {
    return (
      <span
        aria-hidden
        style={{
          ...base,
          background: 'var(--accent-ink)',
          border: '1.5px solid var(--accent-ink)',
        }}
      />
    );
  }

  if (status === 'done') {
    return (
      <span
        aria-hidden
        className="relative"
        style={{
          ...base,
          background: 'var(--green)',
          border: '1.5px solid var(--green)',
        }}
      >
        <svg
          viewBox="0 0 10 10"
          className="absolute inset-[1px]"
          aria-hidden
        >
          <path
            d="M2 5l2 2 4-4"
            stroke="white"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  if (status === 'in-progress') {
    return (
      <span
        aria-hidden
        className="animate-pulse"
        style={{
          ...base,
          background: 'var(--blue)',
          border: '1.5px solid var(--blue)',
        }}
      />
    );
  }

  if (status === 'skipped') {
    return (
      <span
        aria-hidden
        style={{
          ...base,
          background: 'transparent',
          border: '1.5px dashed var(--text-3)',
        }}
      />
    );
  }

  // pending
  return (
    <span
      aria-hidden
      style={{
        ...base,
        background: 'transparent',
        border: '1.5px solid var(--border-strong)',
      }}
    />
  );
}
