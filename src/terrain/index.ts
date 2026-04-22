/**
 * Infinigen R3F Port - Phase 10: Terrain Generation
 * Main Module Exports
 */

// Core Generator
export { 
  TerrainGenerator, 
  type HeightMap, 
  type MaskMap, 
  type TerrainConfig, 
  type TerrainData 
} from './core/TerrainGenerator';

// GPU Compute (Phase 1.2)
export {
  MarchingCubesCompute,
  type GPUComputeConfig,
  type MarchingCubesResult,
} from './gpu';

// Advanced Features (Phase 2)
export {
  CaveGenerator,
  type CaveConfig,
  type CavePoint,
  type CaveSystem,
  type CaveDecoration,
  ErosionSystem,
  type ErosionConfig,
  type ErosionData,
  OceanSystem,
  type OceanConfig,
  type WaveData,
  type OceanState,
} from './features';

// Scatter Systems (Phase 3)
export {
  GroundCoverScatter,
  type GroundCoverType,
  type GroundCoverConfig,
  type GroundCoverInstance,
  ClimbingPlantGenerator,
  type ClimbingPlantType,
  type ClimbingPlantConfig,
  type ClimbingSegment,
  type ClimbingPlantInstance,
} from './scatter';

// Mesher
export { 
  TerrainMesher, 
  type MeshConfig, 
  type ChunkData 
} from './mesher/TerrainMesher';

// Biomes
export { 
  BiomeSystem, 
  type BiomeType, 
  type BiomeConfig 
} from './biomes/BiomeSystem';

// Vegetation
export { 
  VegetationScatter, 
  type VegetationConfig, 
  type VegetationInstance 
} from './vegetation/VegetationScatter';

// Utilities
export { 
  TerrainUtils, 
  type WaterConfig 
} from './utils/TerrainUtils';
