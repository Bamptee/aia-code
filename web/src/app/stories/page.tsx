'use client';

import { useMemo, useState } from 'react';
import { useStoriesQuery } from '@/lib/hooks/useStoriesQuery';
import { useEpicsQuery } from '@/lib/hooks/useEpicsQuery';
import { Filters, phaseToFilter, type LibraryFilter } from '@/components/library/Filters';
import { SearchBox } from '@/components/library/SearchBox';
import { StoryGroup } from '@/components/library/StoryGroup';
import { Skeleton } from '@/components/primitives/Skeleton';
import type { Story } from '@/lib/types/story';
import type { Epic } from '@/lib/types/epic';

/**
 * Library page (FR-7 + FR-8).
 * - GET /api/features + /api/epics
 * - Groupage par Epic, "Unassigned" pour stories sans epicId
 * - Filter tabs All/Product/Dev/Done (counts stables, AND avec search)
 * - SearchBox filtre title|snippet|id case-insensitive
 */
export default function LibraryPage() {
  const stories = useStoriesQuery();
  const epics = useEpicsQuery();

  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [search, setSearch] = useState('');

  const counts = useMemo<Record<LibraryFilter, number>>(() => {
    const allStories = stories.data ?? [];
    const base: Record<LibraryFilter, number> = {
      all: allStories.length,
      product: 0,
      dev: 0,
      done: 0,
    };
    for (const story of allStories) {
      const bucket = phaseToFilter(story.phase);
      base[bucket]++;
    }
    return base;
  }, [stories.data]);

  const grouped = useMemo(() => {
    if (!stories.data || !epics.data) return null;
    return groupByEpic(applyFilters(stories.data, filter, search), epics.data);
  }, [stories.data, epics.data, filter, search]);

  const isLoading = stories.isLoading || epics.isLoading;
  const isError = stories.isError || epics.isError;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Library</h1>
      </div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Filters active={filter} counts={counts} onChange={setFilter} />
        <SearchBox value={search} onChange={setSearch} />
      </div>
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded border border-border bg-surface p-4 text-sm text-text-3">
          Failed to load library data.
        </div>
      ) : !grouped || grouped.length === 0 ? (
        <div className="rounded border border-border bg-surface p-4 text-sm text-text-3">
          No stories match.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map(({ epic, stories: groupStories }) => (
            <StoryGroup
              key={epic?.id ?? 'unassigned'}
              epic={epic}
              stories={groupStories}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Apply tab filter + case-insensitive search on title/snippet/id. */
function applyFilters(stories: Story[], filter: LibraryFilter, search: string): Story[] {
  const query = search.trim().toLowerCase();
  return stories.filter((story) => {
    if (filter !== 'all' && phaseToFilter(story.phase) !== filter) return false;
    if (query.length === 0) return true;
    return (
      story.title.toLowerCase().includes(query) ||
      story.snippet.toLowerCase().includes(query) ||
      story.id.toLowerCase().includes(query)
    );
  });
}

interface GroupedSection {
  epic: Epic | null;
  stories: Story[];
}

function groupByEpic(stories: Story[], epics: Epic[]): GroupedSection[] {
  const epicById = new Map(epics.map((e) => [e.id, e]));
  const groups = new Map<string, Story[]>();
  const unassigned: Story[] = [];

  for (const story of stories) {
    if (story.epicId && epicById.has(story.epicId)) {
      const list = groups.get(story.epicId) ?? [];
      list.push(story);
      groups.set(story.epicId, list);
    } else {
      unassigned.push(story);
    }
  }

  const sections: GroupedSection[] = [];
  for (const epic of epics) {
    const groupStories = groups.get(epic.id);
    if (groupStories && groupStories.length > 0) {
      // Sort by updated desc within group.
      groupStories.sort(
        (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()
      );
      sections.push({ epic, stories: groupStories });
    }
  }
  if (unassigned.length > 0) {
    unassigned.sort(
      (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()
    );
    sections.push({ epic: null, stories: unassigned });
  }
  return sections;
}
