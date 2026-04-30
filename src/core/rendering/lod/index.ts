/**
 * LOD System Module Exports
 */

export * from './LODSystem';

// Re-export default as named export for convenience
export { default as LODSystem } from './LODSystem';

import LODSystem, {
  LODLevel,
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
  LODLevel,
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
