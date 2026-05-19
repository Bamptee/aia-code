/**
 * Chat message types (handoff §7.4 + FR-13).
 * Chaque step d'une story a son propre fil de messages user/AI.
 */

export type MessageRole = 'user' | 'ai';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** True si le stream a été cancelled — message incomplet. */
  partial?: boolean;
}
