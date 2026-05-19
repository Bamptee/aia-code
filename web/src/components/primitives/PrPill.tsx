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
 * Pull Request pill (handoff §13 + .pr-pill CSS lignes 170-192).
 *
 * Format `rounded-[4px]` (pas pill 999), tout en font-mono. Affiche `<icon> #num · State`.
 * size=sm pour Library row (text-11px), size=lg pour SourceStrip (text-12px).
 */
export function PrPill({ pr, size = 'sm' }: PrPillProps) {
  const s = PR_STYLES[pr.state];
  const Icon = pr.state === 'merged' ? GitMerge : GitPullRequest;
  const isLg = size === 'lg';
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-[4px] font-mono font-medium ' +
        (isLg ? 'px-2.5 py-1 text-xs' : 'px-[7px] py-0.5 text-[11px]')
      }
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <Icon size={isLg ? 13 : 11} />
      <span>#{pr.number}</span>
      <span>·</span>
      <span>{s.label}</span>
    </span>
  );
}
