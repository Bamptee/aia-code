import type { Phase } from '@/lib/types/step';

const PHASE_VAR: Record<Phase, string> = {
  product: 'var(--phase-product)',
  dev: 'var(--phase-dev)',
  qa: 'var(--phase-qa)',
  done: 'var(--text-3)',
};

interface PhaseDotProps {
  phase: Phase;
  size?: number;
}

/**
 * Small colored dot indicating a story's phase (handoff §13).
 * Used in Sidebar active stories list, StepRail, etc.
 */
export function PhaseDot({ phase, size = 8 }: PhaseDotProps) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: PHASE_VAR[phase],
      }}
    />
  );
}
