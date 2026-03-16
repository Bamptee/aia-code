/**
 * @fileoverview QA Generation CLI Commands
 * @module commands/qa-gen
 */

import chalk from 'chalk';
import path from 'node:path';
import fs from 'fs-extra';
import { QABoosterService, QA_PROFILES, QA_CATEGORIES } from '../epic/services/qa-booster-service.js';

/**
 * Creates and initializes the QA booster service
 * @param {Object} options - CLI options
 * @returns {QABoosterService} Configured service
 */
function createService(options) {
  const config = {
    outputPath: options.output || '',
    model: options.model || null,
    profile: options.profile || 'full',
    categories: options.categories ? options.categories.split(',').map(c => c.trim()) : null,
  };

  const service = new QABoosterService(config);
  service.setRoot(process.cwd());
  return service;
}

/**
 * Registers QA generation commands
 * @param {import('commander').Command} program - Commander program
 */
export function registerQAGenCommand(program) {
  const qaGen = program
    .command('qa-gen')
    .alias('qagen')
    .description('Generate QA test plan from feature documentation using AI');

  // qa-gen run <feature-path>
  qaGen
    .command('run [feature-path]')
    .description('Generate QA test plan for a feature using AI')
    .option('-c, --cycle <name>', 'Test cycle name', 'initial')
    .option('-o, --output <path>', 'Custom output file path')
    .option('-m, --model <model>', 'AI model to use')
    .option('-p, --profile <profile>', 'QA profile: product, api, security, full (default: full)', 'full')
    .option('--categories <list>', 'Custom categories (comma-separated): ui,functional,api,security,edge-cases,validation')
    .action(async (featurePath, options) => {
      try {
        const targetPath = featurePath ? path.resolve(process.cwd(), featurePath) : process.cwd();

        // Validate path exists
        if (!(await fs.pathExists(targetPath))) {
          console.error(chalk.red(`Error: Path not found: ${targetPath}`));
          process.exit(1);
        }

        // Validate profile
        const validProfiles = ['product', 'api', 'security', 'full'];
        if (options.profile && !validProfiles.includes(options.profile)) {
          console.error(chalk.red(`Error: Invalid profile "${options.profile}". Valid profiles: ${validProfiles.join(', ')}`));
          process.exit(1);
        }

        // Validate categories
        if (options.categories) {
          const validCategories = Object.keys(QA_CATEGORIES);
          const requestedCategories = options.categories.split(',').map(c => c.trim());
          const invalidCategories = requestedCategories.filter(c => !validCategories.includes(c));
          if (invalidCategories.length > 0) {
            console.error(chalk.red(`Error: Invalid categories: ${invalidCategories.join(', ')}`));
            console.error(chalk.dim(`Valid categories: ${validCategories.join(', ')}`));
            process.exit(1);
          }
        }

        const service = createService(options);

        // Display profile info
        const profileConfig = QA_PROFILES[options.profile];
        const profileIcon = profileConfig?.icon || '📦';
        const profileName = profileConfig?.name || options.profile;

        console.log(chalk.blue(`Generating QA test plan using AI...`));
        console.log(chalk.dim(`  Feature path: ${targetPath}`));
        console.log(chalk.dim(`  Test cycle: ${options.cycle}`));
        console.log(chalk.dim(`  Profile: ${profileIcon} ${profileName}`));
        if (options.categories) {
          console.log(chalk.dim(`  Categories: ${options.categories}`));
        } else if (profileConfig) {
          console.log(chalk.dim(`  Categories: ${profileConfig.categories.join(', ')}`));
        }

        const result = await service.generateFromDirectory(targetPath, {
          cycle: options.cycle,
        });

        if (result.success) {
          console.log(chalk.green(`\n✓ QA test plan generated successfully`));
          console.log(chalk.dim(`  Output: ${result.outputPath}`));
          console.log(chalk.dim(`  Total tests: ${result.metadata.totalTests}`));
          console.log(chalk.dim(`  Model: ${result.metadata.model}`));
          console.log(chalk.dim(`  Profile: ${result.metadata.profile}`));
          console.log(chalk.dim(`  Categories: ${result.metadata.categories?.join(', ')}`));

          // Show source documents used
          const sources = result.metadata.sourceDocs;
          const usedSources = [];
          if (sources.hasDevPlan) usedSources.push('dev-plan.md');
          if (sources.hasImplement) usedSources.push('implement.md');
          if (sources.hasReview) usedSources.push('review.md');
          if (sources.hasTechSpec) usedSources.push('tech-spec.md');
          if (sources.hasBaSpec) usedSources.push('ba-spec.md');
          if (sources.hasSpec) usedSources.push('spec.md');

          console.log(chalk.dim(`  Sources: ${usedSources.join(', ')}`));
        } else {
          console.error(chalk.red(`\n✗ Failed to generate QA test plan`));
          console.error(chalk.red(`  ${result.error.message}`));
          process.exit(1);
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // qa-gen preview <feature-path>
  qaGen
    .command('preview [feature-path]')
    .description('Preview QA test plan without writing to file')
    .option('-m, --model <model>', 'AI model to use')
    .action(async (featurePath, options) => {
      try {
        const targetPath = featurePath ? path.resolve(process.cwd(), featurePath) : process.cwd();

        if (!(await fs.pathExists(targetPath))) {
          console.error(chalk.red(`Error: Path not found: ${targetPath}`));
          process.exit(1);
        }

        const service = createService(options);

        console.log(chalk.blue(`Generating QA test plan preview...`));

        const result = await service.preview(targetPath);

        console.log(chalk.blue('\n=== QA Test Plan Preview ===\n'));
        console.log(result.content);
        console.log(chalk.blue('\n=== End Preview ===\n'));

        console.log(chalk.dim(`Total tests: ${result.metadata.totalTests}`));
        console.log(chalk.dim(`Model: ${result.metadata.model}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // qa-gen stats <feature-path>
  qaGen
    .command('stats [feature-path]')
    .description('Show statistics for existing QA test plan')
    .action(async (featurePath) => {
      try {
        const targetPath = featurePath ? path.resolve(process.cwd(), featurePath) : process.cwd();

        const service = createService({});
        const stats = await service.getStats(targetPath);

        if (!stats.exists) {
          console.error(chalk.red(`Error: No qa.md found at ${targetPath}`));
          process.exit(1);
        }

        const progress = stats.totalTests > 0
          ? Math.round((stats.completed / stats.totalTests) * 100)
          : 0;

        console.log(chalk.bold('\nQA Test Plan Statistics:\n'));
        console.log(`  Total Tests: ${stats.totalTests}`);
        console.log(chalk.green(`  Completed: ${stats.completed}`));
        console.log(chalk.yellow(`  Pending: ${stats.pending}`));
        console.log(`\n  Progress: ${progress}%`);

        // Show progress bar
        const barWidth = 30;
        const filled = Math.round((progress / 100) * barWidth);
        const empty = barWidth - filled;
        const bar = chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
        console.log(`  [${bar}]`);

        // Show breakdown by category
        console.log(chalk.bold('\n  By Category:'));
        const categories = stats.byCategory;
        for (const [name, data] of Object.entries(categories)) {
          if (data.total > 0) {
            const catProgress = Math.round((data.completed / data.total) * 100);
            console.log(`    ${name}: ${data.completed}/${data.total} (${catProgress}%)`);
          }
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // qa-gen profiles - List available profiles
  qaGen
    .command('profiles')
    .description('List available QA generation profiles')
    .action(() => {
      console.log(chalk.bold('\nAvailable QA Profiles:\n'));

      for (const [key, profile] of Object.entries(QA_PROFILES)) {
        console.log(`  ${profile.icon} ${chalk.cyan(key.padEnd(10))} ${profile.name}`);
        console.log(chalk.dim(`     ${profile.description}`));
        console.log(chalk.dim(`     Categories: ${profile.categories.join(', ')}`));
        console.log();
      }

      console.log(chalk.bold('Available Categories:\n'));
      for (const [key, cat] of Object.entries(QA_CATEGORIES)) {
        console.log(`  ${cat.icon} ${chalk.yellow(key.padEnd(12))} ${cat.name}`);
      }
      console.log();

      console.log(chalk.dim('Usage examples:'));
      console.log(chalk.dim('  aia qa-gen run features/my-feature --profile product'));
      console.log(chalk.dim('  aia qa-gen run features/my-feature --profile api'));
      console.log(chalk.dim('  aia qa-gen run features/my-feature --categories ui,functional,edge-cases'));
      console.log();
    });

  // Default action when no subcommand is provided
  qaGen.action(async (options, command) => {
    command.help();
  });
}
