import path from 'node:path';
import fs from 'fs-extra';
import yaml from 'yaml';
import { AIA_DIR } from '../constants.js';

const DEFAULT_CONFIG = {
  projectName: 'My Project',
  models: {
    brief: [
      { model: 'claude-default', weight: 1 },
    ],
    'ba-spec': [
      { model: 'claude-default', weight: 0.5 },
      { model: 'openai-default', weight: 0.5 },
    ],
    questions: [
      { model: 'claude-default', weight: 0.5 },
      { model: 'openai-default', weight: 0.5 },
    ],
    'tech-spec': [
      { model: 'claude-default', weight: 0.5 },
      { model: 'openai-default', weight: 0.5 },
    ],
    challenge: [
      { model: 'openai-default', weight: 1 },
    ],
    'dev-plan': [
      { model: 'claude-default', weight: 0.5 },
      { model: 'openai-default', weight: 0.5 },
    ],
    implement: [
      { model: 'claude-default', weight: 1 },
    ],
    review: [
      { model: 'openai-default', weight: 1 },
    ],
  },
  knowledge_default: ['backend'],
  context_files: [
    'context/project.md',
    'context/architecture.md',
  ],
};

export async function writeDefaultConfig(root = process.cwd()) {
  const configPath = path.join(root, AIA_DIR, 'config.yaml');

  if (await fs.pathExists(configPath)) {
    return;
  }

  const content = yaml.stringify(DEFAULT_CONFIG);
  await fs.writeFile(configPath, content, 'utf-8');
}
