// Re-export from DollyShot.ts for backwards compatibility
export {
  createTrackingShot,
  type DollyShotConfig as TrackingShotConfig,
} from './DollyShot';

import { createTrackingShot } from './DollyShot';

/**
 * Legacy default export for backwards compatibility
 */
export default {
  createTrackingShot,
};
