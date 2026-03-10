import path from 'node:path';
import fs from 'fs-extra';
import yaml from 'yaml';
import { AIA_DIR, FEATURE_STEPS } from './constants.js';
import { loadConfig } from './models.js';
import { loadKnowledge } from './knowledge-loader.js';
import { readIfExists } from './utils.js';

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

  const featureDir = path.join(root, AIA_DIR, 'features', feature);
  if (!(await fs.pathExists(featureDir))) {
    throw new Error(`Feature "${feature}" not found.`);
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

async function loadInitSpecs(feature, root) {
  const filePath = path.join(root, AIA_DIR, 'features', feature, 'init.md');
  return readIfExists(filePath);
}

async function loadPreviousOutput(feature, step, root) {
  const filePath = path.join(root, AIA_DIR, 'features', feature, `${step}.md`);
  return readIfExists(filePath);
}

async function resolveKnowledgeCategories(feature, config, root) {
  const statusFile = path.join(root, AIA_DIR, 'features', feature, 'status.yaml');
  const raw = await readIfExists(statusFile);

  if (raw) {
    const status = yaml.parse(raw);
    if (status?.knowledge?.length) {
      return status.knowledge;
    }
  }

  return config.knowledge_default ?? [];
}

async function loadPromptTemplate(step, root) {
  const templatePath = path.join(root, AIA_DIR, 'prompts', `${step}.md`);
  const content = await readIfExists(templatePath);
  if (!content) {
    throw new Error(`Prompt template not found: prompts/${step}.md`);
  }
  return content;
}

export async function buildPrompt(feature, step, { description, root = process.cwd() } = {}) {
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

  if (description) {
    parts.push('=== DESCRIPTION ===\n');
    parts.push(description);
    parts.push('');
  }

  parts.push('=== CONTEXT ===\n');
  parts.push(context || '(no context files)');

  parts.push('\n\n=== KNOWLEDGE ===\n');
  parts.push(knowledge || '(no knowledge)');

  if (initSpecs) {
    parts.push('\n\n=== INITIAL SPECS ===\n');
    parts.push(initSpecs);
  }

  parts.push('\n\n=== FEATURE ===\n');
  parts.push(featureContent || '(no prior steps)');

  if (previousOutput) {
    parts.push('\n\n=== PREVIOUS OUTPUT ===\n');
    parts.push(previousOutput);
    parts.push('\n\nThe above is a previous version of this step. Rewrite it incorporating any new information, answers to questions, and improvements.');
  }

  parts.push('\n\n=== TASK ===\n');
  parts.push(task);

  return parts.join('\n');
}
