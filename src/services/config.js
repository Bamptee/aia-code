import path from 'node:path';
import fs from 'fs-extra';
import yaml from 'yaml';
import { AIA_DIR } from '../constants.js';

const DEFAULT_CONFIG = {
  models: {
    questions: [
      { model: 'claude-default', weight: 0.5 },
      { model: 'openai-default', weight: 0.5 },
    ],
    'tech-spec': [
      { model: 'claude-default', weight: 0.5 },
      { model: 'openai-default', weight: 0.5 },
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
