import path from 'node:path';
import { execFile } from 'node:child_process';
import fs from 'fs-extra';
import yaml from 'yaml';
import {
  AIA_DIR,
  FEATURE_STEPS,
  STEP_ORDER,
  LEGACY_FEATURES_DIR,
  getSkippedSteps,
} from './constants.js';
import { loadConfig } from './models.js';
import { loadKnowledge } from './knowledge-loader.js';
import { readIfExists } from './utils.js';

// V3 step file name mapping (kebab-case)
const STEP_FILE_MAP = {
  'init': 'init',
  'brainstorming': 'brainstorming',
  'specFunc': 'spec-func',
  'spec-func': 'spec-func',
  'specTech': 'spec-tech',
  'spec-tech': 'spec-tech',
  'devPlan': 'dev-plan',
  'dev-plan': 'dev-plan',
  'implement': 'implement',
  'review': 'review',
};

/**
 * Get story directory path (stories first, then legacy features fallback)
 */
async function getStoryDir(feature, root) {
  const storiesPath = path.join(root, AIA_DIR, 'stories', feature);
  if (await fs.pathExists(storiesPath)) {
    return storiesPath;
  }
  const legacyPath = path.join(root, AIA_DIR, LEGACY_FEATURES_DIR, feature);
  if (await fs.pathExists(legacyPath)) {
    return legacyPath;
  }
  return storiesPath;
}

async function loadContextFiles(config, root) {
  const files = config.context_files ?? [];
  const sections = [];

  for (const file of files) {
    const content = await readIfExists(path.join(root, AIA_DIR, file));
    if (content) {
      sections.push(content);
    }
  }

  return sections.join('\n\n');
}

async function loadFeatureFiles(feature, step, root, options = {}) {
  // Support both v3 STEP_ORDER and legacy FEATURE_STEPS
  const stepOrder = STEP_ORDER || FEATURE_STEPS;
  const normalizedStep = STEP_FILE_MAP[step] || step;

  const stepIndex = stepOrder.indexOf(normalizedStep);
  if (stepIndex === -1) {
    throw new Error(`Unknown step "${step}".`);
  }

  const featureDir = await getStoryDir(feature, root);
  if (!(await fs.pathExists(featureDir))) {
    throw new Error(`Story "${feature}" not found.`);
  }

  // For review step, use optimized loading to reduce prompt size
  if (normalizedStep === 'review') {
    return loadFeatureFilesForReview(featureDir);
  }

  const priorSteps = stepOrder.slice(0, stepIndex);
  const sections = [];
  const loadedFiles = [];

  for (const s of priorSteps) {
    const fileName = STEP_FILE_MAP[s] || s;
    const filePath = path.join(featureDir, `${fileName}.md`);
    const content = await readIfExists(filePath);
    if (content) {
      sections.push(content);
      loadedFiles.push({ step: s, file: `${fileName}.md`, chars: content.length });
      console.log(`[PromptBuilder]   - Loaded prior step: ${fileName}.md (${content.length} chars)`);
    }
  }

  return { content: sections.join('\n\n'), priorSteps, loadedFiles };
}

/**
 * Load auto-analysis context when spec-tech is skipped
 * @param {string} root - Project root
 * @returns {Promise<Object>} Auto-analysis context
 */
