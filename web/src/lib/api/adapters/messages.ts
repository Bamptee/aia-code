/**
 * Adapter Message : chat messages user/AI (FR-13).
 *
 * API gap (architecture.md §10) : `GET /api/features/:name/messages?step=`
 * n'existe pas encore côté Express. À câbler dans la story API-side
 * (potentiellement réutiliser `agent-sessions.js` qui stocke les logs CLI
 * mais ce sont des logs, pas un fil conversationnel propre).
 *
 * En attendant, l'adapter est défensif (defaults raisonnables, pas de throw
 * si shape inattendue) pour permettre à ChatPane de render à vide.
 */

import type { Message, MessageRole } from '@/lib/types/messages';

const ROLES: readonly MessageRole[] = ['user', 'ai'] as const;

function parseRole(raw: unknown): MessageRole {
  if (typeof raw === 'string' && (ROLES as readonly string[]).includes(raw)) {
    return raw as MessageRole;
  }
  return 'ai';
}

export function parseMessage(raw: unknown): Message | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.content !== 'string') return null;
  return {
    id: typeof r.id === 'string' ? r.id : String(Date.now() + Math.random()),
    role: parseRole(r.role),
    content: r.content,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
    partial: r.partial === true,
  };
}

export function parseMessageList(raw: unknown): Message[] {
  if (!Array.isArray(raw)) {
    if (typeof console !== 'undefined') {
      console.warn('[adapters/messages] parseMessageList: expected array, got', typeof raw, raw);
    }
    return [];
  }
  return raw.map(parseMessage).filter((m): m is Message => m !== null);
}
