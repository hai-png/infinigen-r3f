/**
 * Shader Nodes Module Index
 * 
 * Re-exports all shader/material nodes
 */

export {
  // Principled BSDF and variants
  PrincipledBSDFDefinition,
  executePrincipledBSDF,
  BsdfDiffuseDefinition,
  executeBsdfDiffuse,
  BsdfGlossyDefinition,
  executeBsdfGlossy,
  BsdfGlassDefinition,
  executeBsdfGlass,
  EmissionDefinition,
  executeEmission,
  TransparentBSDFDefinition,
  executeTransparentBSDF,
  RefractionBSDFDefinition,
  executeRefractionBSDF,
  
  // Shader mixing
  MixShaderDefinition,
  executeMixShader,
  AddShaderDefinition,
  
  // Surface effects
  AmbientOcclusionDefinition,
  executeAmbientOcclusion,
  
  // Texture coordinates
  TextureCoordinateDefinition,
  executeTextureCoordinate,
  MappingDefinition,
  executeMapping,
  
  // Material creation
  createMaterialFromShader,
  parseColor,
} from './PrincipledNodes';

export type {
  PrincipledBSDFNode,
  BsdfDiffuseNode,
  BsdfGlossyNode,
  BsdfGlassNode,
  EmissionNode,
  TransparentBSDFNode,
  RefractionBSDFNode,
  MixShaderNode,
  AddShaderNode,
  AmbientOcclusionNode,
  TextureCoordinateNode,
  MappingNode,
} from './PrincipledNodes';

// Shader mixing nodes (MixShader, LightPath, Fresnel, TransparentOverlay)
export {
  MixShaderNode as MixShaderNodeClass,
  LightPathNode,
  FresnelNode,
  TransparentOverlayNode,
  ShaderMixingSystem,
  shaderMixingSystem,
  createDefaultShaderOutput,
} from './ShaderMixingNodes';

export type {
  BlendMode,
  RayType,
  LightPathContext,
  ShaderOutput as ShaderMixOutput,
  LightPathOutput,
  RegisteredMixShader,
} from './ShaderMixingNodes';
