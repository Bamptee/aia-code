/**
 * @fileoverview Story CLI Commands
 * @module commands/story
 */

import chalk from 'chalk';
import path from 'node:path';
import fs from 'fs-extra';
import { FileStorageProvider } from '../epic/providers/file-storage-provider.js';
import { StoryIndexService } from '../epic/services/story-index-service.js';
import { EpicService } from '../epic/services/epic-service.js';
import { StoryService } from '../epic/services/story-service.js';
import { AIProvider } from '../epic/providers/ai-provider.js';
import { FigmaProvider } from '../epic/providers/figma-provider.js';
import { isValidFigmaUrl } from '../epic/models/validators.js';

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
  return { storage, storyService, epicService, aiProvider, figmaProvider };
}

/**
 * Formats story for display
 */
function formatStory(story) {
  const typeIcon = story.type === 'bug' ? chalk.red('🐛') : chalk.blue('✨');
  const statusColors = {
    draft: chalk.gray,
    ready_for_dev: chalk.yellow,
    in_progress: chalk.cyan,
    testing: chalk.magenta,
    done: chalk.green,
  };
  const colorFn = statusColors[story.status] || chalk.white;
  const space = story.space === 'development' ? chalk.dim('[dev]') : chalk.dim('[exp]');
  const linked = story.linkedFeatureId ? chalk.dim(` ↳ ${story.linkedFeatureId.slice(0, 8)}`) : '';

  return `${typeIcon} ${story.title} ${space} ${colorFn(story.status)}${linked} ${chalk.dim(story.id.slice(0, 8))}`;
}

