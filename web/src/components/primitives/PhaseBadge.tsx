import type { Phase } from '@/lib/types/step';

const PHASE_LABEL: Record<Phase, string> = {
  product: 'Product',
  dev: 'Dev',
  qa: 'QA',
  done: 'Done',
};

interface PhaseStyle {
  bg: string;
  text: string;
  dot: string;
}

const PHASE_STYLES: Record<Phase, PhaseStyle> = {
  product: { bg: 'var(--phase-product-soft)', text: 'var(--phase-product)', dot: 'var(--phase-product)' },
  dev: { bg: 'var(--phase-dev-soft)', text: 'var(--phase-dev)', dot: 'var(--phase-dev)' },
  qa: { bg: 'var(--phase-qa-soft)', text: 'var(--phase-qa)', dot: 'var(--phase-qa)' },
  done: { bg: 'var(--green-soft)', text: 'var(--green)', dot: 'var(--green)' },
};

interface PhaseBadgeProps {
  phase: Phase;
}

/**
 * Tinted pill badge displaying a story's phase (handoff §13 + views-v3.jsx:44-64).
 *
 * Format pill 999px : dot prefix 5px coloré + label casse normale (pas uppercase) +
 * font-size 11.5px + border 1px à 20% d'opacité de la couleur de phase.
 */
export function PhaseBadge({ phase }: PhaseBadgeProps) {
  const { bg, text, dot } = PHASE_STYLES[phase];
  return (
    <span
      className="inline-flex items-center gap-[5px] rounded-full px-2 py-0.5 text-[11.5px] font-medium tracking-[-0.005em]"
      style={{
        backgroundColor: bg,
        color: text,
        border: `1px solid ${text}33`,
      }}
    >
      <span
        aria-hidden
        className="inline-block h-[5px] w-[5px] rounded-full"
        style={{ backgroundColor: dot }}
      />
      {PHASE_LABEL[phase]}
    </span>
  );
}