async function loadAutoAnalysisContext(root) {
  const context = {
    knowledge: '',
    contextFiles: '',
    techStack: null,
  };

  // Load knowledge files
  try {
    const knowledgeDir = path.join(root, AIA_DIR, 'knowledge');
    if (await fs.pathExists(knowledgeDir)) {
      const files = await fs.readdir(knowledgeDir);
      const sections = [];
      for (const file of files) {
        if (file.endsWith('.md')) {
          const content = await readIfExists(path.join(knowledgeDir, file));
          if (content) {
            sections.push(`## ${file}\n${content}`);
          }
        }
      }
      context.knowledge = sections.join('\n\n');
    }
  } catch (err) {
    console.warn('[AutoAnalysis] Failed to load knowledge files:', err.message);
  }

  // Load context files
  try {
    const contextDir = path.join(root, AIA_DIR, 'context');
    if (await fs.pathExists(contextDir)) {
      const files = await fs.readdir(contextDir);
      const sections = [];
      for (const file of files) {
        if (file.endsWith('.md') || file.endsWith('.txt')) {
          const content = await readIfExists(path.join(contextDir, file));
          if (content) {
            sections.push(`## ${file}\n${content}`);
          }
        }
      }
      context.contextFiles = sections.join('\n\n');
    }
  } catch (err) {
    console.warn('[AutoAnalysis] Failed to load context files:', err.message);
  }

  // Detect tech stack
  context.techStack = await detectTechStack(root);

  return context;
}

/**
 * Check if spec-tech was skipped for a story
 * @param {string} feature - Story slug
 * @param {string} root - Project root
 * @returns {Promise<boolean>}
 */
async function isSpecTechSkipped(feature, root) {
  const featureDir = await getStoryDir(feature, root);
  const statusFile = path.join(featureDir, 'status.yaml');
  const raw = await readIfExists(statusFile);

  if (raw) {
    const status = yaml.parse(raw);
    // Check v3 skippedSteps array
    if (status?.skippedSteps?.includes('spec-tech') || status?.skippedSteps?.includes('specTech')) {
      return true;
    }
    // Check step status
    if (status?.steps?.['spec-tech']?.skipped || status?.steps?.specTech?.skipped) {
      return true;
    }
  }

  // Also check if spec-tech.md file is missing but implement is being requested
  const specTechFile = path.join(featureDir, 'spec-tech.md');
  return !(await fs.pathExists(specTechFile));
}

/**
 * Load optimized feature files for review step
 * Includes only essential context to reduce prompt size
 */
async function loadFeatureFilesForReview(featureDir) {
  const sections = [];

  // Include spec-tech summary (key decisions only)
  const specTech = await readIfExists(path.join(featureDir, 'spec-tech.md'));
  if (specTech) {
    const summary = extractTechSpecSummary(specTech);
    sections.push('## Spec Tech Summary\n' + summary);
  }

  // Include dev-plan task list only
  const devPlan = await readIfExists(path.join(featureDir, 'dev-plan.md'));
  if (devPlan) {
    const taskList = extractTaskList(devPlan);
    sections.push('## Implementation Tasks\n' + taskList);
  }

  // Skip: init, brainstorming, spec-func (already incorporated in spec-tech and dev-plan)

  return sections.join('\n\n');
}

/**
 * Extract key decisions from tech-spec (summary only)
 */
function extractTechSpecSummary(techSpec) {
  const lines = techSpec.split('\n');
  const summaryLines = [];
  let inRelevantSection = false;
  let lineCount = 0;

  // Look for key sections: Solution, Architecture, Technical Decisions
  const relevantHeaders = /^#+\s*(solution|architecture|technical decisions|approach|overview|implementation)/i;

  for (const line of lines) {
    if (relevantHeaders.test(line)) {
      inRelevantSection = true;
      summaryLines.push(line);
      lineCount = 0;
    } else if (inRelevantSection) {
      if (line.startsWith('#')) {
        inRelevantSection = false;
      } else if (lineCount < 20) {
        summaryLines.push(line);
        lineCount++;
      }
    }
  }

  // Fallback: if no sections found, take first 50 lines
  if (summaryLines.length === 0) {
    return lines.slice(0, 50).join('\n') + '\n[... truncated for review ...]';
  }

  return summaryLines.join('\n');
}

/**
 * Extract task list from dev-plan (titles and files only)
 */
