import type { StoryType } from '@/lib/types/story';

const TYPE_LABEL: Record<StoryType, string> = {
  feature: 'Feature',
  bug: 'Bug',
  spike: 'Spike',
  chore: 'Chore',
};

const TYPE_STYLES: Record<StoryType, { bg: string; text: string }> = {
  feature: { bg: 'var(--blue-soft)', text: 'var(--blue)' },
  bug: { bg: 'var(--red-soft)', text: 'var(--red)' },
  spike: { bg: 'var(--amber-soft)', text: 'var(--amber)' },
  chore: { bg: 'var(--surface-hover)', text: 'var(--text-3)' },
};

interface TypeBadgeProps {
  type: StoryType;
}

/**
 * Story type badge (handoff §13).
 * Used in StoryHeader and Library rows.
 */
export function TypeBadge({ type }: TypeBadgeProps) {
  const { bg, text } = TYPE_STYLES[type];
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{ backgroundColor: bg, color: text }}
    >
      {TYPE_LABEL[type]}
    </span>
  );
}
