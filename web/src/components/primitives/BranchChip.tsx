import { GitBranch } from 'lucide-react';

interface BranchChipProps {
  branch: string;
}

/**
 * Branch name chip (handoff §13 + .branch-chip CSS lignes 194-208).
 *
 * Format rounded-4px (tag style), font-mono, max-width 240px.
 */
export function BranchChip({ branch }: BranchChipProps) {
  return (
    <span
      className="inline-flex items-center gap-[5px] rounded-[4px] border border-border bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-text-2"
      title={branch}
    >
      <GitBranch size={11} className="text-text-3" />
      <span className="max-w-[240px] truncate">{branch}</span>
    </span>
  );
}
