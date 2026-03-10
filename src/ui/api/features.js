import path from 'node:path';
import fs from 'fs-extra';
import { AIA_DIR } from '../../constants.js';
import { loadStatus, updateStepStatus, resetStep } from '../../services/status.js';
import { createFeature, validateFeatureName } from '../../services/feature.js';
import { runStep } from '../../services/runner.js';
import { json, error } from '../router.js';

export function registerFeatureRoutes(router) {
  // List all features
  router.get('/api/features', async (req, res, { root }) => {
    const featuresDir = path.join(root, AIA_DIR, 'features');
    if (!(await fs.pathExists(featuresDir))) {
      return json(res, []);
    }
    const entries = await fs.readdir(featuresDir, { withFileTypes: true });
    const features = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const status = await loadStatus(entry.name, root);
          features.push({ name: entry.name, ...status });
        } catch {
          features.push({ name: entry.name, error: true });
        }
      }
    }
    json(res, features);
  });

  // Get a single feature
  router.get('/api/features/:name', async (req, res, { params, root }) => {
    try {
      const status = await loadStatus(params.name, root);
      const featureDir = path.join(root, AIA_DIR, 'features', params.name);
      const files = await fs.readdir(featureDir);
      json(res, { name: params.name, ...status, files });
    } catch (err) {
      error(res, err.message, 404);
    }
  });

  // Read a feature file
  router.get('/api/features/:name/files/:filename', async (req, res, { params, root }) => {
    const filePath = path.join(root, AIA_DIR, 'features', params.name, params.filename);
    if (!(await fs.pathExists(filePath))) {
      return error(res, 'File not found', 404);
    }
    const content = await fs.readFile(filePath, 'utf-8');
    json(res, { filename: params.filename, content });
  });

  // Save a feature file
  router.put('/api/features/:name/files/:filename', async (req, res, { params, root, parseBody }) => {
    const body = await parseBody();
    const filePath = path.join(root, AIA_DIR, 'features', params.name, params.filename);
    await fs.writeFile(filePath, body.content, 'utf-8');
    json(res, { ok: true });
  });

  // Create a new feature
  router.post('/api/features', async (req, res, { root, parseBody }) => {
    const body = await parseBody();
    try {
      validateFeatureName(body.name);
      await createFeature(body.name, root);
      json(res, { ok: true, name: body.name }, 201);
    } catch (err) {
      error(res, err.message, 400);
    }
  });

  // Run a step (blocking - returns when done)
  router.post('/api/features/:name/run/:step', async (req, res, { params, root, parseBody }) => {
    const body = await parseBody();
    try {
      const output = await runStep(params.step, params.name, {
        description: body.description,
        verbose: false,
        apply: body.apply || false,
        root,
      });
      json(res, { ok: true, output });
    } catch (err) {
      error(res, err.message, 400);
    }
  });

  // Reset a step
  router.post('/api/features/:name/reset/:step', async (req, res, { params, root }) => {
    try {
      await resetStep(params.name, params.step, root);
      json(res, { ok: true });
    } catch (err) {
      error(res, err.message, 400);
    }
  });
}
