'use client';

import { useMemo } from 'react';

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
 * Pourquoi côté client : pas d'endpoint backend exposant la grille. La logique
 * est déterministe (Date.now()) donc OK pour un solo-dev. Story future :
 * remplacer par `useRoadmapQuery()` si le backend expose une grille canonique.
 *
 * `todayWeek` est fractionnaire pour positionner la ligne dashed au bon jour
 * dans la semaine courante.
 */
export function useRoadmapWeeks(now: number = Date.now()): RoadmapTimeline {
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
