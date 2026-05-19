'use client';

import { useSearchParams } from 'next/navigation';
import { StoryHeader } from './StoryHeader';
import { SourceStrip } from './SourceStrip';
import { StepRail } from './StepRail';
import { DocPane } from './DocPane';
import { ChatPane } from './ChatPane';
import { ReadMode } from './ReadMode';
import type { Story } from '@/lib/types/story';

interface StoryWorkspaceProps {
  story: Story;
}

/**
 * Story Workspace shell (FR-9 à FR-13).
 *
 * Read mode (FR-14, AC Story 4.2) :
 * - `?read=1` → force ReadMode
 * - `?read=0` → force workspace (exit explicite quand phase=done)
 * - sinon : phase==='done' → ReadMode, autres phases → workspace
 */
export function StoryWorkspace({ story }: StoryWorkspaceProps) {
  const searchParams = useSearchParams();
  const readParam = searchParams?.get('read');
  const isReadMode =
    readParam === '1' || (readParam !== '0' && story.phase === 'done');

  if (isReadMode) {
    return <ReadMode story={story} />;
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
