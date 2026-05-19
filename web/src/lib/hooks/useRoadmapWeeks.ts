'use client';

import { useMemo, useState } from 'react';

export interface RoadmapWeek {
  idx: number;
  label: string;
  month: string;
}

export interface RoadmapTimeline {
  weeks: RoadmapWeek[];
  todayWeek: number;
}

const WEEK_COUNT = 16;
const WEEKS_BEFORE_TODAY = 8;
const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/**
 * useRoadmapWeeks — génère une timeline 16 semaines avec "today" au milieu.
 *
 * `now` est figé au mount via useState lazy init pour éviter une boucle infinie
 * d'invalidation : sans ça, `Date.now()` change à chaque render → useMemo
 * réinvalidé → todayWeek change → useLayoutEffect réécrit scrollLeft → le user
 * ne peut plus scroller (review Epic 6 D2/P1).
 *
 * `todayWeek` est fractionnaire pour positionner la ligne dashed au bon jour
 * dans la semaine courante.
 */
export function useRoadmapWeeks(): RoadmapTimeline {
  const [now] = useState(() => Date.now());

  return useMemo(() => {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    // Lundi de la semaine courante (1=Monday → offset 0)
    const dow = today.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const mondayThisWeek = new Date(today);
    mondayThisWeek.setDate(today.getDate() + mondayOffset);

    const week0Start = new Date(mondayThisWeek);
    week0Start.setDate(mondayThisWeek.getDate() - WEEKS_BEFORE_TODAY * 7);

    const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit' });
    const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'short' });

    let lastMonth = '';
    const weeks: RoadmapWeek[] = [];
    for (let i = 0; i < WEEK_COUNT; i++) {
      const d = new Date(week0Start);
      d.setDate(week0Start.getDate() + i * 7);
      const monthName = monthFmt.format(d);
      const showMonth = monthName !== lastMonth ? monthName : '';
      lastMonth = monthName;
      weeks.push({ idx: i, label: fmt.format(d), month: showMonth });
    }

    const daysSinceWeek0 = Math.max(
      0,
      (now - week0Start.getTime()) / MS_PER_DAY,
    );
    const todayWeek = daysSinceWeek0 / 7;

    return { weeks, todayWeek };
  }, [now]);
}

export const ROADMAP_CONFIG = {
  COL_PX: 78,
  LABEL_COL_PX: 280,
  WEEK_COUNT,
  MS_PER_WEEK,
};
