import type { Story } from '@/lib/types/story';
import type { Epic } from '@/lib/types/epic';
import { StoryRow } from './StoryRow';

interface StoryGroupProps {
  epic: Epic | null; // null = "Unassigned" group
  stories: Story[];
}

/**
 * Library group : Epic header + ses stories (FR-7, handoff §10).
 * Epic header : nom + ID + progress meter (14×4 cells) + n/m done.
 * V1 minimal — progress meter rendu en SVG simple, sans tooltip / hover.
 */
export function StoryGroup({ epic, stories }: StoryGroupProps) {
  const doneCount = stories.filter((s) => s.phase === 'done').length;
  const totalCount = stories.length;
  const filledCells = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 14);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2">
        <h3 className="text-sm font-semibold text-text">
          {epic?.name ?? 'Unassigned'}
        </h3>
        {epic && (
          <span className="font-mono text-[10px] text-text-3">{epic.id}</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <ProgressMeter filled={filledCells} total={14} />
          <span className="font-mono text-[10px] text-text-3">
            {doneCount}/{totalCount} done
          </span>
        </span>
      </header>
      <ul className="flex flex-col divide-y divide-border">
        {stories.map((story) => (
          <li key={story.slug}>
            <StoryRow story={story} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProgressMeter({ filled, total }: { filled: number; total: number }) {
  return (
    <span
      aria-label={`${filled} of ${total} done`}
      className="flex h-1 gap-0.5"
    >
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={
            'h-1 w-2 rounded-sm ' + (i < filled ? 'bg-accent' : 'bg-surface-hover')
          }
        />
      ))}
    </span>
  );
}
