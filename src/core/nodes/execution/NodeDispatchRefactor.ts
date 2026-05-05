/**
 * Node Dispatch Refactor — P2 Nodes Subsystem
 *
 * Replaces the 200+ if-chain in NodeEvaluator.executeNodeByType() with a
 * registry-based dispatch system. Two key classes:
 *
 * 1. NodeTypeRegistry — Maps node type strings to evaluator functions.
 *    Supports registration, lookup, and bulk registration of built-in handlers.
 *    This eliminates the linear if-chain and allows O(1) dispatch.
 *
 * 2. PolymorphicArgumentResolver — Handles the polymorphic argument resolution
 *    that was originally done via eval_argument() in Python. Supports:
 *    - Functions: call with context
 *    - Strings: look up as attribute name
 *    - Numbers: return as-is
 *    - Vector2/3/4: return as-is
 *    - NodeOutput: evaluate the connected node first
 *
 * This module does NOT modify existing files — it provides an alternative
 * dispatch architecture that can be adopted incrementally.
 *
 * @module core/nodes/execution
 */

import * as THREE from 'three';

// ============================================================================
// Types
// ============================================================================

/**
 * Evaluation context passed to node evaluators.
 * Provides access to the graph, cached results, and shared state.
 */
export interface NodeEvaluationContext {
  /** The current node graph being evaluated */
  graph: NodeGraphRef;
  /** Cache of already-computed node outputs */
  cache: Map<string, Record<string, any>>;
  /** Warnings accumulated during evaluation */
  warnings: string[];
  /** Errors accumulated during evaluation */
  errors: string[];
  /** Node settings from the current node */
  settings: Record<string, any>;
  /** Optional seeded RNG state */
  rngState?: number;
}

/**
 * Minimal reference to a node graph structure.
 * Allows evaluators to look up connected nodes.
 */
export interface NodeGraphRef {
  /** Get a node instance by ID */
  getNode(id: string): NodeInstanceRef | undefined;
  /** Get all links connected to a node input */
  getInputLinks(nodeId: string): NodeLinkRef[];
  /** Get all links connected to a node output */
  getOutputLinks(nodeId: string): NodeLinkRef[];
}

/**
 * Minimal reference to a node instance.
 */
export interface NodeInstanceRef {
  /** Unique node ID */
  id: string;
  /** Node type string */
  type: string;
  /** Node input values (local, not from connections) */
  inputs: Map<string, any> | Record<string, any>;
  /** Node settings/properties */
  settings: Record<string, any>;
  /** Node output values */
  outputs: Map<string, any> | Record<string, any>;
}

/**
 * Minimal reference to a link between node sockets.
 */
export interface NodeLinkRef {
  /** Source node ID */
  fromNode: string;
  /** Source socket name */
  fromSocket: string;
  /** Target node ID */
  toNode: string;
  /** Target socket name */
  toSocket: string;
}

/**
 * Evaluator function type.
 * Takes resolved inputs and context, returns output values.
 */
export type NodeEvaluatorFn = (
  inputs: Record<string, any>,
  context: NodeEvaluationContext,
) => Record<string, any>;

/**
 * Node type alias — multiple strings can map to the same handler.
 */
export type NodeTypeAlias = string;

// ============================================================================
// 1. NodeTypeRegistry
// ============================================================================

/**
 * NodeTypeRegistry provides O(1) dispatch for node type evaluation,
 * replacing the 200+ if-chain in NodeEvaluator.executeNodeByType().
 *
 * Each node type (e.g., 'ShaderNodeTexNoise', 'noise_texture', 'NoiseTextureNode')
 * is registered with an evaluator function. Multiple aliases can map to the same
 * handler. This allows incremental migration from the if-chain without breaking
 * existing code.
 *
 * Usage:
 * ```ts
 * const registry = new NodeTypeRegistry();
 * registry.registerDefaults();
 *
 * // Evaluate a node
 * const result = registry.evaluate('noise_texture', inputs, context);
 * ```
 */
export class NodeTypeRegistry {
  /** Map from node type string to evaluator function */
  private evaluators: Map<string, NodeEvaluatorFn> = new Map();

  /** Map from alias to canonical type name (for de-duplication) */
  private aliasMap: Map<string, string> = new Map();

  /** Track registered type count for diagnostics */
  private registrationCount: number = 0;

  /**
   * Register an evaluator function for a node type.
   * Overwrites any existing registration for the same type.
   *
   * @param type - The node type string (e.g., 'ShaderNodeTexNoise')
   * @param evaluator - The evaluator function
   */
  register(type: string, evaluator: NodeEvaluatorFn): void {
    this.evaluators.set(type, evaluator);
    this.registrationCount++;
  }

  /**
   * Register an evaluator for multiple type aliases.
   * All aliases will dispatch to the same evaluator.
   *
   * @param types - Array of type strings (aliases)
   * @param evaluator - The evaluator function
   */
  registerAliases(types: string[], evaluator: NodeEvaluatorFn): void {
    if (types.length === 0) return;
    // Register the first type as the primary
    this.register(types[0], evaluator);
    // Register remaining as aliases
    for (let i = 1; i < types.length; i++) {
      this.aliasMap.set(types[i], types[0]);
      this.evaluators.set(types[i], evaluator);
      this.registrationCount++;
    }
  }

