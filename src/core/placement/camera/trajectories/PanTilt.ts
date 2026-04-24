// Re-export from CraneShot.ts for backwards compatibility
export {
  createPanShot,
  createTiltShot,
  type PanShotConfig,
  type TiltShotConfig,
} from './CraneShot';

import { createPanShot, createTiltShot } from './CraneShot';

/**
 * Legacy default export for backwards compatibility
 */
export default {
  createPanShot,
  createTiltShot,
};
