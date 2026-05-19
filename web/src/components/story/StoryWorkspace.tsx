'use client';

import { useSearchParams } from 'next/navigation';
import { StoryHeader } from './StoryHeader';
import { SourceStrip } from './SourceStrip';
import { StepRail } from './StepRail';
import { DocPane } from './DocPane';
import { ChatPane } from './ChatPane';
import type { Story } from '@/lib/types/story';

interface StoryWorkspaceProps {
  story: Story;
}

/**
 * Story Workspace shell (FR-9 à FR-13).
 *
 * Composition top → bottom :
 * 1. StoryHeader (FR-12) ✅ Story 3.3
 * 2. SourceStrip Bitbucket (FR-11) — Story 3.4
 * 3. StepRail (FR-9) — Story 3.5
 * 4. Body split :
 *    - DocPane (FR-10) — Stories 3.6 + 3.7
 *    - ChatPane (FR-13) — Story 3.8
 *
 * Read mode (FR-14) basculé via `?read=1` → ReadMode (Epic 4 Story 4.2).
 */
export function StoryWorkspace({ story }: StoryWorkspaceProps) {
  const searchParams = useSearchParams();
  const isReadMode = searchParams?.get('read') === '1';

  if (isReadMode) {
    return <ReadModePlaceholder story={story} />;
  }

  return (
    <div className="flex flex-col">
      <StoryHeader story={story} />
      <SourceStrip story={story} />
      <StepRail story={story} />
      <div className="flex flex-1 overflow-hidden">
        <DocPane story={story} />
        <div className="border-l border-border" />
        <ChatPane story={story} />
      </div>
    </div>
  );
}

function ReadModePlaceholder({ story }: { story: Story }) {
  return (
    <div className="mx-auto max-w-[720px] px-8 py-12">
      <div className="mb-8 flex items-center gap-3 text-xs text-text-3">
        <span className="rounded bg-accent-soft px-2 py-0.5 font-medium text-accent">
          Read mode
        </span>
        <a
          href={`/stories/${story.slug}`}
          className="text-text-2 transition-colors hover:text-text"
        >
          Exit read mode
        </a>
      </div>
      <h1 className="text-4xl font-semibold tracking-tight text-text [text-wrap:balance]">
        {story.title}
      </h1>
      <p className="mt-4 text-base text-text-2">
        Read mode rendering arrive en Story 4.2 (Epic 4). En attendant, voici la story brute :
        ID <code className="font-mono text-text">{story.id}</code>, Phase <strong>{story.phase}</strong>.
      </p>
    </div>
  );
}
