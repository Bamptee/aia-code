'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Skeleton } from '@/components/primitives/Skeleton';
import { useStoriesQuery } from '@/lib/hooks/useStoriesQuery';
import { useEpicsQuery } from '@/lib/hooks/useEpicsQuery';
import { useRoadmapWeeks, ROADMAP_CONFIG } from '@/lib/hooks/useRoadmapWeeks';
import { setSearchParam } from '@/lib/url/setParam';
import type { Story } from '@/lib/types/story';
import type { Epic } from '@/lib/types/epic';
import { RoadmapHeader } from './RoadmapHeader';
import { EpicGroup } from './EpicGroup';

type Tab = 'active' | 'done' | 'all';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'active', label: 'Active' },
  { id: 'done', label: 'Done' },
  { id: 'all', label: 'All' },
];

/**
 * RoadmapView — Gantt 16 semaines (FR-15, Story 6.1, handoff §9).
 *
 * Composition :
 * - Filtres Active / Done / All (URL `?tab=`)
 * - Legend swatches
 * - Header sticky mois + semaines
 * - Groups par epic, stories triées par roadmap.start (puis updated)
 * - Bar 7 segments step-colorés + diamant target + ligne dashed rouge "today"
 * - Auto-scroll centré sur today via useLayoutEffect
 */
export function RoadmapView() {
  const { data: stories = [], isLoading: storiesLoading } = useStoriesQuery();
  const { data: epics = [] } = useEpicsQuery();
  const { weeks, todayWeek } = useRoadmapWeeks();
  const searchParams = useSearchParams();
  const tab: Tab = (TABS.some((t) => t.id === searchParams?.get('tab')) ? (searchParams?.get('tab') as Tab) : 'active');

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to today on mount uniquement. `todayWeek` est figé via useState
  // dans useRoadmapWeeks → ce useLayoutEffect ne s'exécute qu'une fois et ne réécrit
  // pas scrollLeft à chaque render (review Epic 6 P1).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const vw = el.clientWidth;
    const todayX = ROADMAP_CONFIG.LABEL_COL_PX + todayWeek * ROADMAP_CONFIG.COL_PX;
    el.scrollLeft = Math.max(0, todayX - vw / 2);
  }, [todayWeek]);

  const filteredStories = useMemo(() => {
    return stories.filter((s) => {
      if (tab === 'all') return true;
      if (tab === 'done') return s.phase === 'done';
      return s.phase !== 'done';
    });
  }, [stories, tab]);

  const groups = useMemo(() => groupByEpic(filteredStories, epics), [filteredStories, epics]);

  const counts = useMemo(
    () => ({
      active: stories.filter((s) => s.phase !== 'done').length,
      done: stories.filter((s) => s.phase === 'done').length,
      all: stories.length,
    }),
    [stories],
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-border bg-surface px-6 py-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-text">Roadmap</h1>
          <p className="truncate text-xs text-text-3">
            One row per story · segments are step progress · diamond marks the target.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSearchParam('tab', t.id === 'active' ? null : t.id)}
              className={
                'inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ' +
                (t.id === tab
                  ? 'bg-surface-2 text-text'
                  : 'text-text-2 hover:bg-surface-hover hover:text-text')
              }
            >
              {t.label}
              <span className="font-mono text-[10px] text-text-3">{counts[t.id]}</span>
            </button>
          ))}
        </div>
      </header>

      <Legend />

      <div ref={scrollRef} className="flex-1 overflow-auto">
        {storiesLoading ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <p className="text-sm font-medium text-text">No stories match this filter</p>
            <p className="text-xs text-text-3">Try switching to All or check back when stories advance.</p>
          </div>
        ) : (
          <div
            className="relative min-w-fit"
            style={{ width: ROADMAP_CONFIG.LABEL_COL_PX + weeks.length * ROADMAP_CONFIG.COL_PX }}
          >
            <RoadmapHeader
              weeks={weeks}
              todayWeek={todayWeek}
              labelColPx={ROADMAP_CONFIG.LABEL_COL_PX}
              colPx={ROADMAP_CONFIG.COL_PX}
            />
            {groups.map((g) => (
              <EpicGroup
                key={g.epic.id}
                epic={g.epic}
                stories={g.stories}
                weekCount={weeks.length}
                labelColPx={ROADMAP_CONFIG.LABEL_COL_PX}
                colPx={ROADMAP_CONFIG.COL_PX}
              />
            ))}
            <TodayLine
              todayWeek={todayWeek}
              labelColPx={ROADMAP_CONFIG.LABEL_COL_PX}
              colPx={ROADMAP_CONFIG.COL_PX}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-border bg-surface px-6 py-2 text-[11px] text-text-2">
      <Swatch className="bg-phase-product" label="Product steps" />
      <Swatch className="bg-phase-dev" label="Dev steps" />
      <Swatch className="stripes-dev" label="In progress" />
      <Swatch className="bg-surface-2 border border-border-strong" label="Pending" />
      <Swatch
        className="border border-dashed border-border-strong bg-transparent"
        label="Skipped"
      />
      <span className="ml-auto inline-flex items-center gap-1.5">
        <span
          className="inline-block h-2 w-2 rotate-45 border-[1.5px] border-text bg-surface"
        />
        Target
      </span>
    </div>
  );
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={'inline-block h-3 w-3 rounded-sm ' + className} />
      {label}
    </span>
  );
}

function TodayLine({
  todayWeek,
  labelColPx,
  colPx,
}: {
  todayWeek: number;
  labelColPx: number;
  colPx: number;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 bottom-0 z-[5] border-l border-dashed border-red"
      style={{ left: labelColPx + todayWeek * colPx }}
    />
  );
}

interface RoadmapGroup {
  epic: { id: string; name: string; doneCount?: number; storyCount?: number };
  stories: Story[];
}

function groupByEpic(stories: Story[], epics: Epic[]): RoadmapGroup[] {
  const epicsById = new Map(epics.map((e) => [e.id, e]));
  const groupedMap = new Map<string, Story[]>();

  for (const s of stories) {
    const key = s.epicId ?? 'unassigned';
    const arr = groupedMap.get(key) ?? [];
    arr.push(s);
    groupedMap.set(key, arr);
  }

  const groups: RoadmapGroup[] = [];
  for (const [epicId, arr] of groupedMap) {
    arr.sort((a, b) => {
      const aStart = a.roadmap?.start ?? Infinity;
      const bStart = b.roadmap?.start ?? Infinity;
      if (aStart !== bStart) return aStart - bStart;
      return a.updated.localeCompare(b.updated);
    });
    const epic = epicsById.get(epicId);
    groups.push({
      epic: epic ?? { id: epicId, name: epicId === 'unassigned' ? 'Unassigned' : epicId },
      stories: arr,
    });
  }

  groups.sort((a, b) => a.epic.name.localeCompare(b.epic.name));
  return groups;
}
