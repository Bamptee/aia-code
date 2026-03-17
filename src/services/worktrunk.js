import { execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';

// F1: Validate branch name to prevent command injection
function validateBranchName(branch) {
  // Allow only alphanumeric, dash, underscore, slash
  if (!/^[a-zA-Z0-9_\-/]+$/.test(branch)) {
    throw new Error(`Invalid branch name: "${branch}". Only alphanumeric characters, dashes, underscores, and slashes are allowed.`);
  }
  return branch;
}

// Find wt binary - check common locations
let wtBinary = null;

function findWtBinary() {
  if (wtBinary !== null) return wtBinary;

  const home = os.homedir();
  const candidates = [
    path.join(home, '.cargo', 'bin', 'wt'), // Check cargo first (most common)
    'wt', // in PATH
    '/usr/local/bin/wt',
    '/opt/homebrew/bin/wt',
  ];

  console.log('[Worktrunk] Searching for wt binary...');
  for (const candidate of candidates) {
    try {
      execSync(`"${candidate}" --version`, { stdio: 'ignore' });
      wtBinary = candidate;
      console.log('[Worktrunk] Found wt at:', candidate);
      return wtBinary;
    } catch (e) {
      console.log('[Worktrunk] Not found at:', candidate, e.message);
    }
  }

  wtBinary = false;
  console.log('[Worktrunk] wt binary not found');
  return wtBinary;
}

function getWtCommand() {
  const wt = findWtBinary();
  if (!wt) throw new Error('Worktrunk (wt) CLI not found');
  return wt;
}

/**
 * Check if worktrunk (wt) CLI is installed
 */
export function isWtInstalled() {
  return findWtBinary() !== false;
}

/**
 * Reset the wt binary cache (useful after installing wt)
 */
export function resetWtCache() {
  wtBinary = null;
}

/**
 * List all worktrees in a repository
 * @param {string} cwd - Repository root directory
 * @returns {Array} List of worktree objects
 */
export function listWorktrees(cwd) {
  try {
    const wt = getWtCommand();
    const output = execSync(`${wt} list --format=json`, { cwd, encoding: 'utf-8' });
    return JSON.parse(output);
  } catch {
    return [];
  }
}

/**
 * Check if a git branch exists
 * @param {string} branch - Branch name
 * @param {string} cwd - Repository root directory
 * @returns {boolean}
 */
function branchExists(branch, cwd) {
  try {
    execSync(`git show-ref --verify --quiet refs/heads/${branch}`, { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a worktree for a branch
 * @param {string} branch - Branch name (e.g., 'feature/my-feature')
 * @param {string} cwd - Repository root directory
 */
export function createWorktree(branch, cwd) {
  validateBranchName(branch);
  const wt = getWtCommand();

  // --no-cd: Don't try to change directory (we're in Node.js, not a shell)
  // --yes: Skip approval prompts
  // If branch already exists, switch to it (creates worktree)
  // If branch doesn't exist, create it with -c
  if (branchExists(branch, cwd)) {
    execSync(`${wt} switch --no-cd --yes ${branch}`, { cwd, stdio: 'inherit' });
  } else {
    execSync(`${wt} switch --no-cd --yes -c ${branch}`, { cwd, stdio: 'inherit' });
  }
}

/**
 * Get the path of a worktree for a branch
 * @param {string} branch - Branch name
 * @param {string} cwd - Repository root directory
 * @returns {string|null} Worktree path or null if not found
 */
export function getWorktreePath(branch, cwd) {
  const list = listWorktrees(cwd);
  const wt = list.find(w => w.branch === branch || w.branch === `refs/heads/${branch}`);
  return wt?.path || null;
}

/**
 * Check if a worktree exists for a branch
 * @param {string} branch - Branch name
 * @param {string} cwd - Repository root directory
 * @returns {boolean}
 */
export function hasWorktree(branch, cwd) {
  return getWorktreePath(branch, cwd) !== null;
}

/**
 * Remove a worktree
 * @param {string} branch - Branch name
 * @param {string} cwd - Repository root directory
 */
export function removeWorktree(branch, cwd) {
  validateBranchName(branch);
  const wt = getWtCommand();
  execSync(`${wt} remove ${branch}`, { cwd, stdio: 'inherit' });
}

/**
 * Get the feature branch name from a feature name
 * @param {string} featureName - Feature name
 * @returns {string} Branch name (e.g., 'feature/my-feature')
 */
export function getFeatureBranch(featureName) {
  return `feature/${featureName}`;
}

/**
 * Check if Docker daemon is running
 * @returns {boolean}
 */
export function isDockerRunning() {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if docker-compose.wt.yml exists in a worktree
 * @param {string} wtPath - Worktree directory path
 * @returns {boolean}
 */
export function hasDockerServices(wtPath) {
  if (!wtPath) return false;
  const composePath = path.join(wtPath, 'docker-compose.wt.yml');
  return fs.existsSync(composePath);
}

/**
 * List services defined in docker-compose.wt.yml
 * @param {string} wtPath - Worktree directory path
 * @returns {Array<string>} List of service names
 */
export function listComposeServices(wtPath) {
  if (!hasDockerServices(wtPath)) return [];
  try {
    const output = execSync('docker-compose -f docker-compose.wt.yml config --services', {
      cwd: wtPath,
      encoding: 'utf-8',
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get status of all services from docker-compose
 * @param {string} wtPath - Worktree directory path
 * @returns {Array} List of service objects with name, state, status
 */
export function getServicesStatus(wtPath) {
  if (!hasDockerServices(wtPath)) return [];

  // Get all defined services
  const definedServices = listComposeServices(wtPath);
  if (!definedServices.length) return [];

  // Get running containers status
  let runningServices = [];
  try {
    const output = execSync('docker-compose -f docker-compose.wt.yml ps --format json', {
      cwd: wtPath,
      encoding: 'utf-8',
    });
    // docker-compose ps --format json outputs one JSON per line
    runningServices = output.trim().split('\n').filter(Boolean).map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    // docker-compose ps failed, all services are stopped
  }

  // Map defined services to their status
  return definedServices.map(serviceName => {
    const running = runningServices.find(s =>
      s.Service === serviceName || s.Name?.includes(serviceName)
    );

    // Extract published ports from Publishers array
    const ports = (running?.Publishers || [])
      .filter(p => p.PublishedPort)
      .map(p => ({
        published: p.PublishedPort,
        target: p.TargetPort,
        protocol: p.Protocol || 'tcp',
      }));

    return {
      name: serviceName,
      state: running?.State || 'stopped',
      status: running?.Status || 'Stopped',
      health: running?.Health || null,
      ports,
    };
  });
}

/**
 * Start a docker-compose service
 * @param {string} wtPath - Worktree directory path
 * @param {string} serviceName - Service name to start
 */
export function startComposeService(wtPath, serviceName) {
  if (!hasDockerServices(wtPath)) {
    throw new Error('No docker-compose.wt.yml found');
  }
  // Validate service name
  if (!/^[a-zA-Z0-9_-]+$/.test(serviceName)) {
    throw new Error(`Invalid service name: "${serviceName}"`);
  }
  execSync(`docker-compose -f docker-compose.wt.yml up -d ${serviceName}`, {
    cwd: wtPath,
    stdio: 'inherit',
  });
}

/**
 * Stop a docker-compose service
 * @param {string} wtPath - Worktree directory path
 * @param {string} serviceName - Service name to stop
 */
export function stopComposeService(wtPath, serviceName) {
  if (!hasDockerServices(wtPath)) {
    throw new Error('No docker-compose.wt.yml found');
  }
  // Validate service name
  if (!/^[a-zA-Z0-9_-]+$/.test(serviceName)) {
    throw new Error(`Invalid service name: "${serviceName}"`);
  }
  execSync(`docker-compose -f docker-compose.wt.yml stop ${serviceName}`, {
    cwd: wtPath,
    stdio: 'inherit',
  });
}

/**
 * Start all docker-compose services
 * @param {string} wtPath - Worktree directory path
 */
export function startAllComposeServices(wtPath) {
  if (!hasDockerServices(wtPath)) {
    throw new Error('No docker-compose.wt.yml found');
  }
  execSync('docker-compose -f docker-compose.wt.yml up -d', {
    cwd: wtPath,
    stdio: 'inherit',
  });
}

/**
 * Stop all docker-compose services
 * @param {string} wtPath - Worktree directory path
 */
export function stopAllComposeServices(wtPath) {
  if (!hasDockerServices(wtPath)) {
    throw new Error('No docker-compose.wt.yml found');
  }
  execSync('docker-compose -f docker-compose.wt.yml stop', {
    cwd: wtPath,
    stdio: 'inherit',
  });
}

/**
 * Check if a directory is a git submodule
 * @param {string} dirPath - Directory path to check
 * @returns {boolean}
 */
function isGitSubmodule(dirPath) {
  // F7 fix: wrap all fs operations in try/catch
  try {
    // A submodule has a .git file (not directory) pointing to the parent's .git/modules
    const gitPath = path.join(dirPath, '.git');
    // Use try/catch for existsSync as it can throw on permission errors
    let exists = false;
    try {
      exists = fs.existsSync(gitPath);
    } catch {
      return false;
    }
    if (!exists) return false;
    const stat = fs.statSync(gitPath);
    return stat.isFile(); // Submodules have .git as a file, not directory
  } catch {
    return false;
  }
}

/**
 * Create branches in submodules for a story
 * @param {string} wtPath - Worktree directory path
 * @param {Array<{name: string, path: string}>} apps - Apps/submodules to create branches in
 * @param {string} branchName - Branch name to create
 * @returns {Array<{app: string, branch: string}>} Created branches
 */
export function createSubmoduleBranches(wtPath, apps, branchName) {
  validateBranchName(branchName);
  const results = [];

  for (const app of apps) {
    const appPath = path.join(wtPath, app.path);

    // Check if path exists and is a submodule
    if (!fs.existsSync(appPath)) {
      // F6 fix: use debug-level logging only in development
      if (process.env.DEBUG) console.log(`[Worktrunk] Skipping ${app.name}: path does not exist`);
      continue;
    }

    if (!isGitSubmodule(appPath)) {
      if (process.env.DEBUG) console.log(`[Worktrunk] Skipping ${app.name}: not a git submodule`);
      continue;
    }

    try {
      // Check if branch already exists in submodule
      try {
        execSync(`git show-ref --verify --quiet refs/heads/${branchName}`, { cwd: appPath, stdio: 'ignore' });
        // Branch exists, just checkout
        execSync(`git checkout ${branchName}`, { cwd: appPath, stdio: 'pipe' });
      } catch {
        // Branch doesn't exist, create it
        execSync(`git checkout -b ${branchName}`, { cwd: appPath, stdio: 'pipe' });
      }

      results.push({ app: app.name, branch: branchName });
    } catch (err) {
      // F6 fix: keep error logging but make it conditional
      if (process.env.DEBUG) console.error(`[Worktrunk] Failed to create branch in ${app.name}: ${err.message}`);
    }
  }

  return results;
}

/**
 * Get story branch name from story ID
 * @param {string} storyId - Story UUID
 * @returns {string} Branch name (e.g., 'story/abc12345')
 */
export function getStoryBranch(storyId) {
  return `story/${storyId.slice(0, 8)}`;
}