function extractTaskList(devPlan) {
  const lines = devPlan.split('\n');
  const taskLines = [];

  // Match task headers and file references
  for (const line of lines) {
    if (/^#+\s*(?:Task|Tâche)\s*\d+/i.test(line)) {
      taskLines.push(line);
    } else if (/^\s*[-*]\s*(?:File|Fichier|Files|Fichiers)\s*:/i.test(line)) {
      taskLines.push(line);
    }
  }

  if (taskLines.length === 0) {
    // Fallback: extract headers only
    return lines.filter(l => l.startsWith('#')).slice(0, 20).join('\n');
  }

  return taskLines.join('\n');
}

async function loadInitSpecs(feature, root) {
  const storyDir = await getStoryDir(feature, root);
  const filePath = path.join(storyDir, 'init.md');
  return readIfExists(filePath);
}

async function loadPreviousOutput(feature, step, root) {
  const storyDir = await getStoryDir(feature, root);
  const filePath = path.join(storyDir, `${step}.md`);
  return readIfExists(filePath);
}

async function resolveKnowledgeCategories(feature, config, root) {
  const storyDir = await getStoryDir(feature, root);
  const statusFile = path.join(storyDir, 'status.yaml');
  const raw = await readIfExists(statusFile);

  if (raw) {
    const status = yaml.parse(raw);
    if (status?.knowledge?.length) {
      return status.knowledge;
    }
  }

  return config.knowledge_default ?? [];
}

function execGit(args, root) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: root, maxBuffer: 1024 * 1024 * 5 }, (err, stdout) => {
      resolve(err ? '' : (stdout?.trim() || ''));
    });
  });
}

/**
 * Detect the project's tech stack from common config files
 * @param {string} root - Project root directory
 * @returns {Promise<Object>} Detected tech stack info
 */
async function detectTechStack(root) {
  const techStack = [];
  const database = [];

  // Check package.json for Node.js projects
  const packageJsonPath = path.join(root, 'package.json');
  if (await fs.pathExists(packageJsonPath)) {
    try {
      const pkg = await fs.readJson(packageJsonPath);
      techStack.push('Node.js');

      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Frameworks
      if (allDeps.react) techStack.push('React');
      if (allDeps.vue) techStack.push('Vue');
      if (allDeps['@angular/core']) techStack.push('Angular');
      if (allDeps.svelte) techStack.push('Svelte');
      if (allDeps.express) techStack.push('Express');
      if (allDeps.fastify) techStack.push('Fastify');
      if (allDeps['@nestjs/core']) techStack.push('NestJS');
      if (allDeps.koa) techStack.push('Koa');
      if (allDeps.hono) techStack.push('Hono');
      if (allDeps.next) techStack.push('Next.js');
      if (allDeps.nuxt) techStack.push('Nuxt');

      // Database
      if (allDeps.prisma || allDeps['@prisma/client']) database.push('Prisma');
      if (allDeps.mongoose) database.push('MongoDB/Mongoose');
      if (allDeps.sequelize) database.push('Sequelize');
      if (allDeps.pg) database.push('PostgreSQL');
      if (allDeps.mysql2) database.push('MySQL');
      if (allDeps.sqlite3) database.push('SQLite');

      // Testing
      if (allDeps.jest) techStack.push('Jest');
      if (allDeps.vitest) techStack.push('Vitest');
      if (allDeps.mocha) techStack.push('Mocha');

      // TypeScript
      if (allDeps.typescript) techStack.push('TypeScript');
    } catch {
      // Ignore JSON parse errors
    }
  }

  // Check for Python projects
  const requirementsPath = path.join(root, 'requirements.txt');
  const pyprojectPath = path.join(root, 'pyproject.toml');
  if (await fs.pathExists(requirementsPath) || await fs.pathExists(pyprojectPath)) {
    techStack.push('Python');
  }

  // Check for Go projects
  const goModPath = path.join(root, 'go.mod');
  if (await fs.pathExists(goModPath)) {
    techStack.push('Go');
  }

  // Check for Rust projects
  const cargoPath = path.join(root, 'Cargo.toml');
  if (await fs.pathExists(cargoPath)) {
    techStack.push('Rust');
  }

  return {
    techStack: techStack.length > 0 ? techStack : ['Unknown'],
    database: database.length > 0 ? database : ['none detected'],
  };
}

