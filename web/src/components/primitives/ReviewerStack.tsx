import type { Reviewer } from '@/lib/types/bitbucket';
import { Avatar } from './Avatar';

interface ReviewerStackProps {
  reviewers: Reviewer[];
  size?: number;
}

interface Marker {
  bg: string;
  Svg: React.FC;
}

const SVG_CHECK: React.FC = () => (
  <svg viewBox="0 0 10 10" className="h-full w-full">
    <path
      d="M2 5l2 2 4-4"
      stroke="white"
      strokeWidth="1.8"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SVG_X: React.FC = () => (
  <svg viewBox="0 0 10 10" className="h-full w-full">
    <path
      d="M3 3l4 4M7 3l-4 4"
      stroke="white"
      strokeWidth="1.8"
      fill="none"
      strokeLinecap="round"
    />
  </svg>
);

const SVG_DOT: React.FC = () => (
  <svg viewBox="0 0 10 10" className="h-full w-full">
    <circle cx="5" cy="5" r="1.5" fill="white" />
  </svg>
);

const STATUS_MARKER: Record<Reviewer['status'], Marker> = {
  approved: { bg: 'var(--pipe-ok)', Svg: SVG_CHECK },
  'requested-changes': { bg: 'var(--pipe-fail)', Svg: SVG_X },
  pending: { bg: 'var(--text-3)', Svg: SVG_DOT },
};

/**
 * Overlapping avatars with corner status marker (handoff §13 + CSS .reviewer-stack
 * .marker lignes 394-415).
 *
 * Marker 10×10 avec background = couleur du status et SVG path blanc dedans (vs
 * char unicode coloré sur fond blanc — pattern inversé). Border 2px surface-2
 * pour isoler du fond. Stack overlap -4px.
 */
export function ReviewerStack({ reviewers, size = 22 }: ReviewerStackProps) {
  if (reviewers.length === 0) return null;
  return (
    <span className="inline-flex items-center -space-x-1">
      {reviewers.map((r, i) => {
        const marker = STATUS_MARKER[r.status];
        const Svg = marker.Svg;
        return (
          <span
            key={i}
            className="relative inline-block"
            title={`${r.name} · ${r.status}`}
            style={{ zIndex: reviewers.length - i }}
          >
            <Avatar initials={r.initials} size={size} />
            <span
              aria-hidden
              className="absolute -bottom-[2px] -right-[2px] flex h-2.5 w-2.5 items-center justify-center rounded-full border-2"
              style={{ background: marker.bg, borderColor: 'var(--surface-2)' }}
            >
              <Svg />
            </span>
          </span>
        );
      })}
    </span>
  );
}
