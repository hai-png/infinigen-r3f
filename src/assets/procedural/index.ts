/**
 * Procedural Generation Module Index
 * 
 * Re-exports procedural generation utilities from other modules
 * Note: ScatterConfig from ../scatters conflicts with core/placement,
 * so scatter systems are exported separately in the main index.ts
 */

// Export terrain-related procedural generation
export * from '../../terrain';

// Export object procedural generators
export * from '../objects';

// Export vegetation procedural generators  
export * from '../objects/vegetation';

// Export architectural elements
export * from '../objects/architectural';

// Export scatter systems (excluding ScatterConfig to avoid conflict with core/placement)
export { GrassScatterSystem, InstanceScatterSystem, RockScatterSystem } from '../scatters';
export type { GrassScatterConfig, ScatterConfig as AssetScatterConfig, ScatterMode, BiomeRule, ScatterResult, RockScatterConfig, RockScatterStats } from '../scatters';
