import path from 'node:path';
import { execFile } from 'node:child_process';
import fs from 'fs-extra';
import yaml from 'yaml';
import { AIA_DIR, FEATURE_STEPS, LEGACY_FEATURES_DIR } from './constants.js';
import { loadConfig } from './models.js';
import { loadKnowledge } from './knowledge-loader.js';
import { readIfExists } from './utils.js';

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

async function loadFeatureFiles(feature, step, root) {
  const stepIndex = FEATURE_STEPS.indexOf(step);
  if (stepIndex === -1) {
    throw new Error(`Unknown step "${step}".`);
  }

  const featureDir = await getStoryDir(feature, root);
  if (!(await fs.pathExists(featureDir))) {
    throw new Error(`Story "${feature}" not found.`);
  }

  // For review step, use optimized loading to reduce prompt size
  if (step === 'review') {
    return loadFeatureFilesForReview(featureDir);
  }

  const priorSteps = FEATURE_STEPS.slice(0, stepIndex);
  const sections = [];

  for (const s of priorSteps) {
    const content = await readIfExists(path.join(featureDir, `${s}.md`));
    if (content) {
      sections.push(content);
    }
  }

  return sections.join('\n\n');
}

/**
 * Load optimized feature files for review step
 * Includes only essential context to reduce prompt size
 */
async function loadFeatureFilesForReview(featureDir) {
  const sections = [];

  // Include tech-spec summary (key decisions only)
  const techSpec = await readIfExists(path.join(featureDir, 'tech-spec.md'));
  if (techSpec) {
    const summary = extractTechSpecSummary(techSpec);
    sections.push('## Tech Spec Summary\n' + summary);
  }

  // Include dev-plan task list only
  const devPlan = await readIfExists(path.join(featureDir, 'dev-plan.md'));
  if (devPlan) {
    const taskList = extractTaskList(devPlan);
    sections.push('## Implementation Tasks\n' + taskList);
  }

  // Skip: brief, ba-spec, questions, challenge (already incorporated in tech-spec and dev-plan)

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

async function loadPromptTemplate(step, root) {
  const templatePath = path.join(root, AIA_DIR, 'prompts', `${step}.md`);
  const content = await readIfExists(templatePath);
  if (!content) {
    throw new Error(`Prompt template not found: prompts/${step}.md`);
  }
  return content;
}

export async function buildPrompt(feature, step, { description, instructions, history, attachments, root = process.cwd() } = {}) {
  const config = await loadConfig(root);

  const [context, knowledgeCategories, initSpecs, featureContent, previousOutput, task] = await Promise.all([
    loadContextFiles(config, root),
    resolveKnowledgeCategories(feature, config, root),
    loadInitSpecs(feature, root),
    loadFeatureFiles(feature, step, root),
    loadPreviousOutput(feature, step, root),
    loadPromptTemplate(step, root),
  ]);

  const knowledge = await loadKnowledge(knowledgeCategories, root);

  const parts = [];

  parts.push('IMPORTANT: You are working on a feature development pipeline. Everything you need is provided below in this prompt. Do NOT attempt to read, search for, or reference any external files. Do NOT say files are missing. Work exclusively with the content given below.\n');

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

  // For the review step, include actual code changes so the reviewer can see the code
  if (step === 'review') {
    const diff = await getGitDiff(root);
    if (diff) {
      parts.push('\n\n=== CODE CHANGES (git diff) ===\n');
      parts.push('Below is the actual git diff of the implementation. Review this code:\n');
      parts.push('```diff');
      parts.push(diff);
      parts.push('```');
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

  return parts.join('\n');
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
    if (story.steps.brief?.content) {
      parts.push('\n## Brief\n' + story.steps.brief.content);
    }
    if (story.steps.baSpec?.content) {
      parts.push('\n## BA Specification\n' + story.steps.baSpec.content);
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
