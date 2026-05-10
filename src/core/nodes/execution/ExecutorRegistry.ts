/**
 * ExecutorRegistry — Unified Executor Registry
 *
 * @deprecated Use `import { registerExecutor, getExecutor, ... } from './executor-registry'`
 * (the clean executor registry module) instead. This file is kept for backward
 * compatibility until all consumers migrate.
 *
 * Replaces the massive ~200 if-else chain in NodeEvaluator.executeNodeByType()
 * with an O(1) Map lookup. Each executor is registered under its canonical
 * Blender-style node type (from NodeTypeRegistry) and all known aliases.
 *
 * ## Architecture
 *
 * - `NodeExecutor` type: `(inputs, context) => outputs`
 * - `registerExecutor(nodeType, executor)`: registers for canonical + all aliases
 * - `getExecutor(nodeType)`: resolves alias → canonical, then Map lookup
 * - `registerAllExecutors()`: bulk-registers all executors from the 8 module files
 * - `executeNode(nodeType, inputs, context)`: convenience resolve + lookup + call
 *
 * ## Gradual Migration
 *
 * The if-else chain in NodeEvaluator remains as a fallback for types not yet
 * registered in the registry. Over time, executors can be migrated out of the
 * if-else chain and into this registry without any behavioral change.
 *
 * @module core/nodes/execution
 */

import {
  resolveNodeType,
  getAliasesForCanonical,
} from '../core/NodeTypeRegistry';

import * as CoreExecutors from './CoreNodeExecutors';
import * as ExtExecutors from './ExtendedNodeExecutors';
import * as AddExecutors from './AdditionalNodeExecutors';
import * as ExpExecutors from './ExpandedNodeExecutors';
import * as EssentialExecutors from './EssentialNodeExecutors';
import * as SpecializedExecutors from './SpecializedNodeExecutors';
import * as P1Executors from './P1NodeExecutors';
import * as P2Executors from './P2NodeExecutors';
import * as ShaderExecutors from './ShaderNodeExecutors';

// ============================================================================
// Types
// ============================================================================

/**
 * Context object passed to every executor.
 *
 * Carries optional settings (from node.properties), the node instance
 * itself (for edge cases), and any other contextual data.
 */
export interface ExecutorContext {
  /** Node property settings (from node.settings / node.properties) */
  settings?: Record<string, any>;
  /** The original node instance (for rare cases that need it) */
  node?: any;
  /** Extensible — any additional context key */
  [key: string]: any;
}

/**
 * NodeExecutor — The canonical signature for a node executor function.
 *
 * Takes a bag of resolved input values and a context object, returns a
 * keyed object matching the node's output sockets.
 *
 * @param inputs   - Named input values from upstream connections / defaults
 * @param context  - Execution context (settings, node ref, etc.)
 * @returns Output socket name → value mapping
 */
export type NodeExecutor = (
  inputs: Record<string, any>,
  context: ExecutorContext,
) => Record<string, any>;

// ============================================================================
// Registry
// ============================================================================

/**
 * Global executor registry.
 *
 * Keys are node type strings (canonical or alias), values are executor
 * functions. When `registerExecutor` is called, the executor is stored
 * under the canonical type AND every known alias.
 */
const executorRegistry = new Map<string, NodeExecutor>();

/**
 * Fallback handler — invoked by `executeNode` when no registered executor
 * is found. Set by NodeEvaluator to delegate to its legacy if-else chain.
 */
let fallbackHandler: ((
  nodeType: string,
  inputs: Record<string, any>,
  context: ExecutorContext,
) => Record<string, any>) | null = null;

// ============================================================================
// Registration
// ============================================================================

/**
 * Register an executor for a node type.
 *
 * Resolves `nodeType` to its canonical form via NodeTypeRegistry, then
 * stores the executor under:
 *   1. The canonical type name
 *   2. Every known alias that resolves to that canonical type
 *
 * This means a single `registerExecutor('ShaderNodeTexNoise', fn)` call
 * automatically makes the executor available under 'noise_texture',
 * 'NoiseTextureNode', and all other aliases.
 *
 * @param nodeType - Any alias for the node type (canonical or variant)
 * @param executor - The executor function
 */
export function registerExecutor(nodeType: string, executor: NodeExecutor): void {
  const canonical = resolveNodeType(nodeType);

  // Register under canonical name
  executorRegistry.set(canonical, executor);

  // Register under all known aliases for O(1) lookup
  const aliases = getAliasesForCanonical(canonical);
  for (const alias of aliases) {
    executorRegistry.set(alias, executor);
  }
}

/**
 * Register an executor under a specific raw type string, without resolving
 * through NodeTypeRegistry. Use this for custom / non-standard type names
 * that are not in the alias registry (e.g., P2 variant aliases).
 *
 * @param rawType  - The exact type string to register under
 * @param executor - The executor function
 */
export function registerExecutorRaw(rawType: string, executor: NodeExecutor): void {
  executorRegistry.set(rawType, executor);
}

/**
 * Register an executor under multiple raw type strings.
 * Convenience wrapper around `registerExecutorRaw`.
 */
export function registerExecutorAliases(
  aliases: string[],
  executor: NodeExecutor,
): void {
  for (const alias of aliases) {
    executorRegistry.set(alias, executor);
  }
}

/**
 * Set the fallback handler for unregistered types.
 *
 * Called by NodeEvaluator to wire up its legacy if-else chain as the
 * fallback when no registered executor is found.
 *
 * @param handler - Function that handles unregistered node types
 */
export function setFallbackExecutor(
  handler: (
    nodeType: string,
    inputs: Record<string, any>,
    context: ExecutorContext,
  ) => Record<string, any>,
): void {
  fallbackHandler = handler;
}

// ============================================================================
// Lookup
// ============================================================================

/**
 * Get the executor for a node type.
 *
 * Resolution order:
 *   1. Look up `nodeType` directly in the registry (fast path for aliases)
 *   2. Resolve `nodeType` to canonical form, then look up canonical
 *
 * @param nodeType - Any node type string (alias or canonical)
 * @returns The executor function, or `undefined` if not registered
 */
