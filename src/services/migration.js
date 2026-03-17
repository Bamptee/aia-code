/**
 * @fileoverview Migration utilities for converting from JSON to YAML system
 */

import path from 'node:path';
import fs from 'fs-extra';
import yaml from 'yaml';
import { AIA_DIR } from '../constants.js';

/**
 * Migrate from JSON epic system to YAML epic system
 * This reads all .json files from .aia/epics/ and converts them to YAML format
 */
export async function migrateEpicsToYaml(root = process.cwd()) {
  const epicsDir = path.join(root, AIA_DIR, 'epics');
  const migrated = [];
  const errors = [];

  if (!(await fs.pathExists(epicsDir))) {
    return { migrated, errors, message: 'No epics directory found' };
  }

  const entries = await fs.readdir(epicsDir);
  const jsonFiles = entries.filter(f => f.endsWith('.json'));

  if (jsonFiles.length === 0) {
    return { migrated, errors, message: 'No JSON epic files found' };
  }

  for (const jsonFile of jsonFiles) {
    try {
      const filePath = path.join(epicsDir, jsonFile);
      const content = await fs.readFile(filePath, 'utf-8');
      const epicData = JSON.parse(content);

      // Generate slug from name or id
      const slug = epicData.isGeneral
        ? 'general'
        : epicData.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 30) + '-' + epicData.id.substring(0, 6);

      const epicDir = path.join(epicsDir, slug);

      // Skip if already migrated (directory exists)
      if (await fs.pathExists(epicDir)) {
        continue;
      }

      await fs.ensureDir(epicDir);

      // Create status.yaml
      const statusYaml = {
        slug,
        name: epicData.name,
        description: epicData.description || null,
        status: epicData.status || 'discovery',
        plannedPeriod: epicData.plannedPeriod || null,
        isGeneral: epicData.isGeneral || false,
        isArchived: epicData.isArchived || false,
        createdAt: epicData.createdAt || new Date().toISOString(),
        updatedAt: epicData.updatedAt || new Date().toISOString(),
        // Keep old ID for reference during migration
        _legacyId: epicData.id,
      };

      await fs.writeFile(
        path.join(epicDir, 'status.yaml'),
        yaml.stringify(statusYaml),
        'utf-8'
      );

      // Create init.md
      const initContent = `# ${epicData.name}

${epicData.description || ''}

## Goals


## Notes

`;
      await fs.writeFile(path.join(epicDir, 'init.md'), initContent, 'utf-8');

      // Migrate embedded stories to separate story directories
      if (epicData.stories && epicData.stories.length > 0) {
        for (const story of epicData.stories) {
          try {
            await migrateStoryToYaml(story, slug, root);
          } catch (storyErr) {
            errors.push({ type: 'story', id: story.id, error: storyErr.message });
          }
        }
      }

      migrated.push({ type: 'epic', slug, name: epicData.name, stories: epicData.stories?.length || 0 });

      // Remove the old JSON file
      await fs.remove(filePath);
    } catch (err) {
      errors.push({ type: 'epic', file: jsonFile, error: err.message });
    }
  }

  // Clean up any remaining .lock files
  const remainingEntries = await fs.readdir(epicsDir);
  for (const entry of remainingEntries) {
    if (entry.endsWith('.lock')) {
      await fs.remove(path.join(epicsDir, entry));
    }
  }

  return { migrated, errors, message: `Migrated ${migrated.length} epics` };
}

/**
 * Migrate a story from JSON embedded format to YAML directory format
 */
