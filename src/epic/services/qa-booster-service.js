/**
 * @fileoverview QA Booster Service - AI-powered QA test plan generation
 * @module epic/services/qa-booster-service
 */

import fs from 'fs-extra';
import path from 'node:path';
import { ValidationError, StorageError, SecurityError } from '../utils/errors.js';
import { isPathWithinDir } from '../utils/path-utils.js';
import { AIA_DIR } from '../../constants.js';
import { loadConfig } from '../../models.js';
import { callModel } from '../../services/model-call.js';

/**
 * QA Generation Profiles - predefined test category combinations
 */
export const QA_PROFILES = {
  product: {
    name: 'Produit',
    description: 'Tests UI, fonctionnels, UX - pour QA produit',
    icon: '👤',
    categories: ['ui', 'functional', 'edge-cases'],
  },
  api: {
    name: 'API',
    description: 'Endpoints, validation, erreurs - pour QA technique',
    icon: '🔌',
    categories: ['api', 'validation'],
  },
  security: {
    name: 'Sécurité',
    description: 'XSS, CSRF, injections - tests de sécurité',
    icon: '🔒',
    categories: ['security'],
  },
  full: {
    name: 'Complet',
    description: 'Tous les types de tests',
    icon: '📦',
    categories: ['ui', 'functional', 'api', 'security', 'edge-cases', 'validation'],
  },
};

/**
 * Available test categories
 */
export const QA_CATEGORIES = {
  ui: { name: 'Interface utilisateur', icon: '🖥️' },
  functional: { name: 'Fonctionnel', icon: '⚙️' },
  api: { name: 'API', icon: '🔌' },
  security: { name: 'Sécurité', icon: '🔒' },
  'edge-cases': { name: 'Cas limites', icon: '⚠️' },
  validation: { name: 'Validation', icon: '✅' },
};

/**
 * @typedef {Object} QABoosterConfig
 * @property {string} [outputPath] - Custom output file path
 * @property {string} [outputDir] - Custom output directory
 * @property {string} [model] - Model override for QA generation
 * @property {string} [profile] - QA profile: 'product', 'api', 'security', 'full'
 * @property {string[]} [categories] - Custom categories when profile is 'custom'
 */

/**
 * @typedef {Object} BoosterContext
 * @property {string} featurePath - Path to the feature/story directory
 * @property {string} featureName - Name of the feature
 * @property {string} [testCycle] - Test cycle identifier
 * @property {string} [model] - AI model to use for generation
 */

/**
 * @typedef {Object} BoosterResult
 * @property {boolean} success - Whether generation succeeded
 * @property {string} [outputPath] - Path to generated file
 * @property {string} [content] - Generated content
 * @property {Object} [metadata] - Generation metadata
 * @property {Error} [error] - Error if failed
 */

/**
 * Default configuration for QA Booster
 */
const DEFAULT_QA_CONFIG = {
  outputPath: null,
  outputDir: null,
  model: null,
  profile: 'full', // Default to full profile
  categories: null, // Custom categories (overrides profile)
};

/**
 * Service for generating QA test plans using AI from feature documentation
 */
export class QABoosterService {
  /**
   * Creates a new QA Booster Service
   * @param {Partial<QABoosterConfig>} [config={}] - Configuration overrides
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_QA_CONFIG, ...config };
    this.root = process.cwd();
  }

  /**
   * Sets the project root directory
   * @param {string} root - Project root path
   */
  setRoot(root) {
    this.root = root;
  }

  /**
   * Loads the QA prompt template
   * @returns {Promise<string>} Prompt template content
   */
  async loadPromptTemplate() {
    const templatePath = path.join(this.root, AIA_DIR, 'prompts', 'qa.md');

    if (!(await fs.pathExists(templatePath))) {
      throw new ValidationError('QA prompt template not found: .aia/prompts/qa.md');
    }

    return fs.readFile(templatePath, 'utf-8');
  }

  /**
   * Loads source documents for QA generation
   * @param {string} featurePath - Path to feature/story directory
   * @returns {Promise<Object>} Object with document contents
   */
  async loadSourceDocuments(featurePath) {
    const docs = {
      devPlan: '',
      implement: '',
      review: '',
      spec: '',
      baSpec: '',
      techSpec: '',
    };

    // Primary sources for QA generation
    const devPlanPath = path.join(featurePath, 'dev-plan.md');
    const implementPath = path.join(featurePath, 'implement.md');
    const reviewPath = path.join(featurePath, 'review.md');

    // Secondary sources (fallback context)
    const specPath = path.join(featurePath, 'spec.md');
    const baSpecPath = path.join(featurePath, 'ba-spec.md');
    const techSpecPath = path.join(featurePath, 'tech-spec.md');

    // Load all documents in parallel
    const [devPlan, implement, review, spec, baSpec, techSpec] = await Promise.all([
      this.readIfExists(devPlanPath),
      this.readIfExists(implementPath),
      this.readIfExists(reviewPath),
      this.readIfExists(specPath),
      this.readIfExists(baSpecPath),
      this.readIfExists(techSpecPath),
    ]);

    docs.devPlan = devPlan;
    docs.implement = implement;
    docs.review = review;
    docs.spec = spec;
    docs.baSpec = baSpec;
    docs.techSpec = techSpec;

    return docs;
  }

