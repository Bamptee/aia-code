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
}

const PHASE_STYLES: Record<Phase, PhaseStyle> = {
  product: { bg: 'var(--phase-product-soft)', text: 'var(--phase-product)' },
  dev: { bg: 'var(--phase-dev-soft)', text: 'var(--phase-dev)' },
  qa: { bg: 'var(--phase-qa-soft)', text: 'var(--phase-qa)' },
  done: { bg: 'var(--surface-hover)', text: 'var(--text-3)' },
};

interface PhaseBadgeProps {
  phase: Phase;
}

/**
 * Tinted pill badge displaying a story's phase (handoff §13).
 * Used in Story Header, Library rows, Home recent shortlist.
 */
export function PhaseBadge({ phase }: PhaseBadgeProps) {
  const { bg, text } = PHASE_STYLES[phase];
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{ backgroundColor: bg, color: text }}
    >
      {PHASE_LABEL[phase]}
    </span>
  );
}
