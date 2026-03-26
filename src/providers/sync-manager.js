/**
 * @fileoverview Sync provider factory — instantiates the right provider from config
 * @module providers/sync-manager
 */

import { ClickUpProvider } from './clickup-provider.js';
import { loadSyncConfig } from '../services/config.js';
import { ConfigurationError } from '../epic/utils/errors.js';

/**
 * Create a sync provider instance from config
 * @param {Object} syncConfig - The sync section from .aia/config.yaml
 * @returns {import('./sync-provider.js').SyncProvider|null}
 */
export function createSyncProvider(syncConfig) {
  if (!syncConfig || syncConfig.provider === 'none') return null;

  switch (syncConfig.provider) {
    case 'clickup':
      return new ClickUpProvider({
        apiKey: process.env[syncConfig.clickup?.api_key_env || 'CLICKUP_API_KEY'],
        workspaceId: syncConfig.clickup?.workspace_id,
        spaceId: syncConfig.clickup?.space_id,
        defaultListId: syncConfig.clickup?.default_list_id,
        epicAs: syncConfig.clickup?.epic_as,
        statusMap: syncConfig.clickup?.status_map,
      });
    default:
      throw new ConfigurationError(`Unknown sync provider: ${syncConfig.provider}`);
  }
}

/**
 * Load config and create the sync provider
 * @param {string} [root=process.cwd()]
 * @returns {Promise<import('./sync-provider.js').SyncProvider|null>}
 */
export async function getSyncProvider(root = process.cwd()) {
  const syncConfig = await loadSyncConfig(root);
  return createSyncProvider(syncConfig);
}

/**
 * Quick check if sync is enabled without instantiating
 * @param {string} [root=process.cwd()]
 * @returns {Promise<boolean>}
 */
export async function isSyncEnabled(root = process.cwd()) {
  const syncConfig = await loadSyncConfig(root);
  return Boolean(syncConfig && syncConfig.provider && syncConfig.provider !== 'none');
}
