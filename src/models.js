import path from 'node:path';
import fs from 'fs-extra';
import yaml from 'yaml';
import chalk from 'chalk';
import { AIA_DIR } from './constants.js';
import { loadGlobalConfig } from './services/config.js';

export async function loadConfig(root = process.cwd()) {
  const configPath = path.join(root, AIA_DIR, 'config.yaml');

  if (!(await fs.pathExists(configPath))) {
    throw new Error(`Config not found: ${configPath}`);
  }

  const raw = await fs.readFile(configPath, 'utf-8');
  const projectConfig = yaml.parse(raw);

  validateConfig(projectConfig, configPath);

  // Merge with global user config
  const globalConfig = await loadGlobalConfig();
  const config = { ...globalConfig, ...projectConfig };

  return config;
}

// Load only project config (without global merge)
export async function loadProjectConfig(root = process.cwd()) {
  const configPath = path.join(root, AIA_DIR, 'config.yaml');

  if (!(await fs.pathExists(configPath))) {
    throw new Error(`Config not found: ${configPath}`);
  }

  const raw = await fs.readFile(configPath, 'utf-8');
  return yaml.parse(raw);
}

function validateConfig(config, configPath) {
  if (!config || typeof config !== 'object') {
    throw new Error(`Invalid config: ${configPath} must be a YAML object.`);
  }

  if (!config.models || typeof config.models !== 'object') {
    throw new Error(`Invalid config: "models" section is required in ${configPath}.`);
  }

  for (const [step, models] of Object.entries(config.models)) {
    if (!Array.isArray(models)) {
      throw new Error(`Invalid config: models.${step} must be an array.`);
    }
    for (const entry of models) {
      if (!entry.model || typeof entry.model !== 'string') {
        throw new Error(`Invalid config: each entry in models.${step} must have a "model" string.`);
      }
      if (typeof entry.weight !== 'number' || entry.weight <= 0) {
        throw new Error(`Invalid config: each entry in models.${step} must have a positive "weight".`);
      }
    }
  }
}

export function selectByWeight(models) {
  if (models.length === 1) {
    return models[0].model;
  }

  const totalWeight = models.reduce((sum, m) => sum + m.weight, 0);
  const roll = Math.random() * totalWeight;

  let cumulative = 0;
  for (const entry of models) {
    cumulative += entry.weight;
    if (roll < cumulative) {
      return entry.model;
    }
  }

  return models[models.length - 1].model;
}

export async function resolveModel(step, root = process.cwd()) {
  const config = await loadConfig(root);
  const models = config.models?.[step];

  if (!models || models.length === 0) {
    throw new Error(`No models configured for step "${step}".`);
  }

  const selected = selectByWeight(models);

  console.log(chalk.cyan(`[AI] step=${step} model=${selected}`));

  return selected;
}
