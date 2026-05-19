'use client';

import { STEP_KEYS, type StepKey, type Phase, type StepStatus } from '@/lib/types/step';
import type { Story } from '@/lib/types/story';

interface StoryBarProps {
  story: Story;
}

const PHASE_BY_STEP: Record<StepKey, Phase> = {
  init: 'product',
  brainstorming: 'product',
  'spec-func': 'product',
  'spec-tech': 'dev',
  'dev-plan': 'dev',
  implement: 'dev',
  review: 'dev',
};

const LABEL_BY_STEP: Record<StepKey, string> = {
  init: 'Init',
  brainstorming: 'Brain',
  'spec-func': 'Spec',
  'spec-tech': 'Tech',
  'dev-plan': 'Plan',
  implement: 'Impl',
  review: 'Rev',
};

/**
 * StoryBar — barre Gantt 7 segments step-colorés (Story 6.1 / handoff §9).
 *
 * Positionnement : grid-column-start={start+1}, grid-column-end={end+2} (1-indexed).
 * Sans roadmap.start/end : pas de bar (row vide visuellement pour audit).
 *
 * Segments : product (purple-tinted) / dev (blue-tinted). Overlays :
 * - in-progress : repeating diagonal stripes
 * - pending : surface-2 + border-strong
 * - skipped : transparent + dashed outline
 * - done : solid phase color
 *
 * Target diamond : 12×12 rotated square positionné à la colonne roadmap.target.
 */
export function StoryBar({ story }: StoryBarProps) {
  const r = story.roadmap;
  if (!r) return null;

  const span = Math.max(1, r.end - r.start);
  const segWidthFr = span / STEP_KEYS.length;

  return (
    <>
      <div
        className="relative flex h-7 overflow-hidden rounded"
        style={{
          gridColumnStart: r.start + 1,
          gridColumnEnd: r.end + 2,
          gridRow: 1,
        }}
      >
        {STEP_KEYS.map((step) => {
          const state = story.steps[step];
          const status: StepStatus = state?.status ?? 'pending';
          const phase = PHASE_BY_STEP[step];
          const showLabel = segWidthFr >= 1.1;
          return (
            <div
              key={step}
              title={`${LABEL_BY_STEP[step]} — ${status}`}
              className={
                'flex flex-1 items-center justify-center overflow-hidden text-[10px] font-medium ' +
                segClass(phase, status)
              }
            >
              {showLabel && segWidthFr >= 1.6 ? LABEL_BY_STEP[step] : ''}
            </div>
          );
        })}
      </div>
      {r.target !== undefined && story.phase !== 'done' && (
        <div
          aria-hidden
          className="pointer-events-none h-3 w-3 rotate-45 border-[1.5px] border-text bg-surface"
          style={{
            gridColumnStart: r.target + 1,
            gridRow: 1,
            justifySelf: 'center',
            alignSelf: 'center',
          }}
          title={`Target — week ${r.target}`}
        />
      )}
    </>
  );
}

function segClass(phase: Phase, status: StepStatus): string {
  if (status === 'skipped') {
    return 'border border-dashed border-border-strong bg-transparent text-text-3';
  }
  if (status === 'pending') {
    return 'bg-surface-2 border border-border-strong text-text-3';
  }
  if (status === 'in-progress') {
    return phase === 'dev' ? 'stripes-dev text-white' : 'stripes-product text-white';
  }
  // done
  return phase === 'dev'
    ? 'bg-phase-dev text-white'
    : 'bg-phase-product text-white';
}
