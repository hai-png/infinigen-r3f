/**
 * Node Execution Layer - Index
 *
 * Provides the complete node evaluation pipeline for converting
 * node graphs into renderable Three.js materials, textures, and geometry.
 *
 * @module @infinigen/r3f/nodes/execution
 */

// ExecutorTypes — Shared type definitions for the node execution subsystem
export type {
  NodeInputs,
  NodeOutput,
  Vector3Like,
  ColorLike,
  GeometryLike,
  NodeExecutorFunction,
} from './ExecutorTypes';

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
  ShaderCompileOptions,
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

// ExtendedNodeExecutors - 30 additional curve, attribute, input, utility, and geometry-utility executors
export {
  executeCurveLine,
  executeQuadraticBezier,
  executeBezierSegment,
  executeCurveLength,
  executeSampleCurve,
  executeStoreNamedAttribute,
  executeNamedAttribute,
  executeAttributeStatistic,
  executeAttributeTransfer,
  executeObjectInfo,
  executeCollectionInfo,
  executeSelfObject,
  executeInputVector,
  executeInputColor,
  executeInputInt,
  executeInputFloat,
  executeInputBool,
  executeClamp,
  executeMapRange,
  executeFloatToInt,
  executeRotateEuler,
  executeRotateVector,
  executeAlignEulerToVector,
  executeSwitch,
  executeRandomValue,
  executeBoundingBox,
  executeGeometryProximity,
  executeRaycastEnhanced,
  executeSampleNearestSurfaceEnhanced,
  executeMeshToPoints,
} from './ExtendedNodeExecutors';

// AdditionalNodeExecutors - 30 additional texture coordinate, geometry operation, texture/evaluation, color/mix, and math/utility executors
export {
  AdditionalNodeExecutors,
  executeTextureCoordinate,
  executeMapping,
  executeUVMap,
  executeGeometryNodeInputPosition,
  executeGeometryNodeInputNormal,
  executeGeometryNodeInputTangent,
  executeSubdivideMesh,
  executeDecimateMesh,
  executeExtrudeFaces,
  executeInsetFaces,
  executeFlipFaces,
  executeRotateMesh,
  executeScaleMesh,
  executeTranslateMesh,
  executeBrickTexture,
  executeCheckerTexture,
  executeGradientTexture,
  executeMagicTexture,
  executeWaveTexture,
  executeWhiteNoiseTexture,
  executeColorRamp,
  executeCurves,
  executeSeparateColor,
  executeCombineColor,
  executeBooleanMath,
  executeFloatCompare,
  executeMapRangeVector,
  executeRotationToEuler,
  executeEulerToRotation,
  executeAccumulateField,
} from './AdditionalNodeExecutors';

export type {
  NodeExecutorFunction,
} from './AdditionalNodeExecutors';

// ExpandedNodeExecutors - 30 additional mesh topology, attribute, curve modifier, instance, volume/point, geometry, and shader input executors
export {
  ExpandedNodeExecutors,
  executeDualMesh,
  executeEdgeNeighbors,
  executeEdgeVertices,
  executeFaceArea,
  executeVertexNeighbors,
  executeEdgesOfFace,
  executeFacesOfEdge,
  executeCaptureAttribute,
  executeRemoveAttribute,
  executeSampleIndex,
  executeSampleNearest,
  executeDomainSize,
  executeSetCurveRadius,
  executeSetCurveTilt,
  executeSetHandlePositions,
  executeSplineParameter,
  executeFilletCurve,
  executeTranslateInstances,
  executeRotateInstances,
  executeScaleInstances,
  executeVolumeToMesh,
  executeVolumeToPoints,
  executePointsToVertices,
  executePointsToCurves,
  executeSetPosition,
  executeDuplicateElements,
  executeSetShadeSmooth,
  executeLightFalloff,
  executeObjectIndex,
  executeIsCameraRay,
} from './ExpandedNodeExecutors';

// GLSL Shader Generation - Node function libraries and shader composition
export {
  GLSLShaderComposer,
} from './glsl/GLSLShaderComposer';

export type {
  ComposableNode,
  ShaderGraph,
  ComposedShader,
} from './glsl/GLSLShaderComposer';

export {
  ALL_GLSL_NODE_FUNCTIONS,
  NODE_TYPE_GLSL_REQUIREMENTS,
  GLSL_SNIPPET_MAP,
} from './glsl/GLSLNodeFunctions';

// GPU Per-Vertex Evaluation - WebGPU compute shader evaluation
export {
  GPUPerVertexEvaluator,
} from './gpu/GPUPerVertexEvaluator';

export type {
  GPUEvaluationChannels,
  GPUEvaluationResult,
  GPUNode,
  GPUShaderGraph,
  GPUEvalOptions,
} from './gpu/GPUPerVertexEvaluator';

export {
  GPUEvaluationPipeline,
  isWebGPUAvailable,
  getWebGPUDevice,
} from './gpu/GPUEvaluationPipeline';

export type {
  PipelineEvalOptions,
  PipelineEvalResult,
} from './gpu/GPUEvaluationPipeline';

export {
  ALL_WGSL_NODE_FUNCTIONS,
} from './gpu/WGSLNodeFunctions';
