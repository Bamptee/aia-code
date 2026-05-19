import type { Reviewer } from '@/lib/types/bitbucket';
import { Avatar } from './Avatar';

interface ReviewerStackProps {
  reviewers: Reviewer[];
  size?: number;
}

const STATUS_MARKER: Record<Reviewer['status'], { char: string; color: string }> = {
  approved: { char: '✓', color: 'var(--green)' },
  'requested-changes': { char: '✕', color: 'var(--red)' },
  pending: { char: '·', color: 'var(--text-3)' },
};

/**
 * Overlapping avatars with corner status marker (handoff §13).
 * Used in SourceStrip pour la liste des reviewers.
 */
export function ReviewerStack({ reviewers, size = 22 }: ReviewerStackProps) {
  if (reviewers.length === 0) return null;
  return (
    <span className="inline-flex items-center -space-x-1.5">
      {reviewers.map((r, i) => {
        const marker = STATUS_MARKER[r.status];
        return (
          <span
            key={i}
            className="relative inline-block"
            title={`${r.name} · ${r.status}`}
            style={{ zIndex: reviewers.length - i }}
          >
            <Avatar initials={r.initials} size={size} />
            <span
              aria-hidden="true"
              className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-surface bg-surface text-[8px] font-bold"
              style={{ color: marker.color }}
            >
              {marker.char}
            </span>
          </span>
        );
      })}
    </span>
  );
}
