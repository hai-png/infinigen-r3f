/**
 * Material Category Generators Index
 * 
 * Exports all material category generators.
 */

export { WoodGenerator, WoodSpecies } from './Wood/WoodGenerator';
export { MetalGenerator, MetalType } from './Metal/MetalGenerator';
export { FabricGenerator, FabricWeave } from './Fabric/FabricGenerator';
export { CeramicGenerator } from './Ceramic/CeramicGenerator';
export { PlasticGenerator } from './Plastic/PlasticGenerator';
export { GlassGenerator } from './Glass/GlassGenerator';
export { StoneGenerator } from './Stone/StoneGenerator';
export { LeatherGenerator } from './Leather/LeatherGenerator';

// Tile patterns (Sprint 1.4)
export { TilePatternGenerator, GeometricPatternType, TileMaterialType, TilePresets } from '../TilePatternGenerator';

// Fluid materials (Sprint 1.5)
export { FluidMaterialGenerator, FluidType, WaterPreset, LavaPreset, FluidPresets } from '../FluidMaterialGenerator';
