/**
 * @fileoverview POC CLI Commands
 * @module commands/poc
 */

import chalk from 'chalk';
import { FileStorageProvider } from '../epic/providers/file-storage-provider.js';
import { StoryIndexService } from '../epic/services/story-index-service.js';
import { EpicService } from '../epic/services/epic-service.js';
import { StoryService } from '../epic/services/story-service.js';
import { POCService } from '../epic/services/poc-service.js';
import { POCEnvironmentService } from '../epic/services/poc-environment-service.js';
import { AIProvider, AI_PROVIDER_TYPE } from '../epic/providers/ai-provider.js';
import { FigmaProvider } from '../epic/providers/figma-provider.js';

/**
 * Creates and initializes services
 */
function createServices() {
  const storage = new FileStorageProvider(process.cwd());
  const storyIndexService = new StoryIndexService(storage);
  const epicService = new EpicService(storage, storyIndexService);
  const storyService = new StoryService(storage, storyIndexService, epicService);
  const aiProvider = new AIProvider();
  const figmaProvider = new FigmaProvider(storage);
  const pocService = new POCService(storage, storyService, aiProvider, figmaProvider);
  const pocEnvService = new POCEnvironmentService(storage, storyService);
  return { storage, storyService, pocService, pocEnvService, aiProvider };
}

