import path from 'node:path';
import fs from 'fs-extra';
import { APP_ICONS } from '../constants.js';

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
