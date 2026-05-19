'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStoriesQuery } from '@/lib/hooks/useStoriesQuery';
import { PhaseDot } from '@/components/primitives/PhaseDot';
import { Skeleton } from '@/components/primitives/Skeleton';

/**
 * Sidebar active stories list (FR-3).
 * - Filtre phase !== 'done'
 * - Chaque row : <PhaseDot> <title ellipsis>
 * - Active row = currently-open story (path matches /stories/<slug>)
 */
export function ActiveStoriesList() {
  const pathname = usePathname();
  const { data, isLoading, isError } = useStoriesQuery();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-1 px-2 pt-4">
        <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-text-3">
          Active stories
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="mx-2 h-6" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-4 pt-4 text-xs text-text-3">
        Failed to load stories.
      </div>
    );
  }

  const active = (data ?? []).filter((s) => s.phase !== 'done');

  if (active.length === 0) {
    return (
      <div className="px-4 pt-4 text-xs text-text-3">
        No active stories. Create one with ⌘N.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 pt-4">
      <div className="px-4 pb-1 text-[10px] font-medium uppercase tracking-wide text-text-3">
        Active stories
      </div>
      <ul className="flex flex-col gap-0.5 px-2">
        {active.map((story) => {
          const href = `/stories/${story.slug}`;
          const isActive = pathname === href;
          return (
            <li key={story.slug}>
              <Link
                href={href}
                className={
                  'flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors ' +
                  (isActive
                    ? 'bg-surface font-semibold text-text shadow-sm'
                    : 'text-text-2 hover:bg-surface-hover hover:text-text')
                }
              >
                <PhaseDot phase={story.phase} />
                <span className="truncate">{story.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