export function registerPOCCommand(program) {
  const poc = program
    .command('poc')
    .description('POC generation commands');

  // poc generate
  poc
    .command('generate <storyId>')
    .alias('gen')
    .description('Generate POC code for a story')
    .option('-o, --output <filename>', 'Output filename', 'poc.js')
    .option('-c, --context <context>', 'Additional context')
    .option('--no-figma', 'Exclude Figma design data')
    .option('--dry-run', 'Preview without saving')
    .option('--isolated', 'Create isolated environment for POC execution')
    .option('--prototype', 'Lightweight mode - minimal environment without full setup')
    .option('-t, --template <template>', 'Environment template: minimal, node, vite, next', 'minimal')
    .action(async (storyId, options) => {
      try {
        const { pocService, pocEnvService, aiProvider } = createServices();

        if (!aiProvider.isConfigured()) {
          console.log(chalk.yellow('⚠ AI provider not configured.'));
          console.log(chalk.dim('Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.'));
          console.log(chalk.dim('Using local placeholder generation.\n'));
        }

        console.log(chalk.dim('Generating POC...'));

        if (options.dryRun) {
          const result = await pocService.generate(storyId, {
            context: options.context,
            includeFigmaData: options.figma,
          });
          console.log(chalk.bold('\nGenerated POC:\n'));
          console.log(result.poc);
          console.log(chalk.dim('\n(dry run - not saved)'));
        } else {
          const result = await pocService.generateAndSave(storyId, options.output, {
            context: options.context,
            includeFigmaData: options.figma,
          });
          console.log(chalk.green(`✓ POC generated and saved: ${result.savedAs}`));
          console.log(chalk.dim(`  Model: ${result.metadata.model}`));
          console.log(chalk.dim(`  Figma data: ${result.metadata.hadFigmaData ? 'included' : 'not included'}`));

          // Create isolated environment if requested
          if (options.isolated || options.prototype) {
            console.log(chalk.dim('\nCreating isolated environment...'));
            const template = options.prototype ? 'minimal' : options.template;
            const env = await pocEnvService.createEnvironment(storyId, {
              withGit: !options.prototype,
              withDeps: !options.prototype,
              template,
            });

            // Copy POC to environment
            const pocPath = await pocEnvService.copyPOCToEnv(storyId, options.output);

            console.log(chalk.green(`✓ Isolated environment created: ${env.path}`));
            console.log(chalk.dim(`  POC copied to: ${pocPath}`));
            if (env.scripts.run) {
              console.log(chalk.cyan(`\n  To run: cd ${env.path} && ${env.scripts.run}`));
            }
          }
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // poc list
  poc
    .command('list <storyId>')
    .alias('ls')
    .description('List POC files for a story')
    .action(async (storyId) => {
      try {
        const { pocService } = createServices();
        const pocs = await pocService.listPOCs(storyId);

        if (pocs.length === 0) {
          console.log(chalk.yellow('No POC files found.'));
          return;
        }

        console.log(chalk.bold(`\nPOC Files (${pocs.length}):\n`));
        for (const filename of pocs) {
          console.log(`  📄 ${filename}`);
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // poc show
  poc
    .command('show <storyId> <filename>')
    .description('Show POC content')
    .action(async (storyId, filename) => {
      try {
        const { pocService } = createServices();
        const content = await pocService.getPOC(storyId, filename);

        console.log(chalk.bold(`\n${filename}:\n`));
        console.log(content);
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // poc delete
  poc
    .command('delete <storyId> <filename>')
    .description('Delete a POC file')
    .action(async (storyId, filename) => {
      try {
        const { pocService } = createServices();
        await pocService.deletePOC(storyId, filename);
        console.log(chalk.green(`✓ POC deleted: ${filename}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // poc check
  poc
    .command('check <storyId>')
    .description('Check if story is ready for POC generation')
    .action(async (storyId) => {
      try {
        const { pocService } = createServices();
        const result = await pocService.checkReadiness(storyId);

        if (result.ready) {
          console.log(chalk.green('✓ Story is ready for POC generation'));
        } else {
          console.log(chalk.yellow('⚠ Story may not be ready:'));
          for (const issue of result.issues) {
            console.log(chalk.dim(`  - ${issue}`));
          }
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // poc regenerate
  poc
    .command('regenerate <storyId> <filename>')
    .alias('regen')
    .description('Regenerate POC with modifications')
    .requiredOption('-m, --modifications <mods>', 'Requested modifications')
    .option('-o, --output <newFilename>', 'New output filename')
    .action(async (storyId, filename, options) => {
      try {
        const { pocService, aiProvider } = createServices();

        if (!aiProvider.isConfigured()) {
          console.log(chalk.red('AI provider not configured.'));
          process.exit(1);
        }

        console.log(chalk.dim('Reading existing POC...'));
        const existingPoc = await pocService.getPOC(storyId, filename);

        console.log(chalk.dim('Regenerating with modifications...'));
        const newPoc = await pocService.regenerate(storyId, existingPoc, options.modifications);

        const outputFile = options.output || filename;
        const { savedAs } = await pocService.generateAndSave(storyId, outputFile, {});
        // Re-save with the regenerated content
        const storage = new FileStorageProvider(process.cwd());
        await storage.saveAttachment(storyId, outputFile, Buffer.from(newPoc));

        console.log(chalk.green(`✓ POC regenerated: ${outputFile}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // poc ai-status
  poc
    .command('ai-status')
    .description('Check AI provider status')
    .action(async () => {
      try {
        const { aiProvider } = createServices();

        console.log(chalk.bold('\nAI Provider Status:\n'));
        console.log(`  Provider: ${aiProvider.getProvider()}`);
        console.log(`  Model: ${aiProvider.getModel()}`);
        console.log(`  Configured: ${aiProvider.isConfigured() ? chalk.green('Yes') : chalk.red('No')}`);

        if (!aiProvider.isConfigured()) {
          console.log(chalk.yellow('\n  Set one of these environment variables:'));
          console.log(chalk.dim('    ANTHROPIC_API_KEY - For Claude'));
          console.log(chalk.dim('    OPENAI_API_KEY - For GPT-4'));
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // poc env - environment management subcommands
  const env = poc
    .command('env')
    .description('Manage POC isolated environments');

  // poc env create
  env
    .command('create <storyId>')
    .description('Create isolated environment for a story')
    .option('-t, --template <template>', 'Template: minimal, node, vite, next', 'minimal')
    .option('--no-git', 'Skip git initialization')
    .option('--no-deps', 'Skip dependency installation')
    .action(async (storyId, options) => {
      try {
        const { pocEnvService } = createServices();

        console.log(chalk.dim('Creating isolated environment...'));

        const env = await pocEnvService.createEnvironment(storyId, {
          withGit: options.git,
          withDeps: options.deps,
          template: options.template,
        });

        console.log(chalk.green(`✓ Environment created: ${env.path}`));
        console.log(chalk.dim(`  Template: ${options.template}`));
        if (env.scripts.run) {
          console.log(chalk.cyan(`\n  To run: cd ${env.path} && ${env.scripts.run}`));
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // poc env list
  env
    .command('list')
    .alias('ls')
    .description('List all POC environments')
    .action(async () => {
      try {
        const { pocEnvService } = createServices();
        const envs = await pocEnvService.listEnvironments();

        if (envs.length === 0) {
          console.log(chalk.yellow('No POC environments found.'));
          return;
        }

        console.log(chalk.bold(`\nPOC Environments (${envs.length}):\n`));
        for (const e of envs) {
          console.log(`  📁 ${chalk.cyan(e.storyId)}`);
          console.log(chalk.dim(`     Path: ${e.path}`));
          console.log(chalk.dim(`     Template: ${e.template}`));
          console.log(chalk.dim(`     Created: ${new Date(e.createdAt).toLocaleDateString()}`));
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // poc env remove
  env
    .command('remove <storyId>')
    .alias('rm')
    .description('Remove POC environment for a story')
    .action(async (storyId) => {
      try {
        const { pocEnvService } = createServices();

        if (!(await pocEnvService.exists(storyId))) {
          console.log(chalk.yellow(`No environment found for story ${storyId}`));
          return;
        }

        await pocEnvService.removeEnvironment(storyId);
        console.log(chalk.green(`✓ Environment removed for story ${storyId}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // poc env run
  env
    .command('run <storyId> [command]')
    .description('Run command in POC environment')
    .action(async (storyId, command) => {
      try {
        const { pocEnvService } = createServices();

        const envPath = await pocEnvService.getEnvironmentPath(storyId);
        if (!envPath) {
          console.log(chalk.red(`No environment found for story ${storyId}`));
          process.exit(1);
        }

        const cmd = command || 'npm start';
        console.log(chalk.dim(`Running in ${envPath}: ${cmd}\n`));

        const result = await pocEnvService.runCommand(storyId, cmd);
        if (result.stdout) console.log(result.stdout);
        if (result.stderr) console.error(chalk.red(result.stderr));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // poc env copy
  env
    .command('copy <storyId> <filename>')
    .description('Copy a POC file to its environment')
    .action(async (storyId, filename) => {
      try {
        const { pocEnvService } = createServices();

        const envPath = await pocEnvService.getEnvironmentPath(storyId);
        if (!envPath) {
          console.log(chalk.red(`No environment found for story ${storyId}. Create one first with: aia poc env create ${storyId}`));
          process.exit(1);
        }

        const destPath = await pocEnvService.copyPOCToEnv(storyId, filename);
        console.log(chalk.green(`✓ POC copied to: ${destPath}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
