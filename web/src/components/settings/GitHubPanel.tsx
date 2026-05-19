import { PanelChrome } from './PanelChrome';

/**
 * GitHub placeholder (FR-20, Story 7.2).
 * Bouton disabled, badge "Coming soon", aucune action / API.
 */
export function GitHubPanel() {
  return (
    <PanelChrome
      logo={
        <span className="text-[11px] font-bold tracking-tight text-text-2">GH</span>
      }
      title="GitHub"
      subtitle="Mirror of the Bitbucket integration — connect when you start using GitHub-hosted repos."
      rightSlot={
        <>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-text-3">Coming soon</span>
          <button
            type="button"
            disabled
            aria-disabled
            className="cursor-not-allowed rounded border border-border bg-surface px-3 py-1.5 text-xs text-text-3 opacity-60"
            onClick={(e) => e.preventDefault()}
          >
            Connect
          </button>
        </>
      }
      dim
    >
      {null}
    </PanelChrome>
  );
}