  /**
   * Evaluate a node type by dispatching to the registered handler.
   *
   * @param type - The node type string
   * @param inputs - Resolved input values
   * @param context - Evaluation context
   * @returns Output values from the evaluator
   * @throws Error if no handler is registered for the type
   */
  evaluate(
    type: string,
    inputs: Record<string, any>,
    context: NodeEvaluationContext,
  ): Record<string, any> {
    const evaluator = this.evaluators.get(type);
    if (evaluator) {
      return evaluator(inputs, context);
    }

    // Check alias map
    const canonicalType = this.aliasMap.get(type);
    if (canonicalType) {
      const aliasedEvaluator = this.evaluators.get(canonicalType);
      if (aliasedEvaluator) {
        return aliasedEvaluator(inputs, context);
      }
    }

    // No handler found — return empty result with warning
    context.warnings.push(`No evaluator registered for node type: ${type}`);
    return {};
  }

  /**
   * Check if a handler is registered for a given type.
   *
   * @param type - Node type string
   * @returns True if a handler exists
   */
  has(type: string): boolean {
    return this.evaluators.has(type) || this.aliasMap.has(type);
  }

  /**
   * Get all registered type strings.
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.evaluators.keys());
  }

  /**
   * Get the total number of registrations (including aliases).
   */
  getRegistrationCount(): number {
    return this.registrationCount;
  }

  /**
   * Register all built-in node type handlers.
   * This provides equivalent coverage to the if-chain in NodeEvaluator.
   *
   * The handlers are simple wrappers that produce basic output values.
   * Full implementations should delegate to the existing executor modules
   * (CoreNodeExecutors, ExtendedNodeExecutors, etc.)
   */
  registerDefaults(): void {
    // =========================================================================
    // Shader Nodes
    // =========================================================================
    this.registerShaderNodeDefaults();

    // =========================================================================
    // Texture Nodes
    // =========================================================================
    this.registerTextureNodeDefaults();

    // =========================================================================
    // Color Nodes
    // =========================================================================
    this.registerColorNodeDefaults();

    // =========================================================================
    // Math Nodes
    // =========================================================================
    this.registerMathNodeDefaults();

    // =========================================================================
    // Vector Nodes
    // =========================================================================
    this.registerVectorNodeDefaults();

    // =========================================================================
    // Geometry Nodes (Core)
    // =========================================================================
    this.registerGeometryNodeDefaults();

    // =========================================================================
    // Input Nodes
    // =========================================================================
    this.registerInputNodeDefaults();

    // =========================================================================
    // Utility Nodes
    // =========================================================================
    this.registerUtilityNodeDefaults();

    // =========================================================================
    // Extended Geometry Nodes
    // =========================================================================
    this.registerExtendedNodeDefaults();

    // =========================================================================
    // Curve Nodes
    // =========================================================================
    this.registerCurveNodeDefaults();

    // =========================================================================
    // Instance Transform Nodes
    // =========================================================================
    this.registerInstanceNodeDefaults();

    // =========================================================================
    // Volume/Point Nodes
    // =========================================================================
    this.registerVolumePointNodeDefaults();
  }

  // ---------------------------------------------------------------------------
  // Shader Node Registrations
  // ---------------------------------------------------------------------------

  private registerShaderNodeDefaults(): void {
    // Principled BSDF
    this.registerAliases(
      ['principled_bsdf', 'ShaderNodeBsdfPrincipled', 'PrincipledBSDFNode'],
      (inputs, ctx) => this.evalPrincipledBSDF(inputs, ctx),
    );

    // Diffuse BSDF
    this.registerAliases(
      ['bsdf_diffuse', 'ShaderNodeBsdfDiffuse', 'DiffuseBSDFNode'],
      (inputs, ctx) => this.evalDiffuseBSDF(inputs, ctx),
    );

    // Glossy BSDF
    this.registerAliases(
      ['bsdf_glossy', 'ShaderNodeBsdfGlossy', 'GlossyBSDFNode'],
      (inputs, ctx) => this.evalGlossyBSDF(inputs, ctx),
    );

    // Glass BSDF
    this.registerAliases(
      ['bsdf_glass', 'ShaderNodeBsdfGlass', 'GlassBSDFNode'],
      (inputs, ctx) => this.evalGlassBSDF(inputs, ctx),
    );

    // Emission
    this.registerAliases(
      ['emission', 'ShaderNodeEmission', 'EmissionNode'],
      (inputs, ctx) => this.evalEmission(inputs, ctx),
    );

    // Mix Shader
    this.registerAliases(
      ['mix_shader', 'ShaderNodeMixShader', 'MixShaderNode'],
      (inputs, ctx) => this.evalMixShader(inputs, ctx),
    );

    // Add Shader
    this.registerAliases(
      ['add_shader', 'ShaderNodeAddShader', 'AddShaderNode'],
      (inputs, ctx) => this.evalAddShader(inputs, ctx),
    );
  }

  // ---------------------------------------------------------------------------
  // Texture Node Registrations
  // ---------------------------------------------------------------------------

