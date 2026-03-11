import { FEATURE_STEPS, STEP_STATUS, QUICK_STEPS } from '../../constants.js';
import { loadConfig } from '../../models.js';
import { json } from '../router.js';

export function registerConstantsRoutes(router) {
  router.get('/api/constants', (req, res) => {
    json(res, { FEATURE_STEPS, STEP_STATUS, QUICK_STEPS });
  });

  // List all unique models from config
  router.get('/api/models', async (req, res, { root }) => {
    try {
      const config = await loadConfig(root);
      const all = new Set();
      for (const models of Object.values(config.models || {})) {
        for (const entry of models) {
          all.add(entry.model);
        }
      }
      json(res, [...all]);
    } catch (err) {
      json(res, []);
    }
  });
}