  /**
   * Reads a file if it exists, returns empty string otherwise
   * @param {string} filePath - Path to file
   * @returns {Promise<string>} File content or empty string
   */
  async readIfExists(filePath) {
    try {
      if (await fs.pathExists(filePath)) {
        return await fs.readFile(filePath, 'utf-8');
      }
    } catch {
      // Ignore read errors
    }
    return '';
  }

  /**
   * Resolves the categories to generate based on profile or explicit categories
   * @param {string} [profile] - Profile name ('product', 'api', 'security', 'full')
   * @param {string[]} [categories] - Explicit categories (overrides profile)
   * @returns {string[]} Array of category names to generate
   */
  resolveCategories(profile, categories) {
    // Explicit categories take priority
    if (categories && categories.length > 0) {
      return categories;
    }

    // Use profile
    const profileConfig = QA_PROFILES[profile] || QA_PROFILES.full;
    return profileConfig.categories;
  }

  /**
   * Builds the full prompt for AI generation
   * @param {Object} docs - Source documents
   * @param {string} featureName - Feature name
   * @param {string} promptTemplate - QA prompt template
   * @param {Object} [options] - Generation options
   * @param {string} [options.profile] - QA profile
   * @param {string[]} [options.categories] - Explicit categories
   * @returns {string} Complete prompt
   */
  buildPrompt(docs, featureName, promptTemplate, options = {}) {
    const parts = [];
    const categories = this.resolveCategories(options.profile, options.categories);

    parts.push('You are generating a QA test plan for the following feature.\n');
    parts.push(`Feature: ${featureName}\n`);

    // Add profile/category instructions
    parts.push('=== TEST CATEGORIES TO GENERATE ===\n');
    parts.push(`Generate ONLY the following types of tests:\n`);
    categories.forEach(cat => {
      const catConfig = QA_CATEGORIES[cat];
      if (catConfig) {
        parts.push(`- ${catConfig.icon} ${catConfig.name} (${cat})\n`);
      } else {
        parts.push(`- ${cat}\n`);
      }
    });
    parts.push('\nDO NOT generate tests for categories not listed above.\n');
    parts.push('\n');

    // Add source documents
    if (docs.devPlan) {
      parts.push('=== DEV PLAN ===\n');
      parts.push(docs.devPlan);
      parts.push('\n');
    }

    if (docs.implement) {
      parts.push('=== IMPLEMENTATION NOTES ===\n');
      parts.push(docs.implement);
      parts.push('\n');
    }

    if (docs.review) {
      parts.push('=== CODE REVIEW ===\n');
      parts.push(docs.review);
      parts.push('\n');
    }

    // Add secondary sources if primary sources are missing
    if (!docs.devPlan && !docs.implement) {
      if (docs.techSpec) {
        parts.push('=== TECH SPEC ===\n');
        parts.push(docs.techSpec);
        parts.push('\n');
      }

      if (docs.baSpec) {
        parts.push('=== BA SPEC ===\n');
        parts.push(docs.baSpec);
        parts.push('\n');
      }

      if (docs.spec) {
        parts.push('=== SPEC ===\n');
        parts.push(docs.spec);
        parts.push('\n');
      }
    }

    // Add the prompt template as instructions
    parts.push('=== TASK ===\n');
    parts.push(promptTemplate);

    return parts.join('\n');
  }

  /**
   * Validates the execution context
   * @param {Object} docs - Source documents
   * @returns {boolean} True if valid
   */
  validate(docs) {
    // Must have at least one source document
    return !!(
      docs.devPlan ||
      docs.implement ||
      docs.review ||
      docs.techSpec ||
      docs.baSpec ||
      docs.spec
    );
  }

  /**
   * Resolves the model to use for QA generation
   * @param {string} [modelOverride] - Model passed explicitly (from API/CLI)
   * @returns {Promise<string>} Model identifier
   */
  async resolveModel(modelOverride) {
    // Priority: explicit override > config.model > project config > fallback
    if (modelOverride) {
      return modelOverride;
    }

    if (this.config.model) {
      return this.config.model;
    }

    try {
      const config = await loadConfig(this.root);
      // Use 'qa' model config, then 'review' as fallback
      const models = config.models?.qa || config.models?.review;

      if (models && models.length > 0) {
        // Weighted random selection
        const totalWeight = models.reduce((sum, m) => sum + (m.weight || 1), 0);
        let random = Math.random() * totalWeight;
        for (const m of models) {
          random -= m.weight || 1;
          if (random <= 0) {
            return m.model;
          }
        }
        // Fallback to first model
        return models[0].model;
      }
    } catch {
      // Ignore config errors
    }

    // Default fallback
    return 'claude-default';
  }