export function getExecutor(nodeType: string): NodeExecutor | undefined {
  // Fast path: direct lookup (works for aliases that were pre-registered)
  const direct = executorRegistry.get(nodeType);
  if (direct) return direct;

  // Resolve to canonical and try again
  const canonical = resolveNodeType(nodeType);
  if (canonical !== nodeType) {
    return executorRegistry.get(canonical);
  }

  return undefined;
}

/**
 * Check whether an executor is registered for a given type.
 */
export function hasExecutor(nodeType: string): boolean {
  return getExecutor(nodeType) !== undefined;
}

/**
 * Get the number of entries in the executor registry.
 * (Includes both canonical and alias entries.)
 */
export function getExecutorCount(): number {
  return executorRegistry.size;
}

// ============================================================================
// Execution
// ============================================================================

/**
 * Execute a node by type using the registry.
 *
 * Resolution order:
 *   1. Resolve the type via NodeTypeRegistry
 *   2. Look up the executor in the registry
 *   3. If found, call it with inputs and context
 *   4. If not found, call the fallback handler (legacy if-else chain)
 *   5. If no fallback, return inputs as-is
 *
 * @param nodeType - The node type string (any alias)
 * @param inputs   - Resolved input values
 * @param context  - Execution context (settings, node, etc.)
 * @returns Output socket name → value mapping
 */
export function executeNode(
  nodeType: string,
  inputs: Record<string, any>,
  context: ExecutorContext = {},
): Record<string, any> {
  const executor = getExecutor(nodeType);
  if (executor) {
    return executor(inputs, context);
  }

  if (fallbackHandler) {
    return fallbackHandler(nodeType, inputs, context);
  }

  // No executor and no fallback — pass through inputs
  return inputs;
}

// ============================================================================
// Bulk Registration — registerAllExecutors()
// ============================================================================

/** Helper: wrap an executor that takes only inputs (no settings) */
function wrap(
  fn: (inputs: Record<string, any>) => any,
): NodeExecutor {
  return (inputs: Record<string, any>, _context: ExecutorContext) => fn(inputs);
}

/** Helper: wrap an executor that takes inputs + settings */
function wrapWithSettings(
  fn: (inputs: Record<string, any>, settings: Record<string, any>) => any,
): NodeExecutor {
  return (inputs: Record<string, any>, context: ExecutorContext) =>
    fn(inputs, context.settings ?? {});
}

/**
 * Whether registerAllExecutors() has already been called.
 * Prevents double-registration on hot module reload.
 */
let registered = false;

/**
 * Auto-register all executors from the 8 executor module files.
 *
 * This function imports all executor modules and registers each exported
 * executor function under its canonical Blender-style node type (as defined
 * in NodeTypeRegistry) and all known aliases.
 *
 * Executors that require `settings` are wrapped to extract settings from
 * the ExecutorContext.
 *
 * Call this once at application startup. It is idempotent — subsequent
 * calls are no-ops.
 */
