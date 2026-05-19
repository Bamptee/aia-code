import type { Check } from '@/lib/types/bitbucket';
import { PipelineDot } from './PipelineDot';

interface PipelineStackProps {
  checks: Check[];
  compact?: boolean;
}

/**
 * Inline row of pipeline check dots (handoff §13).
 * Used in SourceStrip and (compact) Library rows.
 */
export function PipelineStack({ checks, compact = false }: PipelineStackProps) {
  if (checks.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {checks.map((c, i) => (
        <PipelineDot key={i} status={c.status} label={c.name} compact={compact} />
      ))}
    </span>
  );
}
