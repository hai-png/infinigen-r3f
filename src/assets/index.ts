// Procedural generators
export * from './procedural/index';

// Material generators
// Note: TerrainMaterialConfig is also exported via ./procedural/index (→ terrain).
// The materials version (from MaterialPipeline) is the primary one here.
// Explicit re-export resolves the ambiguity.
export * from './materials/index';
export type { TerrainMaterialConfig } from './materials/MaterialPipeline';

// Specialized shaders
export * from './shaders/index';

// Scatter systems
export { GrassScatterSystem, InstanceScatterSystem, RockScatterSystem } from './scatters/index';
export type { GrassScatterConfig, ScatterConfig as AssetScatterConfig, ScatterMode, BiomeRule, ScatterResult, RockScatterConfig, RockScatterStats } from './scatters/index';

// Lighting systems
export * from './lighting/index';
