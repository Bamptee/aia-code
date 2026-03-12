import { registerFeatureRoutes } from './features.js';
import { registerConfigRoutes } from './config.js';
import { registerLogRoutes } from './logs.js';
import { registerConstantsRoutes } from './constants.js';
import { registerWorktrunkRoutes } from './worktrunk.js';

export function registerApiRoutes(router, root) {
  registerFeatureRoutes(router);
  registerConfigRoutes(router);
  registerLogRoutes(router);
  registerConstantsRoutes(router);
  registerWorktrunkRoutes(router);
}
