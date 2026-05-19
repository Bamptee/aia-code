'use client';

import { BitbucketPanel } from './BitbucketPanel';
import { GitHubPanel } from './GitHubPanel';
import { ClickUpPanel } from './ClickUpPanel';
import { ModelsPanel } from './ModelsPanel';

/**
 * SettingsView (Epic 7).
 * 4 panels stackés verticalement dans l'ordre handoff §12.
 */
export function SettingsView() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
      <header>
        <h1 className="text-lg font-semibold text-text">Workspace settings</h1>
        <p className="text-xs text-text-3">
          Integrations and AI model assignments per step.
        </p>
      </header>
      <BitbucketPanel />
      <GitHubPanel />
      <ClickUpPanel />
      <ModelsPanel />
    </div>
  );
}
