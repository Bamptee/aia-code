import {
  isWtInstalled,
  listWorktrees,
  createWorktree,
  getWorktreePath,
  hasWorktree,
  removeWorktree,
  getFeatureBranch,
  hasDockerServices,
  isDockerRunning,
  getServicesStatus,
  startComposeService,
  stopComposeService,
  startAllComposeServices,
  stopAllComposeServices,
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
        docker: { available: false, hasComposeFile: false },
      });
    }

    const branch = getFeatureBranch(params.name);
    const wtPath = getWorktreePath(branch, root);
    const hasWt = wtPath !== null;
    const dockerRunning = isDockerRunning();
    const hasComposeFile = hasWt && hasDockerServices(wtPath);

    json(res, {
      installed: true,
      hasWorktree: hasWt,
      path: wtPath,
      branch,
      docker: {
        available: dockerRunning,
        hasComposeFile,
      },
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

  // Get services status (from docker-compose.wt.yml)
  router.get('/api/features/:name/wt/services', async (req, res, { params, root }) => {
    const branch = getFeatureBranch(params.name);
    const wtPath = getWorktreePath(branch, root);

    if (!wtPath) {
      return json(res, { services: [], hasComposeFile: false, dockerAvailable: false });
    }

    const dockerAvailable = isDockerRunning();
    const hasComposeFile = hasDockerServices(wtPath);

    if (!dockerAvailable || !hasComposeFile) {
      return json(res, { services: [], hasComposeFile, dockerAvailable });
    }

    const services = getServicesStatus(wtPath);
    json(res, { services, hasComposeFile, dockerAvailable });
  });

  // Start a specific service
  router.post('/api/features/:name/wt/services/:service/start', async (req, res, { params, root }) => {
    const branch = getFeatureBranch(params.name);
    const wtPath = getWorktreePath(branch, root);

    if (!wtPath) {
      return error(res, 'No worktree found for this feature', 404);
    }

    try {
      startComposeService(wtPath, params.service);
      json(res, { ok: true });
    } catch (err) {
      error(res, `Failed to start service: ${err.message}`, 500);
    }
  });

  // Stop a specific service
  router.post('/api/features/:name/wt/services/:service/stop', async (req, res, { params, root }) => {
    const branch = getFeatureBranch(params.name);
    const wtPath = getWorktreePath(branch, root);

    if (!wtPath) {
      return error(res, 'No worktree found for this feature', 404);
    }

    try {
      stopComposeService(wtPath, params.service);
      json(res, { ok: true });
    } catch (err) {
      error(res, `Failed to stop service: ${err.message}`, 500);
    }
  });

  // Start all services
  router.post('/api/features/:name/wt/services/start', async (req, res, { params, root }) => {
    const branch = getFeatureBranch(params.name);
    const wtPath = getWorktreePath(branch, root);

    if (!wtPath) {
      return error(res, 'No worktree found for this feature', 404);
    }

    try {
      startAllComposeServices(wtPath);
      json(res, { ok: true });
    } catch (err) {
      error(res, `Failed to start services: ${err.message}`, 500);
    }
  });

  // Stop all services
  router.post('/api/features/:name/wt/services/stop', async (req, res, { params, root }) => {
    const branch = getFeatureBranch(params.name);
    const wtPath = getWorktreePath(branch, root);

    if (!wtPath) {
      return error(res, 'No worktree found for this feature', 404);
    }

    try {
      stopAllComposeServices(wtPath);
      json(res, { ok: true });
    } catch (err) {
      error(res, `Failed to stop services: ${err.message}`, 500);
    }
  });
}
