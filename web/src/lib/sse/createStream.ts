/**
 * Streaming helper : fetch + ReadableStream (PAS EventSource).
 *
 * Pourquoi pas EventSource ?
 * - EventSource ne supporte que GET (W3C spec). Or notre POST /api/features/:name/messages
 *   doit envoyer le prompt user dans le body de la request.
 * - Avec fetch + body.getReader(), on a un control complet : POST, headers custom,
 *   AbortController natif, parsing manuel des events `data: ...\n\n`.
 *
 * Cette implémentation suit le format SSE standard mais via fetch :
 * - Le serveur renvoie text/event-stream avec lignes `data: <json>\n\n`.
 * - On parse les lignes au fur et à mesure.
 *
 * Story 1.2 a confirmé que les rewrites Next.js 16 supportent ce streaming
 * sans buffering (validé en dev + prod).
 */

export interface StreamOptions {
  url: string;
  body?: unknown;
  signal?: AbortSignal;
  onChunk: (data: string) => void;
  onError?: (err: Error) => void;
  onClose?: () => void;
}

export async function postStream(opts: StreamOptions): Promise<void> {
  const { url, body, signal, onChunk, onError, onClose } = opts;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    onError?.(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  if (!response.ok) {
    onError?.(new Error(`HTTP ${response.status}`));
    return;
  }
  if (!response.body) {
    onError?.(new Error('No response body'));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE event boundary: \n\n
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');

        // Parse `data: ...` line(s) inside the event.
        const lines = event.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            onChunk(data);
          }
        }
      }
    }

    // Flush any remaining buffered partial event.
    if (buffer.trim().length > 0) {
      const lines = buffer.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          onChunk(line.slice(6));
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      // Cancellation propre — pas une erreur.
    } else {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  } finally {
    reader.releaseLock();
    onClose?.();
  }
}
