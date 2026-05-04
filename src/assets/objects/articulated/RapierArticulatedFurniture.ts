/**
 * Rapier-Backed Articulated Furniture — BACKWARD COMPATIBILITY BARREL
 *
 * ⚠️  This file is a re-export barrel for backward compatibility only.
 *     The actual classes have been extracted into individual files under
 *     `./rapier/`.  New code should import from the canonical `articulated/`
 *     generators (DoorGenerator, WindowGenerator, etc.) instead.
 *
 * Migration guide:
 *   OLD: import { DoorGenerator } from './RapierArticulatedFurniture';
 *   NEW: import { DoorGenerator } from './DoorGenerator';
 *
 * The re-exported classes are deprecated and will be removed in a future
 * release once the unified articulated system supports Rapier physics
 * natively.
 *
 * @deprecated Import from individual rapier/ files or, preferably, from
 *           the canonical articulated/ generators instead.
 *
 * @module articulated
 * @phase 8
 * @p-number P8.3
 */

// Re-export all types and classes from the extracted individual files
export type {
  RapierJointType,
  RapierJointConfig,
  ArticulatedFurnitureResult,
  RigidBodyDef,
  ArticulatedFurnitureConfig,
} from './rapier/RapierTypes';

export {
  DEFAULT_FURNITURE_CONFIG,
  createMaterial,
} from './rapier/RapierTypes';

/**
 * @deprecated Use `import { DoorGenerator } from './DoorGenerator'` instead.
 */
export { RapierDoorGenerator as DoorGenerator } from './rapier/RapierDoorGenerator';

/**
 * @deprecated Use `import { WindowGenerator } from './WindowGenerator'` instead.
 */
export { RapierWindowGenerator as WindowGenerator } from './rapier/RapierWindowGenerator';

/**
 * @deprecated Use `import { DrawerGenerator } from './DrawerGenerator'` instead.
 */
export { RapierDrawerGenerator as DrawerGenerator } from './rapier/RapierDrawerGenerator';

/**
 * @deprecated Use `import { CabinetGenerator } from './CabinetGenerator'` instead.
 */
export { RapierCabinetGenerator as CabinetGenerator } from './rapier/RapierCabinetGenerator';

/**
 * @deprecated Use `import { FaucetGenerator } from './FaucetGenerator'` instead.
 */
export { RapierFaucetGenerator as FaucetGenerator } from './rapier/RapierFaucetGenerator';

import { RapierDoorGenerator } from './rapier/RapierDoorGenerator';
import { RapierWindowGenerator } from './rapier/RapierWindowGenerator';
import { RapierDrawerGenerator } from './rapier/RapierDrawerGenerator';
import { RapierCabinetGenerator } from './rapier/RapierCabinetGenerator';
import { RapierFaucetGenerator } from './rapier/RapierFaucetGenerator';

/**
 * @deprecated Import individual generators from their canonical files instead.
 */
const _defaultExport = {
  DoorGenerator: RapierDoorGenerator,
  WindowGenerator: RapierWindowGenerator,
  DrawerGenerator: RapierDrawerGenerator,
  CabinetGenerator: RapierCabinetGenerator,
  FaucetGenerator: RapierFaucetGenerator,
};

export default _defaultExport;
