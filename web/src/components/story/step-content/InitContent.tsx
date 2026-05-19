import { EmptyStep } from '@/components/primitives/EmptyStep';
import type { Story } from '@/lib/types/story';

interface InitContentProps {
  story: Story;
}

/**
 * `init` step — handoff §7.4 : tagline + description + constraints list.
 *
 * Le titre de la story vit dans StoryHeader (haut de page). Ici on rend
 * uniquement le contenu init.md une fois généré ; en attendant, empty state.
 */
export function InitContent({ story }: InitContentProps) {
  return (
    <div className="flex flex-col gap-4">
      {story.snippet && (
        <p className="text-base leading-relaxed text-text-2">{story.snippet}</p>
      )}
      <EmptyStep
        title="Init content not generated"
        description="Use the chat to draft the initial brief, or click Generate to start."
        onGenerate={undefined}
      />
    </div>
  );
}
