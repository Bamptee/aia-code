'use client';

import { useMemo, useState } from 'react';
import { Sparkles, Plus, Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/primitives/Skeleton';
import { useToast } from '@/components/primitives/Toast';
import { useModelsConfig, useUpdateModelsConfig } from '@/lib/hooks/useSettings';
import type { ModelAssignment, ModelsConfig } from '@/lib/types/settings';
import type { StepKey } from '@/lib/types/step';
import { PanelChrome } from './PanelChrome';

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
 * AI models per step panel (FR-22, Story 7.4).
 *
 * Table 7 lignes step → modèles + poids. Validation : au moins 1 modèle par step
 * (Save bloqué sinon). Poids non-1 = info-bulle indique normalisation runtime.
 */
export function ModelsPanel() {
  const { data: config, isLoading } = useModelsConfig();
  const update = useUpdateModelsConfig();
  const toast = useToast();

  const [draft, setDraft] = useState<ModelsConfig | null>(null);

  const data = draft ?? config;

  const errors = useMemo(() => {
    if (!data) return {} as Partial<Record<StepKey, string>>;
    const out: Partial<Record<StepKey, string>> = {};
    for (const step of STEPS) {
      const assignments = data[step] ?? [];
      if (assignments.length === 0 || assignments.every((a) => !a.name.trim())) {
        out[step] = 'At least one model required';
      }
    }
    return out;
  }, [data]);

  const hasErrors = Object.keys(errors).length > 0;
  const dirty = draft !== null && config !== undefined && JSON.stringify(config) !== JSON.stringify(draft);

  if (isLoading || !data) {
    return (
      <PanelChrome
        logo={<Sparkles size={18} className="text-text-2" />}
        title="AI models per step"
      >
        <Skeleton className="h-32 w-full" />
      </PanelChrome>
    );
  }

  const updateAssignments = (step: StepKey, next: ModelAssignment[]) => {
    setDraft({ ...(draft ?? data), [step]: next });
  };

  const onSave = async () => {
    if (hasErrors || !dirty || !draft) return;
    try {
      await update.mutateAsync({ patch: draft });
      setDraft(null);
      toast.success('Saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  return (
    <PanelChrome
      logo={<Sparkles size={18} className="text-text-2" />}
      title="AI models per step"
      subtitle="Each of the 7 steps can use a different provider. Weighted random selection supported."
      rightSlot={dirty && <span className="text-[11px] text-amber">Unsaved changes</span>}
    >
      <div className="space-y-3">
        {STEPS.map((step) => {
          const assignments = data[step] ?? [];
          const total = assignments.reduce((s, a) => s + a.weight, 0);
          const needsNormalize = Math.abs(total - 1) > 0.001 && assignments.length > 1;
          const err = errors[step];
          return (
            <div
              key={step}
              className={
                'rounded border bg-surface-2 p-3 ' +
                (err ? 'border-red' : 'border-border')
              }
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-[11px] text-text-3">{step}</span>
                {needsNormalize && (
                  <span
                    title={`Weights sum to ${total.toFixed(2)}, normalized at runtime to 1.0.`}
                    className="text-[10px] text-amber"
                  >
                    weights → normalized
                  </span>
                )}
                {err && <span className="text-[10px] text-red">{err}</span>}
                <button
                  type="button"
                  onClick={() =>
                    updateAssignments(step, [...assignments, { name: '', weight: 1 }])
                  }
                  className="ml-auto inline-flex items-center gap-1 text-[11px] text-text-3 hover:text-text"
                >
                  <Plus size={12} />
                  Add model
                </button>
              </div>
              <div className="space-y-2">
                {assignments.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={a.name}
                      onChange={(e) => {
                        const next = [...assignments];
                        next[i] = { ...next[i], name: e.target.value };
                        updateAssignments(step, next);
                      }}
                      placeholder="model id (e.g. claude-opus-4-6)"
                      className="flex-1 rounded border border-border bg-surface px-2 py-1 font-mono text-[12px] text-text outline-none focus:border-accent"
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.05}
                      value={a.weight}
                      onChange={(e) => {
                        const next = [...assignments];
                        next[i] = { ...next[i], weight: Number(e.target.value) || 0 };
                        updateAssignments(step, next);
                      }}
                      className="w-20 rounded border border-border bg-surface px-2 py-1 text-right font-mono text-[12px] text-text outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => updateAssignments(step, assignments.filter((_, j) => j !== i))}
                      aria-label={`Remove ${a.name || 'model'}`}
                      className="rounded border border-border bg-surface p-1 text-text-3 transition-colors hover:bg-surface-hover hover:text-red"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || hasErrors || update.isPending}
          className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
        >
          Save
        </button>
        {hasErrors && (
          <span className="text-[11px] text-red">
            Fix steps without active model before saving.
          </span>
        )}
      </div>
    </PanelChrome>
  );
}
