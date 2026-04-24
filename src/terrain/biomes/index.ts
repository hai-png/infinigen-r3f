/**
 * Biomes Module - Root Index
 * 
 * Provides unified access to biome system functionality.
 * Use this import path for new code:
 *   import { BiomeSystem } from '@/biomes';
 * 
 * Legacy import path still supported:
 *   import { BiomeSystem } from '@/terrain/biomes';
 */

export { BiomeSystem } from './core/BiomeSystem';
export type { 
  BiomeType, 
  BiomeConfig, 
  BiomeDefinition, 
  BiomeBlend 
} from './core/BiomeSystem';

// Re-export core framework for advanced usage
export { 
  BiomeFramework,
  BiomeInterpolator,
  BiomeScatterer,
  type BiomeTransitionZone,
  type ScatteredAsset,
  type BiomeScatterConfig
} from './core/BiomeFramework';