  private registerTextureNodeDefaults(): void {
    this.registerAliases(
      ['ShaderNodeTexNoise', 'noise_texture', 'NoiseTextureNode'],
      (inputs, ctx) => this.evalNoiseTexture(inputs, ctx),
    );
    this.registerAliases(
      ['ShaderNodeTexVoronoi', 'voronoi_texture', 'VoronoiTextureNode'],
      (inputs, ctx) => this.evalVoronoiTexture(inputs, ctx),
    );
    this.registerAliases(
      ['ShaderNodeTexMusgrave', 'musgrave_texture', 'MusgraveTextureNode'],
      (inputs, ctx) => this.evalMusgraveTexture(inputs, ctx),
    );
    this.registerAliases(
      ['ShaderNodeTexGradient', 'gradient_texture', 'GradientTextureNode'],
      (inputs, ctx) => this.evalGradientTexture(inputs, ctx),
    );
    this.registerAliases(
      ['ShaderNodeTexBrick', 'brick_texture', 'BrickTextureNode'],
      (inputs, ctx) => this.evalBrickTexture(inputs, ctx),
    );
    this.registerAliases(
      ['ShaderNodeTexChecker', 'checker_texture', 'CheckerTextureNode'],
      (inputs, ctx) => this.evalCheckerTexture(inputs, ctx),
    );
    this.registerAliases(
      ['ShaderNodeTexMagic', 'magic_texture', 'MagicTextureNode'],
      (inputs, ctx) => this.evalMagicTexture(inputs, ctx),
    );
    this.registerAliases(
      ['ShaderNodeTexImage', 'image_texture', 'ImageTextureNode'],
      (inputs, ctx) => this.evalImageTexture(inputs, ctx),
    );
    this.registerAliases(
      ['ShaderNodeTexWave', 'wave_texture', 'WaveTextureNode'],
      (inputs, ctx) => this.evalWaveTexture(inputs, ctx),
    );
    this.registerAliases(
      ['ShaderNodeTexWhiteNoise', 'white_noise_texture', 'WhiteNoiseTextureNode'],
      (inputs, ctx) => this.evalWhiteNoiseTexture(inputs, ctx),
    );
  }

  // ---------------------------------------------------------------------------
  // Color Node Registrations
  // ---------------------------------------------------------------------------

  private registerColorNodeDefaults(): void {
    this.registerAliases(
      ['ShaderNodeMixRGB', 'mix_rgb', 'MixRGBNode'],
      (inputs, ctx) => this.evalMixRGB(inputs, ctx),
    );
    this.registerAliases(
      ['ShaderNodeValToRGB', 'color_ramp', 'ColorRampNode'],
      (inputs, ctx) => this.evalColorRamp(inputs, ctx),
    );
    this.registerAliases(
      ['ShaderNodeHueSaturation', 'hue_saturation', 'HueSaturationNode'],
      (inputs, ctx) => this.evalHueSaturation(inputs, ctx),
    );
    this.registerAliases(
      ['ShaderNodeInvert', 'invert', 'InvertNode'],
      (inputs, ctx) => this.evalInvert(inputs, ctx),
    );
    this.registerAliases(
      ['CompositorNodeBrightContrast', 'bright_contrast', 'BrightContrastNode'],
      (inputs, ctx) => this.evalBrightContrast(inputs, ctx),
    );
    this.registerAliases(
      ['CombineHSV', 'CombineHSVNode'],
      (inputs, ctx) => this.evalCombineHSV(inputs, ctx),
    );
    this.registerAliases(
      ['SeparateRGB', 'SeparateRGBNode'],
      (inputs, ctx) => this.evalSeparateRGB(inputs, ctx),
    );
    this.registerAliases(
      ['CombineRGB', 'CombineRGBNode'],
      (inputs, ctx) => this.evalCombineRGB(inputs, ctx),
    );
  }

  // ---------------------------------------------------------------------------
  // Math Node Registrations
  // ---------------------------------------------------------------------------

  private registerMathNodeDefaults(): void {
    this.registerAliases(
      ['ShaderNodeMath', 'math', 'MathNode'],
      (inputs, ctx) => this.evalMath(inputs, ctx),
    );
    this.registerAliases(
      ['ShaderNodeVectorMath', 'vector_math', 'VectorMathNode'],
      (inputs, ctx) => this.evalVectorMath(inputs, ctx),
    );
    this.registerAliases(
      ['BooleanMath', 'BooleanMathNode', 'boolean_math', 'FunctionNodeBooleanMath'],
      (inputs, ctx) => this.evalBooleanMath(inputs, ctx),
    );
    this.registerAliases(
      ['FloatCompare', 'FloatCompareNode', 'float_compare', 'FunctionNodeFloatCompare'],
      (inputs, ctx) => this.evalFloatCompare(inputs, ctx),
    );
  }

  // ---------------------------------------------------------------------------
  // Vector Node Registrations
  // ---------------------------------------------------------------------------

  private registerVectorNodeDefaults(): void {
    this.registerAliases(
      ['ShaderNodeMapping', 'mapping', 'MappingNode'],
      (inputs, ctx) => this.evalMapping(inputs, ctx),
    );
    this.registerAliases(
      ['ShaderNodeCombineXYZ', 'combine_xyz', 'CombineXYZNode'],
      (inputs, ctx) => this.evalCombineXYZ(inputs, ctx),
    );
    this.registerAliases(
      ['ShaderNodeSeparateXYZ', 'separate_xyz', 'SeparateXYZNode'],
      (inputs, ctx) => this.evalSeparateXYZ(inputs, ctx),
    );
    this.registerAliases(
      ['ShaderNodeBump', 'bump', 'BumpNode'],
      (inputs, ctx) => this.evalBump(inputs, ctx),
    );
    this.registerAliases(
      ['ShaderNodeDisplacement', 'displacement', 'DisplacementNode'],
      (inputs, ctx) => this.evalDisplacement(inputs, ctx),
    );
    this.registerAliases(
      ['ShaderNodeNormalMap', 'normal_map', 'NormalMapNode'],
      (inputs, ctx) => this.evalNormalMap(inputs, ctx),
    );
  }

  // ---------------------------------------------------------------------------
  // Geometry Node Registrations (Core)
  // ---------------------------------------------------------------------------

