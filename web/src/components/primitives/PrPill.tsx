import { GitPullRequest, GitMerge } from 'lucide-react';
import type { PullRequest } from '@/lib/types/bitbucket';

interface PrPillProps {
  pr: Pick<PullRequest, 'number' | 'state'>;
  size?: 'sm' | 'lg';
}

const PR_STYLES: Record<PullRequest['state'], { bg: string; text: string; label: string }> = {
  draft: { bg: 'var(--bb-draft-soft)', text: 'var(--bb-draft)', label: 'Draft' },
  open: { bg: 'var(--bb-open-soft)', text: 'var(--bb-open)', label: 'Open' },
  approved: { bg: 'var(--green-soft)', text: 'var(--green)', label: 'Approved' },
  merged: { bg: 'var(--bb-merged-soft)', text: 'var(--bb-merged)', label: 'Merged' },
  declined: { bg: 'var(--bb-declined-soft)', text: 'var(--bb-declined)', label: 'Declined' },
};

/**
 * Pull Request pill (handoff §13). Affiche #num · State.
 * size=sm utilisé en Library row, size=lg en SourceStrip.
 */
export function PrPill({ pr, size = 'sm' }: PrPillProps) {
  const s = PR_STYLES[pr.state];
  const Icon = pr.state === 'merged' ? GitMerge : GitPullRequest;
  const isLg = size === 'lg';
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded font-medium ' +
        (isLg ? 'px-2 py-1 text-xs' : 'px-1.5 py-0.5 text-[10px]')
      }
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <Icon size={isLg ? 12 : 10} />
      <span className="font-mono">#{pr.number}</span>
      <span>·</span>
      <span>{s.label}</span>
    </span>
  );
}
