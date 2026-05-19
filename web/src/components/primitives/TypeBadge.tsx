import type { StoryType } from '@/lib/types/story';

const TYPE_LABEL: Record<StoryType, string> = {
  feature: 'Feature',
  bug: 'Bug',
  spike: 'Spike',
  chore: 'Chore',
};

/**
 * Mapping handoff (.badge variants .active/.draft/.review/.shipped) :
 * - feature → active (green)
 * - bug → draft (amber)
 * - spike → review (blue)
 * - chore → shipped (text-2)
 */
const TYPE_STYLES: Record<StoryType, { bg: string; text: string; dot: string }> = {
  feature: { bg: 'var(--green-soft)', text: 'var(--green)', dot: 'var(--green)' },
  bug: { bg: 'var(--amber-soft)', text: 'var(--amber)', dot: 'var(--amber)' },
  spike: { bg: 'var(--blue-soft)', text: 'var(--blue)', dot: 'var(--blue)' },
  chore: { bg: 'var(--surface-2)', text: 'var(--text-2)', dot: 'var(--text-3)' },
};

interface TypeBadgeProps {
  type: StoryType;
}

/**
 * Story type badge (handoff §13 / views-v3.jsx:28-41 .badge).
 *
 * Format pill 999px : dot prefix 5px + label casse normale + 11.5px + border 1px @ 20%.
 */
export function TypeBadge({ type }: TypeBadgeProps) {
  const { bg, text, dot } = TYPE_STYLES[type];
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
      {TYPE_LABEL[type]}
    </span>
  );
}
