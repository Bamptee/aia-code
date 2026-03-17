import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import yaml from 'yaml';
import { AIA_DIR } from '../constants.js';

// Project config path helper
function projectConfigPath(root) {
  return path.join(root, AIA_DIR, 'config.yaml');
}

// Global user config directory
const GLOBAL_AIA_DIR = path.join(os.homedir(), '.aia');
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_AIA_DIR, 'config.yaml');

// Default config for PROJECT (.aia/config.yaml)
const DEFAULT_PROJECT_CONFIG = {
  projectName: 'My Project',
  document_output_language: 'English',
  models: {
    init: [
      { model: 'claude-default', weight: 1 },
    ],
    brainstorming: [
      { model: 'claude-default', weight: 0.5 },
      { model: 'openai-default', weight: 0.5 },
    ],
    'spec-func': [
      { model: 'claude-default', weight: 0.5 },
      { model: 'openai-default', weight: 0.5 },
    ],
    'spec-tech': [
      { model: 'claude-default', weight: 0.5 },
      { model: 'openai-default', weight: 0.5 },
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

// Default config for USER (~/.aia/config.yaml)
const DEFAULT_USER_CONFIG = {
  user_name: '',
  communication_language: 'English',
};

export async function writeDefaultConfig(root = process.cwd()) {
  const configPath = path.join(root, AIA_DIR, 'config.yaml');

  if (await fs.pathExists(configPath)) {
    return;
  }

  const content = yaml.stringify(DEFAULT_PROJECT_CONFIG);
  await fs.writeFile(configPath, content, 'utf-8');
}

export async function ensureGlobalConfig() {
  await fs.ensureDir(GLOBAL_AIA_DIR);

  if (!(await fs.pathExists(GLOBAL_CONFIG_PATH))) {
    const content = yaml.stringify(DEFAULT_USER_CONFIG);
    await fs.writeFile(GLOBAL_CONFIG_PATH, content, 'utf-8');
  }
}

export async function loadGlobalConfig() {
  await ensureGlobalConfig();

  const raw = await fs.readFile(GLOBAL_CONFIG_PATH, 'utf-8');
  return yaml.parse(raw) || {};
}

export async function saveGlobalConfig(config) {
  await fs.ensureDir(GLOBAL_AIA_DIR);
  const content = yaml.stringify(config);
  await fs.writeFile(GLOBAL_CONFIG_PATH, content, 'utf-8');
}

export async function isGlobalConfigured() {
  const config = await loadGlobalConfig();
  return config && config.user_name && config.user_name.trim() !== '';
}

export async function updateGlobalConfig(updates) {
  const existing = await loadGlobalConfig();
  const merged = { ...existing, ...updates };
  await saveGlobalConfig(merged);
  return merged;
}

export function getGlobalConfigPath() {
  return GLOBAL_CONFIG_PATH;
}

// Project config helpers for apps
export async function loadProjectConfig(root = process.cwd()) {
  const configPath = projectConfigPath(root);
  if (!(await fs.pathExists(configPath))) {
    return {};
  }
  const raw = await fs.readFile(configPath, 'utf-8');
  return yaml.parse(raw) || {};
}

export async function getApps(root = process.cwd()) {
  const config = await loadProjectConfig(root);
  return config.apps || [];
}

export async function setApps(apps, root = process.cwd()) {
  const configPath = projectConfigPath(root);
  let config = {};
  if (await fs.pathExists(configPath)) {
    const raw = await fs.readFile(configPath, 'utf-8');
    config = yaml.parse(raw) || {};
  }
  config.apps = apps;
  await fs.writeFile(configPath, yaml.stringify(config), 'utf-8');
}

export async function toggleApp(appName, enabled, root = process.cwd()) {
  const apps = await getApps(root);
  const app = apps.find(a => a.name === appName);
  if (!app) {
    throw new Error(`App "${appName}" not found`);
  }
  app.enabled = Boolean(enabled);
  await setApps(apps, root);
}
