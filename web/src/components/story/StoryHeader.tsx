'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { Share2, BookOpen, ListChecks, MoreHorizontal } from 'lucide-react';
import { PhaseBadge } from '@/components/primitives/PhaseBadge';
import { TypeBadge } from '@/components/primitives/TypeBadge';
import { CuPill } from '@/components/primitives/CuPill';
import { PrPill } from '@/components/primitives/PrPill';
import { useToast } from '@/components/primitives/Toast';
import { useEpicsQuery } from '@/lib/hooks/useEpicsQuery';
import { setSearchParam } from '@/lib/url/setParam';
import type { Story } from '@/lib/types/story';

interface StoryHeaderProps {
  story: Story;
}

/**
 * Story Workspace header (FR-12, handoff §7.1).
 * - Ligne 1 : ID mono + Epic + PhaseBadge + TypeBadge + CuPill + actions
 * - Ligne 2 : Titre 17px semibold ellipsis
 * Actions : Tasks btn (count), Read mode toggle (?read=1), Share (clipboard), kebab (Reset/Delete stubs)
 */
export function StoryHeader({ story }: StoryHeaderProps) {
  const searchParams = useSearchParams();
  const readParam = searchParams?.get('read');
  const isReadMode =
    readParam === '1' || (readParam !== '0' && story.phase === 'done');
  const toast = useToast();
  const epics = useEpicsQuery();
  const epicName = story.epicId
    ? epics.data?.find((e) => e.id === story.epicId)?.name ?? story.epicId
    : null;
  const [kebabOpen, setKebabOpen] = useState(false);
  const kebabRef = useRef<HTMLDivElement>(null);

  // Close kebab on outside click.
  useEffect(() => {
    if (!kebabOpen) return;
    const handler = (e: MouseEvent) => {
      if (kebabRef.current && !kebabRef.current.contains(e.target as Node)) {
        setKebabOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [kebabOpen]);

  const toggleRead = () => {
    if (isReadMode) {
      setSearchParam('read', story.phase === 'done' ? '0' : null);
    } else {
      setSearchParam('read', '1');
    }
  };

  const share = async () => {
    if (typeof window === 'undefined') return;
    const url = window.location.origin + window.location.pathname;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const tasksDisabled = story.tasksTotal === 0;

  // Bouton styles handoff (.btn variants) :
  // - btn-ghost : transparent, text-2, hover surface-hover/text. Pas de border.
  // - btn-secondary : bg-surface, border-border, text-text. Pas de hover bg différent.
  const btnGhost =
    'inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[13px] transition-colors text-text-2 hover:bg-surface-hover hover:text-text';
  const btnSecondary =
    'inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[13px] text-text transition-colors hover:bg-surface-hover';

  return (
    <div className="border-b border-border bg-bg px-6 py-3">
      <div className="mb-[3px] flex items-center gap-2">
        <span className="font-mono text-[11px] text-text-3">{story.id}</span>
        {epicName && (
          <>
            <span className="text-text-3">·</span>
            <span className="text-xs text-text-2">{epicName}</span>
          </>
        )}
        <PhaseBadge phase={story.phase} />
        <TypeBadge type={story.type} />
        <CuPill state={story.cu} taskCount={story.cuTaskCount} />
        {story.bitbucket.pr && <PrPill pr={story.bitbucket.pr} size="sm" />}

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href={tasksDisabled ? '#' : `/tasks?story=${story.slug}`}
            aria-disabled={tasksDisabled}
            onClick={(e) => tasksDisabled && e.preventDefault()}
            className={
              btnGhost +
              (tasksDisabled ? ' pointer-events-none opacity-50' : '')
            }
          >
            <ListChecks size={13} />
            <span>
              <span className="font-mono">{story.tasksDone}/{story.tasksTotal}</span> tasks
            </span>
          </Link>
          <button
            type="button"
            onClick={toggleRead}
            aria-pressed={isReadMode}
            className={
              isReadMode
                ? 'inline-flex items-center gap-1.5 rounded-sm bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-ink transition-opacity hover:opacity-90'
                : btnSecondary
            }
          >
            <BookOpen size={13} />
            <span>Read</span>
          </button>
          <button
            type="button"
            onClick={share}
            aria-label="Share story link"
            className={btnSecondary}
          >
            <Share2 size={13} />
            <span>Share</span>
          </button>
          <div ref={kebabRef} className="relative">
            <button
              type="button"
              onClick={() => setKebabOpen((o) => !o)}
              aria-label="More actions"
              aria-expanded={kebabOpen}
              className="inline-flex items-center rounded-sm border border-border bg-surface p-1.5 text-text transition-colors hover:bg-surface-hover"
            >
              <MoreHorizontal size={14} />
            </button>
            {kebabOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 min-w-[140px] overflow-hidden rounded border border-border bg-surface shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setKebabOpen(false);
                    toast.success(`Reset step "${story.currentStep}" — coming soon`);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-xs text-text-2 transition-colors hover:bg-surface-hover hover:text-text"
                >
                  Reset step
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setKebabOpen(false);
                    toast.error(`Delete story — coming soon`);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-xs text-red transition-colors hover:bg-surface-hover"
                >
                  Delete story
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <h1
        className="truncate text-[17px] font-semibold text-text"
        style={{ letterSpacing: '-0.016em' }}
      >
        {story.title}
      </h1>
    </div>
  );
}
