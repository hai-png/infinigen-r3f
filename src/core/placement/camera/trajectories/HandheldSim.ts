// Re-export from CraneShot.ts for backwards compatibility
export {
  createHandheldSim as simulateHandheld,
  type HandheldConfig,
} from './CraneShot';

import { createHandheldSim } from './CraneShot';

/**
 * Legacy default export for backwards compatibility
 */
export default {
  simulateHandheld: createHandheldSim,
};