  /**
   * Resolves the output file path
   * @param {string} featurePath - Feature directory path
   * @returns {string} Full output path
   */
  resolveOutputPath(featurePath) {
    if (this.config.outputPath) {
      const customPath = path.resolve(featurePath, this.config.outputPath);
      if (!isPathWithinDir(customPath, featurePath)) {
        throw new SecurityError('Output path must be within feature directory');
      }
      return customPath;
    }

    if (this.config.outputDir) {
      const dirPath = path.resolve(featurePath, this.config.outputDir);
      if (!isPathWithinDir(dirPath, featurePath)) {
        throw new SecurityError('Output directory must be within feature directory');
      }
      return path.join(dirPath, 'qa.md');
    }

    return path.join(featurePath, 'qa.md');
  }

  /**
   * Writes content to file atomically (temp file + rename)
   * @param {string} outputPath - Target file path
   * @param {string} content - Content to write
   * @returns {Promise<void>}
   */
  async writeAtomically(outputPath, content) {
    const tempPath = `${outputPath}.tmp.${Date.now()}`;

    try {
      await fs.ensureDir(path.dirname(outputPath));
      await fs.writeFile(tempPath, content, 'utf-8');
      await fs.rename(tempPath, outputPath);
    } catch (error) {
      try {
        await fs.remove(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw new StorageError(`Failed to write QA file: ${error.message}`);
    }
  }

  /**
   * Preserves checkbox states from existing QA file
   * @param {string} outputPath - Path to existing QA file
   * @param {string} newContent - New generated content
   * @returns {Promise<string>} Content with preserved checkbox states
   */
  async preserveCheckboxStates(outputPath, newContent) {
    try {
      if (!(await fs.pathExists(outputPath))) {
        return newContent;
      }

      const existingContent = await fs.readFile(outputPath, 'utf-8');
      const existingStates = this.parseCheckboxStates(existingContent);

      if (existingStates.size === 0) {
        return newContent;
      }

      // Replace checkbox states in new content based on test IDs
      return newContent.replace(
        /- \[([ x])\] \*\*\[(TC-[A-Z]\d+)\]\*\*/g,
        (match, state, testId) => {
          const preservedState = existingStates.get(testId);
          if (preservedState === 'x') {
            return `- [x] **[${testId}]**`;
          }
          return match;
        }
      );
    } catch {
      return newContent;
    }
  }

  /**
   * Parses checkbox states from markdown content
   * @param {string} content - Markdown content
   * @returns {Map<string, string>} Map of test ID to checkbox state
   */
  parseCheckboxStates(content) {
    const states = new Map();
    const regex = /- \[([ x])\] \*\*\[(TC-[A-Z]\d+)\]\*\*/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
      states.set(match[2], match[1]);
    }

    return states;
  }

  /**
   * Executes the QA booster to generate a test plan using AI
   * @param {BoosterContext} context - Execution context
   * @returns {Promise<BoosterResult>} Generation result
   */
  async execute(context) {
    try {
      // Load source documents
      const docs = await this.loadSourceDocuments(context.featurePath);

      // Validate
      if (!this.validate(docs)) {
        return {
          success: false,
          error: new ValidationError(
            'No source documents found. Need at least one of: dev-plan.md, implement.md, review.md, tech-spec.md, ba-spec.md, spec.md'
          ),
        };
      }

      // Load prompt template
      const promptTemplate = await this.loadPromptTemplate();

      // Resolve profile and categories
      const profile = context.profile || this.config.profile || 'full';
      const categories = context.categories || this.config.categories || null;

      // Build full prompt with profile/category filtering
      const prompt = this.buildPrompt(docs, context.featureName, promptTemplate, {
        profile,
        categories,
      });

      // Resolve model (explicit model from context takes priority)
      const model = await this.resolveModel(context.model);

      // Call AI
      console.log(`[QA] Generating test plan for "${context.featureName}" using ${model}...`);
      const callResult = await callModel(model, prompt, {
        verbose: false,
        apply: false,
        cwd: this.root,
      });
      const generatedContent = callResult.output;

      // Resolve output path
      const outputPath = this.resolveOutputPath(context.featurePath);

      // Preserve existing checkbox states
      const finalContent = await this.preserveCheckboxStates(outputPath, generatedContent);

      // Write atomically
      await this.writeAtomically(outputPath, finalContent);

      // Count tests in generated content
      const testCount = (finalContent.match(/- \[[ x]\] \*\*\[TC-/g) || []).length;

      // Resolve actual categories used
      const resolvedCategories = this.resolveCategories(profile, categories);

      return {
        success: true,
        outputPath,
        content: finalContent,
        metadata: {
          totalTests: testCount,
          model,
          profile,
          categories: resolvedCategories,
          sourceDocs: {
            hasDevPlan: !!docs.devPlan,
            hasImplement: !!docs.implement,
            hasReview: !!docs.review,
            hasTechSpec: !!docs.techSpec,
            hasBaSpec: !!docs.baSpec,
            hasSpec: !!docs.spec,
          },
        },
      };
    } catch (error) {
      if (
        error instanceof ValidationError ||
        error instanceof StorageError ||
        error instanceof SecurityError
      ) {
        return {
          success: false,
          error,
        };
      }

      return {
        success: false,
        error: new StorageError(`Unexpected error during QA generation: ${error.message}`),
      };
    }
  }

  /**
   * Generates QA plan from a feature directory
   * @param {string} featurePath - Path to feature directory
   * @param {Object} [options={}] - Generation options
   * @param {string} [options.cycle] - Test cycle name
   * @returns {Promise<BoosterResult>} Generation result
   */
  async generateFromDirectory(featurePath, options = {}) {
    const featureName = path.basename(featurePath);

    return this.execute({
      featurePath,
      featureName,
      testCycle: options.cycle,
    });
  }

  /**
   * Previews a QA plan without writing to file
   * @param {string} featurePath - Path to feature directory
   * @param {Object} [options={}] - Preview options
   * @param {string} [options.model] - AI model to use
   * @returns {Promise<{content: string, metadata: Object}>} Preview result
   */
  async preview(featurePath, options = {}) {
    const featureName = path.basename(featurePath);
    const docs = await this.loadSourceDocuments(featurePath);

    if (!this.validate(docs)) {
      throw new ValidationError(
        'No source documents found. Need at least one of: dev-plan.md, implement.md, review.md, tech-spec.md, ba-spec.md, spec.md'
      );
    }

    const promptTemplate = await this.loadPromptTemplate();
    const prompt = this.buildPrompt(docs, featureName, promptTemplate);
    const model = await this.resolveModel(options.model);

    console.log(`[QA] Generating preview for "${featureName}" using ${model}...`);
    const callResult = await callModel(model, prompt, {
      verbose: false,
      apply: false,
      cwd: this.root,
    });
    const content = callResult.output;

    const testCount = (content.match(/- \[[ x]\] \*\*\[TC-/g) || []).length;

    return {
      content,
      metadata: {
        totalTests: testCount,
        model,
        featureName,
      },
    };
  }

  /**
   * Gets statistics from an existing QA file
   * @param {string} featurePath - Path to feature directory
   * @returns {Promise<Object>} Statistics object
   */
  async getStats(featurePath) {
    const qaPath = this.resolveOutputPath(featurePath);

    if (!(await fs.pathExists(qaPath))) {
      return {
        exists: false,
        totalTests: 0,
        completed: 0,
        pending: 0,
        byCategory: {},
      };
    }

    const content = await fs.readFile(qaPath, 'utf-8');
    const states = this.parseCheckboxStates(content);

    let completed = 0;
    let pending = 0;
    const byCategory = {
      functional: { total: 0, completed: 0 },
      api: { total: 0, completed: 0 },
      ui: { total: 0, completed: 0 },
      security: { total: 0, completed: 0 },
      edge: { total: 0, completed: 0 },
    };

    for (const [testId, state] of states) {
      const isCompleted = state === 'x';
      if (isCompleted) completed++;
      else pending++;

      // Categorize by test ID prefix
      if (testId.startsWith('TC-F')) {
        byCategory.functional.total++;
        if (isCompleted) byCategory.functional.completed++;
      } else if (testId.startsWith('TC-A')) {
        byCategory.api.total++;
        if (isCompleted) byCategory.api.completed++;
      } else if (testId.startsWith('TC-U')) {
        byCategory.ui.total++;
        if (isCompleted) byCategory.ui.completed++;
      } else if (testId.startsWith('TC-S')) {
        byCategory.security.total++;
        if (isCompleted) byCategory.security.completed++;
      } else if (testId.startsWith('TC-E')) {
        byCategory.edge.total++;
        if (isCompleted) byCategory.edge.completed++;
      }
    }

    return {
      exists: true,
      totalTests: states.size,
      completed,
      pending,
      byCategory,
    };
  }

  /**
   * Updates configuration
   * @param {Partial<QABoosterConfig>} config - New config
   */
  updateConfig(config) {
    this.config = { ...this.config, ...config };
  }

  /**
   * Gets current configuration
   * @returns {QABoosterConfig} Current config
   */
  getConfig() {
    return { ...this.config };
  }
}
