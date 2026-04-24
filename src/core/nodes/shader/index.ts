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
  executeAddShader,
  
  // Surface effects
  AmbientOcclusionDefinition,
  executeAmbientOcclusion,
  
  // Texture coordinates
  TextureCoordinateDefinition,
  executeTextureCoordinate,
  MappingDefinition,
  executeMapping,
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
