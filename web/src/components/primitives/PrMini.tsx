import type { PullRequest } from '@/lib/types/bitbucket';

interface PrMiniProps {
  pr: Pick<PullRequest, 'number' | 'state'>;
}

const PR_COLORS: Record<PullRequest['state'], string> = {
  draft: 'var(--bb-draft)',
  open: 'var(--bb-open)',
  approved: 'var(--green)',
  merged: 'var(--bb-merged)',
  declined: 'var(--bb-declined)',
};

/**
 * Tiny inline `#num` indicator (handoff §13). Used in Library rows where space is tight.
 */
export function PrMini({ pr }: PrMiniProps) {
  return (
    <span
      className="font-mono text-[11px]"
      style={{ color: PR_COLORS[pr.state] }}
      title={`PR #${pr.number} · ${pr.state}`}
    >
      #{pr.number}
    </span>
  );
}
