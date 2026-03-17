import {
  isWtInstalled,
  listWorktrees,
  createWorktree,
  getWorktreePath,
  hasWorktree,
  removeWorktree,
  getFeatureBranch,
  getStoryBranch,
  hasDockerServices,
  isDockerRunning,
  getServicesStatus,
  startComposeService,
  stopComposeService,
  startAllComposeServices,
  stopAllComposeServices,
} from '../../services/worktrunk.js';
import { json, error } from '../router.js';
import { loadStatus, getStoryDirPath } from '../../services/status.js';
import fs from 'fs-extra';
import yaml from 'yaml';
import path from 'node:path';

// Helper to update worktrunk in status.yaml
async function updateWorktrunkStatus(slug, root, worktrunk) {
  const storyDir = await getStoryDirPath(slug, root);
  const statusPath = path.join(storyDir, 'status.yaml');

  if (!await fs.pathExists(statusPath)) {
    throw new Error(`Story "${slug}" not found`);
  }

  const raw = await fs.readFile(statusPath, 'utf-8');
  const status = yaml.parse(raw);
  status.worktrunk = worktrunk;
  await fs.writeFile(statusPath, yaml.stringify(status), 'utf-8');
  return status;
}

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

  // ============== Story Worktrunk Routes ==============

  // Validate storyId format (F1 fix: add validation)
  // Accept UUIDs and slugs (alphanumeric with dashes)
  function isValidStoryId(id) {
    return typeof id === 'string' && id.length >= 1 && /^[a-zA-Z0-9_-]+$/i.test(id);
  }

  // Get worktrunk status for a story (uses slug, not UUID)
  router.get('/api/stories/:slug/worktrunk', async (req, res, { params, root }) => {
    const installed = isWtInstalled();
    if (!installed) {
      return json(res, {
        installed: false,
        hasWorktree: false,
        path: null,
        docker: { available: false, hasComposeFile: false },
      });
    }

    try {
      const status = await loadStatus(params.slug, root);

      // Check if story has worktrunk in status.yaml
      if (status.worktrunk?.enabled) {
        const wtPath = status.worktrunk.path;
        const pathExists = wtPath && hasWorktree(status.worktrunk.branch, root);
        if (!pathExists) {
          // Worktree was deleted externally, clean up
          await updateWorktrunkStatus(params.slug, root, null);
        } else {
          const dockerRunning = isDockerRunning();
          const hasComposeFile = hasDockerServices(wtPath);

          return json(res, {
            installed: true,
            hasWorktree: true,
            path: wtPath,
            branch: status.worktrunk.branch,
            submoduleBranches: status.worktrunk.submoduleBranches || [],
            docker: {
              available: dockerRunning,
              hasComposeFile,
            },
          });
        }
      }

      // Check if worktree exists but not linked to story
      const branch = getStoryBranch(params.slug);
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
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  // Create worktree for a story
  router.post('/api/stories/:slug/worktrunk', async (req, res, { params, root }) => {
    const installed = isWtInstalled();
    if (!installed) {
      return error(res, 'Worktrunk (wt) CLI is not installed', 400);
    }

    const branch = getStoryBranch(params.slug);

    if (hasWorktree(branch, root)) {
      return error(res, `Worktree for branch "${branch}" already exists`, 400);
    }

    try {
      // Verify story exists
      await loadStatus(params.slug, root);

      createWorktree(branch, root);
      const wtPath = getWorktreePath(branch, root);

      // Save worktrunk info to status.yaml
      await updateWorktrunkStatus(params.slug, root, {
        enabled: true,
        branch,
        path: wtPath,
        createdAt: new Date().toISOString(),
        submoduleBranches: [],
      });

      json(res, { ok: true, branch, path: wtPath }, 201);
    } catch (err) {
      error(res, `Failed to create worktree: ${err.message}`, 500);
    }
  });

  // Delete worktree for a story
  router.delete('/api/stories/:slug/worktrunk', async (req, res, { params, root }) => {
    const installed = isWtInstalled();
    if (!installed) {
      return error(res, 'Worktrunk (wt) CLI is not installed', 400);
    }

    try {
      const status = await loadStatus(params.slug, root);
      const branch = status.worktrunk?.branch || getStoryBranch(params.slug);

      if (hasWorktree(branch, root)) {
        removeWorktree(branch, root);
      }

      await updateWorktrunkStatus(params.slug, root, null);
      json(res, { ok: true });
    } catch (err) {
      error(res, `Failed to remove worktree: ${err.message}`, 500);
    }
  });

  // Get services status for story worktrunk
  router.get('/api/stories/:slug/worktrunk/services', async (req, res, { params, root }) => {
    try {
      const status = await loadStatus(params.slug, root);
      const wtPath = status.worktrunk?.path;

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
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  // Start a service in story worktrunk
  router.post('/api/stories/:slug/worktrunk/services/:service/start', async (req, res, { params, root }) => {
    try {
      const status = await loadStatus(params.slug, root);
      const wtPath = status.worktrunk?.path;

      if (!wtPath) {
        return error(res, 'No worktrunk found for this story', 404);
      }

      startComposeService(wtPath, params.service);
      json(res, { ok: true });
    } catch (err) {
      error(res, `Failed to start service: ${err.message}`, 500);
    }
  });

  // Stop a service in story worktrunk
  router.post('/api/stories/:slug/worktrunk/services/:service/stop', async (req, res, { params, root }) => {
    try {
      const status = await loadStatus(params.slug, root);
      const wtPath = status.worktrunk?.path;

      if (!wtPath) {
        return error(res, 'No worktrunk found for this story', 404);
      }

      stopComposeService(wtPath, params.service);
      json(res, { ok: true });
    } catch (err) {
      error(res, `Failed to stop service: ${err.message}`, 500);
    }
  });

  // Start all services in story worktrunk
  router.post('/api/stories/:slug/worktrunk/services/start', async (req, res, { params, root }) => {
    try {
      const status = await loadStatus(params.slug, root);
      const wtPath = status.worktrunk?.path;

      if (!wtPath) {
        return error(res, 'No worktrunk found for this story', 404);
      }

      startAllComposeServices(wtPath);
      json(res, { ok: true });
    } catch (err) {
      error(res, `Failed to start services: ${err.message}`, 500);
    }
  });

  // Stop all services in story worktrunk
  router.post('/api/stories/:slug/worktrunk/services/stop', async (req, res, { params, root }) => {
    try {
      const status = await loadStatus(params.slug, root);
      const wtPath = status.worktrunk?.path;

      if (!wtPath) {
        return error(res, 'No worktrunk found for this story', 404);
      }

      stopAllComposeServices(wtPath);
      json(res, { ok: true });
    } catch (err) {
      error(res, `Failed to stop services: ${err.message}`, 500);
    }
  });
}
