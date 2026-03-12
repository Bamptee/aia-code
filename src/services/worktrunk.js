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
 * Start docker-compose services in a worktree
 * @param {string} wtPath - Worktree directory path
 */
export function startServices(wtPath) {
  const composePath = path.join(wtPath, 'docker-compose.wt.yml');
  if (fs.existsSync(composePath)) {
    execSync('docker-compose -f docker-compose.wt.yml up -d', { cwd: wtPath, stdio: 'inherit' });
  }
}

/**
 * Stop docker-compose services in a worktree
 * @param {string} wtPath - Worktree directory path
 */
export function stopServices(wtPath) {
  const composePath = path.join(wtPath, 'docker-compose.wt.yml');
  if (fs.existsSync(composePath)) {
    execSync('docker-compose -f docker-compose.wt.yml down', { cwd: wtPath, stdio: 'inherit' });
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
 * Get docker services status
 * @param {string} wtPath - Worktree directory path
 * @returns {Array} List of service objects with name and status
 */
export function getServicesStatus(wtPath) {
  if (!hasDockerServices(wtPath)) return [];
  try {
    const output = execSync('docker-compose -f docker-compose.wt.yml ps --format json', {
      cwd: wtPath,
      encoding: 'utf-8',
    });
    return JSON.parse(output);
  } catch {
    return [];
  }
}
