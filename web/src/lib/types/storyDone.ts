/**
 * Story Done / Read Mode payload (handoff §8 + FR-14).
 *
 * Rendu sous forme d'article éditorial pour les stories phase=done.
 * Section ordre (top→bottom) :
 * 1. Top bar (Read mode pill + shipped date + Exit)
 * 2. Kicker line (ID · Epic · duration · crew avatars)
 * 3. Hero h1 (punchy headline)
 * 4. Lede (paragraphe d'intro 18px)
 * 5. Story arc (mini bar 7 segments phase-tinted)
 * 6. Outcome (4-column KPI grid)
 * 7. "How we got here" (timeline de chapters)
 * 8. Decisions in order (when/note list)
 * 9. Artifacts (2-column grid, PR card first si présente)
 * 10. What we learned (numbered list)
 */

export interface OutcomeKPI {
  label: string;
  value: string;
  delta?: string;
}

export interface Chapter {
  step: string;
  kicker: string;
  when: string;
  title: string;
  body: string;
  callouts?: string[];
  commitHash?: string;
}

export interface Decision {
  when: string;
  note: string;
}

export interface Artifact {
  type: 'pr' | 'commit' | 'doc' | 'link';
  title: string;
  url?: string;
  meta?: string;
}

export interface Learning {
  number: number;
  text: string;
}

export interface StoryDone {
  storyId: string;
  shippedAt: string;
  durationDays: number;
  crew: string[];
  kicker: string;
  hero: string;
  lede: string;
  outcome: OutcomeKPI[];
  chapters: Chapter[];
  decisions: Decision[];
  artifacts: Artifact[];
  learnings: Learning[];
}
