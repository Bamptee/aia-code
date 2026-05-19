import { EmptyStep } from '@/components/primitives/EmptyStep';
import { PipelineStack } from '@/components/primitives/PipelineStack';
import type { Story } from '@/lib/types/story';

interface ImplementContentProps {
  story: Story;
}

/**
 * `implement` step — handoff §7.4 : CI pipeline card + commit card + diff view
 * + Next steps + actions (Approve & open PR / Run review / Iterate).
 *
 * V1 minimal : pipeline stub + empty state global. Real commits + diff arrivent
 * quand Express expose `/api/features/:name/commits` (ADD-13).
 */
export function ImplementContent({ story }: ImplementContentProps) {
  const pipeline = story.bitbucket.pr?.pipeline;
  const hasPipeline = pipeline && pipeline.checks.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {hasPipeline && (
        <section className="rounded border border-border bg-surface px-4 py-[14px]">
          <header className="mb-3 flex items-center justify-between">
            <h3 className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-text-3">
              CI Pipeline
            </h3>
            <span className="font-mono text-[11px] text-text-3">
              {pipeline.buildId ?? '—'}
            </span>
          </header>
          <PipelineStack checks={pipeline.checks} />
          <p className="mt-2 font-mono text-[11px] text-text-3">
            {pipeline.status} · {pipeline.duration}
          </p>
        </section>
      )}
      <EmptyStep
        title="Implementation not run yet"
        description="Generate code with Claude/Codex/Gemini, then push to Bitbucket to see the diff and pipeline."
        ctaLabel="Run implement"
        onGenerate={undefined}
      />
    </div>
  );
}