  private registerGeometryNodeDefaults(): void {
    this.registerAliases(
      ['DistributePointsOnFaces', 'DistributePointsOnFacesNode', 'distribute_points_on_faces'],
      (inputs, ctx) => this.evalDistributePoints(inputs, ctx),
    );
    this.registerAliases(
      ['InstanceOnPoints', 'InstanceOnPointsNode', 'instance_on_points'],
      (inputs, ctx) => this.evalInstanceOnPoints(inputs, ctx),
    );
    this.registerAliases(
      ['RealizeInstances', 'RealizeInstancesNode', 'realize_instances'],
      (inputs, ctx) => this.evalRealizeInstances(inputs, ctx),
    );
    this.registerAliases(
      ['Proximity', 'ProximityNode', 'GeometryNodeProximity', 'proximity'],
      (inputs, ctx) => this.evalProximity(inputs, ctx),
    );
    this.registerAliases(
      ['Raycast', 'RaycastNode', 'GeometryNodeRaycast', 'raycast'],
      (inputs, ctx) => this.evalRaycast(inputs, ctx),
    );
    this.registerAliases(
      ['ConvexHull', 'ConvexHullNode', 'convex_hull'],
      (inputs, ctx) => this.evalConvexHull(inputs, ctx),
    );
    this.registerAliases(
      ['MeshBoolean', 'MeshBooleanNode', 'Boolean', 'BooleanUnionNode', 'mesh_boolean'],
      (inputs, ctx) => this.evalMeshBoolean(inputs, ctx),
    );
    this.registerAliases(
      ['JoinGeometry', 'JoinGeometryNode'],
      (inputs, ctx) => this.evalJoinGeometry(inputs, ctx),
    );
    this.registerAliases(
      ['SeparateGeometry', 'SeparateGeometryNode'],
      (inputs, ctx) => this.evalSeparateGeometry(inputs, ctx),
    );
    this.registerAliases(
      ['DeleteGeometry', 'DeleteGeometryNode'],
      (inputs, ctx) => this.evalDeleteGeometry(inputs, ctx),
    );
    this.registerAliases(
      ['Transform', 'TransformNode'],
      (inputs, ctx) => this.evalTransform(inputs, ctx),
    );
    this.registerAliases(
      ['SetPosition', 'SetPositionNode', 'set_position', 'GeometryNodeSetPosition'],
      (inputs, ctx) => this.evalSetPosition(inputs, ctx),
    );
    this.registerAliases(
      ['SetMaterial', 'SetMaterialNode'],
      (inputs, ctx) => this.evalSetMaterial(inputs, ctx),
    );
  }

  // ---------------------------------------------------------------------------
  // Input Node Registrations
  // ---------------------------------------------------------------------------

  private registerInputNodeDefaults(): void {
    this.registerAliases(
      ['GeometryNodeObjectInfo', 'object_info', 'ObjectInfoNode'],
      (inputs, ctx) => this.evalObjectInfo(inputs, ctx),
    );
    this.registerAliases(
      ['ShaderNodeValue', 'value', 'ValueNode'],
      (inputs, ctx) => this.evalValue(inputs, ctx),
    );
    this.registerAliases(
      ['ShaderNodeRGB', 'rgb', 'RGBNode'],
      (inputs, ctx) => this.evalRGB(inputs, ctx),
    );
    this.registerAliases(
      ['ShaderNodeTexCoord', 'texture_coordinate', 'TextureCoordinateNode'],
      (inputs, ctx) => this.evalTextureCoordinate(inputs, ctx),
    );
    this.registerAliases(
      ['GeometryNodeInputPosition', 'input_position', 'InputPositionNode'],
      (inputs, ctx) => this.evalInputPosition(inputs, ctx),
    );
    this.registerAliases(
      ['GeometryNodeInputNormal', 'input_normal', 'InputNormalNode'],
      (inputs, ctx) => this.evalInputNormal(inputs, ctx),
    );
    this.registerAliases(
      ['GeometryNodeInputTangent', 'input_tangent', 'InputTangentNode'],
      (inputs, ctx) => this.evalInputTangent(inputs, ctx),
    );
    this.registerAliases(
      ['random_value', 'GeometryNodeRandomValue', 'FunctionNodeRandomValue', 'RandomValueNode'],
      (inputs, ctx) => this.evalRandomValue(inputs, ctx),
    );
  }

  // ---------------------------------------------------------------------------
  // Utility Node Registrations
  // ---------------------------------------------------------------------------

  private registerUtilityNodeDefaults(): void {
    this.registerAliases(
      ['clamp', 'ShaderNodeClamp', 'GeometryNodeClamp', 'ClampNode'],
      (inputs, ctx) => this.evalClamp(inputs, ctx),
    );
    this.registerAliases(
      ['map_range', 'ShaderNodeMapRange', 'GeometryNodeMapRange', 'MapRangeNode'],
      (inputs, ctx) => this.evalMapRange(inputs, ctx),
    );
    this.registerAliases(
      ['switch', 'GeometryNodeSwitch', 'ShaderNodeSwitch', 'SwitchNode'],
      (inputs, ctx) => this.evalSwitch(inputs, ctx),
    );
  }

  // ---------------------------------------------------------------------------
  // Extended Node Registrations
  // ---------------------------------------------------------------------------

  private registerExtendedNodeDefaults(): void {
    this.registerAliases(
      ['CollectionInfo', 'CollectionInfoNode', 'GeometryNodeCollectionInfo', 'collection_info'],
      (inputs, ctx) => this.evalCollectionInfo(inputs, ctx),
    );
    this.registerAliases(
      ['bounding_box', 'GeometryNodeBoundBox', 'BoundingBoxNode'],
      (inputs, ctx) => this.evalBoundingBox(inputs, ctx),
    );
    this.registerAliases(
      ['SubdivideMesh', 'SubdivideMeshNode', 'subdivide_mesh'],
      (inputs, ctx) => this.evalSubdivideMesh(inputs, ctx),
    );
    this.registerAliases(
      ['ExtrudeFaces', 'ExtrudeFacesNode', 'extrude_faces'],
      (inputs, ctx) => this.evalExtrudeFaces(inputs, ctx),
    );
    this.registerAliases(
      ['MeshToVolume', 'MeshToVolumeNode', 'mesh_to_volume'],
      (inputs, ctx) => this.evalMeshToVolume(inputs, ctx),
    );
    this.registerAliases(
      ['mesh_to_points', 'GeometryNodeMeshToPoints', 'MeshToPointsNode'],
      (inputs, ctx) => this.evalMeshToPoints(inputs, ctx),
    );
  }

