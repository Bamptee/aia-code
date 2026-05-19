'use client';

import Link from 'next/link';
import { useStoriesQuery } from '@/lib/hooks/useStoriesQuery';
import { PhaseBadge } from '@/components/primitives/PhaseBadge';
import { Skeleton } from '@/components/primitives/Skeleton';
import { formatRelative } from '@/lib/format/date';

/**
 * Home recent stories shortlist (FR-6).
 * 8 stories triées `updated desc`. Row : title + PhaseBadge + ID mono + last updated.
 * Clic ouvre la Story Workspace.
 */
export function RecentStories() {
  const { data, isLoading, isError } = useStoriesQuery();

  return (
    <section className="mt-12">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-text-3">
        Recent stories
      </h2>
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded border border-border bg-surface p-4 text-sm text-text-3">
          Failed to load recent stories.
        </div>
      ) : (data?.length ?? 0) === 0 ? (
        <div className="rounded border border-border bg-surface p-4 text-sm text-text-3">
          No stories yet. Create your first one above.
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {(data ?? [])
            .slice()
            .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
            .slice(0, 8)
            .map((story) => (
              <li key={story.slug}>
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
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
