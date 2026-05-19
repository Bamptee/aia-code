'use client';

import Link from 'next/link';
import { Layers } from 'lucide-react';
import { StoryBar } from './StoryBar';
import type { Epic } from '@/lib/types/epic';
import type { Story } from '@/lib/types/story';

interface EpicGroupProps {
  epic: Epic | { id: string; name: string; doneCount?: number; storyCount?: number };
  stories: Story[];
  weekCount: number;
  labelColPx: number;
  colPx: number;
}

/**
 * EpicGroup — header row epic + story rows (Story 6.1).
 *
 * Header row : label epic + ID + done/total. Subgrid pour aligner labels et
 * track. Le track est une grille `weekCount` colonnes, mêmes largeurs que le
 * RoadmapHeader (passées via colPx/labelColPx).
 */
export function EpicGroup({ epic, stories, weekCount, labelColPx, colPx }: EpicGroupProps) {
  const done = epic.doneCount ?? stories.filter((s) => s.phase === 'done').length;
  const total = epic.storyCount ?? stories.length;

  return (
    <section>
      <div
        className="grid border-b border-border bg-surface-2"
        style={{ gridTemplateColumns: `${labelColPx}px repeat(${weekCount}, ${colPx}px)` }}
      >
        <div className="flex items-center gap-2 border-r border-border px-3 py-1.5 text-[12px]">
          <Layers size={14} className="text-text-3" />
          <span className="font-medium text-text">{epic.name}</span>
          <span className="font-mono text-[10px] text-text-3">{epic.id}</span>
          <span className="ml-auto font-mono text-[10px] text-text-3">
            {done}/{total}
          </span>
        </div>
        {Array.from({ length: weekCount }).map((_, i) => (
          <div key={i} className="border-l border-dashed border-border" />
        ))}
      </div>

      {stories.map((story) => (
        <div
          key={story.slug}
          className="grid border-b border-border transition-colors hover:bg-surface-hover"
          style={{ gridTemplateColumns: `${labelColPx}px repeat(${weekCount}, ${colPx}px)` }}
        >
          <Link
            href={`/stories/${story.slug}`}
            className="flex min-w-0 flex-col gap-0.5 border-r border-border px-3 py-2 text-[12px]"
          >
            <span className="truncate text-text">{story.title}</span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-text-3">
              <span>{story.id}</span>
              <span>·</span>
              <span>
                {story.tasksDone}/{story.tasksTotal}t
              </span>
            </span>
          </Link>
          <div
            className="relative grid"
            style={{
              gridColumn: `2 / span ${weekCount}`,
              gridTemplateColumns: `repeat(${weekCount}, ${colPx}px)`,
            }}
          >
            {Array.from({ length: weekCount }).map((_, i) => (
              <div
                key={i}
                className={
                  'min-h-8 border-l border-dashed border-border ' +
                  (i === 0 ? '' : '')
                }
              />
            ))}
            <div
              className="pointer-events-none absolute inset-0 grid items-center"
              style={{ gridTemplateColumns: `repeat(${weekCount}, ${colPx}px)`, padding: '2px 0' }}
            >
              <StoryBar story={story} />
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