  // ---------------------------------------------------------------------------
  // Curve Node Registrations
  // ---------------------------------------------------------------------------

  private registerCurveNodeDefaults(): void {
    this.registerAliases(
      ['curve_line', 'GeometryNodeCurveLine', 'CurveLineNode'],
      (inputs, ctx) => this.evalCurveLine(inputs, ctx),
    );
    this.registerAliases(
      ['CurveToMesh', 'CurveToMeshNode', 'curve_to_mesh'],
      (inputs, ctx) => this.evalCurveToMesh(inputs, ctx),
    );
    this.registerAliases(
      ['ResampleCurve', 'ResampleCurveNode', 'curve_resample', 'resample_curve'],
      (inputs, ctx) => this.evalResampleCurve(inputs, ctx),
    );
    this.registerAliases(
      ['CurveToPoints', 'CurveToPointsNode'],
      (inputs, ctx) => this.evalCurveToPoints(inputs, ctx),
    );
  }

  // ---------------------------------------------------------------------------
  // Instance Transform Node Registrations
  // ---------------------------------------------------------------------------

  private registerInstanceNodeDefaults(): void {
    this.registerAliases(
      ['TranslateInstances', 'TranslateInstancesNode', 'translate_instances'],
      (inputs, ctx) => this.evalTranslateInstances(inputs, ctx),
    );
    this.registerAliases(
      ['RotateInstances', 'RotateInstancesNode', 'rotate_instances'],
      (inputs, ctx) => this.evalRotateInstances(inputs, ctx),
    );
    this.registerAliases(
      ['ScaleInstances', 'ScaleInstancesNode', 'scale_instances'],
      (inputs, ctx) => this.evalScaleInstances(inputs, ctx),
    );
  }

  // ---------------------------------------------------------------------------
  // Volume/Point Node Registrations
  // ---------------------------------------------------------------------------

  private registerVolumePointNodeDefaults(): void {
    this.registerAliases(
      ['VolumeToMesh', 'VolumeToMeshNode', 'volume_to_mesh'],
      (inputs, ctx) => this.evalVolumeToMesh(inputs, ctx),
    );
    this.registerAliases(
      ['PointsToVertices', 'PointsToVerticesNode', 'points_to_vertices'],
      (inputs, ctx) => this.evalPointsToVertices(inputs, ctx),
    );
    this.registerAliases(
      ['PointsToCurves', 'PointsToCurvesNode', 'points_to_curves'],
      (inputs, ctx) => this.evalPointsToCurves(inputs, ctx),
    );
    this.registerAliases(
      ['DuplicateElements', 'DuplicateElementsNode', 'duplicate_elements'],
      (inputs, ctx) => this.evalDuplicateElements(inputs, ctx),
    );
  }

  // ===========================================================================
  // Evaluator Implementations (stubs with basic output)
  // ===========================================================================
  // These stubs provide the correct output socket structure.
  // Full implementations should delegate to the existing executor modules.

