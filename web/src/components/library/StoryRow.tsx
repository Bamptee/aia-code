import Link from 'next/link';
import { PhaseBadge } from '@/components/primitives/PhaseBadge';
import { StepMini } from '@/components/primitives/StepMini';
import { CuPill } from '@/components/primitives/CuPill';
import { PrMini } from '@/components/primitives/PrMini';
import { Avatar } from '@/components/primitives/Avatar';
import { formatRelative } from '@/lib/format/date';
import type { Story } from '@/lib/types/story';

interface StoryRowProps {
  story: Story;
}

/**
 * Library row 8 colonnes (handoff §10 / views-v3.jsx:1497).
 *
 * Grid : title+snippet | PhaseBadge | story ID | StepMini dots | updated | CuPill | PrMini | avatar stack.
 *
 * Plusieurs colonnes restent vides en pratique tant que l'API Express ne les expose pas (snippet,
 * steps statuts, cuTaskCount, bitbucket.pr, collaborators). L'adapter `parseStory` retourne des
 * defaults zéro/null pour ces champs ; les primitives gèrent gracefully l'absence de data.
 */
export function StoryRow({ story }: StoryRowProps) {
  return (
    <Link
      href={`/stories/${story.slug}`}
      className="grid items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover"
      style={{ gridTemplateColumns: 'minmax(0, 1fr) 90px 80px 88px 80px 72px 72px 60px' }}
    >
      <div className="min-w-0">
        <div className="truncate text-sm text-text">{story.title}</div>
        {story.snippet && (
          <div className="truncate text-[11px] text-text-3">{story.snippet}</div>
        )}
      </div>
      <PhaseBadge phase={story.phase} />
      <span className="truncate font-mono text-[11px] text-text-3">{story.id}</span>
      <StepMini steps={story.steps} />
      <span className="truncate text-[11px] text-text-3">{formatRelative(story.updated)}</span>
      <CuPill state={story.cu} taskCount={story.cuTaskCount} />
      <span className="flex justify-start">
        {story.bitbucket.pr ? <PrMini pr={story.bitbucket.pr} /> : <span className="text-text-3">—</span>}
      </span>
      <span className="flex items-center -space-x-1.5">
        {story.collaborators.slice(0, 3).map((c) => (
          <span key={c} className="ring-2 ring-surface">
            <Avatar initials={c} size={20} />
          </span>
        ))}
      </span>
    </Link>
  );
}
