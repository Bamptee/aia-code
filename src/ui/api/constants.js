import { FEATURE_STEPS, STEP_STATUS, QUICK_STEPS } from '../../constants.js';
import { loadConfig } from '../../models.js';
import { json } from '../router.js';

export function registerConstantsRoutes(router) {
  router.get('/api/constants', (req, res) => {
    json(res, { FEATURE_STEPS, STEP_STATUS, QUICK_STEPS });
  });

  // List available models per step from config
  router.get('/api/models', async (req, res, { root }) => {
    try {
      const config = await loadConfig(root);
      json(res, config.models || {});
    } catch (err) {
      json(res, {});
    }
  });
}
