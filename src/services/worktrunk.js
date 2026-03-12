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
    'wt', // in PATH
    path.join(home, '.cargo', 'bin', 'wt'),
    '/usr/local/bin/wt',
    '/opt/homebrew/bin/wt',
  ];

  for (const candidate of candidates) {
    try {
      execSync(`${candidate} --version`, { stdio: 'ignore' });
      wtBinary = candidate;
      return wtBinary;
    } catch {
      // Try next
    }
  }

  wtBinary = false;
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

