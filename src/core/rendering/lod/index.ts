/**
 * LOD System Module Exports — DEPRECATED
 *
 * This barrel has been consolidated into `@/assets/core/LODSystem`.
 * All symbols are re-exported here for backward compatibility.
 * New code should import directly from the canonical location.
 *
 * @deprecated Import from `@/assets/core/LODSystem` instead.
 */

// Re-export everything from the deprecated LODSystem module (which itself
// re-exports from the canonical location)
export * from './LODSystem';

// Re-export default as named export for convenience
export { default as LODSystem } from './LODSystem';

// Additional types from the canonical location that are not re-exported
// through ./LODSystem (which only covers the rendering-pipeline subset)
export type {
  ExportLODConfig,
  TerrainLODConfigFields,
} from '@/assets/core/LODSystem';

// Explicitly re-export types for consumers that import from this barrel
import LODSystem, {
  type LODLevel,
  DEFAULT_LOD_CONFIG,
  generateLODLevels,
  selectLODByDistance,
  selectLODByScreenSpace,
  updateLODWithHysteresis,
  LODManager,
  InstancedLODManager,
  calculateMemorySavings,
  estimateRenderingImprovement,
  type LODConfig,
  type LODMesh,
  type LODObject,
  type InstancedLODConfig,
} from './LODSystem';

export {
  type LODLevel,
  DEFAULT_LOD_CONFIG,
  generateLODLevels,
  selectLODByDistance,
  selectLODByScreenSpace,
  updateLODWithHysteresis,
  LODManager,
  InstancedLODManager,
  calculateMemorySavings,
  estimateRenderingImprovement,
};

export type {
  LODConfig,
  LODMesh,
  LODObject,
  InstancedLODConfig,
};