/**
 * Build codebase context section for grounded prompts
 * @param {string} root - Project root directory
 * @returns {Promise<string>} Context section
 */
async function buildCodebaseContext(root) {
  const { techStack, database } = await detectTechStack(root);

  // Detect common directory patterns
  const patterns = [];
  const dirsToCheck = ['src', 'lib', 'app', 'pages', 'components', 'api', 'routes', 'services', 'utils'];
  for (const dir of dirsToCheck) {
    if (await fs.pathExists(path.join(root, dir))) {
      patterns.push(dir);
    }
  }

  return `
=== CODEBASE CONTEXT (Auto-detected) ===
Tech Stack: ${techStack.join(', ')}
Database: ${database.join(', ')}
Project Structure: ${patterns.length > 0 ? patterns.join(', ') : 'flat structure'}

IMPORTANT: Base your specification on these detected technologies. Do NOT invent technologies or patterns not present in this project.
`;
}

async function getGitDiff(root) {
  // 1. Try uncommitted changes (staged + unstaged), excluding .aia
  const uncommitted = await execGit(['diff', 'HEAD', '--', '.', ':!.aia'], root);
  if (uncommitted) return uncommitted;

  // 2. If no uncommitted changes, the implement step likely committed.
  //    Find the merge-base with main and diff from there.
  const branch = await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], root);
  if (branch && branch !== 'main' && branch !== 'master') {
    const base = await execGit(['merge-base', branch, 'main'], root) ||
                 await execGit(['merge-base', branch, 'master'], root);
    if (base) {
      return execGit(['diff', base, 'HEAD', '--', '.', ':!.aia'], root);
    }
  }

  // 3. Fallback: diff last commit
  return execGit(['diff', 'HEAD~1', 'HEAD', '--', '.', ':!.aia'], root);
}

/**
 * Parse YAML front matter from a markdown file
 * @param {string} content - Markdown content with optional front matter
 * @returns {{ frontMatter: Object|null, body: string }}
 */
function parseFrontMatter(content) {
  const frontMatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
  const match = content.match(frontMatterRegex);

  if (match) {
    try {
      const frontMatter = yaml.parse(match[1]);
      const body = content.slice(match[0].length);
      return { frontMatter, body };
    } catch {
      // Invalid YAML, treat as no front matter
      return { frontMatter: null, body: content };
    }
  }

  return { frontMatter: null, body: content };
}

async function loadPromptTemplate(step, root) {
  const templatePath = path.join(root, AIA_DIR, 'prompts', `${step}.md`);
  const content = await readIfExists(templatePath);
  if (!content) {
    throw new Error(`Prompt template not found: prompts/${step}.md`);
  }

  // Parse front matter and return both metadata and body
  const { frontMatter, body } = parseFrontMatter(content);
  return { content: body, metadata: frontMatter };
}

