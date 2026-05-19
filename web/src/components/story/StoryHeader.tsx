'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { Share2, BookOpen, ListChecks, MoreHorizontal } from 'lucide-react';
import { PhaseBadge } from '@/components/primitives/PhaseBadge';
import { TypeBadge } from '@/components/primitives/TypeBadge';
import { CuPill } from '@/components/primitives/CuPill';
import { useToast } from '@/components/primitives/Toast';
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
  const isReadMode = searchParams?.get('read') === '1';
  const toast = useToast();
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
    setSearchParam('read', isReadMode ? null : '1');
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

  return (
    <div className="border-b border-border bg-surface px-6 py-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-text-3">{story.id}</span>
        {story.epicId && (
          <>
            <span className="text-text-3">·</span>
            <span className="text-xs text-text-2">{story.epicId}</span>
          </>
        )}
        <span className="text-text-3">·</span>
        <PhaseBadge phase={story.phase} />
        <TypeBadge type={story.type} />
        <CuPill state={story.cu} taskCount={story.cuTaskCount} />
        {story.bitbucket.pr && (
          <span className="font-mono text-[11px] text-text-2">
            PR#{story.bitbucket.pr.number}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Link
            href={tasksDisabled ? '#' : `/tasks?story=${story.slug}`}
            aria-disabled={tasksDisabled}
            onClick={(e) => tasksDisabled && e.preventDefault()}
            className={
              'inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs transition-colors ' +
              (tasksDisabled
                ? 'cursor-not-allowed text-text-3 opacity-50'
                : 'text-text-2 hover:bg-surface-hover hover:text-text')
            }
          >
            <ListChecks size={12} />
            <span className="font-mono">
              {story.tasksDone}/{story.tasksTotal}
            </span>
          </Link>
          <button
            type="button"
            onClick={toggleRead}
            className={
              'inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs transition-colors ' +
              (isReadMode
                ? 'bg-accent text-accent-ink'
                : 'text-text-2 hover:bg-surface-hover hover:text-text')
            }
          >
            <BookOpen size={12} />
            <span>Read</span>
          </button>
          <button
            type="button"
            onClick={share}
            aria-label="Share story link"
            className="rounded border border-border p-1.5 text-text-2 transition-colors hover:bg-surface-hover hover:text-text"
          >
            <Share2 size={12} />
          </button>
          <div ref={kebabRef} className="relative">
            <button
              type="button"
              onClick={() => setKebabOpen((o) => !o)}
              aria-label="More actions"
              aria-expanded={kebabOpen}
              className="rounded border border-border p-1.5 text-text-2 transition-colors hover:bg-surface-hover hover:text-text"
            >
              <MoreHorizontal size={12} />
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

      <h1 className="mt-2 truncate text-[17px] font-semibold text-text">
        {story.title}
      </h1>
    </div>
  );
}
