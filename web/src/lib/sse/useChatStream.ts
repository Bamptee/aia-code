'use client';

import { useEffect, useRef, useState } from 'react';

export type StreamStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface UseChatStreamResult {
  messages: string[];
  status: StreamStatus;
  cancel: () => void;
}

/**
 * SSE hook with proper EventSource lifecycle handling for React 19 Strict Mode.
 *
 * Lessons from Story 1.3 spike:
 * 1. Set `status` via real events (`onopen`, `onerror`), NOT eagerly in the effect body.
 *    Eager `setStatus('open')` inside useEffect can interact badly with Fast Refresh.
 * 2. Do NOT setState in the cleanup function. The component might already be unmounting,
 *    and setState in cleanup is flagged by `react-hooks/set-state-in-effect` rule.
 *    The cancel() function exposed by the hook is the user-facing way to force closed.
 * 3. The useRef guard against double connections is OK to keep, but understand that
 *    React Strict Mode's cleanup→remount pattern means a guard-only approach doesn't
 *    fully prevent the first connection from being briefly opened then closed.
 *    What it DOES prevent: 2 concurrent connections existing at the same instant.
 *
 * @param url SSE endpoint URL. Pass `null` to skip connection.
 */
export function useChatStream(url: string | null): UseChatStreamResult {
  const [messages, setMessages] = useState<string[]>([]);
  const [status, setStatus] = useState<StreamStatus>('idle');
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!url) return;
    if (esRef.current) return; // Strict Mode guard

    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setStatus('open');
    es.onerror = () => setStatus('error');
    es.onmessage = (event) => {
      setMessages((prev) => [...prev, event.data]);
    };

    // Trigger connecting state (will become 'open' via onopen)
    setStatus('connecting');

    return () => {
      es.close();
      if (esRef.current === es) {
        esRef.current = null;
      }
    };
  }, [url]);

  const cancel = () => {
    esRef.current?.close();
    esRef.current = null;
    setStatus('closed');
  };

  return { messages, status, cancel };
}
