'use client';

import { useEffect, useState } from 'react';
import { ListChecks, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { Skeleton } from '@/components/primitives/Skeleton';
import { useToast } from '@/components/primitives/Toast';
import {
  useClickUpSettings,
  useUpdateClickUpSettings,
  useTestConnection,
  useDisconnect,
} from '@/lib/hooks/useSettings';
import type { ClickUpSettings, EpicMappingMode } from '@/lib/types/settings';
import { PanelChrome, Field, PanelActions } from './PanelChrome';
import { ConfirmModal } from './ConfirmModal';
import { TestBadge } from './TestBadge';

const EPIC_MAPPING_LABELS: Record<EpicMappingMode, string> = {
  folder: 'As ClickUp folder',
  list: 'As ClickUp list',
  tag: 'As tag on tasks',
};

const REVEAL_DURATION_MS = 10_000;

/**
 * ClickUp Settings panel (FR-21, Story 7.3).
 * API key masquée (Reveal 10s) · workspace/list · epic mapping · status mapping table.
 */
export function ClickUpPanel() {
  const { data: settings, isLoading } = useClickUpSettings();
  const update = useUpdateClickUpSettings();
  const test = useTestConnection('clickup');
  const disconnect = useDisconnect('clickup');
  const toast = useToast();

  const [draft, setDraft] = useState<ClickUpSettings | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!revealed) return;
    const id = setTimeout(() => setRevealed(false), REVEAL_DURATION_MS);
    return () => clearTimeout(id);
  }, [revealed]);

  if (isLoading || !settings) {
    return (
      <PanelChrome logo={<ListChecks size={18} className="text-text-2" />} title="ClickUp">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </PanelChrome>
    );
  }

  const data = draft ?? settings;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(settings);
  const change = (patch: Partial<ClickUpSettings>) =>
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
  const onDisconnect = async () => {
    setConfirmOpen(false);
    try {
      await disconnect.mutateAsync();
      toast.success('Disconnected');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  };


  return (
    <PanelChrome
      logo={<ListChecks size={18} className="text-text-2" />}
      title="ClickUp"
      subtitle={
        <>
          Tasks generated from <code className="font-mono">dev-plan</code> outputs sync both ways with your ClickUp list.
        </>
      }
      state={settings?.state ?? 'unknown'}
      rightSlot={
        <>
          {dirty && <span className="text-[11px] text-amber">Unsaved changes</span>}
          <TestBadge
            key={test.submittedAt}
            result={test.data}
            pending={test.isPending}
          />
        </>
      }
    >
      <Field label="API key" hint="Stored in .env as CLICKUP_API_KEY. Revealed for 10s.">
        <div className="flex items-center gap-2">
          <input
            // Toujours type=password quand non revealed (vraie masque du browser, pas
            // un masque texte qui corromprait apiKey à la saisie — review Epic 7 P1).
            type={revealed ? 'text' : 'password'}
            value={data.apiKey}
            onChange={(e) => change({ apiKey: e.target.value })}
            placeholder="pk_…"
            className="flex-1 rounded border border-border bg-surface px-2 py-1.5 font-mono text-sm text-text outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? 'Hide key' : 'Reveal key'}
            className="rounded border border-border bg-surface p-1.5 text-text-2 transition-colors hover:bg-surface-hover hover:text-text"
          >
            {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
      </Field>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Default workspace">
          <input
            type="text"
            value={data.workspace}
            onChange={(e) => change({ workspace: e.target.value })}
            className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
          />
        </Field>
        <Field label="Default list">
          <input
            type="text"
            value={data.list}
            onChange={(e) => change({ list: e.target.value })}
            className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
          />
        </Field>
      </div>
      <Field label="Epic mapping" hint="How AIA epics map onto ClickUp's hierarchy.">
        <select
          value={data.epicMapping}
          onChange={(e) => change({ epicMapping: e.target.value as EpicMappingMode })}
          className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
        >
          {(['folder', 'list', 'tag'] as EpicMappingMode[]).map((m) => (
            <option key={m} value={m}>
              {EPIC_MAPPING_LABELS[m]}
            </option>
          ))}
        </select>
      </Field>

      <div className="rounded border border-border bg-surface-2 p-3">
        <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-3">Status mapping</h4>
        <div className="grid grid-cols-[1fr_max-content_1fr] items-center gap-x-3 gap-y-2 text-sm">
          {data.statusMapping.map((row, i) => (
            <div key={i} className="contents">
              <input
                type="text"
                value={row.aia}
                onChange={(e) => {
                  const next = [...data.statusMapping];
                  next[i] = { ...next[i], aia: e.target.value };
                  change({ statusMapping: next });
                }}
                className="rounded border border-transparent bg-surface px-2 py-1 text-[12px] text-text outline-none focus:border-accent"
              />
              <span className="text-text-3">→</span>
              <input
                type="text"
                value={row.clickup}
                onChange={(e) => {
                  const next = [...data.statusMapping];
                  next[i] = { ...next[i], clickup: e.target.value };
                  change({ statusMapping: next });
                }}
                className="rounded border border-transparent bg-surface px-2 py-1 font-mono text-[12px] text-text outline-none focus:border-accent"
              />
            </div>
          ))}
        </div>
      </div>

      <PanelActions>
        <button
          type="button"
          onClick={() => test.mutate()}
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
        title="Disconnect ClickUp?"
        body="Task sync will stop. Existing tasks stay visible but won't be updated until you reconnect."
        confirmLabel="Disconnect"
        confirmTone="danger"
        onConfirm={onDisconnect}
        onCancel={() => setConfirmOpen(false)}
      />
    </PanelChrome>
  );
}

