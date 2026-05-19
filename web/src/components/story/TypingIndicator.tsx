/**
 * Silence-driven typing indicator (FR-13, Sally finding).
 *
 * Affiché uniquement quand le stream est actif ET >800ms sans token reçu.
 * Trois dots qui pulsent en cascade — calé sur le rythme réel d'arrivée
 * (pas un blink métronome).
 *
 * Logique d'apparition gérée par useChatStream (isSilent flag).
 */
export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-1">
      <span className="text-[11px] text-text-3">AI is thinking</span>
      <span className="flex items-center gap-0.5">
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </span>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-1 w-1 animate-pulse rounded-full bg-text-3"
      style={{ animationDelay: delay }}
    />
  );
}
