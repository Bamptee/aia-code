import { FEATURE_STEPS, STEP_STATUS, QUICK_STEPS } from '../../constants.js';
import { json } from '../router.js';

export function registerConstantsRoutes(router) {
  router.get('/api/constants', (req, res) => {
    json(res, { FEATURE_STEPS, STEP_STATUS, QUICK_STEPS });
  });
}
