/**
 * Node Execution Layer - Index
 *
 * Provides the complete node evaluation pipeline for converting
 * node graphs into renderable Three.js materials, textures, and geometry.
 *
 * @module @infinigen/r3f/nodes/execution
 */

// NodeEvaluator - Topological sort and graph evaluation
export {
  NodeEvaluator,
  EvaluationMode,
  CyclicDependencyError,
  MissingConnectionError,
  SocketTypeMismatchError,
} from './NodeEvaluator';

export type {
  NodeEvaluationResult,
  NodeGraph,
} from './NodeEvaluator';

// ShaderCompiler - GLSL shader generation from node graphs
export {
  NodeShaderCompiler,
} from './ShaderCompiler';

export type {
  ShaderCompileResult,
} from './ShaderCompiler';

// MaterialFactory - High-level API for creating materials from presets
export {
  MaterialFactory,
} from './MaterialFactory';

export type {
  TerrainMaterialParams,
  BarkMaterialParams,
  StoneMaterialParams,
  MetalMaterialParams,
  GlassMaterialParams,
  FabricMaterialParams,
  WaterMaterialParams,
  FoliageMaterialParams,
  SkinMaterialParams,
} from './MaterialFactory';

// TextureNodeExecutor - DataTexture generation from node parameters
export {
  TextureNodeExecutor,
} from './TextureNodeExecutor';

export type {
  NoiseType,
  GradientType,
  PatternType,
  TextureExecParams,
} from './TextureNodeExecutor';

// GeometryNodeExecutor - Geometry node execution backend
export {
  GeometryNodeContext,
  GeometryNodeExecutor,
  GeometryNodePipeline,
} from './GeometryNodeExecutor';

export type {
  GeometryExecutorFn,
} from './GeometryNodeExecutor';

// AttributeIO - Per-vertex/face data I/O system
export {
  AttributeType,
  AttributeDomain,
  NamedAttribute,
  AttributeManager,
  StandardAttributes,
  readAttrData,
  writeAttrData,
  newAttrData,
} from './AttributeIO';

// NodeGraphMaterialBridge - Converts BSDF output to MeshPhysicalMaterial
export {
  NodeGraphMaterialBridge,
} from './NodeGraphMaterialBridge';

export type {
  BSDFOutput,
  NodeEvaluationOutput,
} from './NodeGraphMaterialBridge';

// NodeGraphTextureBridge - Converts texture node output to Three.js Texture
export {
  NodeGraphTextureBridge,
} from './NodeGraphTextureBridge';

export type {
  TextureNodeType,
  TextureNodeOutput,
} from './NodeGraphTextureBridge';

// SurfaceIntegration - Surface/material integration
export {
  add_geomod,
  add_material,
  shaderfunc_to_material,
  create_surface_material,
  compileShaderGraphToMaterial,
} from './SurfaceIntegration';

export type {
  MaterialCompileOptions,
} from './SurfaceIntegration';
