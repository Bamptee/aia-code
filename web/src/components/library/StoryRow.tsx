import Link from 'next/link';
import { PhaseBadge } from '@/components/primitives/PhaseBadge';
import { formatRelative } from '@/lib/format/date';
import type { Story } from '@/lib/types/story';

interface StoryRowProps {
  story: Story;
}

/**
 * One row in the Library list (FR-7, handoff §10).
 *
 * V1 minimal — title + PhaseBadge + ID + last updated.
 * Story 3.x enrichira avec snippet, StepMini dots, CuPill, PrMini, avatar stack
 * une fois que l'API Express expose ces données.
 */
export function StoryRow({ story }: StoryRowProps) {
  return (
    <Link
      href={`/stories/${story.slug}`}
      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover"
    >
      <span className="flex-1 truncate text-sm text-text">{story.title}</span>
      <PhaseBadge phase={story.phase} />
      <span className="font-mono text-[11px] text-text-3">{story.id}</span>
      <span className="w-16 text-right text-[11px] text-text-3">
        {formatRelative(story.updated)}
      </span>
    </Link>
  );
}
