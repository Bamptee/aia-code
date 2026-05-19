import { Layers } from 'lucide-react';
import type { Story } from '@/lib/types/story';
import type { Epic } from '@/lib/types/epic';
import { StoryRow } from './StoryRow';

interface StoryGroupProps {
  epic: Epic | null; // null = "Unassigned" group
  stories: Story[];
}

/**
 * Library group : Epic header + ses stories (FR-7, handoff §10).
 * Epic header : Layers icon + nom + ID + progress meter 14×4 cells (3 states) + done/total.
 */
export function StoryGroup({ epic, stories }: StoryGroupProps) {
  const doneCount = stories.filter((s) => s.phase === 'done').length;
  const doingCount = stories.filter((s) => s.phase !== 'done').length;
  const totalCount = stories.length;
  const epicColor = epic?.color;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2">
        <Layers size={14} className="text-text-3" />
        <h2 className="text-sm font-medium text-text">{epic?.name ?? 'Unassigned'}</h2>
        {epic && (
          <span className="font-mono text-[10px] text-text-3">{epic.id}</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <ProgressMeter
            done={doneCount}
            doing={doingCount}
            total={totalCount}
            color={epicColor}
          />
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
 * Progress meter 14 colonnes × 4 rows (handoff §10, views-v3.jsx:1485).
 *
 * 3 états par colonne — done : colorée pleine ; doing : colorée 1ʳᵉ row uniquement
 * (indique le travail en cours sur cette story) ; empty : surface-hover.
 *
 * Sémantique handoff : `i < doneCount` = done ; `i < doneCount + 1` = doing (1 colonne en cours
 * après les done) ; le reste = empty. Couleur tirée d'epic.color si dispo, sinon accent.
 */
function ProgressMeter({
  done,
  doing,
  total,
  color,
}: {
  done: number;
  doing: number;
  total: number;
  color?: string;
}) {
  const COLS = 14;
  const ROWS = 4;
  const cells = COLS * ROWS;

  // Mappe N stories réelles → N colonnes proportionnellement sur 14.
  const doneCols = total === 0 ? 0 : Math.round((done / total) * COLS);
  // doing = au moins 1 col si des stories non-done existent (et qu'on a de la place).
  const doingCols = total === 0 || doing === 0 ? 0 : Math.min(1, COLS - doneCols);
  const fillColor = color ?? 'var(--accent)';

  return (
    <span
      aria-label={`${done} of ${total} done`}
      className="grid h-3 gap-px"
      style={{
        gridTemplateColumns: `repeat(${COLS}, 2px)`,
        gridTemplateRows: `repeat(${ROWS}, 1fr)`,
      }}
    >
      {Array.from({ length: cells }).map((_, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const isDone = col < doneCols;
        const isDoing = !isDone && col < doneCols + doingCols;
        // Pour doing : seule la première row (top) est colorée — signal "en cours".
        const isDoingActive = isDoing && row === 0;
        return (
          <span
            key={i}
            className="rounded-[1px]"
            style={{
              backgroundColor: isDone || isDoingActive ? fillColor : 'var(--surface-hover)',
              opacity: isDoingActive ? 0.6 : 1,
            }}
          />
        );
      })}
    </span>
  );
}
