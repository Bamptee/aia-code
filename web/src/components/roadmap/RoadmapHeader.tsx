'use client';

import type { RoadmapWeek } from '@/lib/hooks/useRoadmapWeeks';

interface RoadmapHeaderProps {
  weeks: RoadmapWeek[];
  todayWeek: number;
  labelColPx: number;
  colPx: number;
}

/**
 * RoadmapHeader — header sticky 2 rows (mois + semaines) (Story 6.1).
 *
 * Sticky top via position:sticky, restant visible quand on scroll horizontal.
 * Cell `today` mise en évidence + line dashed rouge gérée par RoadmapView (overlay).
 */
export function RoadmapHeader({ weeks, todayWeek, labelColPx, colPx }: RoadmapHeaderProps) {
  const todayIdx = Math.floor(todayWeek);
  return (
    <div
      className="sticky top-0 z-10 grid border-b border-border-strong bg-surface"
      style={{
        gridTemplateColumns: `${labelColPx}px repeat(${weeks.length}, ${colPx}px)`,
      }}
    >
      {/* Month row */}
      <div className="row-start-1 border-r border-border" />
      {weeks.map((w, i) => (
        <div
          key={`m-${i}`}
          className={
            'row-start-1 px-2 py-1.5 text-[11px] font-medium text-text-2 ' +
            (w.month ? 'border-l border-border-strong' : '')
          }
        >
          {w.month}
        </div>
      ))}

      {/* Week row */}
      <div className="row-start-2 border-r border-border" />
      {weeks.map((w, i) => (
        <div
          key={`w-${i}`}
          className={
            'row-start-2 px-2 py-1.5 font-mono text-[10px] text-text-3 ' +
            (w.month ? 'border-l border-border-strong ' : '') +
            (i === todayIdx ? 'bg-red-soft text-red' : '')
          }
        >
          {w.label}
        </div>
      ))}
    </div>
  );
}
