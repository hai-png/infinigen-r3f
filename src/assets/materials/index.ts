export { WoodGenerator as WoodMaterialGenerator } from './categories/Wood/WoodGenerator';
export type { WoodParams as WoodMaterialConfig } from './categories/Wood/WoodGenerator';

export { MetalGenerator as MetalMaterialGenerator } from './categories/Metal/MetalGenerator';
export type { MetalParams as MetalMaterialConfig } from './categories/Metal/MetalGenerator';

export { FabricGenerator as FabricMaterialGenerator } from './categories/Fabric/FabricGenerator';
export type { FabricParams as FabricMaterialConfig } from './categories/Fabric/FabricGenerator';

export { CeramicGenerator as CeramicMaterialGenerator } from './categories/Ceramic/CeramicGenerator';
export type { CeramicParams as CeramicMaterialConfig } from './categories/Ceramic/CeramicGenerator';

export { GlassGenerator as GlassMaterialGenerator } from './categories/Glass/GlassGenerator';
export type { GlassParams as GlassMaterialConfig } from './categories/Glass/GlassGenerator';

export { LeatherGenerator as LeatherMaterialGenerator } from './categories/Leather/LeatherGenerator';
export type { LeatherParams as LeatherMaterialConfig } from './categories/Leather/LeatherGenerator';

export { TileGenerator as TileMaterialGenerator } from './categories/Tile/TileGenerator';
export type { TileParams as TileMaterialConfig } from './categories/Tile/TileGenerator';

export { WaterMaterial } from './categories/Fluid/WaterMaterial';
export type { WaterParams, WaterPreset, WaterMaterialConfig } from './categories/Fluid/WaterMaterial';

export { CoatingGenerator } from './coating/CoatingGenerator';
export type { CoatingParams } from './coating/CoatingGenerator';

export { SurfaceDetailGenerator } from './surface/SurfaceDetail';
export type { SurfaceParams } from './surface/SurfaceDetail';

export { WeatheringGenerator } from './weathering/Weathering';
export type { WeatheringParams } from './weathering/Weathering';

export { WearGenerator } from './wear/WearGenerator';
export type { WearParams } from './wear/WearGenerator';

export { PatternGenerator } from './patterns/PatternGenerator';
export type { PatternParams } from './patterns/PatternGenerator';

export { MaterialBlender } from './blending/MaterialBlender';
export type { BlendParams } from './blending/MaterialBlender';

// Phase 3.3 — Material & Texture Pipeline
export { MaterialPresetLibrary } from './MaterialPresetLibrary';
export type { MaterialPreset as PBRMaterialPreset, MaterialCategory as PresetMaterialCategory, PresetVariation } from './MaterialPresetLibrary';

export { MaterialBlendingSystem } from './blending/MaterialBlendingSystem';
export type { BlendConfig, BlendMaskType, BlendedResult, SlopeMaskParams, AltitudeMaskParams, NoiseMaskParams } from './blending/MaterialBlendingSystem';

export { ProceduralTextureGraph } from './textures/ProceduralTextureGraph';
export type { TextureChannel, TextureGraph, TextureGraphOutput, GraphNode, GraphLink } from './textures/ProceduralTextureGraph';

export { TextureBakePipeline } from './textures/TextureBakePipeline';
export type { BakeResolution, PBRTextureSet, MaterialPBRParams } from './textures/TextureBakePipeline';

export { DecalSystem } from './decals/DecalSystem';
export type { DecalParams, DecalPlacement } from './decals/DecalSystem';

// Node-material bridge: node system → category generators
export { NodeMaterialGenerator, generateNodeMaterial, generateMaterial } from './node-materials';
export type { MaterialCategory, NodeMaterialParams, NodeMaterialResult } from './node-materials';

// Unified material pipeline: preset library + node graph bridges + texture baker
export { MaterialPipeline } from './MaterialPipeline';
export type { TextureMaps } from './MaterialPipeline';
