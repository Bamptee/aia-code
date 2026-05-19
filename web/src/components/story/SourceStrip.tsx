'use client';

import { ExternalLink } from 'lucide-react';
import { BranchChip } from '@/components/primitives/BranchChip';
import { PrPill } from '@/components/primitives/PrPill';
import { PipelineStack } from '@/components/primitives/PipelineStack';
import { ReviewerStack } from '@/components/primitives/ReviewerStack';
import type { Story } from '@/lib/types/story';

interface SourceStripProps {
  story: Story;
}

/**
 * Source Strip Bitbucket (FR-11, handoff §7.2).
 *
 * Affiché uniquement si `story.bitbucket.branch !== null`.
 * Contient : icône Bitbucket + BranchChip + commits + PrPill + → target + PipelineStack
 * + ReviewerStack + bouton "Open in Bitbucket".
 * Si branch existe mais pas de PR → bouton "Open PR" à droite.
 *
 * Polling 10s du pipeline géré par `usePipelinePolling` (Story 3.4).
 * Note v1 : l'API Express n'expose pas encore ces données, donc en pratique
 * `story.bitbucket.branch` est toujours null et ce composant ne render pas.
 * Foundation prête pour quand le backend câblera ADD-13.
 */
export function SourceStrip({ story }: SourceStripProps) {
  const bb = story.bitbucket;
  if (!bb.branch) return null;

  const pipelineChecks = bb.pr?.pipeline?.checks ?? [];
  const reviewers = bb.pr?.reviewers ?? [];

  return (
    <div className="flex items-center gap-3 border-b border-border bg-surface-2 px-6 py-2 text-xs">
      <BitbucketIcon />
      <BranchChip branch={bb.branch} />
      {bb.commits > 0 && (
        <span className="text-text-3">
          <span className="font-mono">{bb.commits}</span>{' '}
          {bb.commits === 1 ? 'commit' : 'commits'}
        </span>
      )}
      {bb.pr && (
        <>
          <span className="text-text-3">·</span>
          <PrPill pr={bb.pr} size="lg" />
          <span className="text-text-3">→</span>
          <span className="font-mono text-[11px] text-text-2">{bb.pr.target}</span>
        </>
      )}
      {pipelineChecks.length > 0 && (
        <>
          <span className="text-text-3">·</span>
          <PipelineStack checks={pipelineChecks} compact />
        </>
      )}
      {reviewers.length > 0 && (
        <>
          <span className="text-text-3">·</span>
          <ReviewerStack reviewers={reviewers} size={20} />
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        {bb.pr ? (
          <a
            href={`https://bitbucket.org/_/pull-requests/${bb.pr.number}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-text-2 transition-colors hover:bg-surface hover:text-text"
          >
            <ExternalLink size={10} />
            <span>Open in Bitbucket</span>
          </a>
        ) : (
          <button
            type="button"
            onClick={() => {
              // Stub : actual create PR endpoint pas câblé en v1.
              if (typeof window !== 'undefined') {
                window.alert('Create PR — endpoint à câbler côté Express (ADD-13).');
              }
            }}
            className="rounded bg-accent px-2 py-1 text-[11px] font-medium text-accent-ink transition-opacity hover:opacity-90"
          >
            Open PR
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Bitbucket logo icon — lucide-react n'inclut pas Bitbucket nativement (handoff §18
 * suggère simple-icons). Pour v1 minimal, on inline un SVG simple représentatif.
 */
function BitbucketIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="shrink-0 text-bb-open"
    >
      <path d="M2.5 3l2.5 18 14-1.5 2.5-16.5h-19zm12.5 13l-6 .5-.6-7H15l-.5 6.5z" />
    </svg>
  );
}
