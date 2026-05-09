/**
 * Infinigen R3F Node System
 *
 * Complete node-based procedural generation system
 * Ported from Blender Geometry Nodes and Infinigen's node system
 *
 * @module @infinigen/r3f/nodes
 * @version 2.0.0
 *
 * Note: Some names exist in multiple sub-modules. When there's a conflict,
 * we explicitly re-export from the preferred module to resolve ambiguity.
 * The following names have been resolved:
 * - ColorNode, RandomValueNode, InstanceOnPointsNode → from ./geometry (primary definitions)
 * - MappingNode, CombineXYZNode, SeparateXYZNode, VectorMathNode, CompareNode → from ./vector (primary definitions)
 * - AttributeStatisticNode, CaptureAttributeNode, NamedAttributeNode, RemoveAttributeNode,
 *   SetPositionNode, StoreNamedAttributeNode → from ./geometry (primary definitions)
 * - GroupOutputNode → from ./output (primary definition)
 * - CollectionInfoNode, ObjectInfoNode → from ./collection (primary definitions)
 */

// ============================================================================
// NEW: Clean top-level exports
// ============================================================================

// NodeWrangler — central orchestrator for node graphs
export { NodeWrangler } from './node-wrangler';

// Types — single canonical source for all node-system interfaces
export type {
  NodeInstance,
  NodeLink,
  NodeGroup,
  NodeTree,
  NodeGraph,
  NodeGroupInterface,
  NodeEvaluationResult,
  NodeExecutionContext,
  Node,
  AttributeDomain,
  GeometryType,
} from './types';

export {
  EvaluationMode,
  NodeCategory,
} from './types';

// SocketTypeEnum — re-exported directly from registry (types.ts imports it as type-only)
export { SocketType as SocketTypeEnum } from './registry';

export type {
  NodeType,
  NodeSocket,
  SocketDefinition,
  GeometryDataType,
} from './registry';

// Registry — node type resolution and socket type system
export {
  resolveNodeType,
  isKnownNodeType,
  getAliasesForCanonical,
  registerNodeType,
  getCanonicalNodeTypes,
  getNodeCategory,
  SocketType,
  getDefaultValueForType,
  areSocketsCompatible,
} from './registry';

// Execution — node evaluation pipeline (clean API)
export type {
  NodeExecutor,
  ExecutorContext,
} from './execution';

export {
  registerExecutor,
  registerExecutorRaw,
  registerExecutorAliases,
  getExecutor,
  hasExecutor,
  executeNode,
  registerAllExecutors,
  getExecutorCount,
  NodeEvaluator,
  EvaluationMode as ExecutionEvaluationMode,
  CyclicDependencyError,
  MissingConnectionError,
  SocketTypeMismatchError,
  performCSGBoolean,
  mergeGeometries,
} from './execution';

export type {
  NodeEvaluationResult as ExecutionNodeEvaluationResult,
  BooleanOperation,
} from './execution';

// ============================================================================
// DEPRECATED: Legacy core/ re-exports (kept for backward compatibility)
// Consumers should migrate to the clean top-level exports above.
// ============================================================================

/** @deprecated Use `import { NodeTypes } from './core/node-types'` or canonical string types */
export { NodeTypes } from './core/node-types';

/** @deprecated Use `import type { SocketType, NodeSocket } from './registry'` instead */
export type { SocketType as LegacySocketType, NodeSocket as LegacyNodeSocket } from './core/socket-types';

/** @deprecated Use `import type { NodeDefinition, NodeBase, NodeContext, NodeDomain } from './types'` instead */
export type { NodeDefinition } from './core/types';
export type { NodeBase, NodeContext, NodeDomain } from './core/types';

// ============================================================================
// Geometry Nodes (20 nodes) - primary source for: ColorNode, RandomValueNode,
// InstanceOnPointsNode, and all attribute type names
// ============================================================================

export * from './geometry';

// ============================================================================
// Shader Nodes (13 nodes) - export explicitly to exclude MappingNode (conflicts with vector)
// ============================================================================

