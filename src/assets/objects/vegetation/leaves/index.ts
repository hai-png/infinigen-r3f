/**
 * Leaves Module — Leaf geometry and materials with vein structure and wave deformation
 *
 * @module objects/vegetation/leaves
 */

export {
  LeafGenerator,
  generateLeaf,
  createGLSLeafMaterial,
  createLeafMeshWithGLSL,
} from './LeafGenerator';

export type {
  LeafShapeType,
  VeinParams,
  WaveParams,
  LeafGeneratorParams,
} from './LeafGenerator';

export {
  LeafMaterialGenerator,
  generateLeafMaterial,
} from './LeafMaterial';

export type {
  LeafColorScheme,
  LeafMaterialParams,
} from './LeafMaterial';

export {
  createGLSLLeafMaterial,
  createLeafMesh,
  updateLeafSeason,
} from './LeafGLSLMaterial';

export type {
  LeafShaderType,
  LeafSeason,
  GLSLLeafMaterialParams,
} from './LeafGLSLMaterial';