export async function buildPrompt(feature, step, { description, instructions, history, attachments, root = process.cwd(), wtPath = null } = {}) {
  console.log(`\n[PromptBuilder] ========== Building prompt for step: ${step} ==========`);
  console.log(`[PromptBuilder] Feature/Story: ${feature}`);
  console.log(`[PromptBuilder] Root: ${root}`);

  const config = await loadConfig(root);
  console.log(`[PromptBuilder] Config loaded - doc_lang: ${config.document_output_language}, comm_lang: ${config.communication_language}`);

  // Check if spec-tech was skipped (for implement step auto-analysis)
  const specTechSkipped = (step === 'implement') ? await isSpecTechSkipped(feature, root) : false;
  if (specTechSkipped) {
    console.log(`[PromptBuilder] ⚠️ spec-tech was SKIPPED - will use auto-analysis`);
  }

  console.log(`[PromptBuilder] Loading files...`);

  const [context, knowledgeCategories, initSpecs, featureResult, previousOutput, taskResult] = await Promise.all([
    loadContextFiles(config, root),
    resolveKnowledgeCategories(feature, config, root),
    loadInitSpecs(feature, root),
    loadFeatureFiles(feature, step, root),
    loadPreviousOutput(feature, step, root),
    loadPromptTemplate(step, root),
  ]);

  // Log what was loaded
  console.log(`[PromptBuilder] ✓ Context files: ${context ? `${context.length} chars` : 'none'}`);
  console.log(`[PromptBuilder] ✓ Knowledge categories: ${knowledgeCategories?.join(', ') || 'none'}`);
  console.log(`[PromptBuilder] ✓ Init specs: ${initSpecs ? `${initSpecs.length} chars` : 'none'}`);
  console.log(`[PromptBuilder] ✓ Previous output: ${previousOutput ? `${previousOutput.length} chars` : 'none'}`);

  // Handle both old string return and new object return from loadFeatureFiles
  const featureContent = typeof featureResult === 'string' ? featureResult : featureResult?.content;
  const loadedPriorSteps = featureResult?.loadedFiles || [];
  console.log(`[PromptBuilder] ✓ Feature content (prior steps): ${featureContent ? `${featureContent.length} chars` : 'none'}`);
  if (loadedPriorSteps.length > 0) {
    console.log(`[PromptBuilder]   Prior steps loaded: ${loadedPriorSteps.map(f => f.file).join(', ')}`);
  }

  // Extract task content and metadata from parsed prompt template
  const task = taskResult.content;
  const taskMetadata = taskResult.metadata;
  console.log(`[PromptBuilder] ✓ Prompt template loaded: ${taskMetadata?.name || step}.md`);
  console.log(`[PromptBuilder]   - Phase: ${taskMetadata?.phase || 'unknown'}`);
  console.log(`[PromptBuilder]   - Type: ${taskMetadata?.type || 'generate'}`);
  console.log(`[PromptBuilder]   - Scan required: ${taskMetadata?.scan_required || false}`);
  console.log(`[PromptBuilder]   - First 100 chars: "${task?.substring(0, 100)}..."`);

  // Load auto-analysis context if spec-tech was skipped
  let autoAnalysisContext = null;
  if (specTechSkipped && step === 'implement') {
    autoAnalysisContext = await loadAutoAnalysisContext(root);
    console.log(`[PromptBuilder] ✓ Auto-analysis context loaded`);
  }

  const knowledge = await loadKnowledge(knowledgeCategories, root);
  console.log(`[PromptBuilder] ✓ Knowledge: ${knowledge ? `${knowledge.length} chars` : 'none'}`);

  // Track files used for transparency
  const filesUsed = {
    promptTemplate: `${taskMetadata?.name || step}.md`,
    promptPhase: taskMetadata?.phase || 'unknown',
    promptType: taskMetadata?.type || 'generate',
    contextFiles: config.context_files || [],
    knowledgeCategories: knowledgeCategories || [],
    priorSteps: loadedPriorSteps,
    codebaseFiles: [],
    initFile: initSpecs ? 'init.md' : null,
  };

  const parts = [];

  parts.push('IMPORTANT: You are working on a feature development pipeline. Everything you need is provided below in this prompt. Do NOT attempt to read, search for, or reference any external files. Do NOT say files are missing. Work exclusively with the content given below.\n');

  // Worktree workspace isolation - if wtPath is provided, all file operations must use it
  if (wtPath) {
    parts.push('=== WORKSPACE ISOLATION ===\n');
    parts.push(`This story uses an isolated git worktree for development.`);
    parts.push(`WORKTREE PATH: ${wtPath}`);
    parts.push(`ALL file edits and creations MUST be within this worktree path.`);
    parts.push(`Use absolute paths starting with: ${wtPath}/`);
    parts.push(`Do NOT modify files in the main repository.\n`);
  }

  // Inject user preferences - document language is the ONLY thing that matters for output
  const docLang = config.document_output_language || 'English';

  parts.push('=== OUTPUT LANGUAGE ===\n');
  parts.push(`Write ALL your output in ${docLang}. This is mandatory and non-negotiable.`);
  parts.push(`Do NOT use any other language for the document content.\n`);

  // Add conversation history if present (for multi-turn)
  if (history && history.length > 0) {
    parts.push('=== CONVERSATION HISTORY ===\n');
    for (const msg of history) {
      const prefix = msg.role === 'user' ? 'User' : 'Agent';
      parts.push(`${prefix}: ${msg.content}`);
    }
    parts.push('');
  }

  if (description) {
    parts.push('=== DESCRIPTION ===\n');
    parts.push(description);
    parts.push('');
  }

  if (attachments && attachments.length > 0) {
    parts.push('=== ATTACHMENTS ===\n');
    parts.push('The user has attached the following files. Use the Read tool to view them:\n');
    for (const a of attachments) {
      // F11: Sanitize filename to prevent prompt injection
      const safeFilename = String(a.filename || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255);
      const safePath = String(a.path || '').slice(0, 1000);
      parts.push(`- ${safeFilename}: ${safePath}`);
    }
    parts.push('');
  }

  if (context) {
    parts.push('=== CONTEXT ===\n');
    parts.push(context);
  }

  // Inject codebase context if prompt requires scan (scan_required: true in front matter)
  if (taskMetadata?.scan_required) {
    const codebaseContext = await buildCodebaseContext(root);
    parts.push(codebaseContext);
  }

  if (knowledge) {
    parts.push('\n\n=== KNOWLEDGE ===\n');
    parts.push(knowledge);
  }

  if (initSpecs) {
    parts.push('\n\n=== INITIAL SPECS ===\n');
    parts.push(initSpecs);
  }

  if (featureContent) {
    parts.push('\n\n=== FEATURE ===\n');
    parts.push(featureContent);
  }

  // V3: Auto-analysis context when spec-tech was skipped
  if (autoAnalysisContext && specTechSkipped) {
    parts.push('\n\n=== AUTO-ANALYSE (spec-tech skippe) ===\n');
    parts.push('ATTENTION: La spec technique a ete skippee. Tu dois effectuer une analyse automatique.\n');

    if (autoAnalysisContext.techStack) {
      parts.push('\n## Tech Stack Detecte\n');
      if (autoAnalysisContext.techStack.length > 0) {
        parts.push(autoAnalysisContext.techStack.map(t => `- ${t}`).join('\n'));
      }
    }

    if (autoAnalysisContext.knowledge) {
      parts.push('\n## Knowledge (from .aia/knowledge/)\n');
      parts.push(autoAnalysisContext.knowledge);
    }

    if (autoAnalysisContext.contextFiles) {
      parts.push('\n## Context (from .aia/context/)\n');
      parts.push(autoAnalysisContext.contextFiles);
    }

    parts.push('\n## Instructions Auto-Analyse\n');
    parts.push('1. Scanne le codebase pour identifier les patterns existants');
    parts.push('2. Identifie les fichiers similaires a modifier');
    parts.push('3. Propose ton approche AVANT de coder');
    parts.push('4. Suis les conventions detectees\n');
  }

  // For the review step, include actual code changes so the reviewer can see the code
  if (step === 'review') {
    const diff = await getGitDiff(root);
    parts.push('\n\n=== CODE CHANGES (git diff) ===\n');
    if (diff) {
      parts.push('Below is the actual git diff of the implementation. Review this code:\n');
      parts.push('```diff');
      parts.push(diff);
      parts.push('```');
    } else {
      parts.push('**NO CHANGES DETECTED**\n');
      parts.push('No git diff was found. This could mean:\n');
      parts.push('- No changes have been made yet\n');
      parts.push('- Changes are not staged or committed\n');
      parts.push('- You are on the main/master branch with no feature commits\n');
      parts.push('\nPlease ensure code changes exist before requesting a review.');
    }
  }

  if (previousOutput) {
    parts.push('\n\n=== PREVIOUS OUTPUT ===\n');
    parts.push(previousOutput);
    parts.push('\n\nThe above is a previous version of this step. Rewrite it incorporating any new information, answers to questions, and improvements.');
  }

  if (instructions) {
    parts.push('\n\n=== ITERATION INSTRUCTIONS ===\n');
    parts.push('Apply the following changes/feedback to the previous output:\n');
    parts.push(instructions);
  }

  parts.push('\n\n=== TASK ===\n');
  parts.push(task);

  // Add language reminder at the end (always, to reinforce)
  parts.push(`\n\n---\nREMINDER: Your entire output MUST be written in ${docLang}.`);

  const prompt = parts.join('\n');

  console.log(`[PromptBuilder] ========== Prompt built: ${prompt.length} chars ==========\n`);

  // Return both prompt and metadata about files used
  return {
    prompt,
    filesUsed,
  };
}

