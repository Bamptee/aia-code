import { GitBranch } from 'lucide-react';

interface BranchChipProps {
  branch: string;
}

/**
 * Branch name chip (handoff §13). Used in SourceStrip.
 */
export function BranchChip({ branch }: BranchChipProps) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text-2"
      title={branch}
    >
      <GitBranch size={10} />
      <span className="max-w-[180px] truncate">{branch}</span>
    </span>
  );
}
