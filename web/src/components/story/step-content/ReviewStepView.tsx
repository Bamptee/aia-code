import { EmptyStep } from '@/components/primitives/EmptyStep';
import { PrPill } from '@/components/primitives/PrPill';
import { PipelineStack } from '@/components/primitives/PipelineStack';
import { ReviewerStack } from '@/components/primitives/ReviewerStack';
import type { Story } from '@/lib/types/story';

interface ReviewStepViewProps {
  story: Story;
}

/**
 * `review` step — handoff §7.4 + §12 : drivé par `story.bitbucket.pr`.
 * Rend PR card + reviewers + pipeline + commits + actions.
 *
 * V1 minimal : si pas de PR (cas usuel sans backend Bitbucket câblé), empty state.
 * Quand PR présent, render les sections principales.
 */
export function ReviewStepView({ story }: ReviewStepViewProps) {
  const pr = story.bitbucket.pr;

  if (!pr) {
    return (
      <EmptyStep
        title="No PR yet"
        description="Push your branch and open a Pull Request to start the review process."
        ctaLabel="Open PR"
        onGenerate={undefined}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="overflow-hidden rounded border border-border bg-surface">
        <header className="flex items-start gap-3 border-b border-border px-4 py-3">
          <PrPill pr={pr} size="lg" />
          <div className="flex flex-1 flex-col gap-1">
            <h3
              className="text-[14.5px] font-semibold text-text"
              style={{ letterSpacing: '-0.005em' }}
            >
              {pr.title}
            </h3>
            <div className="flex items-center gap-2 font-mono text-[11.5px] text-text-3">
              <span>{pr.author}</span>
              <span>·</span>
              <span>
                <span className="text-green">+{pr.additions}</span>{' '}
                <span className="text-red">−{pr.deletions}</span>
              </span>
              <span>·</span>
              <span>→ {pr.target}</span>
            </div>
          </div>
        </header>

        {pr.reviewers && pr.reviewers.length > 0 && (
          <div className="flex items-center gap-2 border-b border-border px-4 py-[14px]">
            <h4 className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-text-3">
              Reviewers
            </h4>
            <ReviewerStack reviewers={pr.reviewers} />
          </div>
        )}

        {pr.pipeline && pr.pipeline.checks.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2">
            <h4 className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-text-3">
              Pipeline
            </h4>
            <PipelineStack checks={pr.pipeline.checks} />
            <span className="font-mono text-[11.5px] text-text-3">{pr.pipeline.status}</span>
          </div>
        )}
      </section>

      <p className="text-xs text-text-3">
        Commits, diff view, et actions Approve/Merge arrivent quand l&apos;API
        Express expose `/api/features/:name/bitbucket/commits` (ADD-13).
      </p>
    </div>
  );
}
