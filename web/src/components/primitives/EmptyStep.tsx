import { Sparkles } from 'lucide-react';

interface EmptyStepProps {
  title?: string;
  description?: string;
  /** Label du CTA principal. Default : "Generate". */
  ctaLabel?: string;
  onGenerate?: () => void;
  disabled?: boolean;
}

/**
 * Empty state pour les Doc Pane steps sans contenu (handoff §13).
 * Affiche : titre + description + bouton Generate (CTA primary).
 */
export function EmptyStep({
  title = 'Not generated yet',
  description = 'Generate this step to start producing content.',
  ctaLabel = 'Generate',
  onGenerate,
  disabled = false,
}: EmptyStepProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface-2 px-8 py-12 text-center">
      <Sparkles size={20} className="text-text-3" />
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      <p className="max-w-xs text-xs text-text-2">{description}</p>
      <button
        type="button"
        onClick={onGenerate}
        disabled={disabled || !onGenerate}
        className="mt-2 inline-flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Sparkles size={12} />
        <span>{ctaLabel}</span>
      </button>
    </div>
  );
}
