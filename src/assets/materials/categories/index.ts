/**
 * Material Category Generators Index
 * 
 * Exports all material category generators.
 */

export { WoodGenerator } from './Wood/WoodGenerator';
export { MetalGenerator } from './Metal/MetalGenerator';
export { FabricGenerator } from './Fabric/FabricGenerator';
export { CeramicGenerator } from './Ceramic/CeramicGenerator';
export { PlasticGenerator } from './Plastic/PlasticGenerator';
export { GlassGenerator } from './Glass/GlassGenerator';
export { StoneGenerator } from './Stone/StoneGenerator';
export { LeatherGenerator } from './Leather/LeatherGenerator';

// Creature materials (Sprint 1.5)
export type { FurMaterial, FurParams, FurPreset } from './Creature/FurMaterial';
export type { ScaleMaterial, ScaleParams, ScalePreset } from './Creature/ScaleMaterial';
export type { SkinMaterial, SkinParams, SkinPreset } from './Creature/SkinMaterial';

// Plant materials (Sprint 1.5)
export type { LeafMaterial, LeafParams, LeafPreset } from './Plant/LeafMaterial';
export type { BarkMaterial, BarkParams, BarkPreset } from './Plant/BarkMaterial';

// Fluid materials (Sprint 1.5)
export type { WaterMaterial, WaterParams, WaterPreset } from './Fluid/WaterMaterial';

// Tile materials (Sprint 1.5)
export type { CeramicTileMaterial, CeramicTileParams, CeramicTilePreset } from './Tile/CeramicTileMaterial';