export function registerStoryCommand(program) {
  const story = program
    .command('story')
    .description('Manage stories');

  // story list
  story
    .command('list')
    .alias('ls')
    .description('List stories')
    .option('-e, --epic <id>', 'Filter by epic ID')
    .option('-s, --status <status>', 'Filter by status')
    .option('--space <space>', 'Filter by space (experimentation|development)')
    .option('-t, --type <type>', 'Filter by type (feature|bug)')
    .action(async (options) => {
      try {
        const { storyService } = createServices();
        const stories = await storyService.list({
          epicId: options.epic,
          status: options.status,
          space: options.space,
          type: options.type,
        });

        if (stories.length === 0) {
          console.log(chalk.yellow('No stories found.'));
          return;
        }

        console.log(chalk.bold(`\nStories (${stories.length}):\n`));

        // Group by epic
        const byEpic = {};
        for (const s of stories) {
          if (!byEpic[s.epicName]) {
            byEpic[s.epicName] = [];
          }
          byEpic[s.epicName].push(s);
        }

        for (const [epicName, epicStories] of Object.entries(byEpic)) {
          console.log(chalk.bold.underline(`  ${epicName}:`));
          for (const s of epicStories) {
            console.log(`    ${formatStory(s)}`);
          }
          console.log();
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story create
  story
    .command('create <epicId> <title>')
    .description('Create a new story')
    .option('-t, --type <type>', 'Story type (feature|bug)', 'feature')
    .option('-d, --description <desc>', 'Story description')
    .action(async (epicId, title, options) => {
      try {
        const { storyService } = createServices();
        const newStory = await storyService.create(epicId, {
          title,
          type: options.type,
          description: options.description,
        });

        console.log(chalk.green(`✓ Story created: ${newStory.title}`));
        console.log(chalk.dim(`  ID: ${newStory.id}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story show
  story
    .command('show <id>')
    .description('Show story details')
    .action(async (id) => {
      try {
        const { storyService } = createServices();
        const s = await storyService.getById(id);

        console.log(chalk.bold(`\n${s.title}`));
        console.log(chalk.dim(`ID: ${s.id}`));
        console.log(`Type: ${s.type}`);
        console.log(`Status: ${s.status}`);
        console.log(`Space: ${s.space}`);
        if (s.description) console.log(`Description: ${s.description}`);
        if (s.linkedFeatureId) console.log(`Linked to: ${s.linkedFeatureId}`);
        if (s.figmaUrl) console.log(`Figma: ${s.figmaUrl}`);

        // Init section
        if (s.init?.input || s.init?.enriched || s.init?.attachments?.length || s.init?.figmaLinks?.length) {
          console.log(chalk.bold('\nInit:'));
          if (s.init.input) {
            const preview = s.init.input.substring(0, 80);
            console.log(`  Input: ${preview}${s.init.input.length > 80 ? '...' : ''}`);
          }
          if (s.init.enriched) {
            console.log(chalk.dim(`  Enriched: ✓ (${s.init.model})`));
          }
          if (s.init.attachments?.length > 0) {
            console.log(`  Attachments: ${s.init.attachments.length} file(s)`);
          }
          if (s.init.figmaLinks?.length > 0) {
            console.log(`  Figma Links: ${s.init.figmaLinks.length} link(s)`);
          }
        }

        console.log(chalk.bold('\nSteps:'));
        for (const [name, step] of Object.entries(s.steps)) {
          const icon = step.completed ? '✓' : step.skipped ? '○' : '·';
          const color = step.completed ? chalk.green : step.skipped ? chalk.gray : chalk.dim;
          const versionInfo = step.history?.length > 0 ? chalk.dim(` (v${step.currentVersion}/${step.history.length})`) : '';
          console.log(`  ${color(icon)} ${name}${versionInfo}`);
        }

        console.log(`\nCreated: ${s.createdAt}`);
        console.log(`Updated: ${s.updatedAt}`);
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story update
  story
    .command('update <id>')
    .description('Update a story')
    .option('-t, --title <title>', 'New title')
    .option('-d, --description <desc>', 'New description')
    .action(async (id, options) => {
      try {
        const { storyService } = createServices();
        const updates = {};
        if (options.title) updates.title = options.title;
        if (options.description !== undefined) updates.description = options.description;

        if (Object.keys(updates).length === 0) {
          console.log(chalk.yellow('No updates specified'));
          return;
        }

        const updated = await storyService.update(id, updates);
        console.log(chalk.green(`✓ Story updated: ${updated.title}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story status
  story
    .command('status <id> <status>')
    .description('Update story status')
    .action(async (id, status) => {
      try {
        const { storyService } = createServices();
        const updated = await storyService.updateStatus(id, status);
        console.log(chalk.green(`✓ Story status updated to: ${updated.status}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story step
  story
    .command('step <id> <stepName>')
    .description('Update a story step (init|brainstorming|specFunc|specTech|devPlan|implement|review)')
    .option('-c, --complete', 'Mark as completed')
    .option('-s, --skip', 'Mark as skipped')
    .option('--content <content>', 'Step content')
    .action(async (id, stepName, options) => {
      try {
        const { storyService } = createServices();
        const stepData = {};

        if (options.complete) {
          stepData.completed = true;
          stepData.content = options.content;
        }
        if (options.skip) {
          stepData.skipped = true;
        }

        const updated = await storyService.updateStep(id, stepName, stepData);
        console.log(chalk.green(`✓ Step ${stepName} updated`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story promote
  story
    .command('promote <id>')
    .description('Promote story to development space')
    .action(async (id) => {
      try {
        const { storyService } = createServices();

        // Check if can promote
        const check = await storyService.canPromote(id);
        if (!check.canPromote) {
          console.log(chalk.yellow(`Cannot promote: Missing steps: ${check.missingSteps.join(', ')}`));
          console.log(chalk.dim('Complete or skip these steps first.'));
          return;
        }

        const promoted = await storyService.promote(id);
        console.log(chalk.green(`✓ Story promoted to development`));
        console.log(chalk.dim(`  Status: ${promoted.status}, Space: ${promoted.space}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story move
  story
    .command('move <id> <targetEpicId>')
    .description('Move story to another epic')
    .action(async (id, targetEpicId) => {
      try {
        const { storyService } = createServices();
        const moved = await storyService.move(id, targetEpicId);
        console.log(chalk.green(`✓ Story moved: ${moved.title}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story delete
  story
    .command('delete <id>')
    .description('Delete a story')
    .action(async (id) => {
      try {
        const { storyService } = createServices();
        await storyService.delete(id);
        console.log(chalk.green(`✓ Story deleted`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story init (Set and enrich initial input)
  story
    .command('init <id>')
    .description('Set initial input for a story and optionally enrich with AI')
    .option('-i, --input <text>', 'Initial input/description')
    .option('-f, --file <path>', 'Read input from file')
    .option('--enrich', 'Enrich input with AI')
    .action(async (id, options) => {
      try {
        const { storyService, aiProvider } = createServices();

        // Get input from option or file
        let input = options.input;
        if (options.file) {
          const fs = await import('fs-extra');
          input = await fs.default.readFile(options.file, 'utf-8');
        }

        if (!input) {
          console.error(chalk.red('Input is required. Use -i or -f option.'));
          process.exit(1);
        }

        // Save input
        let story = await storyService.setInitInput(id, input);
        console.log(chalk.green(`✓ Init input saved (${input.length} chars)`));

        // Enrich if requested
        if (options.enrich) {
          if (!aiProvider.isConfigured()) {
            console.error(chalk.yellow('AI provider not configured. Input saved but not enriched.'));
            return;
          }

          console.log(chalk.cyan(`\nEnriching with ${aiProvider.getProvider()}...`));
          const enriched = await aiProvider.enrichStoryInit(input);
          story = await storyService.setInitEnriched(id, enriched, aiProvider.getModel());

          console.log(chalk.bold('\nEnriched Discovery Document:\n'));
          console.log(chalk.white(enriched));
          console.log(chalk.green(`\n✓ Enriched with ${aiProvider.getModel()}`));
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story generate-step (AI-assisted step generation with history)
  story
    .command('generate-step <id> <stepName>')
    .alias('gen')
    .description('Generate step content with AI (init|brainstorming|specFunc)')
    .option('--context <context>', 'Additional context for AI')
    .action(async (id, stepName, options) => {
      try {
        const { storyService, aiProvider } = createServices();

        // Validate step name
        const validSteps = ['init', 'brainstorming', 'specFunc'];
        if (!validSteps.includes(stepName)) {
          console.error(chalk.red(`Invalid step name. Must be one of: ${validSteps.join(', ')}`));
          process.exit(1);
        }

        // Check AI provider
        if (!aiProvider.isConfigured()) {
          console.error(chalk.red('AI provider not configured.'));
          console.log(chalk.dim('Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.'));
          process.exit(1);
        }

        // Get story
        const story = await storyService.getById(id);

        console.log(chalk.cyan(`\nGenerating ${stepName} for: ${story.title}`));
        console.log(chalk.dim(`Using ${aiProvider.getProvider()} (${aiProvider.getModel()})...`));
        console.log();

        // Build context from story init
        let context = '';
        if (story.init?.enriched) {
          context = `Story Context:\n${story.init.enriched}`;
        } else if (story.init?.input) {
          context = `Story Context:\n${story.init.input}`;
        }

        // Build input
        let input = `Story: ${story.title}\n`;
        if (story.description) {
          input += `Description: ${story.description}\n`;
        }
        if (options.context) {
          input += `Additional context: ${options.context}\n`;
        }

        // Generate based on step type
        let generatedContent;
        switch (stepName) {
          case 'init':
            generatedContent = await aiProvider.generateInit(input, context);
            break;
          case 'specFunc':
            if (story.steps?.init?.content) {
              input = `${input}\nExisting Init:\n${story.steps.init.content}`;
            }
            generatedContent = await aiProvider.generateSpecFunc(input, context);
            break;
          case 'brainstorming':
            if (story.steps?.init?.content) {
              input = `${input}\nInit:\n${story.steps.init.content}`;
            }
            if (story.steps?.specFunc?.content) {
              input = `${input}\nFunctional Specification:\n${story.steps.specFunc.content}`;
            }
            generatedContent = await aiProvider.generateBrainstorming(input, context);
            break;
        }

        // Save to history
        const updatedStory = await storyService.addStepVersion(
          id,
          stepName,
          generatedContent,
          'CLI generation',
          aiProvider.getModel()
        );

        // Display generated content
        console.log(chalk.bold(`Generated ${stepName} (v${updatedStory.steps[stepName].currentVersion}):\n`));
        console.log(chalk.white(generatedContent));
        console.log();
        console.log(chalk.green(`✓ Saved as version ${updatedStory.steps[stepName].currentVersion}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story iterate (Iterate on existing step with feedback)
  story
    .command('iterate <id> <stepName>')
    .alias('iter')
    .description('Iterate on a step with feedback/instructions')
    .requiredOption('-i, --instructions <text>', 'Iteration instructions')
    .action(async (id, stepName, options) => {
      try {
        const { storyService, aiProvider } = createServices();

        // Validate step name
        const validSteps = ['init', 'brainstorming', 'specFunc', 'specTech', 'devPlan', 'implement', 'review'];
        if (!validSteps.includes(stepName)) {
          console.error(chalk.red(`Invalid step name. Must be one of: ${validSteps.join(', ')}`));
          process.exit(1);
        }

        // Check AI provider
        if (!aiProvider.isConfigured()) {
          console.error(chalk.red('AI provider not configured.'));
          process.exit(1);
        }

        // Get story
        const story = await storyService.getById(id);
        const currentContent = story.steps[stepName]?.content;

        if (!currentContent) {
          console.error(chalk.red(`Step ${stepName} has no content to iterate on. Generate first.`));
          process.exit(1);
        }

        console.log(chalk.cyan(`\nIterating ${stepName} for: ${story.title}`));
        console.log(chalk.dim(`Instructions: "${options.instructions}"`));
        console.log(chalk.dim(`Using ${aiProvider.getProvider()}...`));
        console.log();

        // Build context
        let context = '';
        if (story.init?.enriched) {
          context += `Story Init:\n${story.init.enriched}\n\n`;
        }

        // Iterate
        const newContent = await aiProvider.iterateContent(currentContent, options.instructions, context);

        // Save to history
        const updatedStory = await storyService.addStepVersion(
          id,
          stepName,
          newContent,
          options.instructions,
          aiProvider.getModel()
        );

        // Display
        console.log(chalk.bold(`Iterated ${stepName} (v${updatedStory.steps[stepName].currentVersion}):\n`));
        console.log(chalk.white(newContent));
        console.log();
        console.log(chalk.green(`✓ Saved as version ${updatedStory.steps[stepName].currentVersion}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story history (Show version history for a step)
  story
    .command('history <id> <stepName>')
    .description('Show version history for a step')
    .action(async (id, stepName) => {
      try {
        const { storyService } = createServices();

        const validSteps = ['init', 'brainstorming', 'specFunc', 'specTech', 'devPlan', 'implement', 'review'];
        if (!validSteps.includes(stepName)) {
          console.error(chalk.red(`Invalid step name. Must be one of: ${validSteps.join(', ')}`));
          process.exit(1);
        }

        const history = await storyService.getStepHistory(id, stepName);

        if (history.length === 0) {
          console.log(chalk.yellow(`No history for step ${stepName}`));
          return;
        }

        console.log(chalk.bold(`\nVersion history for ${stepName} (${history.length} versions):\n`));

        for (const v of history.slice().reverse()) {
          console.log(chalk.cyan(`Version ${v.version}`));
          console.log(chalk.dim(`  Generated: ${new Date(v.generatedAt).toLocaleString()}`));
          console.log(chalk.dim(`  Model: ${v.model}`));
          if (v.instructions) {
            console.log(chalk.dim(`  Instructions: "${v.instructions.substring(0, 60)}${v.instructions.length > 60 ? '...' : ''}"`));
          }
          console.log();
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story revert (Revert to a previous version)
  story
    .command('revert <id> <stepName> <version>')
    .description('Revert a step to a previous version')
    .action(async (id, stepName, version) => {
      try {
        const { storyService } = createServices();

        const validSteps = ['init', 'brainstorming', 'specFunc', 'specTech', 'devPlan', 'implement', 'review'];
        if (!validSteps.includes(stepName)) {
          console.error(chalk.red(`Invalid step name. Must be one of: ${validSteps.join(', ')}`));
          process.exit(1);
        }

        const versionNum = parseInt(version, 10);
        if (isNaN(versionNum)) {
          console.error(chalk.red('Version must be a number'));
          process.exit(1);
        }

        const story = await storyService.revertStepToVersion(id, stepName, versionNum);
        console.log(chalk.green(`✓ Reverted ${stepName} to version ${versionNum}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story generate-all (AI-assisted all steps generation with history)
  story
    .command('generate-all <id>')
    .alias('gen-all')
    .description('Generate all steps content with AI (init, brainstorming, specFunc)')
    .option('--context <context>', 'Additional context for AI')
    .action(async (id, options) => {
      try {
        const { storyService, aiProvider } = createServices();

        // Check AI provider
        if (!aiProvider.isConfigured()) {
          console.error(chalk.red('AI provider not configured.'));
          console.log(chalk.dim('Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.'));
          process.exit(1);
        }

        // Get story
        const story = await storyService.getById(id);

        console.log(chalk.cyan(`\nGenerating all steps for: ${story.title}`));
        console.log(chalk.dim(`Using ${aiProvider.getProvider()} (${aiProvider.getModel()})...`));
        console.log();

        // Build context from story init
        let context = '';
        if (story.init?.enriched) {
          context = `Story Context:\n${story.init.enriched}`;
        } else if (story.init?.input) {
          context = `Story Context:\n${story.init.input}`;
        }

        // Build base input
        let baseInput = `Story: ${story.title}\n`;
        if (story.description) {
          baseInput += `Description: ${story.description}\n`;
        }
        if (options.context) {
          baseInput += `Additional context: ${options.context}\n`;
        }

        // Generate Init
        console.log(chalk.bold('1. Generating Init...'));
        const init = await aiProvider.generateInit(baseInput, context);
        await storyService.addStepVersion(id, 'init', init, 'Generate all - Init', aiProvider.getModel());
        console.log(chalk.dim('   Done (v1 saved)'));

        // Generate Spec-Func (using init)
        console.log(chalk.bold('2. Generating Spec-Func...'));
        const specFuncInput = `${baseInput}\nExisting Init:\n${init}`;
        const specFunc = await aiProvider.generateSpecFunc(specFuncInput, context);
        await storyService.addStepVersion(id, 'specFunc', specFunc, 'Generate all - Spec-Func', aiProvider.getModel());
        console.log(chalk.dim('   Done (v1 saved)'));

        // Generate Brainstorming (using init + specFunc)
        console.log(chalk.bold('3. Generating Brainstorming...'));
        const brainstormingInput = `${baseInput}\nInit:\n${init}\nFunctional Specification:\n${specFunc}`;
        const brainstorming = await aiProvider.generateBrainstorming(brainstormingInput, context);
        await storyService.addStepVersion(id, 'brainstorming', brainstorming, 'Generate all - Brainstorming', aiProvider.getModel());
        console.log(chalk.dim('   Done (v1 saved)'));

        console.log();

        // Display generated content
        console.log(chalk.bold.underline('Generated Init:'));
        console.log(chalk.white(init));
        console.log();

        console.log(chalk.bold.underline('Generated Spec-Func:'));
        console.log(chalk.white(specFunc));
        console.log();

        console.log(chalk.bold.underline('Generated Brainstorming:'));
        console.log(chalk.white(brainstorming));
        console.log();

        console.log(chalk.green('✓ All steps generated and saved with version history'));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story figma (Manage Figma links)
  const figmaCmd = story
    .command('figma')
    .description('Manage Figma links for story init');

  // story figma add
  figmaCmd
    .command('add <storyId> <url>')
    .description('Add a Figma link to story init')
    .option('-l, --label <label>', 'Optional label for the link')
    .action(async (storyId, url, options) => {
      try {
        const { storyService, figmaProvider } = createServices();

        // Validate URL
        if (!isValidFigmaUrl(url)) {
          console.error(chalk.red('Invalid Figma URL. Must be a figma.com URL.'));
          process.exit(1);
        }

        // Check if Figma is configured
        let cacheKey = null;
        let figmaData = null;

        if (figmaProvider.isConfigured()) {
          console.log(chalk.cyan('Fetching Figma design data...'));
          cacheKey = figmaProvider.getCacheKey(url);
          try {
            figmaData = await figmaProvider.fetchDesign(url);
            console.log(chalk.green(`✓ Design data cached: ${figmaData.name}`));
            console.log(chalk.dim(`  Components: ${figmaData.components?.length || 0}`));
            console.log(chalk.dim(`  Frames: ${figmaData.frames?.length || 0}`));
          } catch (err) {
            console.log(chalk.yellow(`⚠ Could not fetch design data: ${err.message}`));
          }
        } else {
          console.log(chalk.yellow('⚠ FIGMA_TOKEN not set - saving URL only (no design data for AI)'));
        }

        await storyService.addFigmaLink(storyId, url, options.label || null, cacheKey);
        console.log(chalk.green(`✓ Figma link added`));
        if (options.label) {
          console.log(chalk.dim(`  Label: ${options.label}`));
        }
        console.log(chalk.dim(`  URL: ${url}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story figma status
  figmaCmd
    .command('status')
    .description('Check Figma API configuration status')
    .action(async () => {
      try {
        const { figmaProvider } = createServices();

        console.log(chalk.bold('\nFigma Configuration:\n'));

        if (figmaProvider.isConfigured()) {
          console.log(chalk.green('  ✓ FIGMA_TOKEN is configured'));
          console.log(chalk.dim('  Design data will be fetched and cached for AI enrichment'));
        } else {
          console.log(chalk.yellow('  ⚠ FIGMA_TOKEN is not set'));
          console.log(chalk.dim('  Links will be saved as URLs only (no design data for AI)'));
          console.log();
          console.log(chalk.bold('  To configure:'));
          console.log(chalk.cyan('  export FIGMA_TOKEN=your-personal-access-token'));
          console.log(chalk.dim('  Get your token from: Figma Settings > Account > Personal Access Tokens'));
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story figma list
  figmaCmd
    .command('list <storyId>')
    .alias('ls')
    .description('List Figma links for a story')
    .action(async (storyId) => {
      try {
        const { storyService, figmaProvider } = createServices();
        const { figmaLinks } = await storyService.getInitAssets(storyId);

        if (figmaLinks.length === 0) {
          console.log(chalk.yellow('No Figma links attached.'));
          return;
        }

        console.log(chalk.bold(`\nFigma Links (${figmaLinks.length}):\n`));
        for (const link of figmaLinks) {
          const label = link.label ? chalk.cyan(`[${link.label}] `) : '';
          const cached = link.cacheKey ? chalk.green(' [cached]') : chalk.dim(' [no cache]');
          console.log(`  ${label}${link.url}${cached}`);
          console.log(chalk.dim(`    Added: ${new Date(link.addedAt).toLocaleString()}`));

          // Show cached data summary if available
          if (link.cacheKey && figmaProvider.isConfigured()) {
            try {
              const cachedData = await figmaProvider.getCached(link.url);
              if (cachedData) {
                console.log(chalk.dim(`    Design: ${cachedData.name} | Components: ${cachedData.components?.length || 0} | Frames: ${cachedData.frames?.length || 0}`));
              }
            } catch {
              // Ignore cache read errors
            }
          }
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story figma remove
  figmaCmd
    .command('remove <storyId> <url>')
    .alias('rm')
    .description('Remove a Figma link from story init')
    .action(async (storyId, url) => {
      try {
        const { storyService } = createServices();
        await storyService.removeFigmaLink(storyId, url);
        console.log(chalk.green(`✓ Figma link removed`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story attach (Add attachment)
  story
    .command('attach <storyId> <filePath>')
    .description('Attach a file to story init')
    .action(async (storyId, filePath) => {
      try {
        const { storyService, storage } = createServices();

        // Resolve and check file
        const absolutePath = path.resolve(filePath);
        if (!await fs.pathExists(absolutePath)) {
          console.error(chalk.red(`File not found: ${absolutePath}`));
          process.exit(1);
        }

        const stats = await fs.stat(absolutePath);
        if (!stats.isFile()) {
          console.error(chalk.red('Path is not a file'));
          process.exit(1);
        }

        // Get story to determine destination
        const story = await storyService.getById(storyId);

        // Copy file to attachments directory
        const filename = path.basename(absolutePath);
        const attachDir = path.join(storage.basePath, '.aia', 'stories', storyId, 'attachments');
        await fs.ensureDir(attachDir);

        const destPath = path.join(attachDir, filename);
        await fs.copy(absolutePath, destPath);

        // Determine MIME type (basic)
        const ext = path.extname(filename).toLowerCase();
        const mimeTypes = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.pdf': 'application/pdf',
          '.txt': 'text/plain',
          '.md': 'text/markdown',
          '.json': 'application/json',
        };
        const mimeType = mimeTypes[ext] || 'application/octet-stream';

        // Save attachment metadata
        await storyService.addAttachment(storyId, {
          filename,
          path: `stories/${storyId}/attachments/${filename}`,
          type: mimeType,
          size: stats.size,
        });

        console.log(chalk.green(`✓ File attached: ${filename}`));
        console.log(chalk.dim(`  Size: ${(stats.size / 1024).toFixed(2)} KB`));
        console.log(chalk.dim(`  Type: ${mimeType}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story attachments (List attachments)
  story
    .command('attachments <storyId>')
    .alias('att')
    .description('List attachments for a story')
    .action(async (storyId) => {
      try {
        const { storyService } = createServices();
        const { attachments } = await storyService.getInitAssets(storyId);

        if (attachments.length === 0) {
          console.log(chalk.yellow('No attachments.'));
          return;
        }

        console.log(chalk.bold(`\nAttachments (${attachments.length}):\n`));
        for (const att of attachments) {
          console.log(`  ${chalk.cyan(att.filename)}`);
          console.log(chalk.dim(`    Type: ${att.type} | Size: ${(att.size / 1024).toFixed(2)} KB`));
          console.log(chalk.dim(`    Uploaded: ${new Date(att.uploadedAt).toLocaleString()}`));
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story detach (Remove attachment)
  story
    .command('detach <storyId> <filename>')
    .description('Remove an attachment from story init')
    .action(async (storyId, filename) => {
      try {
        const { storyService, storage } = createServices();

        // Get story to find attachment
        const { attachments } = await storyService.getInitAssets(storyId);
        const attachment = attachments.find((a) => a.filename === filename);

        if (!attachment) {
          console.error(chalk.red(`Attachment not found: ${filename}`));
          process.exit(1);
        }

        // Remove file from disk
        const filePath = path.join(storage.basePath, '.aia', attachment.path);
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
        }

        // Remove metadata
        await storyService.removeAttachment(storyId, filename);
        console.log(chalk.green(`✓ Attachment removed: ${filename}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story assets (Show all init assets)
  story
    .command('assets <storyId>')
    .description('Show all init assets (attachments and Figma links)')
    .action(async (storyId) => {
      try {
        const { storyService } = createServices();
        const story = await storyService.getById(storyId);
        const { attachments, figmaLinks } = await storyService.getInitAssets(storyId);

        console.log(chalk.bold(`\nInit Assets for: ${story.title}\n`));

        // Init content
        if (story.init?.input || story.init?.enriched) {
          console.log(chalk.bold.underline('Init Content:'));
          if (story.init.input) {
            console.log(`  Input: ${story.init.input.substring(0, 100)}${story.init.input.length > 100 ? '...' : ''}`);
          }
          if (story.init.enriched) {
            console.log(chalk.dim(`  Enriched with ${story.init.model} at ${new Date(story.init.enrichedAt).toLocaleString()}`));
          }
          console.log();
        }

        // Figma links
        console.log(chalk.bold.underline(`Figma Links (${figmaLinks.length}):`));
        if (figmaLinks.length === 0) {
          console.log(chalk.dim('  None'));
        } else {
          for (const link of figmaLinks) {
            const label = link.label ? chalk.cyan(`[${link.label}] `) : '';
            console.log(`  ${label}${link.url}`);
          }
        }
        console.log();

        // Attachments
        console.log(chalk.bold.underline(`Attachments (${attachments.length}):`));
        if (attachments.length === 0) {
          console.log(chalk.dim('  None'));
        } else {
          for (const att of attachments) {
            console.log(`  ${chalk.cyan(att.filename)} ${chalk.dim(`(${(att.size / 1024).toFixed(2)} KB)`)}`);
          }
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // story stats
  story
    .command('stats')
    .description('Show story statistics')
    .option('-e, --epic <id>', 'Filter by epic')
    .action(async (options) => {
      try {
        const { storyService } = createServices();
        const stats = await storyService.getStats({ epicId: options.epic });

        console.log(chalk.bold('\nStory Statistics:\n'));
        console.log(`  Total: ${stats.total}`);
        console.log(chalk.bold('\n  By Type:'));
        console.log(`    Features: ${stats.byType.feature}`);
        console.log(`    Bugs: ${stats.byType.bug}`);
        console.log(chalk.bold('\n  By Space:'));
        console.log(`    Experimentation: ${stats.bySpace.experimentation}`);
        console.log(`    Development: ${stats.bySpace.development}`);
        console.log(chalk.bold('\n  By Status:'));
        for (const [status, count] of Object.entries(stats.byStatus)) {
          if (count > 0) {
            console.log(`    ${status}: ${count}`);
          }
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
