'use client';

import { Suspense, use } from 'react';
import { useStoryQuery } from '@/lib/hooks/useStoryQuery';
import { StoryWorkspace } from '@/components/story/StoryWorkspace';
import { Skeleton } from '@/components/primitives/Skeleton';

/**
 * Story Workspace route /stories/[slug].
 * Fetch la story par slug, render StoryWorkspace ou empty states.
 */
export default function StoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { data: story, isLoading, isError, error } = useStoryQuery(slug);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !story) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <div className="rounded-lg border border-border bg-surface p-6">
          <h1 className="text-lg font-semibold text-text">Story not found</h1>
          <p className="mt-2 text-sm text-text-2">
            La story <code className="font-mono text-text">{slug}</code> n&apos;existe pas
            (ou l&apos;API est down).
          </p>
          {error instanceof Error && (
            <p className="mt-2 font-mono text-[11px] text-text-3">{error.message}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-3 p-6">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <StoryWorkspace story={story} />
    </Suspense>
  );
}
