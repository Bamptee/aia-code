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