/**
 * Builds a prompt for task-scoped implementation
 * @param {Object} task - Task object
 * @param {Object} story - Parent story object
 * @param {Object} options - Options
 * @returns {Promise<string>} Generated prompt
 */
export async function buildTaskPrompt(task, story, { root = process.cwd() } = {}) {
  const config = await loadConfig(root);
  const docLang = config.document_output_language || 'English';

  const parts = [];

  parts.push('IMPORTANT: You are implementing a specific task as part of a larger feature. Focus ONLY on the files and changes specified in this task.\n');

  parts.push('=== OUTPUT LANGUAGE ===\n');
  parts.push(`Write ALL code comments and documentation in ${docLang}.\n`);

  // Story context
  parts.push('=== STORY CONTEXT ===\n');
  parts.push(`# ${story.title}\n`);
  if (story.description) {
    parts.push(story.description);
  }

  // Include step content if available
  if (story.steps) {
    if (story.steps.init?.content) {
      parts.push('\n## Init\n' + story.steps.init.content);
    }
    if (story.steps.specFunc?.content) {
      parts.push('\n## Functional Specification\n' + story.steps.specFunc.content);
    }
  }

  // Task details
  parts.push('\n\n=== TASK TO IMPLEMENT ===\n');
  parts.push(`## ${task.title}\n`);
  parts.push(`**Task ID:** ${task.id}`);
  parts.push(`**Order:** ${task.order + 1}`);

  if (task.details) {
    parts.push('\n### Implementation Details');
    parts.push(task.details);
  }

  if (task.files && task.files.length > 0) {
    parts.push('\n### Files to Create/Modify');
    for (const file of task.files) {
      parts.push(`- \`${file}\``);
    }
  }

  if (task.dependencies && task.dependencies.length > 0) {
    parts.push('\n### Dependencies');
    parts.push('This task depends on the following tasks being completed:');
    for (const dep of task.dependencies) {
      parts.push(`- ${dep}`);
    }
  }

  if (task.tests && task.tests.length > 0) {
    parts.push('\n### Tests to Write');
    for (const test of task.tests) {
      parts.push(`- ${test}`);
    }
  }

  // Implementation instructions
  parts.push('\n\n=== IMPLEMENTATION INSTRUCTIONS ===\n');
  parts.push(`
You are a senior developer. Implement this task following these guidelines:

1. **Focus**: Only modify the files listed in this task. Do not make changes outside the scope.

2. **Code Quality**:
   - Follow the project's existing code patterns and conventions
   - Write clean, production-ready code
   - Include proper error handling and input validation
   - Add JSDoc comments for public functions

3. **Progress Reporting**:
   - After completing each file, output a progress line
   - Format: "✓ File [filename] completed: [brief description]"

4. **Testing**:
   - Write tests for the functionality you implement
   - Ensure tests are comprehensive and cover edge cases

5. **Documentation**:
   - Update any relevant documentation
   - Add inline comments for complex logic

Begin implementation now.
`);

  parts.push(`\n---\nREMINDER: Focus ONLY on this task. Files: ${task.files?.join(', ') || 'as specified'}`);

  return parts.join('\n');
}
