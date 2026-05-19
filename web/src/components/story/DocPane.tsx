'use client';

import { useSearchParams } from 'next/navigation';
import type { Story } from '@/lib/types/story';
import type { StepKey, StepType } from '@/lib/types/step';
import { InitContent } from './step-content/InitContent';
import { BrainstormingContent } from './step-content/BrainstormingContent';
import { SpecFuncContent } from './step-content/SpecFuncContent';
import { ImplementContent } from './step-content/ImplementContent';
import { ReviewStepView } from './step-content/ReviewStepView';
import { EmptyStep } from '@/components/primitives/EmptyStep';

const STEP_CONFIG: Record<StepKey, { name: string; type: StepType }> = {
  init: { name: 'Init', type: 'generate' },
  brainstorming: { name: 'Brainstorming', type: 'chat-only' },
  'spec-func': { name: 'Spec Func', type: 'generate' },
  'spec-tech': { name: 'Spec Tech', type: 'generate' },
  'dev-plan': { name: 'Dev Plan', type: 'generate' },
  implement: { name: 'Implement', type: 'generate' },
  review: { name: 'Review', type: 'chat-only' },
};

interface DocPaneProps {
  story: Story;
}

/**
 * Doc Pane router (FR-10, handoff §7.4).
 *
 * Rend le contenu de l'étape active (URL `?step=` ou `story.currentStep` fallback).
 * Chaque step a sa branche de rendu :
 * - init / brainstorming / spec-func → contenu généré (placeholder v1)
 * - spec-tech / dev-plan → EmptyStep (PRD §5 Non-Goals : pas de rendering détaillé v1)
 * - implement → CI pipeline + commits + actions
 * - review → drivé par story.bitbucket.pr
 *
 * Background `surface`, padding 6, flex column.
 */
export function DocPane({ story }: DocPaneProps) {
  const searchParams = useSearchParams();
  const activeStep = (searchParams?.get('step') as StepKey | null) || story.currentStep;
  const stepState = story.steps[activeStep];
  const conf = STEP_CONFIG[activeStep];
  const status = stepState?.status ?? 'pending';
  const tokens = stepState?.tokens;

  return (
    <div className="flex-[1.55] overflow-y-auto bg-surface px-6 py-5">
      {/* Step kicker (handoff §7.4 views-v3.jsx:491-499) */}
      <div className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-text-3">
        <span
          aria-hidden
          className={
            'inline-block h-1.5 w-1.5 rounded-full ' +
            (status === 'in-progress'
              ? 'animate-pulse bg-blue'
              : status === 'done'
                ? 'bg-green'
                : 'bg-text-3')
          }
        />
        <span>Step · {conf.name}</span>
        <span>·</span>
        <span>{conf.type}</span>
        {typeof tokens === 'number' && tokens > 0 && (
          <span className="ml-auto">{formatTokens(tokens)} tokens</span>
        )}
      </div>
      <StepContent step={activeStep} story={story} />
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function StepContent({ step, story }: { step: StepKey; story: Story }) {
  switch (step) {
    case 'init':
      return <InitContent story={story} />;
    case 'brainstorming':
      return <BrainstormingContent />;
    case 'spec-func':
      return <SpecFuncContent />;
    case 'spec-tech':
      return (
        <EmptyStep
          title="Spec Tech not generated"
          description="Tech specification rendering not specced for v1 (PRD §5 Non-Goals). Generate to draft."
          onGenerate={undefined}
        />
      );
    case 'dev-plan':
      return (
        <EmptyStep
          title="Dev Plan not generated"
          description="Dev plan rendering not specced for v1 (PRD §5 Non-Goals). Generate to draft."
          onGenerate={undefined}
        />
      );
    case 'implement':
      return <ImplementContent story={story} />;
    case 'review':
      return <ReviewStepView story={story} />;
    default: {
      const _exhaustive: never = step;
      void _exhaustive;
      return <EmptyStep />;
    }
  }
}