export {
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
  MixShaderDefinition,
  executeMixShader,
  AddShaderDefinition,
  executeMixShader as executeAddShader,
  AmbientOcclusionDefinition,
  executeAmbientOcclusion,
  TextureCoordinateDefinition,
  executeTextureCoordinate,
  MappingDefinition,
  executeMapping,
} from './shader';

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
} from './shader';

// ============================================================================
// Input/Output Nodes - export explicitly to exclude names that conflict with ./output and ./collection
// ============================================================================

export {
  ValueNode,
  IntegerNode,
  FloatNode,
  VectorNode,
  RotationNode,
  ScaleNode,
  BooleanNode,
  ColorNode as InputOutputColorNode,
  StringNode,
  ObjectInfoNode as InputOutputObjectInfoNode,
  CollectionInfoNode as InputOutputCollectionInfoNode,
  SelfObjectNode,
  JoinGeometryNode,
  GroupOutputNode as InputOutputGroupOutputNode,
  InputOutputNodes,
} from './input_output';

export type {
  ValueNodeData,
  IntegerNodeData,
  FloatNodeData,
  VectorNodeData,
  RotationNodeData,
  ScaleNodeData,
  BooleanNodeData,
  ColorNodeData,
  StringNodeData,
  ObjectInfoNodeData,
  CollectionInfoNodeData,
  SelfObjectNodeData,
  JoinGeometryNodeData,
  GroupOutputNodeData,
} from './input_output';

// ============================================================================
// Utility Nodes - export explicitly to exclude names that conflict with ./vector and ./geometry
// ============================================================================

export {
  MathNode,
  ColorMathNode,
  SwitchNode,
  CombineRGBANode,
  SeparateRGBANode,
  FloatToIntNode,
  IntToFloatNode,
  RandomValueNode as UtilityRandomValueNode,
  UtilityNodes,
} from './utility';

export type {
  MathNodeData,
  VectorMathNodeData as UtilityVectorMathNodeData,
  ColorMathNodeData,
  CompareNodeData as UtilityCompareNodeData,
  SwitchNodeData,
  RandomValueNodeData as UtilityRandomValueNodeData,
} from './utility';

// Re-export conflicting names from utility with aliases for the utility versions
export {
  CombineXYZNode as UtilityCombineXYZNode,
  SeparateXYZNode as UtilitySeparateXYZNode,
  CompareNode as UtilityCompareNode,
  VectorMathNode as UtilityVectorMathNode,
} from './utility';

// ============================================================================
// Curve Nodes (13 nodes)
// ============================================================================

export * from './curve';

// ============================================================================
// Texture Nodes (10 nodes)
// ============================================================================

export * from './texture';

// ============================================================================
// Color Nodes - export explicitly to exclude ColorNode (conflicts with ./geometry)
// ============================================================================

export {
  ColorRampNode,
  MixRGBNode,
  RGBCurveNode,
  BrightContrastNode,
  ExposureNode,
  CombineHSVNode,
  SeparateRGBNode,
  SeparateColorNode,
  CombineRGBNode,
  CombineColorNode,
  HueSaturationValueNode,
  BlackBodyNode,
  InvertNode,
  type ColorNodeBase,
  type ColorRampInputs,
  type ColorRampOutputs,
  type MixRGBInputs,
  type MixRGBOutputs,
  type RGBCurveInputs,
  type RGBCurveOutputs,
  type BrightContrastInputs,
  type BrightContrastOutputs,
  type ExposureInputs,
  type ExposureOutputs,
  type CombineHSVInputs,
  type CombineHSVOutputs,
  type SeparateRGBInputs,
  type SeparateRGBOutputs,
  type SeparateColorInputs,
  type SeparateColorOutputs,
  type CombineRGBInputs,
  type CombineRGBOutputs,
  type CombineColorInputs,
  type CombineColorOutputs,
  type HueSaturationValueInputs,
  type HueSaturationValueOutputs,
  type BlackBodyInputs,
  type BlackBodyOutputs,
  type InvertInputs,
  type InvertOutputs,
  createColorRampNode,
  createMixRGBNode,
  createRGBCurveNode,
  createBrightContrastNode,
  createExposureNode,
  createCombineHSVNode,
  createSeparateRGBNode,
  createSeparateColorNode,
  createCombineRGBNode,
  createCombineColorNode,
  createHueSaturationValueNode,
  createBlackBodyNode,
  createInvertNode,
} from './color';

