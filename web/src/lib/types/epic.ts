/**
 * Epic shape (handoff §17 + PRD glossary).
 */

export interface Epic {
  id: string;
  name: string;
  color: string;
  storyCount: number;
  doneCount: number;
  status: 'active' | 'done';
}
