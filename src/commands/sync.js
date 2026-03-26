/**
 * @fileoverview Sync CLI commands — setup, status, disconnect
 * @module commands/sync
 */

import chalk from 'chalk';
import readline from 'node:readline';
import { loadSyncConfig, saveSyncConfig } from '../services/config.js';
import { createSyncProvider } from '../providers/sync-manager.js';

function ask(rl, question) {
  return new Promise(resolve => rl.question(chalk.cyan(question), resolve));
}

export function registerSyncCommand(program) {
  const sync = program
    .command('sync')
    .description('Manage external sync integrations');

  // ─── sync setup ──────────────────────────────────────────────
  sync
    .command('setup')
    .description('Configure sync integration (ClickUp)')
    .action(async () => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      try {
        console.log(chalk.bold('\n🔗 Sync Integration Setup\n'));

        // 1. Provider choice
        console.log('Available providers: clickup');
        const providerName = (await ask(rl, 'Provider [clickup]: ')).trim() || 'clickup';

        if (providerName !== 'clickup') {
          console.log(chalk.red(`Provider "${providerName}" is not supported yet.`));
          return;
        }

        // 2. API key env var
        const apiKeyEnv = (await ask(rl, 'API key env variable [CLICKUP_API_KEY]: ')).trim() || 'CLICKUP_API_KEY';

        if (!process.env[apiKeyEnv]) {
          console.log(chalk.yellow(`\n⚠ ${apiKeyEnv} is not set in your environment.`));
          console.log(chalk.dim(`  Set it with: export ${apiKeyEnv}="your-token-here"`));
          console.log(chalk.dim('  Get a token at: https://app.clickup.com/settings/apps\n'));
          const cont = (await ask(rl, 'Continue anyway? [y/N]: ')).trim().toLowerCase();
          if (cont !== 'y') return;
        }

        // 3. Test connection
        console.log(chalk.dim('\nTesting connection...'));
        const tempProvider = createSyncProvider({
          provider: 'clickup',
          clickup: { api_key_env: apiKeyEnv },
        });

        const connResult = await tempProvider.testConnection();
        if (!connResult.ok) {
          console.log(chalk.red(`Connection failed: ${connResult.error}`));
          const cont = (await ask(rl, 'Continue setup anyway? [y/N]: ')).trim().toLowerCase();
          if (cont !== 'y') return;
        } else {
          console.log(chalk.green('✓ Connection successful'));
        }

        // 4. Workspace selection
        let workspaceId = '';
        if (connResult.ok && connResult.teams?.length) {
          console.log('\nAvailable workspaces:');
          connResult.teams.forEach((t, i) => console.log(`  ${i + 1}. ${t.name} (${t.id})`));
          const choice = (await ask(rl, `Select workspace [1]: `)).trim() || '1';
          const idx = Math.max(0, Math.min((parseInt(choice, 10) || 1) - 1, connResult.teams.length - 1));
          workspaceId = connResult.teams[idx].id;
        } else {
          workspaceId = (await ask(rl, 'Workspace ID: ')).trim();
        }

        // 5. Space selection
        let spaceId = '';
        if (connResult.ok && workspaceId) {
          try {
            const spaces = await tempProvider.getSpaces(workspaceId);
            if (spaces.length) {
              console.log('\nAvailable spaces:');
              spaces.forEach((s, i) => console.log(`  ${i + 1}. ${s.name} (${s.id})`));
              const choice = (await ask(rl, `Select space [1]: `)).trim() || '1';
              const idx = Math.max(0, Math.min((parseInt(choice, 10) || 1) - 1, spaces.length - 1));
              spaceId = spaces[idx].id;
            }
          } catch {
            spaceId = (await ask(rl, 'Space ID: ')).trim();
          }
        } else {
          spaceId = (await ask(rl, 'Space ID: ')).trim();
        }

        // 6. Default list ID
        const defaultListId = (await ask(rl, 'Default List ID (for new tasks): ')).trim();

        // 7. Epic mapping
        const epicAs = (await ask(rl, 'Map epics as [folder/list] (folder): ')).trim() || 'folder';

        // 8. Auto options
        const autoPush = (await ask(rl, 'Enable auto-push after each step? [Y/n]: ')).trim().toLowerCase() !== 'n';
        const autoPullCheck = (await ask(rl, 'Check for remote changes before run? [Y/n]: ')).trim().toLowerCase() !== 'n';

        // 9. Save config
        const syncConfig = {
          provider: 'clickup',
          auto_push: autoPush,
          auto_pull_check: autoPullCheck,
          clickup: {
            workspace_id: workspaceId,
            space_id: spaceId,
            default_list_id: defaultListId,
            api_key_env: apiKeyEnv,
            epic_as: epicAs,
            status_map: {
              pending: 'to do',
              'in-progress': 'in progress',
              done: 'complete',
              error: 'blocked',
            },
          },
        };

        await saveSyncConfig(syncConfig);
        console.log(chalk.green('\n✓ Sync configuration saved to .aia/config.yaml'));

        // 10. Summary
        console.log(chalk.bold('\nConfiguration summary:'));
        console.log(`  Provider: ${chalk.cyan('clickup')}`);
        console.log(`  Workspace: ${chalk.cyan(workspaceId)}`);
        console.log(`  Space: ${chalk.cyan(spaceId)}`);
        console.log(`  Default List: ${chalk.cyan(defaultListId || '(not set)')}`);
        console.log(`  Epic as: ${chalk.cyan(epicAs)}`);
        console.log(`  Auto-push: ${autoPush ? chalk.green('enabled') : chalk.dim('disabled')}`);
        console.log(`  Auto-pull check: ${autoPullCheck ? chalk.green('enabled') : chalk.dim('disabled')}`);

        // 11. .gitignore recommendation
        console.log(chalk.yellow('\n⚠ Recommended: Add these entries to your .gitignore:'));
        console.log(chalk.dim('  .aia/stories/'));
        console.log(chalk.dim('  .aia/epics/'));
        console.log(chalk.dim('  .aia/integrations/'));
        console.log(chalk.dim('  .env'));
        console.log(chalk.dim('\n  When using ClickUp as your shared workspace, these files are synced via the integration.'));
        console.log(chalk.dim('  Committing them to Git would create duplicate sources of truth.\n'));

      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      } finally {
        rl.close();
      }
    });

  // ─── sync status ─────────────────────────────────────────────
  sync
    .command('status')
    .description('Show current sync configuration and test connection')
    .action(async () => {
      try {
        const syncConfig = await loadSyncConfig();
        if (!syncConfig) {
          console.log(chalk.yellow('Sync not configured. Run `aia sync setup` to set up.'));
          return;
        }

        console.log(chalk.bold('\nSync Configuration:'));
        console.log(`  Provider: ${chalk.cyan(syncConfig.provider)}`);
        console.log(`  Auto-push: ${syncConfig.auto_push ? chalk.green('enabled') : chalk.dim('disabled')}`);
        console.log(`  Auto-pull check: ${syncConfig.auto_pull_check ? chalk.green('enabled') : chalk.dim('disabled')}`);

        if (syncConfig.provider === 'clickup' && syncConfig.clickup) {
          console.log(`  Workspace ID: ${chalk.cyan(syncConfig.clickup.workspace_id || '(not set)')}`);
          console.log(`  Space ID: ${chalk.cyan(syncConfig.clickup.space_id || '(not set)')}`);
          console.log(`  Default List: ${chalk.cyan(syncConfig.clickup.default_list_id || '(not set)')}`);
        }

        // Test connection
        console.log(chalk.dim('\nTesting connection...'));
        const provider = createSyncProvider(syncConfig);
        if (provider) {
          const result = await provider.testConnection();
          if (result.ok) {
            console.log(chalk.green('✓ Connection OK'));
          } else {
            console.log(chalk.red(`✗ Connection failed: ${result.error}`));
          }
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // ─── sync disconnect ────────────────────────────────────────
  sync
    .command('disconnect')
    .description('Remove sync configuration')
    .action(async () => {
      try {
        await saveSyncConfig(null);
        console.log(chalk.green('✓ Sync configuration removed.'));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
