import { EmptyStep } from '@/components/primitives/EmptyStep';
import type { Story } from '@/lib/types/story';

interface InitContentProps {
  story: Story;
}

/**
 * `init` step — handoff §7.4 : titre + tagline + description + constraints list.
 *
 * V1 minimal : empty state. La fetch + render markdown du contenu init.md
 * arrivera quand l'API Express exposera GET /api/features/:name/content/init.
 */
export function InitContent({ story }: InitContentProps) {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold tracking-tight text-text">
          {story.title}
        </h2>
        {story.snippet && (
          <p className="mt-2 text-sm text-text-2">{story.snippet}</p>
        )}
      </header>
      <EmptyStep
        title="Init content not generated"
        description="Use the chat to draft the initial brief, or click Generate to start."
        onGenerate={undefined}
      />
    </div>
  );
}
