'use client';

import type { ReactElement } from 'react';
import { BookOpen, X, GitMerge, GitCommit, FileText, Link2 } from 'lucide-react';
import { Avatar } from '@/components/primitives/Avatar';
import { Skeleton } from '@/components/primitives/Skeleton';
import { useStoryDoneQuery } from '@/lib/hooks/useStoryDoneQuery';
import { setSearchParam } from '@/lib/url/setParam';
import { STEP_KEYS, type StepKey, type Phase } from '@/lib/types/step';
import type { Story } from '@/lib/types/story';
import type { Artifact, StoryDone } from '@/lib/types/storyDone';

interface ReadModeProps {
  story: Story;
}

/**
 * ReadMode (FR-14, handoff §8).
 *
 * Article éditorial rendu pour les stories `phase=done` (default) ou via toggle manuel
 * (`?read=1` sur n'importe quelle story). Layout 720px max-width centré, 10 sections.
 * Placeholder si payload absent (story pas encore générée côté backend).
 *
 * URL state : `?read=0` force le workspace même si phase=done (cf. StoryWorkspace).
 */
export function ReadMode({ story }: ReadModeProps) {
  const { data, isLoading } = useStoryDoneQuery(story.slug);
  const exit = () => setSearchParam('read', story.phase === 'done' ? '0' : null);

  if (isLoading) {
    return (
      <article className="mx-auto max-w-[720px] px-8 py-10">
        <TopBar shippedAt={null} onExit={exit} />
        <Skeleton className="mt-8 h-4 w-40" />
        <Skeleton className="mt-4 h-10 w-3/4" />
        <Skeleton className="mt-3 h-20 w-full" />
      </article>
    );
  }

  if (!data) {
    return (
      <article className="mx-auto max-w-[720px] px-8 py-10">
        <TopBar shippedAt={null} onExit={exit} />
        <div className="mt-10 text-xs font-medium uppercase tracking-wider text-text-3">
          <span className="font-mono">{story.id}</span> · Read mode
        </div>
        <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight text-text [text-wrap:balance]">
          {story.title}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-text-3">
          Read mode hasn&apos;t been generated yet. It builds itself as the story progresses through each step.
        </p>
      </article>
    );
  }

  return (
    <article className="mx-auto max-w-[720px] px-8 py-10">
      <TopBar shippedAt={data.shippedAt} onExit={exit} />
      <Kicker story={story} data={data} />
      <h1 className="mt-3 text-[44px] font-semibold leading-[1.05] tracking-tight text-text [text-wrap:balance]">
        {data.hero}
      </h1>
      <p className="mt-5 text-[18px] leading-relaxed text-text-2">{data.lede}</p>

      <StoryArc story={story} />
      <Outcome data={data} />
      <HowWeGotHere data={data} />
      <Decisions data={data} />
      <Artifacts story={story} data={data} />
      <Learnings data={data} />
    </article>
  );
}

function TopBar({ shippedAt, onExit }: { shippedAt: string | null; onExit: () => void }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="inline-flex items-center gap-1.5 rounded bg-accent-soft px-2 py-1 font-medium text-accent">
        <BookOpen size={12} />
        Read mode
      </span>
      {shippedAt && (
        <span className="text-text-3">Shipped {formatShipped(shippedAt)}</span>
      )}
      <button
        type="button"
        onClick={onExit}
        className="ml-auto inline-flex items-center gap-1.5 rounded border border-border px-2 py-1 text-text-2 transition-colors hover:bg-surface-hover hover:text-text"
      >
        <X size={12} />
        Exit read mode
      </button>
    </div>
  );
}

function Kicker({ story, data }: { story: Story; data: StoryDone }) {
  const parts: string[] = [story.id];
  if (story.epicId) parts.push(story.epicId);
  if (data.durationDays > 0) parts.push(`${data.durationDays}d`);

  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-text-3">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-2">
          <span className={i === 0 ? 'font-mono' : ''}>{p}</span>
          {i < parts.length - 1 && <span>·</span>}
        </span>
      ))}
      {data.crew.length > 0 && (
        <>
          <span>·</span>
          <span className="flex items-center">
            {data.crew.map((c, i) => (
              <span
                key={c}
                style={{ marginLeft: i === 0 ? 0 : -6 }}
                className="ring-2 ring-bg"
              >
                <Avatar initials={c} size={18} />
              </span>
            ))}
          </span>
        </>
      )}
    </div>
  );
}

