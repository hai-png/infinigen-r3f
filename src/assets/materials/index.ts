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

export { EdgeWearMaterial } from './wear/EdgeWearMaterial';
export type { EdgeWearParams } from './wear/EdgeWearMaterial';

export { ScratchesMaterial } from './wear/ScratchesMaterial';
export type { ScratchParams } from './wear/ScratchesMaterial';

export { FruitMaterialLibrary } from './categories/Fruit/FruitMaterialLibrary';
export type { FruitMaterialParams, FruitType } from './categories/Fruit/FruitMaterialLibrary';

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
export type { BakeResolution, PBRTextureSet, CanvasPBRTextureSet, MaterialPBRParams, PresetBakeOptions } from './textures/TextureBakePipeline';

export { DecalSystem } from './decals/DecalSystem';
export type { DecalParams, DecalPlacement } from './decals/DecalSystem';

// Node-material bridge: node system → category generators
export { NodeMaterialGenerator, generateNodeMaterial, generateMaterial } from './node-materials';
export type { MaterialCategory, NodeMaterialParams, NodeMaterialResult } from './node-materials';

// Unified material pipeline: preset library + node graph bridges + texture baker
export { MaterialPipeline } from './MaterialPipeline';
export type {
  TextureMaps,
  MaterialInput,
  TerrainMaterialConfig,
  CreatureMaterialConfig,
  IndoorMaterialConfig,
} from './MaterialPipeline';

// Unified texture pipeline: GPU GLSL / Canvas / NodeGraph backends
export { MaterialTexturePipeline, getMaterialTexturePipeline, generateProceduralTexture } from './MaterialTexturePipeline';
export type {
  UnifiedPBRTextureSet,
  TextureBackend,
  MaterialTexturePipelineConfig,
  GenerateTextureOptions,
} from './MaterialTexturePipeline';

// 3D Material Evaluation — runtime GLSL shader pipeline
export { Material3DEvaluator, CoordinateSpace, DEFAULT_3D_CONFIG } from './Material3DEvaluator';
export type { MaterialPointEvaluation, Material3DConfig } from './Material3DEvaluator';

export { RuntimeMaterialBuilder, DEFAULT_NODEGRAPH_3D_CONFIG } from './RuntimeMaterialBuilder';
export type { NodeGraph3DConfig } from './RuntimeMaterialBuilder';

export {
  TRIPLANAR_GLSL,
  TEXCOORD_GLSL,
  NOISE_4D_GLSL,
  IBL_GLSL,
  MULTI_LIGHT_GLSL,
  VERTEX_SHADER_3D,
  VERTEX_VARYINGS_3D,
  FRAGMENT_VARYINGS_3D,
  buildVertexShaderWithDisplacement,
} from './shaders/TriplanarProjection';

// Terrain materials — 12 terrain types (ChunkyRock, CobbleStone, CrackedGround, etc.)
export { TerrainMaterialLibrary } from './categories/Terrain/TerrainMaterialLibrary';
export type { TerrainParams as TerrainSurfaceParams, TerrainType } from './categories/Terrain/TerrainMaterialLibrary';

// Tile patterns — 11 tile pattern types (BasketWeave, Chevron, Herringbone, etc.)
export { TilePatternLibrary } from './categories/Tile/TilePatternLibrary';
export type { TilePatternParams, TilePatternType } from './categories/Tile/TilePatternLibrary';

// Expanded material variants
export { WoodVariants } from './categories/Wood/WoodVariants';
export type { WoodVariantType, WoodVariantParams } from './categories/Wood/WoodVariants';

export { MetalVariants } from './categories/Metal/MetalVariants';
export type { MetalVariantType, MetalVariantParams } from './categories/Metal/MetalVariants';

export { FabricVariants } from './categories/Fabric/FabricVariants';
export type { FabricVariantType, FabricVariantParams } from './categories/Fabric/FabricVariants';

export { CreatureVariants } from './categories/Creature/CreatureVariants';
export type { CreatureVariantType, CreatureVariantParams } from './categories/Creature/CreatureVariants';

// Material assignment system — tag-based material selection and assignment
export { MaterialAssignmentSystem } from './assignment/MaterialAssignmentSystem';
export type { MaterialAssignmentEntry, MaterialAssignmentList } from './assignment/MaterialAssignmentSystem';

// SDF Perturb surface — SDF-aware displacement for material detail
export { SDFPerturbSurface, SDF_PERTURB_PRESETS, applySDFPerturb } from './surface/SDFPerturbSurface';
export type { SDFPerturbType, SDFPerturbConfig, SDFPerturbResult } from './surface/SDFPerturbSurface';

// Erosion-driven material blending — erosion mask → terrain material blends
export { ErosionMaterialBlending, createErosionBlendMask } from './blending/ErosionMaterialBlending';
export type { ErosionData, ErosionBlendConfig, TerrainBlendWeights, ErosionBlendResult } from './blending/ErosionMaterialBlending';

// Anisotropic material — GGX anisotropic BRDF for brushed metal, hair, silk
export { AnisotropicMaterial, ANISOTROPIC_PRESETS, createAnisotropicMaterial } from './AnisotropicMaterial';
export type { AnisotropicConfig, AnisotropicPreset } from './AnisotropicMaterial';
