// Procedural generators
export * from './procedural/index';

// Material generators — avoid barrel re-export to prevent ErosionData name clash
export { MaterialPipeline, type TerrainMaterialConfig } from './materials/MaterialPipeline';
export * from './materials/MaterialPresetLibrary';
export * from './materials/wear/WearGenerator';
export * from './materials/textures/TextureBakePipeline';
export { ErosionMaterialBlending, type ErosionData as MaterialErosionData, type ErosionBlendConfig, type TerrainBlendWeights, type ErosionBlendResult } from './materials/blending/ErosionMaterialBlending';

// Specialized shaders
export * from './shaders/index';

// Scatter systems
export { GrassScatterSystem, InstanceScatterSystem, RockScatterSystem } from './scatters/index';
export type { GrassScatterConfig, ScatterConfig as AssetScatterConfig, ScatterMode, BiomeRule, ScatterResult, RockScatterConfig, RockScatterStats } from './scatters/index';

// Lighting systems
export * from './lighting/index';
