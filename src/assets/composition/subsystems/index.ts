/**
 * Nature Scene Composer Subsystems — Barrel exports.
 *
 * Each subsystem handles a specific domain of the nature scene pipeline:
 *   - NatureTerrainSubsystem   — terrain generation & biome classification
 *   - NatureVegetationSubsystem — vegetation & ground cover scattering
 *   - NatureAtmosphereSubsystem — clouds, weather, wind, lighting
 *   - NatureWaterSubsystem     — rivers, lakes, waterfalls
 *   - NatureCameraSubsystem    — camera setup & terrain validation
 *
 * @module composition/subsystems
 */

export { NatureTerrainSubsystem, type TerrainStepResult } from './NatureTerrainSubsystem';
export { NatureVegetationSubsystem, type VegetationStepResult } from './NatureVegetationSubsystem';
export { NatureAtmosphereSubsystem } from './NatureAtmosphereSubsystem';
export { NatureWaterSubsystem } from './NatureWaterSubsystem';
export { NatureCameraSubsystem } from './NatureCameraSubsystem';
