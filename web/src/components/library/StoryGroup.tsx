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

/**
 * 14 colonnes × 4 rows grid, conforme handoff §10.
 * Les cells "filled" sont distribuées par colonnes : ratio doneCount/total
 * appliqué à chaque colonne (4 rows). Approche déterministe et lisible.
 */
function ProgressMeter({ filled, total }: { filled: number; total: number }) {
  const ROWS = 4;
  const COLS = total;
  // Cells distribuées column-first : chaque colonne remplit ses 4 cells avant
  // de passer à la suivante. Donc isFilled = (col < filled).
  const cells = COLS * ROWS;

  return (
    <span
      aria-label={`${filled} of ${total} done`}
      className="grid h-3 gap-px"
      style={{
        gridTemplateColumns: `repeat(${COLS}, 2px)`,
        gridTemplateRows: `repeat(${ROWS}, 1fr)`,
      }}
    >
      {Array.from({ length: cells }).map((_, i) => {
        const col = i % COLS;
        // Column-first fill : la colonne `col` est entièrement remplie si col < filled.
        const isFilled = col < filled;
        return (
          <span
            key={i}
            className={
              'rounded-[1px] ' + (isFilled ? 'bg-accent' : 'bg-surface-hover')
            }
          />
        );
      })}
    </span>
  );
}
