import type { StepKey, StepState } from '@/lib/types/step';
import { STEP_KEYS } from '@/lib/types/step';

interface StepMiniProps {
  steps: Partial<Record<StepKey, StepState>>;
  size?: number;
}

const STATUS_COLOR: Record<'done' | 'in-progress' | 'pending' | 'skipped', string> = {
  done: 'var(--accent)',
  'in-progress': 'var(--pipe-run)',
  pending: 'var(--surface-hover)',
  skipped: 'var(--text-3)',
};

/**
 * Compact step-dots row (handoff §13).
 * Used in Library rows pour show step progression en un coup d'œil.
 * 7 petits dots, un par step du pipeline.
 */
export function StepMini({ steps, size = 6 }: StepMiniProps) {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-0.5">
      {STEP_KEYS.map((key) => {
        const status = steps[key]?.status ?? 'pending';
        const color = STATUS_COLOR[status];
        return (
          <span
            key={key}
            className={
              'inline-block ' + (status === 'skipped' ? 'border border-dashed' : '')
            }
            style={{
              width: size,
              height: size,
              borderRadius: '50%',
              backgroundColor: status === 'skipped' ? 'transparent' : color,
              borderColor: status === 'skipped' ? color : undefined,
            }}
          />
        );
      })}
    </span>
  );
}
