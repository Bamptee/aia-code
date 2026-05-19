'use client';

import { useState } from 'react';
import { GitBranch, RefreshCw, X } from 'lucide-react';
import { PhaseBadge } from '@/components/primitives/PhaseBadge';
import { Skeleton } from '@/components/primitives/Skeleton';
import { useToast } from '@/components/primitives/Toast';
import {
  useBitbucketSettings,
  useUpdateBitbucketSettings,
  useTestConnection,
  useDisconnect,
} from '@/lib/hooks/useSettings';
import type { BitbucketSettings } from '@/lib/types/settings';
import type { Phase, StepKey } from '@/lib/types/step';
import { PanelChrome, Field, PanelActions } from './PanelChrome';
import { ConfirmModal } from './ConfirmModal';
import { TestBadge } from './TestBadge';

const PHASES: Phase[] = ['product', 'dev', 'qa', 'done'];
const STEPS: StepKey[] = [
  'init',
  'brainstorming',
  'spec-func',
  'spec-tech',
  'dev-plan',
  'implement',
  'review',
];

/**
 * Bitbucket Settings panel (FR-19, AC Story 7.1).
 *
 * Champs : workspace, repo, branch pattern, phase→target-branch mapping table,
 * required-pipelines-per-step list. Save activé si dirty + indicateur "Unsaved changes".
 * Test connection : spinner + pastille verte/rouge 5s. Disconnect : modal confirm.
 */
export function BitbucketPanel() {
  const { data: settings, isLoading } = useBitbucketSettings();
  const update = useUpdateBitbucketSettings();
  const test = useTestConnection('bitbucket');
  const disconnect = useDisconnect('bitbucket');
  const toast = useToast();

  const [draft, setDraft] = useState<BitbucketSettings | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (isLoading || !settings) {
    return (
      <PanelChrome logo={<GitBranch size={18} className="text-text-2" />} title="Bitbucket">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </PanelChrome>
    );
  }

  const data = draft ?? settings;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(settings);
  const change = (patch: Partial<BitbucketSettings>) =>
    setDraft({ ...(draft ?? settings), ...patch });

  const onSave = async () => {
    if (!dirty || !draft) return;
    try {
      await update.mutateAsync({ patch: draft });
      setDraft(null);
      toast.success('Saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const onTest = () => test.mutate();
  const onDisconnect = async () => {
    setConfirmOpen(false);
    try {
      await disconnect.mutateAsync();
      toast.success('Disconnected');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  };

  const right = (
    <>
      {dirty && <span className="text-[11px] text-amber">Unsaved changes</span>}
      <TestBadge
        key={test.submittedAt}
        result={test.data}
        pending={test.isPending}
      />
    </>
  );

  return (
    <PanelChrome
      logo={<GitBranch size={18} className="text-text-2" />}
      title="Bitbucket"
      subtitle={
        <>
          Branches, PRs and pipelines for the <code className="font-mono">implement</code> and{' '}
          <code className="font-mono">review</code> steps.
        </>
      }
      state={settings?.state ?? 'unknown'}
      rightSlot={right}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Workspace">
          <input
            type="text"
            value={data.workspace}
            onChange={(e) => change({ workspace: e.target.value })}
            className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
          />
        </Field>
        <Field label="Repository">
          <input
            type="text"
            value={data.repo}
            onChange={(e) => change({ repo: e.target.value })}
            className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
          />
        </Field>
      </div>
      <Field
        label="Branch pattern"
        hint={
          <>
            Tokens : <code className="font-mono">{'{type}'}</code> · <code className="font-mono">{'{slug}'}</code> ·{' '}
            <code className="font-mono">{'{story}'}</code>
          </>
        }
      >
        <input
          type="text"
          value={data.branchPattern}
          onChange={(e) => change({ branchPattern: e.target.value })}
          className="rounded border border-border bg-surface px-2 py-1.5 font-mono text-sm text-text outline-none focus:border-accent"
        />
      </Field>

      <div className="rounded border border-border bg-surface-2 p-3">
        <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-3">
          Merge targets per phase
        </h4>
        <div className="grid grid-cols-[max-content_max-content_1fr] items-center gap-x-3 gap-y-2 text-sm">
          {PHASES.map((phase) => (
            <div key={phase} className="contents">
              <PhaseBadge phase={phase} />
              <span className="text-text-3">→</span>
              <input
                type="text"
                value={data.phaseTargets[phase]}
                onChange={(e) =>
                  change({
                    phaseTargets: { ...data.phaseTargets, [phase]: e.target.value },
                  })
                }
                placeholder="branch name"
                className="rounded border border-border bg-surface px-2 py-1 font-mono text-[12px] text-text outline-none focus:border-accent"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded border border-border bg-surface-2 p-3">
        <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-3">
          Required pipelines per step
        </h4>
        <div className="space-y-2 text-sm">
          {STEPS.map((step) => (
            <PipelinesEditor
              key={step}
              step={step}
              checks={data.stepPipelines[step] ?? []}
              onChange={(next) =>
                change({
                  stepPipelines: { ...data.stepPipelines, [step]: next },
                })
              }
            />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-text-3">
          Story can&apos;t be marked done until every pipeline in{' '}
          <code className="font-mono">review</code> is green.
        </p>
      </div>

      <PanelActions>
        <button
          type="button"
          onClick={onTest}
          disabled={test.isPending}
          className="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-3 py-1.5 text-xs text-text-2 transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-50"
        >
          <RefreshCw size={12} className={test.isPending ? 'animate-spin' : ''} />
          Test connection
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || update.isPending}
          className="inline-flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="ml-auto text-xs text-red transition-opacity hover:opacity-80"
        >
          Disconnect
        </button>
      </PanelActions>

      <ConfirmModal
        open={confirmOpen}
        title="Disconnect Bitbucket?"
        body="Stories in dev/review phases will lose source-control context until you reconnect."
        confirmLabel="Disconnect"
        confirmTone="danger"
        onConfirm={onDisconnect}
        onCancel={() => setConfirmOpen(false)}
      />
    </PanelChrome>
  );
}

/**
 * Sous-éditeur des pipelines (tag chips + input add-on-Enter).
 * Évite le bug original "virgule dans input" qui découpait la saisie en cours.
 */
function PipelinesEditor({
  step,
  checks,
  onChange,
}: {
  step: string;
  checks: string[];
  onChange: (next: string[]) => void;
}) {
  const [pending, setPending] = useState('');

  const commit = () => {
    const v = pending.trim();
    if (!v) return;
    if (!checks.includes(v)) onChange([...checks, v]);
    setPending('');
  };

  const remove = (c: string) => onChange(checks.filter((x) => x !== c));

  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-x-3">
      <span className="pt-1.5 font-mono text-[11px] text-text-3">{step}</span>
      <div className="flex flex-wrap items-center gap-1 rounded border border-border bg-surface px-2 py-1">
        {checks.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text-2"
          >
            {c}
            <button
              type="button"
              onClick={() => remove(c)}
              aria-label={`Remove ${c}`}
              className="text-text-3 hover:text-red"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={pending}
          onChange={(e) => setPending(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Backspace' && !pending && checks.length > 0) {
              onChange(checks.slice(0, -1));
            }
          }}
          onBlur={commit}
          placeholder={checks.length === 0 ? 'lint, typecheck, e2e (Enter to add)' : ''}
          className="min-w-[120px] flex-1 bg-transparent font-mono text-[12px] text-text outline-none"
        />
      </div>
    </div>
  );
}
