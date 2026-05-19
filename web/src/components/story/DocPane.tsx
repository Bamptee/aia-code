'use client';

import { useSearchParams } from 'next/navigation';
import type { Story } from '@/lib/types/story';
import type { StepKey } from '@/lib/types/step';
import { InitContent } from './step-content/InitContent';
import { BrainstormingContent } from './step-content/BrainstormingContent';
import { SpecFuncContent } from './step-content/SpecFuncContent';
import { ImplementContent } from './step-content/ImplementContent';
import { ReviewStepView } from './step-content/ReviewStepView';
import { EmptyStep } from '@/components/primitives/EmptyStep';

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

  return (
    <div className="flex-[1.55] overflow-y-auto bg-surface p-6">
      <StepContent step={activeStep} story={story} />
    </div>
  );
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