  private evalPrincipledBSDF(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { BSDF: { type: 'principled_bsdf', ...inputs } };
  }
  private evalDiffuseBSDF(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { BSDF: { type: 'diffuse', ...inputs } };
  }
  private evalGlossyBSDF(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { BSDF: { type: 'glossy', ...inputs } };
  }
  private evalGlassBSDF(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { BSDF: { type: 'glass', ...inputs } };
  }
  private evalEmission(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Emission: { type: 'emission', ...inputs } };
  }
  private evalMixShader(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Shader: { type: 'mix_shader', ...inputs } };
  }
  private evalAddShader(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Shader: { type: 'add_shader', ...inputs } };
  }
  private evalNoiseTexture(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    const fac = inputs.Fac ?? inputs.fac ?? 0.5;
    return { Fac: fac, Color: { r: fac, g: fac, b: fac, a: 1 } };
  }
  private evalVoronoiTexture(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    const fac = inputs.Fac ?? inputs.fac ?? 0.5;
    return { Distance: fac, Color: { r: fac, g: fac, b: fac, a: 1 }, Position: { x: 0, y: 0, z: 0 } };
  }
  private evalMusgraveTexture(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    const fac = inputs.Fac ?? inputs.fac ?? inputs.amplitude ?? 0.5;
    return { Fac: fac };
  }
  private evalGradientTexture(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    const fac = inputs.Fac ?? inputs.fac ?? 0.5;
    return { Fac: fac, Color: { r: fac, g: fac, b: fac, a: 1 } };
  }
  private evalBrickTexture(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    const fac = inputs.Fac ?? inputs.fac ?? 0.5;
    return { Fac: fac, Color: { r: 0.8, g: 0.5, b: 0.3, a: 1 } };
  }
  private evalCheckerTexture(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    const fac = inputs.Fac ?? inputs.fac ?? 0.5;
    return { Fac: fac, Color: { r: fac, g: fac, b: fac, a: 1 } };
  }
  private evalMagicTexture(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    const fac = inputs.Fac ?? inputs.fac ?? 0.5;
    return { Fac: fac, Color: { r: fac, g: fac * 0.8, b: fac * 0.6, a: 1 } };
  }
  private evalImageTexture(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    const fac = inputs.Fac ?? inputs.fac ?? 0.5;
    return { Fac: fac, Color: { r: fac, g: fac, b: fac, a: 1 } };
  }
  private evalWaveTexture(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    const fac = inputs.Fac ?? inputs.fac ?? 0.5;
    return { Fac: fac, Color: { r: fac, g: fac, b: fac, a: 1 } };
  }
  private evalWhiteNoiseTexture(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    const rng = this.contextRng(_ctx);
    return { Fac: rng(), Color: { r: rng(), g: rng(), b: rng(), a: 1 } };
  }
  private evalMixRGB(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    const fac = inputs.Fac ?? inputs.factor ?? 0.5;
    return { Result: { r: fac, g: fac, b: fac, a: 1 } };
  }
  private evalColorRamp(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    const fac = inputs.Fac ?? inputs.factor ?? 0.5;
    return { Color: { r: fac, g: fac, b: fac, a: 1 }, Fac: fac };
  }
  private evalHueSaturation(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    const color = inputs.Color ?? inputs.color ?? { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    return { Color: color };
  }
  private evalInvert(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    const color = inputs.Color ?? inputs.color ?? { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    return { Color: { r: 1 - (color.r ?? 0.5), g: 1 - (color.g ?? 0.5), b: 1 - (color.b ?? 0.5), a: color.a ?? 1 } };
  }
  private evalBrightContrast(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    const color = inputs.Color ?? inputs.color ?? { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    return { Color: color };
  }
  private evalCombineHSV(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Color: { r: 0.5, g: 0.5, b: 0.5, a: 1 } };
  }
  private evalSeparateRGB(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    const color = inputs.Color ?? inputs.color ?? { r: 0, g: 0, b: 0, a: 1 };
    return { R: color.r ?? 0, G: color.g ?? 0, B: color.b ?? 0, A: color.a ?? 1 };
  }
  private evalCombineRGB(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Color: { r: inputs.R ?? 0, g: inputs.G ?? 0, b: inputs.B ?? 0, a: inputs.A ?? 1 } };
  }
  private evalMath(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    const a = inputs.Value ?? inputs.A ?? inputs.a ?? 0;
    const b = inputs.B ?? inputs.b ?? 0;
    const op = inputs.Operation ?? inputs.operation ?? 'ADD';
    let result = 0;
    switch (op) {
      case 'ADD': result = a + b; break;
      case 'SUBTRACT': result = a - b; break;
      case 'MULTIPLY': result = a * b; break;
      case 'DIVIDE': result = b !== 0 ? a / b : 0; break;
      case 'POWER': result = Math.pow(a, b); break;
      case 'ABSOLUTE': result = Math.abs(a); break;
      case 'SQRT': result = Math.sqrt(Math.max(0, a)); break;
      case 'SINE': result = Math.sin(a); break;
      case 'COSINE': result = Math.cos(a); break;
      default: result = a + b;
    }
    return { Value: result };
  }
  private evalVectorMath(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Vector: { x: 0, y: 0, z: 0 }, Value: 0 };
  }
  private evalBooleanMath(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Result: 0 };
  }
  private evalFloatCompare(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Result: 0 };
  }
  private evalMapping(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Vector: inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 } };
  }
  private evalCombineXYZ(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Vector: { x: inputs.X ?? inputs.x ?? 0, y: inputs.Y ?? inputs.y ?? 0, z: inputs.Z ?? inputs.z ?? 0 } };
  }
  private evalSeparateXYZ(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    const v = inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 };
    return { X: v.x ?? 0, Y: v.y ?? 0, Z: v.z ?? 0 };
  }
  private evalBump(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Normal: { x: 0, y: 1, z: 0 } };
  }
  private evalDisplacement(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Displacement: { x: 0, y: 0, z: 0 } };
  }
  private evalNormalMap(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Normal: { x: 0, y: 1, z: 0 } };
  }
  private evalDistributePoints(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: new THREE.BufferGeometry() };
  }
  private evalInstanceOnPoints(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: new THREE.BufferGeometry() };
  }
  private evalRealizeInstances(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: inputs.Geometry ?? inputs.geometry ?? new THREE.BufferGeometry() };
  }
  private evalProximity(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Distance: 0, Position: { x: 0, y: 0, z: 0 } };
  }
  private evalRaycast(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Hit: false, HitPosition: { x: 0, y: 0, z: 0 }, HitNormal: { x: 0, y: 1, z: 0 }, HitDistance: 0 };
  }
  private evalConvexHull(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: new THREE.BufferGeometry() };
  }
  private evalMeshBoolean(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: new THREE.BufferGeometry() };
  }
  private evalJoinGeometry(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: new THREE.BufferGeometry() };
  }
  private evalSeparateGeometry(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: new THREE.BufferGeometry() };
  }
  private evalDeleteGeometry(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: new THREE.BufferGeometry() };
  }
  private evalTransform(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: inputs.Geometry ?? inputs.geometry ?? new THREE.BufferGeometry() };
  }
  private evalSetPosition(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: inputs.Geometry ?? inputs.geometry ?? new THREE.BufferGeometry() };
  }
  private evalSetMaterial(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: inputs.Geometry ?? inputs.geometry ?? new THREE.BufferGeometry() };
  }
  private evalObjectInfo(inputs: Record<string, any>, ctx: NodeEvaluationContext): Record<string, any> {
    return { Location: { x: 0, y: 0, z: 0 }, Color: { r: 1, g: 1, b: 1, a: 1 }, Random: this.contextRng(ctx), Index: 0 };
  }
  private evalValue(inputs: Record<string, any>, ctx: NodeEvaluationContext): Record<string, any> {
    return { Value: inputs.Value ?? inputs.value ?? ctx.settings?.value ?? 0 };
  }
  private evalRGB(inputs: Record<string, any>, ctx: NodeEvaluationContext): Record<string, any> {
    const color = ctx.settings?.color ?? inputs.Color ?? inputs.color;
    return { Color: color ?? { r: 0.5, g: 0.5, b: 0.5, a: 1 } };
  }
  private evalTextureCoordinate(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Generated: { x: 0, y: 0, z: 0 }, UV: { x: 0, y: 0 }, Normal: { x: 0, y: 1, z: 0 }, Object: { x: 0, y: 0, z: 0 } };
  }
  private evalInputPosition(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Position: { x: 0, y: 0, z: 0 } };
  }
  private evalInputNormal(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Normal: { x: 0, y: 1, z: 0 } };
  }
  private evalInputTangent(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Tangent: { x: 1, y: 0, z: 0 } };
  }
  private evalRandomValue(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Value: Math.random() };
  }
  private evalClamp(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    const value = inputs.Value ?? inputs.value ?? 0;
    const min = inputs.Min ?? inputs.min ?? 0;
    const max = inputs.Max ?? inputs.max ?? 1;
    return { Result: Math.max(min, Math.min(max, value)) };
  }
  private evalMapRange(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Result: inputs.Value ?? inputs.value ?? 0 };
  }
  private evalSwitch(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    const cond = inputs.Switch ?? inputs.condition ?? inputs.factor ?? false;
    return { Output: cond ? (inputs.True ?? inputs.B ?? inputs.b) : (inputs.False ?? inputs.A ?? inputs.a) };
  }
  private evalCollectionInfo(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: new THREE.BufferGeometry() };
  }
  private evalBoundingBox(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Bounding: new THREE.BufferGeometry(), Min: { x: -1, y: -1, z: -1 }, Max: { x: 1, y: 1, z: 1 } };
  }
  private evalSubdivideMesh(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: inputs.Geometry ?? inputs.geometry ?? new THREE.BufferGeometry() };
  }
  private evalExtrudeFaces(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: inputs.Geometry ?? inputs.geometry ?? new THREE.BufferGeometry() };
  }
  private evalMeshToVolume(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: new THREE.BufferGeometry() };
  }
  private evalMeshToPoints(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: new THREE.BufferGeometry() };
  }
  private evalCurveLine(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: new THREE.BufferGeometry() };
  }
  private evalCurveToMesh(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: new THREE.BufferGeometry() };
  }
  private evalResampleCurve(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: inputs.Geometry ?? inputs.geometry ?? new THREE.BufferGeometry() };
  }
  private evalCurveToPoints(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: new THREE.BufferGeometry(), Tangent: { x: 0, y: 0, z: 1 }, Normal: { x: 0, y: 1, z: 0 } };
  }
  private evalTranslateInstances(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: inputs.Geometry ?? inputs.geometry ?? new THREE.BufferGeometry() };
  }
  private evalRotateInstances(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: inputs.Geometry ?? inputs.geometry ?? new THREE.BufferGeometry() };
  }
  private evalScaleInstances(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: inputs.Geometry ?? inputs.geometry ?? new THREE.BufferGeometry() };
  }
  private evalVolumeToMesh(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: new THREE.BufferGeometry() };
  }
  private evalPointsToVertices(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: inputs.Geometry ?? inputs.geometry ?? new THREE.BufferGeometry() };
  }
  private evalPointsToCurves(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: new THREE.BufferGeometry() };
  }
  private evalDuplicateElements(inputs: Record<string, any>, _ctx: NodeEvaluationContext): Record<string, any> {
    return { Geometry: inputs.Geometry ?? inputs.geometry ?? new THREE.BufferGeometry() };
  }

  /** Get a deterministic RNG from context */
  private contextRng(ctx: NodeEvaluationContext): () => number {
    let state = ctx.rngState ?? 42;
    return () => {
      state = (state * 1664525 + 1013904223) & 0xffffffff;
      return (state >>> 0) / 4294967296;
    };
  }
}

