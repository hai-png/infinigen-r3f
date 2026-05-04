/**
 * LOD System — DEPRECATED
 *
 * This module has been consolidated into the canonical implementation at
 * `@/assets/core/LODSystem`.  All types, classes, and functions are
 * re-exported here for backward compatibility.  New code should import
 * directly from the canonical location.
 *
 * Migration guide:
 *   import { LODConfig }      from '@/core/rendering/lod/LODSystem'
 *   → import { RenderingLODConfig } from '@/assets/core/LODSystem'
 *
 *   import { LODLevel }       from '@/core/rendering/lod/LODSystem'
 *   → import { RenderingLODLevel }  from '@/assets/core/LODSystem'
 *
 *   import LODSystem          from '@/core/rendering/lod/LODSystem'
 *   → import { LODManager }   from '@/assets/core/LODSystem'
 *   (The default export here is a thin LODManager subclass for compat.)
 *
 * @deprecated Import from `@/assets/core/LODSystem` instead.
 */

// Re-export everything from the canonical location
export {
  // Types
  type RenderingLODConfig,
  type RenderingLODLevel,
  type LODLevel,
  type LODMesh,
  type LODObject,
  type InstancedLODConfig,

  // Constants
  DEFAULT_LOD_CONFIG,

  // Classes
  LODManager,
  InstancedLODManager,

  // Functions
  generateLODLevels,
  selectLODByDistance,
  selectLODByScreenSpace,
  updateLODWithHysteresis,
  calculateMemorySavings,
  estimateRenderingImprovement,
} from '@/assets/core/LODSystem';

/**
 * @deprecated Use `RenderingLODConfig` from `@/assets/core/LODSystem` instead.
 * Kept as a type alias for backward compatibility with code that imported
 * `LODConfig` from this module.
 */
import type { RenderingLODConfig } from '@/assets/core/LODSystem';
export type LODConfig = RenderingLODConfig;

/**
 * @deprecated Use `LODManager` from `@/assets/core/LODSystem` instead.
 * The default export is retained for backward compatibility.
 */
import { LODManager } from '@/assets/core/LODSystem';
export default class LODSystem extends LODManager {
  constructor(config: Partial<RenderingLODConfig> = {}) {
    super(config);
  }
}