const PHASE_BY_STEP_CHAPTER: Record<StepKey, Phase> = {
  init: 'product',
  brainstorming: 'product',
  'spec-func': 'product',
  'spec-tech': 'dev',
  'dev-plan': 'dev',
  implement: 'dev',
  review: 'dev',
};

function StoryArc({ story }: { story: Story }) {
  const labelByStep: Record<StepKey, string> = {
    init: 'Init',
    brainstorming: 'Brain',
    'spec-func': 'Spec',
    'spec-tech': 'Tech',
    'dev-plan': 'Plan',
    implement: 'Impl',
    review: 'Rev',
  };

  return (
    <section className="mt-10">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-text-3">Story arc</h2>
      <div className="mt-3 grid grid-cols-7 gap-1 overflow-hidden rounded">
        {STEP_KEYS.map((key) => {
          const status = story.steps[key]?.status;
          const phase = PHASE_BY_STEP_CHAPTER[key];
          return (
            <div
              key={key}
              title={`${labelByStep[key]} — ${status ?? 'pending'}`}
              className={
                'flex h-7 items-center justify-center text-[10px] font-medium ' +
                segmentClass(phase, status)
              }
            >
              {labelByStep[key]}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function segmentClass(phase: Phase, status: string | undefined): string {
  if (status === 'skipped') {
    return 'border border-dashed border-border text-text-3';
  }
  if (status === 'pending' || !status) {
    return 'bg-surface-2 text-text-3';
  }
  if (phase === 'product') return 'bg-phase-product-soft text-phase-product';
  if (phase === 'dev') return 'bg-phase-dev-soft text-phase-dev';
  if (phase === 'qa') return 'bg-phase-qa-soft text-phase-qa';
  return 'bg-surface-2 text-text-3';
}

function Outcome({ data }: { data: StoryDone }) {
  if (data.outcome.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-text-3">Outcome</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data.outcome.map((kpi, i) => (
          <div key={i} className="rounded border border-border bg-surface p-3">
            <div className="text-[11px] text-text-3">{kpi.label}</div>
            <div className="mt-1 text-xl font-semibold tracking-tight text-text">{kpi.value}</div>
            {kpi.delta && (
              <div className={'mt-0.5 text-[11px] ' + deltaToneClass(kpi.delta)}>
                {kpi.delta}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function deltaToneClass(delta: string): string {
  const trimmed = delta.trim();
  // Seuls les prefixes explicites + / - / − colorent. Pas de regex permissive sur
  // "42%" qui virerait vert sans intention de signe (review Epic 4 P3).
  if (trimmed.startsWith('+')) return 'text-green';
  if (trimmed.startsWith('-') || trimmed.startsWith('−')) return 'text-red';
  return 'text-text-3';
}

function HowWeGotHere({ data }: { data: StoryDone }) {
  if (data.chapters.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-text-3">How we got here</h2>
      <ol className="mt-4 space-y-6 border-l border-border pl-5">
        {data.chapters.map((ch, i) => {
          const phase: Phase = ch.step ? PHASE_BY_STEP_CHAPTER[ch.step] : 'product';
          return (
            <li key={i} className="relative">
              <span
                aria-hidden
                className={
                  'absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-bg ' +
                  (phase === 'dev' ? 'bg-phase-dev' : 'bg-phase-product')
                }
              />
              <div className="flex flex-wrap items-baseline gap-x-2 text-[11px] uppercase tracking-wider text-text-3">
                {ch.kicker && <span>{ch.kicker}</span>}
                {ch.kicker && ch.when && <span>·</span>}
                {ch.when && <span>{ch.when}</span>}
              </div>
              <h3 className="mt-1 text-[20px] font-semibold leading-tight tracking-tight text-text [text-wrap:balance]">
                {ch.title}
              </h3>
              <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-text-2">
                {ch.body.split(/\n\n+/).map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
              </div>
              {ch.callouts && ch.callouts.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {ch.callouts.map((co, j) => (
                    <span
                      key={j}
                      className="rounded border border-border bg-surface-2 px-2 py-1 text-[11px] text-text-2"
                    >
                      {co}
                    </span>
                  ))}
                </div>
              )}
              {ch.commitHash && (
                <div className="mt-3 inline-flex items-center gap-2 rounded border border-border bg-surface px-2 py-1 text-[11px] text-text-2">
                  <GitCommit size={12} className="text-text-3" />
                  <code className="font-mono text-text">{ch.commitHash.slice(0, 7)}</code>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Decisions({ data }: { data: StoryDone }) {
  if (data.decisions.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-text-3">Decisions, in order</h2>
      <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
        {data.decisions.map((d, i) => (
          <div key={i} className="contents">
            <dt className="text-[12px] text-text-3">{d.when || '—'}</dt>
            <dd className="text-text-2">{d.note}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Artifacts({ story, data }: { story: Story; data: StoryDone }) {
  const pr = story.bitbucket?.pr;
  const cards: ReactElement[] = [];

  if (pr) {
    cards.push(
      <div
        key="pr"
        className="flex items-start gap-3 rounded border border-border bg-surface p-3"
      >
        <span
          className="inline-flex h-6 items-center justify-center rounded px-2 text-[10px] font-semibold"
          style={{ background: 'var(--bb-merged-soft)', color: 'var(--bb-merged)' }}
        >
          PR
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium text-text">
            <GitMerge size={12} style={{ color: 'var(--bb-merged)' }} />
            <span className="font-mono">#{pr.number}</span>
            <span className="truncate">{pr.title}</span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-text-3">
            {story.bitbucket?.branch ?? 'branch'} → {pr.target} · <span className="text-green">+{pr.additions}</span>{' '}
            <span className="text-red">−{pr.deletions}</span>
          </div>
        </div>
      </div>,
    );
  }

  data.artifacts.forEach((a, i) => {
    cards.push(<ArtifactCard key={`a-${i}`} artifact={a} />);
  });

  if (cards.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-text-3">Artifacts</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{cards}</div>
    </section>
  );
}

const ARTIFACT_ICONS: Record<Artifact['type'], { Icon: typeof FileText; label: string }> = {
  pr: { Icon: GitMerge, label: 'PR' },
  commit: { Icon: GitCommit, label: 'Commit' },
  doc: { Icon: FileText, label: 'Doc' },
  link: { Icon: Link2, label: 'Link' },
};

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const { Icon, label } = ARTIFACT_ICONS[artifact.type];
  const className =
    'flex items-start gap-3 rounded border border-border bg-surface p-3 transition-colors hover:bg-surface-hover';
  const inner = (
    <>
      <span className="inline-flex h-6 items-center justify-center rounded bg-surface-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-text-2">
        {label}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-medium text-text">
          <Icon size={12} className="text-text-3" />
          <span className="truncate">{artifact.title}</span>
        </div>
        {artifact.meta && (
          <div className="mt-0.5 truncate text-[11px] text-text-3">{artifact.meta}</div>
        )}
      </div>
    </>
  );

  if (artifact.url) {
    return (
      <a href={artifact.url} target="_blank" rel="noopener noreferrer" className={className}>
        {inner}
      </a>
    );
  }
  return <div className={className}>{inner}</div>;
}

function Learnings({ data }: { data: StoryDone }) {
  if (data.learnings.length === 0) return null;
  return (
    <section className="mt-10 mb-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-text-3">What we learned</h2>
      <ol className="mt-3 space-y-3 text-[15px] leading-relaxed text-text-2">
        {data.learnings.map((l, i) => {
          const n = l.number > 0 ? l.number : i + 1;
          return (
            <li key={i} className="flex gap-3">
              <span className="font-mono text-[12px] text-text-3 tabular-nums">
                {String(n).padStart(2, '0')}
              </span>
              <span>{l.text}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function formatShipped(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}
