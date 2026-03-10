import { registerFeatureRoutes } from './features.js';
import { registerConfigRoutes } from './config.js';
import { registerLogRoutes } from './logs.js';
import { registerConstantsRoutes } from './constants.js';

export function registerApiRoutes(router, root) {
  registerFeatureRoutes(router);
  registerConfigRoutes(router);
  registerLogRoutes(router);
  registerConstantsRoutes(router);
}