export function registerAllExecutors(): void {
  if (registered) return;
  registered = true;

  // ==========================================================================
  // ShaderNodeExecutors — 18 executors (extracted from NodeEvaluator)
  // ==========================================================================

  // Shader BSDF
  registerExecutor('ShaderNodeBsdfPrincipled', wrap(ShaderExecutors.executePrincipledBSDF));
  registerExecutor('ShaderNodeBsdfDiffuse', wrap(ShaderExecutors.executeDiffuseBSDF));
  registerExecutor('ShaderNodeBsdfGlossy', wrap(ShaderExecutors.executeGlossyBSDF));
  registerExecutor('ShaderNodeBsdfGlass', wrap(ShaderExecutors.executeGlassBSDF));
  registerExecutor('ShaderNodeEmission', wrap(ShaderExecutors.executeEmission));
  registerExecutor('ShaderNodeMixShader', wrap(ShaderExecutors.executeMixShader));
  registerExecutor('ShaderNodeAddShader', wrap(ShaderExecutors.executeAddShader));

  // Texture
  registerExecutor('ShaderNodeTexNoise', wrap(ShaderExecutors.executeNoiseTexture));
  registerExecutor('ShaderNodeTexVoronoi', wrap(ShaderExecutors.executeVoronoiTexture));
  registerExecutor('ShaderNodeTexMusgrave', wrap(ShaderExecutors.executeMusgraveTexture));
  registerExecutor('ShaderNodeTexGradient', wrap(ShaderExecutors.executeGradientTexture));

  // Color
  registerExecutor('ShaderNodeMixRGB', wrap(ShaderExecutors.executeMixRGB));
  registerExecutor('ShaderNodeValToRGB', wrap(ShaderExecutors.executeColorRamp));

  // Math
  registerExecutor('ShaderNodeMath', wrap(ShaderExecutors.executeMath));
  registerExecutor('ShaderNodeVectorMath', wrap(ShaderExecutors.executeVectorMath));

  // Vector
  registerExecutor('ShaderNodeMapping', wrapWithSettings(ShaderExecutors.executeMapping));
  registerExecutor('ShaderNodeCombineXYZ', wrap(ShaderExecutors.executeCombineXYZ));
  registerExecutor('ShaderNodeSeparateXYZ', wrap(ShaderExecutors.executeSeparateXYZ));
  registerExecutor('ShaderNodeTexCoord', wrap(ShaderExecutors.executeTextureCoordinate));

  // ==========================================================================
  // CoreNodeExecutors — 20 executors
  // ==========================================================================
  registerExecutor('GeometryNodeDistributePointsOnFaces', wrap(CoreExecutors.executeDistributePointsOnFaces));
  registerExecutor('GeometryNodeInstanceOnPoints', wrap(CoreExecutors.executeInstanceOnPoints));
  registerExecutor('GeometryNodeRealizeInstances', wrap(CoreExecutors.executeRealizeInstances));
  registerExecutor('GeometryNodeProximity', wrap(CoreExecutors.executeProximity));
  registerExecutor('GeometryNodeRaycast', wrap(CoreExecutors.executeRaycast));
  registerExecutor('GeometryNodeSampleNearestSurface', wrap(CoreExecutors.executeSampleNearestSurface));
  registerExecutor('GeometryNodeConvexHull', wrap(CoreExecutors.executeConvexHull));
  registerExecutor('GeometryNodeMergeByDistance', wrap(CoreExecutors.executeMergeByDistance));
  registerExecutor('GeometryNodeSmoothByAngle', wrap(CoreExecutors.executeSmoothByAngle));
  // EdgeSplit → registered under GeometryNodeSplitEdges alias in NodeTypeRegistry
  registerExecutor('GeometryNodeSplitEdges', wrap(CoreExecutors.executeEdgeSplit));
  registerExecutor('GeometryNodeCurveToMesh', wrap(CoreExecutors.executeCurveToMesh));
  registerExecutor('GeometryNodeResampleCurve', wrap(CoreExecutors.executeCurveResample));
  registerExecutor('GeometryNodeFillCurve', wrap(CoreExecutors.executeFillCurve));
  registerExecutor('GeometryNodeTrimCurve', wrap(CoreExecutors.executeTrimCurve));
  registerExecutor('GeometryNodeMeshBoolean', wrapWithSettings(CoreExecutors.executeMeshBoolean));
  registerExecutor('GeometryNodeMeshToCurve', wrap(CoreExecutors.executeMeshToCurve));
  registerExecutor('GeometryNodeFaceSetBoundaries', wrap(CoreExecutors.executeFaceSetBoundaries));
  registerExecutor('GeometryNodeStoreNamedAttribute', wrap(CoreExecutors.executeStoreNamedAttribute));
  registerExecutor('GeometryNodeInputNamedAttribute', wrap(CoreExecutors.executeNamedAttribute));
  registerExecutor('GeometryNodeAttributeStatistic', wrap(CoreExecutors.executeAttributeStatistic));

  // ==========================================================================
  // ExtendedNodeExecutors — 30 executors
  // ==========================================================================

  // Curve primitives
  registerExecutor('GeometryNodeCurvePrimitiveLine', wrap(ExtExecutors.executeCurveLine));
  registerExecutor('GeometryNodeCurveQuadraticBezier', wrap(ExtExecutors.executeQuadraticBezier));
  registerExecutor('GeometryNodeCurvePrimitiveBezierSegment', wrap(ExtExecutors.executeBezierSegment));
  registerExecutor('GeometryNodeCurveLength', wrap(ExtExecutors.executeCurveLength));
  registerExecutor('GeometryNodeSampleCurve', wrap(ExtExecutors.executeSampleCurve));

  // Attribute
  registerExecutor('GeometryNodeAttributeTransfer', wrap(ExtExecutors.executeAttributeTransfer));

  // Input/Output
  registerExecutor('GeometryNodeCollectionInfo', wrap(ExtExecutors.executeCollectionInfo));
  registerExecutor('FunctionNodeInputVector', wrapWithSettings(ExtExecutors.executeInputVector));
  registerExecutor('FunctionNodeInputColor', wrapWithSettings(ExtExecutors.executeInputColor));
  registerExecutor('FunctionNodeInputInt', wrapWithSettings(ExtExecutors.executeInputInt));
  registerExecutor('FunctionNodeInputFloat', wrapWithSettings(ExtExecutors.executeInputFloat));
  registerExecutor('FunctionNodeInputBool', wrapWithSettings(ExtExecutors.executeInputBool));

  // Utility
  registerExecutor('ShaderNodeClamp', wrap(ExtExecutors.executeClamp));
  registerExecutor('GeometryNodeFloatToInt', wrap(ExtExecutors.executeFloatToInt));
  registerExecutor('GeometryNodeRotateEuler', wrap(ExtExecutors.executeRotateEuler));

  // RotateVector — custom aliases not in standard NodeTypeRegistry
  registerExecutorAliases(
    ['rotate_vector', 'RotateVector', 'RotateVectorNode', 'GeometryNodeRotateVector'],
    wrap(ExtExecutors.executeRotateVector),
  );

  registerExecutor('GeometryNodeAlignEulerToVector', wrap(ExtExecutors.executeAlignEulerToVector));
  registerExecutor('GeometryNodeSwitch', wrap(ExtExecutors.executeSwitch));
  registerExecutor('FunctionNodeRandomValue', wrap(ExtExecutors.executeRandomValue));

  // Geometry Utility
  registerExecutor('GeometryNodeBoundBox', wrap(ExtExecutors.executeBoundingBox));
  registerExecutor('GeometryNodeMeshToPoints', wrap(ExtExecutors.executeMeshToPoints));

  // Enhanced variants — custom aliases that are NOT in NodeTypeRegistry,
  // so we register them directly under their raw type strings.
  registerExecutorAliases(
    ['RaycastEnhancedNode', 'raycast_enhanced'],
    wrap(ExtExecutors.executeRaycastEnhanced),
  );
  registerExecutorAliases(
    ['SampleNearestSurfaceEnhancedNode', 'sample_nearest_surface_enhanced'],
    wrap(ExtExecutors.executeSampleNearestSurfaceEnhanced),
  );
  // geometry_proximity has its own Extended executor (different from Core's Proximity)
  registerExecutorRaw('geometry_proximity', wrap(ExtExecutors.executeGeometryProximity));
  registerExecutorRaw('GeometryProximityNode', wrap(ExtExecutors.executeGeometryProximity));

  // ==========================================================================
  // P1NodeExecutors — 16 executors
  // ==========================================================================

  // Texture
  registerExecutor('ShaderNodeTexBrick', wrap(P1Executors.executeBrickTexture));
  registerExecutor('ShaderNodeTexChecker', wrap(P1Executors.executeCheckerTexture));
  registerExecutor('ShaderNodeTexMagic', wrap(P1Executors.executeMagicTexture));
  registerExecutor('ShaderNodeTexImage', wrapWithSettings(P1Executors.executeImageTexture));

  // Color
  registerExecutor('ShaderNodeHueSaturation', wrap(P1Executors.executeHueSaturationValue));
  registerExecutor('ShaderNodeInvert', wrap(P1Executors.executeInvertColor));
  registerExecutor('CompositorNodeBrightContrast', wrap(P1Executors.executeBrightContrast));

  // Vector
  registerExecutor('ShaderNodeBump', wrap(P1Executors.executeBump));
  registerExecutor('ShaderNodeDisplacement', wrap(P1Executors.executeDisplacement));
  registerExecutor('ShaderNodeNormalMap', wrap(P1Executors.executeNormalMap));

  // Input
  registerExecutor('GeometryNodeObjectInfo', wrapWithSettings(P1Executors.executeObjectInfo));
  registerExecutor('GeometryNodeSelfObject', wrap(P1Executors.executeSelfObject));
  registerExecutor('ShaderNodeValue', wrapWithSettings(P1Executors.executeValueNode));
  registerExecutor('ShaderNodeRGB', wrapWithSettings(P1Executors.executeRGBNode));

  // Utility
  registerExecutor('ShaderNodeMapRange', wrap(P1Executors.executeMapRange));
  registerExecutor('ShaderNodeFloatCurve', wrap(P1Executors.executeFloatCurve));

  // ==========================================================================
  // AdditionalNodeExecutors — 30 executors
  // ==========================================================================

  // Texture Coordinate Nodes
  registerExecutor('ShaderNodeTexCoord', wrap(AddExecutors.executeTextureCoordinate));
  registerExecutor('ShaderNodeMapping', wrap(AddExecutors.executeMapping));
  registerExecutor('GeometryNodeInputUVMap', wrap(AddExecutors.executeUVMap));
  registerExecutor('GeometryNodeInputPosition', wrap(AddExecutors.executeGeometryNodeInputPosition));
  registerExecutor('GeometryNodeInputNormal', wrap(AddExecutors.executeGeometryNodeInputNormal));
  registerExecutor('GeometryNodeInputTangent', wrap(AddExecutors.executeGeometryNodeInputTangent));

  // Geometry Operation Nodes
  registerExecutor('GeometryNodeSubdivideMesh', wrap(AddExecutors.executeSubdivideMesh));
  registerExecutor('GeometryNodeDecimate', wrap(AddExecutors.executeDecimateMesh));
  registerExecutor('GeometryNodeExtrudeFaces', wrap(AddExecutors.executeExtrudeFaces));
  registerExecutor('GeometryNodeInsetFaces', wrap(AddExecutors.executeInsetFaces));
  registerExecutor('GeometryNodeFlipFaces', wrap(AddExecutors.executeFlipFaces));
  registerExecutor('GeometryNodeRotateMesh', wrap(AddExecutors.executeRotateMesh));
  registerExecutor('GeometryNodeScaleMesh', wrap(AddExecutors.executeScaleMesh));
  registerExecutor('GeometryNodeTranslateMesh', wrap(AddExecutors.executeTranslateMesh));

  // Texture/Evaluation Nodes
  registerExecutor('ShaderNodeTexGradient', wrap(AddExecutors.executeGradientTexture));
  registerExecutor('ShaderNodeTexWave', wrap(AddExecutors.executeWaveTexture));
  registerExecutor('ShaderNodeTexWhiteNoise', wrap(AddExecutors.executeWhiteNoiseTexture));

  // Color/Mix Nodes
  registerExecutor('ShaderNodeValToRGB', wrap(AddExecutors.executeColorRamp));
  registerExecutor('ShaderNodeRGBCurve', wrap(AddExecutors.executeCurves));
  registerExecutor('ShaderNodeSeparateColor', wrap(AddExecutors.executeSeparateColor));
  registerExecutor('FunctionNodeCombineColor', wrap(AddExecutors.executeCombineColor));

  // Math/Utility Nodes
  registerExecutor('FunctionNodeBooleanMath', wrap(AddExecutors.executeBooleanMath));
  registerExecutor('FunctionNodeFloatCompare', wrap(AddExecutors.executeFloatCompare));
  // MapRangeVector — custom aliases
  registerExecutorAliases(
    ['MapRangeVector', 'MapRangeVectorNode', 'map_range_vector', 'ShaderNodeVectorMapRange'],
    wrap(AddExecutors.executeMapRangeVector),
  );
  registerExecutorAliases(
    ['RotationToEuler', 'RotationToEulerNode', 'rotation_to_euler', 'FunctionNodeRotationToEuler'],
    wrap(AddExecutors.executeRotationToEuler),
  );
  registerExecutorAliases(
    ['EulerToRotation', 'EulerToRotationNode', 'euler_to_rotation', 'FunctionNodeEulerToRotation'],
    wrap(AddExecutors.executeEulerToRotation),
  );
  registerExecutor('GeometryNodeAccumulateField', wrap(AddExecutors.executeAccumulateField));

  // ==========================================================================
  // ExpandedNodeExecutors — 31 executors
  // ==========================================================================

  // Mesh Topology
  registerExecutor('GeometryNodeDualMesh', wrap(ExpExecutors.executeDualMesh));
  registerExecutor('GeometryNodeEdgeNeighbors', wrap(ExpExecutors.executeEdgeNeighbors));
  registerExecutor('GeometryNodeInputMeshEdgeVertices', wrap(ExpExecutors.executeEdgeVertices));
  registerExecutor('GeometryNodeInputMeshFaceArea', wrap(ExpExecutors.executeFaceArea));
  registerExecutorAliases(
    ['VertexNeighbors', 'VertexNeighborsNode', 'vertex_neighbors', 'GeometryNodeInputMeshVertexNeighbors'],
    wrap(ExpExecutors.executeVertexNeighbors),
  );
  registerExecutorAliases(
    ['EdgesOfFace', 'EdgesOfFaceNode', 'edges_of_face', 'GeometryNodeInputMeshFaceEdges'],
    wrap(ExpExecutors.executeEdgesOfFace),
  );
  registerExecutorAliases(
    ['FacesOfEdge', 'FacesOfEdgeNode', 'faces_of_edge', 'GeometryNodeInputMeshEdgeFaces'],
    wrap(ExpExecutors.executeFacesOfEdge),
  );

  // Attribute
  registerExecutor('GeometryNodeCaptureAttribute', wrap(ExpExecutors.executeCaptureAttribute));
  registerExecutor('GeometryNodeRemoveAttribute', wrap(ExpExecutors.executeRemoveAttribute));
  registerExecutor('GeometryNodeSampleIndex', wrap(ExpExecutors.executeSampleIndex));
  registerExecutor('GeometryNodeSampleNearest', wrap(ExpExecutors.executeSampleNearest));
  registerExecutor('GeometryNodeAttributeDomainSize', wrap(ExpExecutors.executeDomainSize));

  // Curve Modifiers
  registerExecutor('GeometryNodeSetCurveRadius', wrap(ExpExecutors.executeSetCurveRadius));
  registerExecutor('GeometryNodeSetCurveTilt', wrap(ExpExecutors.executeSetCurveTilt));
  registerExecutor('GeometryNodeSetCurveHandlePositions', wrap(ExpExecutors.executeSetHandlePositions));
  registerExecutor('GeometryNodeSplineParameter', wrap(ExpExecutors.executeSplineParameter));
  registerExecutor('GeometryNodeFilletCurve', wrap(ExpExecutors.executeFilletCurve));

  // Instance Transforms
  registerExecutor('GeometryNodeTranslateInstances', wrap(ExpExecutors.executeTranslateInstances));
  registerExecutor('GeometryNodeRotateInstances', wrap(ExpExecutors.executeRotateInstances));
  registerExecutor('GeometryNodeScaleInstances', wrap(ExpExecutors.executeScaleInstances));

  // Volume/Point
  registerExecutor('GeometryNodeVolumeToMesh', wrap(ExpExecutors.executeVolumeToMesh));
  registerExecutor('GeometryNodeVolumeToPoints', wrap(ExpExecutors.executeVolumeToPoints));
  registerExecutor('GeometryNodePointsToVertices', wrap(ExpExecutors.executePointsToVertices));
  registerExecutor('GeometryNodePointsToCurves', wrap(ExpExecutors.executePointsToCurves));

  // Geometry Operations
  registerExecutor('GeometryNodeSetPosition', wrap(ExpExecutors.executeSetPosition));
  registerExecutor('GeometryNodeDuplicateElements', wrap(ExpExecutors.executeDuplicateElements));
  registerExecutor('GeometryNodeSetShadeSmooth', wrap(ExpExecutors.executeSetShadeSmooth));

  // Shader Input / Light
  registerExecutor('ShaderNodeLightFalloff', wrap(ExpExecutors.executeLightFalloff));
  registerExecutorWithSettings('GeometryNodeInputObjectIndex', ExpExecutors.executeObjectIndex);
  registerExecutor('ShaderNodeIsCameraRay', wrap(ExpExecutors.executeIsCameraRay));

  // ==========================================================================
  // EssentialNodeExecutors — 33 executors
  // ==========================================================================

  // Geometry Merge/Split/Delete
  registerExecutor('GeometryNodeJoinGeometry', wrap(EssentialExecutors.executeJoinGeometry));
  registerExecutor('GeometryNodeSeparateGeometry', wrap(EssentialExecutors.executeSeparateGeometry));
  registerExecutor('GeometryNodeDeleteGeometry', wrap(EssentialExecutors.executeDeleteGeometry));

  // Transform & Triangulate
  registerExecutor('GeometryNodeTransform', wrap(EssentialExecutors.executeTransform));
  registerExecutor('GeometryNodeTriangulate', wrap(EssentialExecutors.executeTriangulate));

  // Material
  registerExecutor('GeometryNodeSetMaterial', wrap(EssentialExecutors.executeSetMaterial));

  // Curve Operations
  registerExecutor('GeometryNodeCurveToPoints', wrap(EssentialExecutors.executeCurveToPoints));
  registerExecutor('GeometryNodeReverseCurve', wrap(EssentialExecutors.executeReverseCurve));
  registerExecutor('GeometryNodeSubdivideCurve', wrap(EssentialExecutors.executeSubdivideCurve));
  registerExecutor('GeometryNodeCurvePrimitiveCircle', wrap(EssentialExecutors.executeCurveCircle));

  // Mesh Operations
  registerExecutor('GeometryNodeExtrudeMesh', wrap(EssentialExecutors.executeExtrudeMesh));
  registerExecutor('GeometryNodeSetMeshNormals', wrap(EssentialExecutors.executeSetMeshNormals));
  registerExecutor('GeometryNodeMeshToVolume', wrap(EssentialExecutors.executeMeshToVolume));
  registerExecutor('GeometryNodeDistributePointsInVolume', wrap(EssentialExecutors.executeDistributePointsInVolume));

  // Color Operations
  registerExecutor('ShaderNodeCombineHSV', wrap(EssentialExecutors.executeCombineHSV));
  registerExecutor('ShaderNodeCombineRGB', wrap(EssentialExecutors.executeCombineRGB));
  registerExecutor('ShaderNodeSeparateRGB', wrap(EssentialExecutors.executeSeparateRGB));
  registerExecutor('ShaderNodeRGBCurve', wrap(EssentialExecutors.executeRGBCurve));

  // Mix & Compare
  registerExecutor('ShaderNodeMix', wrap(EssentialExecutors.executeMix));
  registerExecutor('FunctionNodeCompare', wrap(EssentialExecutors.executeCompare));

  // Input Nodes
  registerExecutor('FunctionNodeInputInt', wrap(EssentialExecutors.executeInteger));
  registerExecutor('GeometryNodeInputIndex', wrap(EssentialExecutors.executeIndex));
  registerExecutor('GeometryNodeInputID', wrap(EssentialExecutors.executeInputID));
  registerExecutor('GeometryNodeInputMeshEdgeVertices', wrap(EssentialExecutors.executeInputEdgeVertices));

  // Ambient Occlusion
  registerExecutor('ShaderNodeAmbientOcclusion', wrap(EssentialExecutors.executeAmbientOcclusion));

  // Material Index
  registerExecutor('GeometryNodeSetMaterialIndex', wrap(EssentialExecutors.executeSetMaterialIndex));
  registerExecutor('GeometryNodeInputMaterialIndex', wrap(EssentialExecutors.executeMaterialIndex));

  // Mesh Offset & Subdivision
  registerExecutor('GeometryNodeOffsetFace', wrap(EssentialExecutors.executeOffsetMesh));
  registerExecutor('GeometryNodeSubdivisionSurface', wrap(EssentialExecutors.executeSubdivisionSurface));

  // UV Operations
  registerExecutor('GeometryNodeSetUV', wrap(EssentialExecutors.executeSetUV));
  registerExecutor('GeometryNodeUVWarp', wrap(EssentialExecutors.executeUVWarp));

  // Group I/O
  registerExecutor('NodeGroupInput', wrap(EssentialExecutors.executeGroupInput));
  registerExecutor('NodeGroupOutput', wrap(EssentialExecutors.executeGroupOutput));

  // ==========================================================================
  // SpecializedNodeExecutors — 41 executors
  // ==========================================================================

  // Shader Input Nodes
  registerExecutor('ShaderNodeLayerWeight', wrap(SpecializedExecutors.executeLayerWeight));
  registerExecutor('ShaderNodeLightPath', wrap(SpecializedExecutors.executeLightPath));
  registerExecutor('ShaderNodeWireframe', wrap(SpecializedExecutors.executeWireframe));
  registerExecutor('ShaderNodeObjectInfo', wrap(SpecializedExecutors.executeShaderObjectInfo));
  registerExecutor('ShaderNodeParticleInfo', wrap(SpecializedExecutors.executeParticleInfo));
  registerExecutor('ShaderNodeCameraData', wrap(SpecializedExecutors.executeCameraData));
  registerExecutor('ShaderNodeHairInfo', wrap(SpecializedExecutors.executeHairInfo));
  registerExecutor('ShaderNodeNewGeometry', wrap(SpecializedExecutors.executeNewGeometry));
  registerExecutor('ShaderNodeBlackbody', wrap(SpecializedExecutors.executeBlackBody));

  // Color/Wavelength Nodes
  registerExecutor('ShaderNodeWavelength', wrap(SpecializedExecutors.executeWavelength));
  registerExecutor('ShaderNodeBevel', wrap(SpecializedExecutors.executeBevel));

  // Vector/Math Nodes
  registerExecutor('FunctionNodeNormalize', wrap(SpecializedExecutors.executeNormalize));
  registerExecutor('ShaderNodeVectorRotate', wrap(SpecializedExecutors.executeVectorRotate));
  registerExecutor('ShaderNodeVectorTransform', wrap(SpecializedExecutors.executeVectorTransform));
  registerExecutor('FunctionNodeQuaternion', wrap(SpecializedExecutors.executeQuaternion));
  registerExecutor('FunctionNodeMatrixTransform', wrap(SpecializedExecutors.executeMatrixTransform));

  // Attribute (legacy)
  registerExecutor('ShaderNodeAttribute', wrap(SpecializedExecutors.executeAttribute));

  // Curve Spline Type
  registerExecutor('GeometryNodeCurveSplineType', wrap(SpecializedExecutors.executeCurveSplineType));

  // Topology Nodes
  registerExecutor('GeometryNodeInputMeshEdgeAngle', wrap(SpecializedExecutors.executeEdgeAngle));
  registerExecutor('GeometryNodeEdgesOfVertex', wrap(SpecializedExecutors.executeEdgesOfVertex));
  // VerticesOfEdge — custom alias
  registerExecutorAliases(
    ['VerticesOfEdge', 'VerticesOfEdgeNode', 'vertices_of_edge', 'GeometryNodeInputMeshEdgeVertices_VerticesOfEdge'],
    wrap(SpecializedExecutors.executeVerticesOfEdge),
  );
  registerExecutorAliases(
    ['VerticesOfFace', 'VerticesOfFaceNode', 'vertices_of_face', 'GeometryNodeInputMeshFaceVertices'],
    wrap(SpecializedExecutors.executeVerticesOfFace),
  );
  registerExecutorAliases(
    ['FacesOfVertex', 'FacesOfVertexNode', 'faces_of_vertex', 'GeometryNodeInputMeshVertexFaces'],
    wrap(SpecializedExecutors.executeFacesOfVertex),
  );
  registerExecutor('GeometryNodeFaceCorners', wrap(SpecializedExecutors.executeFaceCorners));
  registerExecutor('GeometryNodeNamedCorner', wrap(SpecializedExecutors.executeNamedCorner));

  // Exposure & Shader Input Nodes
  registerExecutor('CompositorNodeExposure', wrap(SpecializedExecutors.executeExposure));
  registerExecutor('ShaderNodeNormal', wrap(SpecializedExecutors.executeNormal));
  registerExecutor('ShaderNodeTangent', wrap(SpecializedExecutors.executeTangent));
  registerExecutor('ShaderNodeTrueNormal', wrap(SpecializedExecutors.executeTrueNormal));
  registerExecutor('ShaderNodeMaterialInfo', wrap(SpecializedExecutors.executeMaterialInfo));

  // Mesh Info & Light Nodes
  registerExecutor('GeometryNodeMeshInfo', wrap(SpecializedExecutors.executeMeshInfo));
  registerExecutor('ShaderNodeEmission_PointLight', wrap(SpecializedExecutors.executePointLight));
  registerExecutor('ShaderNodeEmission_SpotLight', wrap(SpecializedExecutors.executeSpotLight));
  registerExecutor('ShaderNodeEmission_SunLight', wrap(SpecializedExecutors.executeSunLight));
  registerExecutor('ShaderNodeEmission_AreaLight', wrap(SpecializedExecutors.executeAreaLight));
  registerExecutorAliases(
    ['LightAttenuation', 'LightAttenuationNode', 'light_attenuation', 'ShaderNodeLightAttenuation'],
    wrap(SpecializedExecutors.executeLightAttenuation),
  );
  registerExecutorAliases(
    ['RandomPerIsland', 'RandomPerIslandNode', 'random_per_island', 'GeometryNodeInputRandomPerIsland'],
    wrap(SpecializedExecutors.executeRandomPerIsland),
  );

  // Texture & Utility Math Nodes
  registerExecutor('ShaderNodeTexGabor', wrap(SpecializedExecutors.executeTextureGabor));
  registerExecutor('FunctionNodeFloorCeil', wrap(SpecializedExecutors.executeFloorCeil));
  registerExecutor('ShaderNodeRGBToBW', wrap(SpecializedExecutors.executeRGBToBW));

  // ==========================================================================
  // P2NodeExecutors — 23 executors
  // ==========================================================================

  // Shader BSDF
  registerExecutorAliases(
    ['SubsurfaceScattering', 'SubsurfaceScatteringNode', 'subsurface_scattering', 'ShaderNodeSubsurfaceScattering'],
    wrap(P2Executors.executeSubsurfaceScattering),
  );
  registerExecutorAliases(
    ['ToonBSDF', 'ToonBSDFNode', 'toon_bsdf', 'ShaderNodeBsdfToon'],
    wrap(P2Executors.executeToonBSDF),
  );
  registerExecutorAliases(
    ['HairBSDF', 'HairBSDFNode', 'hair_bsdf', 'ShaderNodeBsdfHair'],
    wrap(P2Executors.executeHairBSDF),
  );
  registerExecutorAliases(
    ['GlassBSDFNode', 'glass_bsdf_p2', 'ShaderNodeBsdfGlassP2'],
    wrap(P2Executors.executeGlassBSDF),
  );
  registerExecutorAliases(
    ['RefractionBSDF', 'RefractionBSDFNode', 'refraction_bsdf', 'ShaderNodeBsdfRefraction'],
    wrap(P2Executors.executeRefractionBSDF),
  );
  registerExecutorAliases(
    ['Fresnel', 'FresnelNode', 'fresnel', 'ShaderNodeFresnel'],
    wrap(P2Executors.executeFresnel),
  );

  // Geometry Nodes (P2)
  registerExecutorAliases(
    ['Subdivide', 'SubdivideNode', 'subdivide', 'GeometryNodeSubdivide'],
    wrap(P2Executors.executeSubdivide),
  );
  registerExecutorAliases(
    ['Boolean', 'BooleanNode', 'boolean_operation', 'GeometryNodeBoolean'],
    wrap(P2Executors.executeBoolean),
  );
  registerExecutorAliases(
    ['Extrude', 'ExtrudeNode', 'extrude', 'GeometryNodeExtrude'],
    wrap(P2Executors.executeExtrude),
  );
  registerExecutorAliases(
    ['TransformGeometry', 'TransformGeometryNode', 'transform_geometry', 'GeometryNodeTransformGeometry'],
    wrap(P2Executors.executeTransformGeometry),
  );
  registerExecutorAliases(
    ['JoinGeometryP2', 'JoinGeometryP2Node', 'join_geometry_p2', 'GeometryNodeJoinGeometryP2'],
    wrap(P2Executors.executeJoinGeometry),
  );

  // Texture Nodes (P2)
  registerExecutorAliases(
    ['GradientTextureP2', 'GradientTextureP2Node', 'gradient_texture_p2', 'ShaderNodeTexGradientP2'],
    wrap(P2Executors.executeGradientTexture),
  );
  registerExecutorAliases(
    ['VoronoiTextureP2', 'VoronoiTextureP2Node', 'voronoi_texture_p2', 'ShaderNodeTexVoronoiP2'],
    wrap(P2Executors.executeVoronoiTexture),
  );
  registerExecutorAliases(
    ['WaveTextureP2', 'WaveTextureP2Node', 'wave_texture_p2', 'ShaderNodeTexWaveP2'],
    wrap(P2Executors.executeWaveTexture),
  );
  registerExecutorAliases(
    ['WhiteNoiseTextureP2', 'WhiteNoiseTextureP2Node', 'white_noise_texture_p2', 'ShaderNodeTexWhiteNoiseP2'],
    wrap(P2Executors.executeWhiteNoiseTexture),
  );
  registerExecutorAliases(
    ['ColorRampP2', 'color_ramp_p2', 'ShaderNodeValToRGBP2'],
    wrap(P2Executors.executeColorRamp),
  );

  // Curve Nodes (P2)
  registerExecutorAliases(
    ['CurveToMeshP2', 'curve_to_mesh_p2', 'GeometryNodeCurveToMeshP2'],
    wrap(P2Executors.executeCurveToMesh),
  );
  registerExecutorAliases(
    ['CurveLineP2', 'curve_line_p2', 'GeometryNodeCurveLineP2'],
    wrap(P2Executors.executeCurveLine),
  );
  registerExecutorAliases(
    ['BezierSegmentP2', 'bezier_segment_p2', 'GeometryNodeBezierSegmentP2'],
    wrap(P2Executors.executeBezierSegment),
  );
  registerExecutorAliases(
    ['QuadraticBezierP2', 'quadratic_bezier_p2', 'GeometryNodeQuadraticBezierP2'],
    wrap(P2Executors.executeQuadraticBezier),
  );

  // Vector Nodes (P2)
  registerExecutorAliases(
    ['VectorMathP2', 'vector_math_p2', 'ShaderNodeVectorMathP2'],
    wrap(P2Executors.executeVectorMath),
  );
  registerExecutorAliases(
    ['VectorRotateP2', 'vector_rotate_p2', 'ShaderNodeVectorRotateP2'],
    wrap(P2Executors.executeVectorRotate),
  );
  registerExecutorAliases(
    ['CurveLengthP2', 'curve_length_p2', 'GeometryNodeCurveLengthP2'],
    wrap(P2Executors.executeCurveLength),
  );

  // ==========================================================================
  // Blender-specific pass-through nodes
  // ==========================================================================
  const passThrough: NodeExecutor = (inputs) => inputs;

  registerExecutorAliases(
    ['CompositorNodeViewer', 'ViewerNode', 'viewer'],
    passThrough,
  );
  registerExecutorAliases(
    ['CompositorNodeSplitViewer', 'SplitViewerNode', 'split_viewer'],
    passThrough,
  );
  registerExecutorAliases(
    ['CompositorNodeComposite', 'CompositeNode', 'composite'],
    passThrough,
  );
  registerExecutorAliases(
    ['CompositorNodeRLayers', 'RenderLayerNode', 'render_layer'],
    passThrough,
  );
  registerExecutorAliases(
    ['GeometryNodeDebugOutput', 'DebugOutputNode', 'debug_output'],
    passThrough,
  );

  // Blender-specific output nodes
  registerExecutor('ShaderNodeOutputWorld', passThrough);
  registerExecutorAliases(
    ['ShaderNodeOutputLight', 'light_output', 'OutputLightNode'],
    passThrough,
  );
  registerExecutorAliases(
    ['ShaderNodeOutputAOV', 'aov_output', 'OutputAOVNode'],
    passThrough,
  );
  registerExecutorAliases(
    ['GeometryNodeOutput', 'geometry_output', 'OutputGeometryNode'],
    passThrough,
  );
  registerExecutorAliases(
    ['CompositorNodeOutputFile', 'file_output', 'OutputFileNode'],
    passThrough,
  );

  // ShaderNodeOutputMaterial — validates Surface input and returns it
  registerExecutor(
    'ShaderNodeOutputMaterial',
    (inputs) => {
      const surface = inputs.Surface ?? inputs.surface ?? inputs.bsdf;

      if (surface == null) {
        throw new Error(
          'MaterialOutput: No Surface/BSDF input connected. ' +
          'A MaterialOutput node requires a valid shader input (e.g. PrincipledBSDF, ' +
          'DiffuseBSDF, Emission, MixShader, AddShader). ' +
          'Connect a shader node to the Surface input before rendering.'
        );
      }

      // Validate that the surface input looks like a shader result
      if (typeof surface === 'number') {
        throw new Error(
          `MaterialOutput: Surface input received a bare number (${surface}). ` +
          'This usually means a float/value node was connected directly to the ' +
          'MaterialOutput instead of a proper BSDF shader. ' +
          'Connect a shader node (PrincipledBSDF, DiffuseBSDF, Emission, etc.) instead.'
        );
      }

      if (typeof surface === 'string') {
        throw new Error(
          `MaterialOutput: Surface input received a string ("${surface}"). ` +
          'This is not a valid shader input. ' +
          'Connect a shader node (PrincipledBSDF, DiffuseBSDF, Emission, etc.) instead.'
        );
      }

      return surface;
    },
  );

  // ==========================================================================
  // Domain Alias Nodes
  // Point*/Volume* prefixed types delegate to generic executors
  // ==========================================================================
  registerExecutorAliases(
    ['PointIndexNode', 'point_index', 'GeometryNodeInputPointIndex'],
    wrap(EssentialExecutors.executeIndex),
  );
  registerExecutorAliases(
    ['PointPositionNode', 'point_position', 'GeometryNodeInputPointPosition'],
    wrap(AddExecutors.executeGeometryNodeInputPosition),
  );
  registerExecutorAliases(
    ['PointNormalNode', 'point_normal', 'GeometryNodeInputPointNormal'],
    wrap(AddExecutors.executeGeometryNodeInputNormal),
  );
  registerExecutorAliases(
    ['PointIDNode', 'point_id', 'GeometryNodeInputPointID'],
    wrap(EssentialExecutors.executeInputID),
  );
  registerExecutorAliases(
    ['PointRadiusNode', 'point_radius', 'GeometryNodeInputPointRadius'],
    passThrough,
  );
  registerExecutorAliases(
    ['PointCountNode', 'point_count', 'GeometryNodeInputPointCount'],
    wrap(ExpExecutors.executeDomainSize),
  );
  registerExecutorAliases(
    ['VolumeIndexNode', 'volume_index', 'GeometryNodeInputVolumeIndex'],
    wrap(EssentialExecutors.executeIndex),
  );
  registerExecutorAliases(
    ['VolumePositionNode', 'volume_position', 'GeometryNodeInputVolumePosition'],
    wrap(AddExecutors.executeGeometryNodeInputPosition),
  );
  registerExecutorAliases(
    ['VolumeNormalNode', 'volume_normal', 'GeometryNodeInputVolumeNormal'],
    wrap(AddExecutors.executeGeometryNodeInputNormal),
  );
  registerExecutorAliases(
    ['VolumeIDNode', 'volume_id', 'GeometryNodeInputVolumeID'],
    wrap(EssentialExecutors.executeInputID),
  );
}

/**
 * Register an executor that needs settings, under a canonical type + aliases.
 * Convenience wrapper for the common pattern of executors that take (inputs, settings).
 */
function registerExecutorWithSettings(
  nodeType: string,
  fn: (inputs: Record<string, any>, settings?: Record<string, any>) => any,
): void {
  registerExecutor(nodeType, wrapWithSettings(fn));
}

/**
 * Reset the registry (for testing purposes only).
 */
export function resetRegistry(): void {
  executorRegistry.clear();
  registered = false;
  fallbackHandler = null;
}
