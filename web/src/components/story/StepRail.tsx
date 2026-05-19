'use client';

import { useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { setSearchParam } from '@/lib/url/setParam';
import { PRODUCT_STEPS, DEV_STEPS } from '@/lib/types/step';
import type { StepKey, StepState } from '@/lib/types/step';
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
 * Step Rail (FR-9, handoff §7.3).
 *
 * Layout : [Product cluster] → [Dev cluster]
 * - Product cluster : init, brainstorming, spec-func
 * - Dev cluster : spec-tech, dev-plan, implement, review
 * - Dev cluster masqué si `story.phase === 'product'` (encore en product side)
 *
 * Each pill : <dot> <label> <tokens?>
 * States visuels :
 *   - done      : dot filled accent
 *   - in-progress : dot pulse
 *   - pending   : dot outline (border-2)
 *   - skipped   : dot dashed outline
 *   - active (étape sélectionnée) : pill ring + filled bg
 *
 * Click pill → setSearchParam('step', stepKey) — URL state, pas de server re-render.
 * Active step = `?step=` ou fallback `story.currentStep`.
 */
export function StepRail({ story }: StepRailProps) {
  const searchParams = useSearchParams();
  const activeStep = (searchParams?.get('step') as StepKey | null) || story.currentStep;
  const showDev = story.phase !== 'product';

  return (
    <nav
      aria-label="Story pipeline steps"
      className="flex items-center gap-2 overflow-x-auto border-b border-border bg-surface px-6 py-2"
    >
      <ClusterLabel label="PRODUCT" />
      <StepCluster
        steps={PRODUCT_STEPS}
        story={story}
        activeStep={activeStep}
      />
      {showDev && (
        <>
          <ArrowRight size={14} className="shrink-0 text-text-3" />
          <ClusterLabel label="DEV" />
          <StepCluster
            steps={DEV_STEPS}
            story={story}
            activeStep={activeStep}
          />
        </>
      )}
    </nav>
  );
}

function ClusterLabel({ label }: { label: string }) {
  return (
    <span className="shrink-0 font-mono text-[10px] font-medium uppercase tracking-wider text-text-3">
      {label}
    </span>
  );
}

function StepCluster({
  steps,
  story,
  activeStep,
}: {
  steps: readonly StepKey[];
  story: Story;
  activeStep: StepKey;
}) {
  return (
    <span className="flex items-center gap-1">
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

  const handleClick = () => {
    setSearchParam('step', step);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isActive}
      title={`${STEP_LABEL[step]}${tokens ? ` · ${tokens} tokens` : ''} · ${status}`}
      className={
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ' +
        (isActive
          ? 'border-accent bg-accent text-accent-ink shadow-sm ring-2 ring-accent/30'
          : 'border-border bg-surface text-text-2 hover:bg-surface-hover hover:text-text')
      }
    >
      <StatusDot status={status} isActive={isActive} />
      <span className="font-medium">{STEP_LABEL[step]}</span>
      {typeof tokens === 'number' && tokens > 0 && (
        <span className={'font-mono text-[10px] ' + (isActive ? 'text-accent-ink/80' : 'text-text-3')}>
          {tokens}
        </span>
      )}
    </button>
  );
}

function StatusDot({ status, isActive }: { status: StepState['status']; isActive: boolean }) {
  // Active step déjà highlight via le pill ring → dot reste cohérent avec status.
  const baseStyle: React.CSSProperties = {
    width: 8,
    height: 8,
    borderRadius: '50%',
  };

  if (status === 'done') {
    return (
      <span
        aria-hidden="true"
        style={{
          ...baseStyle,
          backgroundColor: isActive ? 'var(--accent-ink)' : 'var(--accent)',
        }}
      />
    );
  }

  if (status === 'in-progress') {
    return (
      <span
        aria-hidden="true"
        className="animate-pulse"
        style={{
          ...baseStyle,
          backgroundColor: 'var(--pipe-run)',
        }}
      />
    );
  }

  if (status === 'skipped') {
    return (
      <span
        aria-hidden="true"
        style={{
          ...baseStyle,
          border: '1px dashed currentColor',
          backgroundColor: 'transparent',
        }}
      />
    );
  }

  // pending — empty outline
  return (
    <span
      aria-hidden="true"
      style={{
        ...baseStyle,
        border: '1.5px solid currentColor',
        backgroundColor: 'transparent',
      }}
    />
  );
}
