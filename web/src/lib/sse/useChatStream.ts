'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { postStream } from './createStream';
import type { Message } from '@/lib/types/messages';

export type StreamStatus = 'idle' | 'streaming' | 'paused' | 'error' | 'cancelled';

export interface UseChatStreamResult {
  messages: Message[];
  status: StreamStatus;
  isSilent: boolean; // true si > 800ms sans token (silence-driven indicator)
  send: (prompt: string) => void;
  cancel: () => void;
  reset: () => void;
}

interface UseChatStreamOptions {
  slug: string | null;
  step: string | null;
  initialMessages?: Message[];
}

const SILENCE_MS = 800;

/**
 * useChatStream — wrapper SSE pour le ChatPane (FR-13).
 *
 * Réécrit en Story 3.8 (vs Story 1.3 spike) :
 * - Utilise fetch + ReadableStream (pas EventSource) pour supporter POST.
 * - Tracks `isSilent` via timestamp du dernier chunk reçu (déclenche le typing
 *   indicator silence-driven >800ms — Sally finding).
 * - Cancel via AbortController : message marqué `partial`, status='cancelled'.
 *
 * API gap : endpoint POST /api/features/:slug/messages?step=... n'existe pas
 * encore (architecture.md §10 ADD-13). En attendant, `send()` produit l'echo
 * en stub local pour valider l'UI.
 */
export function useChatStream({ slug, step, initialMessages = [] }: UseChatStreamOptions): UseChatStreamResult {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [isSilent, setIsSilent] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentMessageIdRef = useRef<string | null>(null);

  // Reset messages quand slug/step changent.
  // setState-in-effect est accepté ici : on resync l'état au changement d'URL params,
  // équivalent à un remount via `key={slug+step}` mais sans demander au parent de gérer.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setMessages(initialMessages);
    setStatus('idle');
    setIsSilent(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, step]);

  // Cleanup à l'unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  const resetSilenceTimer = useCallback(() => {
    setIsSilent(false);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      setIsSilent(true);
    }, SILENCE_MS);
  }, []);

  const send = useCallback(
    (prompt: string) => {
      if (!slug || !step || !prompt.trim()) return;
      if (abortRef.current) {
        abortRef.current.abort();
      }

      // Ajoute le message user immédiatement.
      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: prompt.trim(),
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // Prépare le message AI (sera rempli au fur et à mesure du stream).
      const aiId = `a-${Date.now()}`;
      currentMessageIdRef.current = aiId;
      const aiMsg: Message = {
        id: aiId,
        role: 'ai',
        content: '',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMsg]);

      setStatus('streaming');
      resetSilenceTimer();

      const ac = new AbortController();
      abortRef.current = ac;

      postStream({
        url: `/api/features/${encodeURIComponent(slug)}/messages?step=${encodeURIComponent(step)}`,
        body: { prompt: prompt.trim() },
        signal: ac.signal,
        onChunk: (data) => {
          resetSilenceTimer();
          // Parse JSON ou string brute.
          let chunkText = data;
          try {
            const parsed = JSON.parse(data);
            if (typeof parsed === 'string') chunkText = parsed;
            else if (parsed && typeof parsed.content === 'string') chunkText = parsed.content;
          } catch {
            // data was already a string
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiId ? { ...m, content: m.content + chunkText } : m
            )
          );
        },
        onError: (err) => {
          console.error('[useChatStream] error:', err);
          setStatus('error');
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          setIsSilent(false);
        },
        onClose: () => {
          setStatus((s) => (s === 'streaming' ? 'idle' : s));
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          setIsSilent(false);
          abortRef.current = null;
        },
      });
    },
    [slug, step, resetSilenceTimer]
  );

  const cancel = useCallback(() => {
    if (!abortRef.current) return;
    abortRef.current.abort();
    abortRef.current = null;
    setStatus('cancelled');
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setIsSilent(false);
    // Marque le message AI courant comme partial.
    const aiId = currentMessageIdRef.current;
    if (aiId) {
      setMessages((prev) =>
        prev.map((m) => (m.id === aiId ? { ...m, partial: true } : m))
      );
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setIsSilent(false);
    setMessages(initialMessages);
    setStatus('idle');
  }, [initialMessages]);

  return { messages, status, isSilent, send, cancel, reset };
}
