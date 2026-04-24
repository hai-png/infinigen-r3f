/**
 * Infinigen R3F Port - Phase 10: Terrain Generation
 * Main Module Exports
 */
// Core Generator
export { TerrainGenerator } from './core/TerrainGenerator';
// GPU Compute (Phase 1.2)
export { MarchingCubesCompute, } from './gpu';
// Advanced Features (Phase 2)
export { CaveGenerator, ErosionSystem, OceanSystem, } from './features';
// Scatter Systems (Phase 3)
export { GroundCoverScatter, ClimbingPlantGenerator, } from './scatter';
// Mesher
export { TerrainMesher } from './mesher/TerrainMesher';
// Biomes
export { BiomeSystem } from '../biomes/core/BiomeSystem';
// Vegetation
export { VegetationScatter } from './vegetation/VegetationScatter';
// Utilities
export { TerrainUtils } from './utils/TerrainUtils';
//# sourceMappingURL=index.js.map