// ============================================================================
// 2. PolymorphicArgumentResolver
// ============================================================================

/**
 * PolymorphicArgumentResolver handles the polymorphic argument resolution
 * that was originally done via eval_argument() in Python Infinigen.
 *
 * In the original codebase, node arguments can be:
 * - A function that takes a context and returns a value
 * - A string that should be looked up as an attribute name
 * - A number (returned as-is)
 * - A Vector2/3/4 (returned as-is)
 * - A NodeOutput reference that needs to be evaluated first
 *
 * This resolver centralizes that logic in one place.
 *
 * Usage:
 * ```ts
 * const resolver = new PolymorphicArgumentResolver(registry);
 * const value = resolver.resolve(someArg, context);
 * ```
 */
export class PolymorphicArgumentResolver {
  /** The node type registry for evaluating NodeOutput references */
  private registry: NodeTypeRegistry;

  constructor(registry: NodeTypeRegistry) {
    this.registry = registry;
  }

  /**
   * Resolve a polymorphic argument to its final value.
   *
   * Resolution rules:
   * 1. If arg is a function: call it with context and return result
   * 2. If arg is a string: look up as attribute name in context
   * 3. If arg is a number: return as-is
   * 4. If arg is a Vector2/3/4: return as-is
   * 5. If arg is a NodeOutputReference: evaluate the connected node
   * 6. If arg is an array: recursively resolve each element
   * 7. If arg is null/undefined: return null
   *
   * @param arg - The argument to resolve
   * @param context - The evaluation context
   * @returns The resolved value
   */
  resolve(arg: any, context: NodeEvaluationContext): any {
    if (arg === null || arg === undefined) {
      return null;
    }

    // Number — return as-is
    if (typeof arg === 'number') {
      return arg;
    }

    // Boolean — return as-is
    if (typeof arg === 'boolean') {
      return arg;
    }

    // Function — call with context
    if (typeof arg === 'function') {
      try {
        return arg(context);
      } catch (e) {
        context.warnings.push(`Function argument evaluation failed: ${e}`);
        return null;
      }
    }

    // String — look up as attribute name
    if (typeof arg === 'string') {
      return this.resolveString(arg, context);
    }

    // Vector2
    if (arg instanceof THREE.Vector2) {
      return arg;
    }

    // Vector3
    if (arg instanceof THREE.Vector3) {
      return arg;
    }

    // Vector4
    if (arg instanceof THREE.Vector4) {
      return arg;
    }

    // Color
    if (arg instanceof THREE.Color) {
      return arg;
    }

    // Euler
    if (arg instanceof THREE.Euler) {
      return arg;
    }

    // Quaternion
    if (arg instanceof THREE.Quaternion) {
      return arg;
    }

    // Matrix4
    if (arg instanceof THREE.Matrix4) {
      return arg;
    }

    // BufferGeometry
    if (arg instanceof THREE.BufferGeometry) {
      return arg;
    }

    // NodeOutputReference — evaluate connected node
    if (this.isNodeOutputReference(arg)) {
      return this.resolveNodeOutput(arg, context);
    }

    // Array — recursively resolve each element
    if (Array.isArray(arg)) {
      return arg.map(item => this.resolve(item, context));
    }

    // Plain object with __nodeOutput marker
    if (typeof arg === 'object' && arg.__nodeOutput === true) {
      return this.resolveNodeOutput(arg, context);
    }

    // Plain object — return as-is (could be a color, vector-like, etc.)
    return arg;
  }

