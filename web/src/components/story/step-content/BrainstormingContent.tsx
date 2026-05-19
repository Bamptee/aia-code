import { EmptyStep } from '@/components/primitives/EmptyStep';

/**
 * `brainstorming` step — handoff §7.4 : summary + key takeaways.
 * V1 minimal : empty state.
 */
export function BrainstormingContent() {
  return (
    <EmptyStep
      title="Brainstorming not generated"
      description="Free-form chat-only step. Discuss the problem space, then summarize key takeaways."
      onGenerate={undefined}
    />
  );
}
