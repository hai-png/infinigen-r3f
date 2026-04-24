/**
 * Infinigen R3F Port - Phase 10: Terrain Generation
 * Main Module Exports
 */
export { TerrainGenerator, type HeightMap, type MaskMap, type TerrainConfig, type TerrainData } from './core/TerrainGenerator';
export { MarchingCubesCompute, type GPUComputeConfig, type MarchingCubesResult, } from './gpu';
export { CaveGenerator, type CaveConfig, type CavePoint, type CaveSystem, type CaveDecoration, ErosionSystem, type ErosionConfig, type ErosionData, OceanSystem, type OceanConfig, type WaveData, type OceanState, } from './features';
export { GroundCoverScatter, type GroundCoverType, type GroundCoverConfig, type GroundCoverInstance, ClimbingPlantGenerator, type ClimbingPlantType, type ClimbingPlantConfig, type ClimbingSegment, type ClimbingPlantInstance, } from './scatter';
export { TerrainMesher, type MeshConfig, type ChunkData } from './mesher/TerrainMesher';
export { BiomeSystem, type BiomeType, type BiomeConfig } from '../biomes/core/BiomeSystem';
export { VegetationScatter, type VegetationConfig, type VegetationInstance } from './vegetation/VegetationScatter';
export { TerrainUtils, type WaterConfig } from './utils/TerrainUtils';
//# sourceMappingURL=index.d.ts.map