import {
  isWtInstalled,
  listWorktrees,
  createWorktree,
  getWorktreePath,
  hasWorktree,
  removeWorktree,
  getFeatureBranch,
  startServices,
  stopServices,
  hasDockerServices,
  getServicesStatus,
} from '../../services/worktrunk.js';
import { json, error } from '../router.js';

export function registerWorktrunkRoutes(router) {
  // Check if wt CLI is installed
  router.get('/api/wt/status', async (req, res) => {
    const installed = isWtInstalled();
    json(res, { installed });
  });

  // Get worktree status for a feature
  router.get('/api/features/:name/wt', async (req, res, { params, root }) => {
    const installed = isWtInstalled();
    if (!installed) {
      return json(res, {
        installed: false,
        hasWorktree: false,
        path: null,
        hasServices: false,
      });
    }

    const branch = getFeatureBranch(params.name);
    const wtPath = getWorktreePath(branch, root);
    const hasWt = wtPath !== null;
    const hasServices = hasWt && hasDockerServices(wtPath);

    json(res, {
      installed: true,
      hasWorktree: hasWt,
      path: wtPath,
      branch,
      hasServices,
    });
  });

  // Create a worktree for a feature
  router.post('/api/features/:name/wt/create', async (req, res, { params, root }) => {
    const installed = isWtInstalled();
    if (!installed) {
      return error(res, 'Worktrunk (wt) CLI is not installed', 400);
    }

    const branch = getFeatureBranch(params.name);

    // Check if worktree already exists
    if (hasWorktree(branch, root)) {
      return error(res, `Worktree for branch "${branch}" already exists`, 400);
    }

    try {
      createWorktree(branch, root);
      const wtPath = getWorktreePath(branch, root);
      json(res, {
        ok: true,
        branch,
        path: wtPath,
      }, 201);
    } catch (err) {
      error(res, `Failed to create worktree: ${err.message}`, 500);
    }
  });

  // Remove a worktree for a feature
  router.delete('/api/features/:name/wt', async (req, res, { params, root }) => {
    const installed = isWtInstalled();
    if (!installed) {
      return error(res, 'Worktrunk (wt) CLI is not installed', 400);
    }

    const branch = getFeatureBranch(params.name);

    if (!hasWorktree(branch, root)) {
      return error(res, `No worktree found for branch "${branch}"`, 404);
    }

    try {
      removeWorktree(branch, root);
      json(res, { ok: true });
    } catch (err) {
      error(res, `Failed to remove worktree: ${err.message}`, 500);
    }
  });

  // Start docker services in worktree
  router.post('/api/features/:name/wt/services/start', async (req, res, { params, root }) => {
    const branch = getFeatureBranch(params.name);
    const wtPath = getWorktreePath(branch, root);

    if (!wtPath) {
      return error(res, 'No worktree found for this feature', 404);
    }

    if (!hasDockerServices(wtPath)) {
      return error(res, 'No docker-compose.wt.yml found in worktree', 404);
    }

    try {
      startServices(wtPath);
      json(res, { ok: true });
    } catch (err) {
      error(res, `Failed to start services: ${err.message}`, 500);
    }
  });

  // Stop docker services in worktree
  router.post('/api/features/:name/wt/services/stop', async (req, res, { params, root }) => {
    const branch = getFeatureBranch(params.name);
    const wtPath = getWorktreePath(branch, root);

    if (!wtPath) {
      return error(res, 'No worktree found for this feature', 404);
    }

    if (!hasDockerServices(wtPath)) {
      return error(res, 'No docker-compose.wt.yml found in worktree', 404);
    }

    try {
      stopServices(wtPath);
      json(res, { ok: true });
    } catch (err) {
      error(res, `Failed to stop services: ${err.message}`, 500);
    }
  });

  // Get services status
  router.get('/api/features/:name/wt/services', async (req, res, { params, root }) => {
    const branch = getFeatureBranch(params.name);
    const wtPath = getWorktreePath(branch, root);

    if (!wtPath) {
      return json(res, { services: [], hasServices: false });
    }

    const hasServices = hasDockerServices(wtPath);
    const services = hasServices ? getServicesStatus(wtPath) : [];

    json(res, { services, hasServices });
  });
}