  /**
   * Resolve a string argument by looking it up in the context.
   * Strings can reference:
   * - Attribute names on the current object
   * - Named properties in the graph
   * - Special built-in names like 'position', 'normal', 'uv'
   *
   * @param name - The string to resolve
   * @param context - The evaluation context
   * @returns The resolved value, or the string itself if not found
   */
  private resolveString(name: string, context: NodeEvaluationContext): any {
    // Built-in attribute names
    switch (name) {
      case 'position':
      case 'Position':
        return { x: 0, y: 0, z: 0 }; // Default — should be overridden by geometry context
      case 'normal':
      case 'Normal':
        return { x: 0, y: 1, z: 0 };
      case 'uv':
      case 'UV':
        return { x: 0, y: 0 };
      case 'index':
      case 'Index':
        return 0;
      case 'id':
      case 'ID':
        return 0;
      case 'random':
      case 'Random':
        return this.registry['contextRng'] ? 0.5 : Math.random();
      default:
        // Check context settings for the named property
        if (context.settings && name in context.settings) {
          return context.settings[name];
        }
        // Return the string itself as a fallback (it might be an enum value)
        return name;
    }
  }

  /**
   * Check if an argument is a NodeOutputReference.
   * A NodeOutputReference has nodeId and socketName properties.
   */
  private isNodeOutputReference(arg: any): boolean {
    return (
      typeof arg === 'object' &&
      arg !== null &&
      typeof arg.nodeId === 'string' &&
      typeof arg.socketName === 'string'
    );
  }

  /**
   * Resolve a NodeOutputReference by evaluating the connected node
   * and extracting the specified socket value.
   *
   * @param ref - The NodeOutputReference with nodeId and socketName
   * @param context - The evaluation context
   * @returns The value from the connected node's output socket
   */
  private resolveNodeOutput(
    ref: { nodeId: string; socketName: string },
    context: NodeEvaluationContext,
  ): any {
    const { nodeId, socketName } = ref;

    // Check cache first
    const cacheKey = `node:${nodeId}`;
    const cached = context.cache.get(cacheKey);
    if (cached) {
      return cached[socketName] ?? cached;
    }

    // Look up the node in the graph
    const node = context.graph.getNode(nodeId);
    if (!node) {
      context.warnings.push(`NodeOutputReference: node "${nodeId}" not found in graph`);
      return null;
    }

    // Resolve the node's inputs first
    const resolvedInputs: Record<string, any> = {};

    // Get local inputs
    if (node.inputs instanceof Map) {
      for (const [key, value] of node.inputs) {
        resolvedInputs[key] = this.resolve(value, context);
      }
    } else if (typeof node.inputs === 'object') {
      for (const [key, value] of Object.entries(node.inputs)) {
        resolvedInputs[key] = this.resolve(value, context);
      }
    }

    // Get connected inputs
    const inputLinks = context.graph.getInputLinks(nodeId);
    for (const link of inputLinks) {
      const upstreamOutput = this.resolveNodeOutput(
        { nodeId: link.fromNode, socketName: link.fromSocket },
        context,
      );
      if (upstreamOutput !== null && upstreamOutput !== undefined) {
        resolvedInputs[link.toSocket] = upstreamOutput;
      }
    }

    // Evaluate the node
    const childContext: NodeEvaluationContext = {
      ...context,
      settings: node.settings ?? {},
    };

    const result = this.registry.evaluate(node.type, resolvedInputs, childContext);

    // Cache the result
    context.cache.set(cacheKey, result);

    // Extract the requested socket
    return result[socketName] ?? result;
  }
}

/**
 * Create a NodeOutputReference for connecting to another node's output.
 * This is used by the PolymorphicArgumentResolver to trace connections.
 *
 * @param nodeId - The ID of the source node
 * @param socketName - The name of the output socket
 * @returns A reference object that the resolver can evaluate
 */
export function nodeOutputRef(nodeId: string, socketName: string): { nodeId: string; socketName: string; __nodeOutput: true } {
  return { nodeId, socketName, __nodeOutput: true };
}