async function migrateStoryToYaml(story, epicSlug, root) {
  const storiesDir = path.join(root, AIA_DIR, 'stories');
  await fs.ensureDir(storiesDir);

  // Generate slug from title
  const slug = story.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30) + '-' + story.id.substring(0, 6);

  const storyDir = path.join(storiesDir, slug);

  // Skip if already exists
  if (await fs.pathExists(storyDir)) {
    return;
  }

  await fs.ensureDir(storyDir);

  // Map story status to phase
  const phase = ['ready_for_dev', 'in_progress', 'testing', 'done'].includes(story.status)
    ? 'development'
    : 'discovery';

  // Create status.yaml
  const statusYaml = {
    slug,
    name: story.title,
    epic: epicSlug,
    phase,
    type: story.type || 'feature',
    flow: phase === 'discovery' ? 'full' : 'full',
    current_step: phase === 'discovery' ? 'init' : 'spec-tech',
    createdAt: story.createdAt || new Date().toISOString(),
    updatedAt: story.updatedAt || new Date().toISOString(),
    steps: {
      brief: story.steps?.brief?.completed ? 'done' : 'pending',
      'ba-spec': story.steps?.baSpec?.completed ? 'done' : 'pending',
      questions: story.steps?.questions?.completed ? 'done' : 'pending',
      'tech-spec': 'pending',
      challenge: 'pending',
      'dev-plan': 'pending',
      implement: 'pending',
      review: 'pending',
    },
    knowledge: ['backend'],
    _legacyId: story.id,
  };

  await fs.writeFile(
    path.join(storyDir, 'status.yaml'),
    yaml.stringify(statusYaml),
    'utf-8'
  );

  // Create init.md from story description and init content
  let initContent = `# ${story.title}\n\n`;

  if (story.description) {
    initContent += `## Description\n\n${story.description}\n\n`;
  }

  if (story.init?.enriched) {
    initContent += `## Discovery Document\n\n${story.init.enriched}\n\n`;
  } else if (story.init?.input) {
    initContent += `## Initial Input\n\n${story.init.input}\n\n`;
  }

  if (story.figmaUrl) {
    initContent += `## Figma\n\n[Design Link](${story.figmaUrl})\n\n`;
  }

  initContent += `## Constraints\n\n`;

  await fs.writeFile(path.join(storyDir, 'init.md'), initContent, 'utf-8');

  // Migrate step content if available
  if (story.steps?.brief?.content) {
    await fs.writeFile(path.join(storyDir, 'brief.md'), story.steps.brief.content, 'utf-8');
  }
  if (story.steps?.baSpec?.content) {
    await fs.writeFile(path.join(storyDir, 'ba-spec.md'), story.steps.baSpec.content, 'utf-8');
  }
  if (story.steps?.questions?.content) {
    await fs.writeFile(path.join(storyDir, 'questions.md'), story.steps.questions.content, 'utf-8');
  }

  // Create empty files for other steps
  const stepFiles = ['tech-spec.md', 'challenge.md', 'dev-plan.md', 'implement.md', 'review.md'];
  for (const stepFile of stepFiles) {
    const stepPath = path.join(storyDir, stepFile);
    if (!(await fs.pathExists(stepPath))) {
      await fs.writeFile(stepPath, '', 'utf-8');
    }
  }
}

/**
 * Clean up old JSON files and index
 */
export async function cleanupOldJsonFiles(root = process.cwd()) {
  const cleanedUp = [];

  // Clean .aia/epics/*.json files
  const epicsDir = path.join(root, AIA_DIR, 'epics');
  if (await fs.pathExists(epicsDir)) {
    const entries = await fs.readdir(epicsDir);
    for (const entry of entries) {
      if (entry.endsWith('.json') || entry.endsWith('.lock')) {
        await fs.remove(path.join(epicsDir, entry));
        cleanedUp.push(`epics/${entry}`);
      }
    }
  }

  // Clean .aia/index directory
  const indexDir = path.join(root, AIA_DIR, 'index');
  if (await fs.pathExists(indexDir)) {
    await fs.remove(indexDir);
    cleanedUp.push('index/');
  }

  // Clean .aia/cache directory
  const cacheDir = path.join(root, AIA_DIR, 'cache');
  if (await fs.pathExists(cacheDir)) {
    await fs.remove(cacheDir);
    cleanedUp.push('cache/');
  }

  return cleanedUp;
}