// ============================================================================
// Vector Nodes (36 nodes) - primary source for: MappingNode, CombineXYZNode,
// SeparateXYZNode, VectorMathNode, CompareNode
// ============================================================================

export * from './vector';

// ============================================================================
// Attribute Nodes - export explicitly to exclude names that conflict with ./geometry
// ============================================================================

export {
  PositionInputNode,
  NormalInputNode,
  TangentInputNode,
  UVMapInputNode,
  ColorInputNode,
  RadiusInputNode,
  IdInputNode,
  IndexInputNode,
  type AttributeNodeBase,
  type StoreNamedAttributeInputs,
  type StoreNamedAttributeOutputs,
  type CaptureAttributeInputs,
  type CaptureAttributeOutputs,
  type RemoveAttributeInputs,
  type RemoveAttributeOutputs,
  type NamedAttributeInputs,
  type NamedAttributeOutputs,
  type AttributeStatisticInputs,
  type AttributeStatisticOutputs,
  type SetPositionInputs,
  type SetPositionOutputs,
  type PositionInputNodeOutputs,
  type NormalInputNodeOutputs,
  type TangentInputNodeOutputs,
  type UVMapInputNodeOutputs,
  type ColorInputNodeOutputs,
  type RadiusInputNodeOutputs,
  type IdInputNodeOutputs,
  type IndexInputNodeOutputs,
  createStoreNamedAttributeNode,
  createCaptureAttributeNode,
  createRemoveAttributeNode,
  createNamedAttributeNode,
  createAttributeStatisticNode,
  createSetPositionNode,
  createPositionInputNode,
  createNormalInputNode,
  createTangentInputNode,
  createUVMapInputNode,
  createColorInputNode,
  createRadiusInputNode,
  createIdInputNode,
  createIndexInputNode,
} from './attribute';

// Attribute nodes also exports class versions that conflict with ./geometry type exports
// Re-export the class versions with aliases
export {
  StoreNamedAttributeNode as AttributeStoreNamedAttributeNode,
  CaptureAttributeNode as AttributeCaptureAttributeNode,
  RemoveAttributeNode as AttributeRemoveAttributeNode,
  NamedAttributeNode as AttributeNamedAttributeNode,
  AttributeStatisticNode as AttributeAttributeStatisticNode,
  SetPositionNode as AttributeSetPositionNode,
} from './attribute';

// ============================================================================
// Output Nodes (24 nodes) - primary source for GroupOutputNode
// ============================================================================

export * from './output';

// ============================================================================
// Boolean Nodes (3 nodes)
// ============================================================================

export * from './boolean';

// ============================================================================
// Light Nodes (6 nodes)
// ============================================================================

export * from './light';

// ============================================================================
// Camera Nodes (4 nodes)
// ============================================================================

export * from './camera';

// ============================================================================
// Collection Nodes (5 nodes) - primary source for CollectionInfoNode, ObjectInfoNode
// ============================================================================

export {
  CollectionInfoNode,
  ObjectInfoNode,
  InstanceOnPointsNode as CollectionInstanceOnPointsNode,
  DuplicateElementsNode,
  ChildrenOfSceneNode,
  type CollectionNodeBase,
  type CollectionInfoInputs,
  type CollectionInfoOutputs,
  type ObjectInfoInputs,
  type ObjectInfoOutputs,
  type InstanceOnPointsInputs,
  type InstanceOnPointsOutputs,
  type DuplicateElementsInputs,
  type DuplicateElementsOutputs,
  type ChildrenOfSceneInputs,
  type ChildrenOfSceneOutputs,
  createCollectionInfoNode,
  createObjectInfoNode,
  createInstanceOnPointsNode,
  createDuplicateElementsNode,
  createChildrenOfSceneNode,
} from './collection';

// ============================================================================
// Simulation Nodes (9 nodes)
// ============================================================================

export * from './simulation';

// ============================================================================
// Volume Nodes (4 nodes)
// ============================================================================

