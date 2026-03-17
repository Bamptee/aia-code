import path from 'node:path';
import fs from 'fs-extra';
import { APP_ICONS, AIA_DIR } from '../constants.js';
import yaml from 'yaml';

const MANIFEST_FILES = {
  'package.json': 'node',
  'pom.xml': 'java',
  'go.mod': 'go',
  'Cargo.toml': 'rust',
  'requirements.txt': 'python',
  'pyproject.toml': 'python',
};

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'vendor',
  '.aia',
  'coverage',
  '__pycache__',
  '.next',
  '.nuxt',
]);

/**
 * Detect the icon for an app based on its manifest file
 */
async function detectIcon(appPath, manifestType) {
  // For node projects, check for framework-specific indicators
  if (manifestType === 'node') {
    const pkgPath = path.join(appPath, 'package.json');
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps.react || deps['react-dom']) return 'react';
      if (deps.vue) return 'vue';
      if (deps['@angular/core']) return 'angular';
      return 'node';
    } catch {
      return 'node';
    }
  }

  return manifestType;
}

/**
 * Check if a directory is a git submodule
 */
async function isGitSubmodule(dirPath) {
  const gitPath = path.join(dirPath, '.git');
  try {
    const stat = await fs.stat(gitPath);
    // Submodules have a .git file (not directory) pointing to the main repo
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Scan a directory for apps/submodules
 */
export async function scanApps(root = process.cwd()) {
  const apps = [];
  const visited = new Set();

  async function scan(dir, depth = 0) {
    // Limit depth to avoid deep recursion
    if (depth > 3) return;

    const relativePath = path.relative(root, dir);
    if (visited.has(relativePath)) return;
    visited.add(relativePath);

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    // Check for manifest files in current directory
    let foundManifest = null;
    for (const [manifest, type] of Object.entries(MANIFEST_FILES)) {
      if (entries.some(e => e.isFile() && e.name === manifest)) {
        foundManifest = { manifest, type };
        break;
      }
    }

    // Check if this is a git submodule
    const isSubmodule = await isGitSubmodule(dir);

    // If we found a manifest or submodule (not at root), add as app
    if ((foundManifest || isSubmodule) && relativePath) {
      const appName = path.basename(dir);
      const iconType = foundManifest
        ? await detectIcon(dir, foundManifest.type)
        : 'generic';

      apps.push({
        name: appName,
        path: relativePath,
        icon: APP_ICONS[iconType] || APP_ICONS.generic,
        enabled: true,
      });

      // Don't scan deeper if we found an app
      return;
    }

    // Recurse into subdirectories
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (IGNORE_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;

      await scan(path.join(dir, entry.name), depth + 1);
    }
  }

  await scan(root);

  // Sort by name
  apps.sort((a, b) => a.name.localeCompare(b.name));

  return apps;
}

/**
 * Load full config from config.yaml (cached per call)
 * @param {string} root - Project root
 * @returns {Promise<Object>} Parsed config or empty object
 */
async function loadConfig(root) {
  const configPath = path.join(root, AIA_DIR, 'config.yaml');
  if (!(await fs.pathExists(configPath))) {
    return {};
  }
  const raw = await fs.readFile(configPath, 'utf-8');
  return yaml.parse(raw) || {};
}

/**
 * Get configured apps from config.yaml
 * @param {string} root - Project root
 * @returns {Promise<Array>} Configured apps
 */
export async function getApps(root = process.cwd()) {
  const config = await loadConfig(root);
  return config.apps || [];
}

/**
 * Validate and sanitize app path to prevent traversal
 * @param {string} appPath - App path from config
 * @param {string} root - Project root
 * @returns {string|null} Safe absolute path or null if invalid
 */
function sanitizeAppPath(appPath, root) {
  if (typeof appPath !== 'string' || !appPath.trim()) {
    return null;
  }

  // Normalize and resolve the path
  const normalized = path.normalize(appPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const absolutePath = path.resolve(root, normalized);

  // Ensure path stays within project root
  if (!absolutePath.startsWith(root + path.sep) && absolutePath !== root) {
    return null;
  }

  return absolutePath;
}

/**
 * Convert app names to absolute paths
 * @param {Array<string>} appNames - Array of app names
 * @param {string} root - Project root
 * @returns {Promise<Array<string>>} Array of absolute paths
 */
export async function getAppPaths(appNames, root = process.cwd()) {
  // F3: Validate input
  if (!Array.isArray(appNames)) {
    return [];
  }

  const allApps = await getApps(root);
  const paths = [];

  for (const name of appNames) {
    if (typeof name !== 'string') continue;

    const app = allApps.find(a => a.name === name);
    if (app?.path) {
      // F4: Sanitize path to prevent traversal
      const safePath = sanitizeAppPath(app.path, root);
      if (safePath) {
        paths.push(safePath);
      }
    }
  }

  return paths;
}

/**
 * Get knowledge categories for selected apps
 * @param {Array<string>} appNames - Array of app names
 * @param {string} root - Project root
 * @returns {Promise<Array<string>>} Array of knowledge category names
 */
export async function getKnowledgeForApps(appNames, root = process.cwd()) {
  // F3: Validate input
  if (!Array.isArray(appNames)) {
    appNames = [];
  }

  // F2: Load config once, reuse for apps and defaults
  const config = await loadConfig(root);
  const allApps = config.apps || [];
  const categories = new Set();

  for (const name of appNames) {
    if (typeof name !== 'string') continue;

    const app = allApps.find(a => a.name === name);
    if (app?.knowledge && Array.isArray(app.knowledge)) {
      app.knowledge.forEach(k => categories.add(k));
    }
  }

  // If no knowledge found, use defaults from same config
  if (categories.size === 0) {
    const defaults = config.knowledge_default || [];
    defaults.forEach(k => categories.add(k));
  }

  return [...categories];
}
