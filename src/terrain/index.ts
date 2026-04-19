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