export * from './volume';

// ============================================================================
// Transpiler — new NodeTranspiler + legacy re-exports
// ============================================================================

export { NodeTranspiler, CodeGenerator, LabelExpressionParser, transpileNodeTree } from './transpiler';
export type { TranspileOptions, TranspileResult, ImportEntry, LabelExpression, DistributionType } from './transpiler';
export type { LegacyTranspilerOptions } from './transpiler';
export { LegacyNodeTranspiler } from './transpiler';

// ============================================================================
// Code Serializer / Transpiler (NodeWrangler graph → TypeScript code)
// ============================================================================

export {
  NodeCodeSerializer,
  serializeToTypeScript,
  roundTripTest,
} from './core/NodeCodeSerializer';
export type {
  CodeSerializerOptions,
  RoundTripResult,
} from './core/NodeCodeSerializer';

// ============================================================================
// Pre-built Groups
// ============================================================================

export * from './groups';

// ============================================================================
// Helpers
// ============================================================================

export * from './helpers';

// ============================================================================
// Python-Compatible API — full Python NodeWrangler API with auto-connecting
// ============================================================================

export {
  PythonCompatibleNodeWrangler,
  type PythonInputValue,
  type CaptureResult,
} from './api';

// ============================================================================
// Scene Transpiler — declarative scene configuration to node graph
// ============================================================================

export { SceneTranspiler } from './transpiler/SceneTranspiler';
export type {
  NodeConfig,
  LinkConfig,
  GroupConfig,
  SocketInterfaceConfig,
  BaseGraphConfig,
  MaterialGraphConfig,
  GeometryGraphConfig,
  CompositorGraphConfig,
  SceneGraphConfig,
  TranspileResult as SceneTranspileResult,
  SerializedGraph,
} from './transpiler/SceneTranspiler';

// ============================================================================
// Node Info Constants — ported from infinigen/core/nodes/node_info.py
// ============================================================================

export {
  NODE_ATTRS_AVAILABLE,
  SINGLETON_NODES as SINGLETON_NODE_TYPES,
  NODETYPE_TO_DATATYPE,
  NODECLASS_TO_DATATYPE,
  DATATYPE_TO_NODECLASS,
  DATATYPE_DIMS,
  DATATYPE_FIELDS,
} from './core/node-types';

// ============================================================================
// Execution Layer — full re-export for consumers that need the deep pipeline
// ============================================================================

export {
  NodeShaderCompiler,
  MaterialFactory,
  TextureNodeExecutor,
  NodeGraphMaterialBridge,
  NodeGraphTextureBridge,
  evaluateToMaterial,
  evaluateToMaterialQuick,
  bsdfToMaterial,
  evaluatorTextureToThreeTexture,
  runAllValidations,
  validateBridgePipeline,
  add_geomod,
  add_material,
  shaderfunc_to_material,
  create_surface_material,
  compileShaderGraphToMaterial,
  GeometryNodeContext,
  GeometryNodeExecutor,
  GeometryNodePipeline,
  AttributeType,
  AttributeDomain as AttributeIODomain,
  NamedAttribute,
  AttributeManager,
  StandardAttributes,
  readAttrData,
  writeAttrData,
  newAttrData,
} from './execution';

export type {
  ShaderCompileResult,
  ShaderCompileOptions,
  TerrainMaterialParams,
  BarkMaterialParams,
  StoneMaterialParams,
  MetalMaterialParams,
  GlassMaterialParams,
  FabricMaterialParams,
  WaterMaterialParams,
  FoliageMaterialParams,
  SkinMaterialParams,
  NoiseType,
  GradientType,
  PatternType,
  TextureExecParams,
  BSDFOutput,
  NodeEvaluationOutput,
  MaterialBridgeOptions,
  TextureNodeType,
  TextureNodeOutput,
  TextureConversionResult,
  EvaluatorTextureOutput,
  EvaluateToMaterialOptions,
  EvaluateToMaterialResult,
  GeometryExecutorFn,
  MaterialCompileOptions,
} from './execution';

// Shader utilities (also from shader module)
export {
  createMaterialFromShader,
  parseColor,
} from './shader';
