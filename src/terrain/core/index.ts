/**
 * Core Terrain Generator Module Exports
 *
 * ⚠️  DEPRECATION NOTICE: `TerrainGenerator` is deprecated in favour of
 *     `UnifiedTerrainGenerator` (from `../UnifiedTerrainGenerator`).
 *     The class is retained for backward compatibility and now delegates
 *     internally to `UnifiedTerrainGenerator` in HEIGHTMAP mode.
 *
 * Migration:
 *   import { UnifiedTerrainGenerator, TerrainGenerationMode } from '@/terrain/UnifiedTerrainGenerator';
 *   const gen = new UnifiedTerrainGenerator({ mode: TerrainGenerationMode.HEIGHTMAP, seed: 42 });
 */

export {
  TerrainGenerator,
  type TerrainData as TerrainCoreData,
  type MaskMap,
  type TerrainConfig,
  type TerrainGeneratorConfig,
} from './TerrainGenerator';

// Re-export the surface shader config type since it's part of TerrainGeneratorConfig
export type { TerrainSurfaceConfig } from '../gpu/TerrainSurfaceShaderPipeline';

// Re-export unified types from shared types module
export type { HeightMap, NormalMap, BiomeGrid } from '../types';
export { heightMapFromFloat32Array, sampleHeightAt, getHeightValueAt, setHeightValueAt, normalizeHeightmap } from '../types';

// Re-export UnifiedTerrainGenerator for easy migration from this entry point.
// Note: parameter sub-types (MountainParams, CaveParams, etc.) are NOT
// re-exported here to avoid naming conflicts with existing exports in
// sibling modules (e.g. CaveParams from ../caves). Import those directly
// from '../UnifiedTerrainGenerator' if needed.
export {
  UnifiedTerrainGenerator,
  TerrainGenerationMode,
  TerrainPresetConfig,
  getPresetConfig,
  DEFAULT_UNIFIED_TERRAIN_CONFIG,
  type UnifiedTerrainConfig,
  type SDFGenerationResult,
} from '../UnifiedTerrainGenerator';
