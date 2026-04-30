/**
 * Node System - Core Types and Interfaces
 * 
 * Ports: infinigen/core/nodes/node_info.py
 * 
 * Defines the type system for Blender-style node graphs in TypeScript.
 * This enables procedural material and geometry generation similar to the original Infinigen.
 */

/**
 * Base interface for all node classes
 * Provides common properties shared across all node types
 */
export interface NodeBase {
  readonly nodeType: NodeType | string;
  readonly category: NodeCategory | string;
  readonly name: string;
  readonly domain: AttributeDomain;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  settings: Record<string, any>;
}

/**
 * Attribute domain types for geometry nodes
 * Matches Blender's attribute domain system
 */
export type AttributeDomain = 
  | 'point'
  | 'edge'
  | 'face'
  | 'face_corner'
  | 'spline'
  | 'curve'
  | 'instance';

/**
 * Socket types supported by the node system
 */
export enum SocketType {
  GEOMETRY = 'GEOMETRY',
  VECTOR = 'VECTOR',
  COLOR = 'COLOR',
  FLOAT = 'FLOAT',
  INTEGER = 'INTEGER',
  INT = 'INT',
  BOOLEAN = 'BOOLEAN',
  STRING = 'STRING',
  TEXTURE = 'TEXTURE',
  MATERIAL = 'MATERIAL',
  OBJECT = 'OBJECT',
  COLLECTION = 'COLLECTION',
  CURVE = 'CURVE',
  MESH = 'MESH',
  POINTS = 'POINTS',
  INSTANCE = 'INSTANCE',
  INSTANCES = 'INSTANCES',
  VOLUME = 'VOLUME',
  ANY = 'ANY',
  VALUE = 'VALUE',
  SHADER = 'SHADER',
  ROTATION = 'ROTATION',
  MATRIX = 'MATRIX',
  LIGHT = 'LIGHT',
  CAMERA = 'CAMERA',
  RGB = 'RGB',
  RGBA = 'RGBA',
  UV = 'UV',
  QUATERNION = 'QUATERNION',
  TRANSFORM = 'TRANSFORM',
  IMAGE = 'IMAGE',
  WORLD = 'WORLD',
}

/**
 * Node categories organized by Blender's Shift-A menu structure
 */
export enum NodeCategory {
  // Geometry Nodes
  ATTRIBUTE = 'ATTRIBUTE',
  CURVE = 'CURVE',
  CURVE_PRIMITIVES = 'CURVE_PRIMITIVES',
  GEOMETRY = 'GEOMETRY',
  INPUT = 'INPUT',
  INSTANCES = 'INSTANCES',
  MATERIAL = 'MATERIAL',
  MESH = 'MESH',
  MESH_PRIMITIVES = 'MESH_PRIMITIVES',
  MODIFIERS = 'MODIFIERS',
  OUTPUT = 'OUTPUT',
  SIMULATE = 'SIMULATE',
  TEXT = 'TEXT',
  TEXTURE = 'TEXTURE',
  TRANSFORM = 'TRANSFORM',
  UTILITY = 'UTILITY',
  
  // Shader Nodes
  SHADER_INPUT = 'SHADER_INPUT',
  SHADER_OUTPUT = 'SHADER_OUTPUT',
  SHADER = 'SHADER',
  TEXTURE_SHADER = 'TEXTURE_SHADER',
  COLOR = 'COLOR',
  CONVERTER = 'CONVERTER',
  VECTOR = 'VECTOR_SHADER',
  
  // Compositor Nodes
  COMPOSIT_INPUT = 'COMPOSIT_INPUT',
  COMPOSIT_OUTPUT = 'COMPOSIT_OUTPUT',
  COMPOSIT_FILTER = 'COMPOSIT_FILTER',
  COMPOSIT_COLOR = 'COMPOSIT_COLOR',
}

/**
 * Node type definitions - maps to Blender node identifiers
 */
export enum NodeType {
  // Mix & Utilities
  Mix = 'ShaderNodeMix',
  
  // Attribute Nodes
  Attribute = 'ShaderNodeAttribute',
  CaptureAttribute = 'GeometryNodeCaptureAttribute',
  AttributeStatistic = 'GeometryNodeAttributeStatistic',
  TransferAttribute = 'GeometryNodeAttributeTransfer',
  DomainSize = 'GeometryNodeAttributeDomainSize',
  StoreNamedAttribute = 'GeometryNodeStoreNamedAttribute',
  NamedAttribute = 'GeometryNodeInputNamedAttribute',
  SampleIndex = 'GeometryNodeSampleIndex',
  SampleNearest = 'GeometryNodeSampleNearest',
  SampleNearestSurface = 'GeometryNodeSampleNearestSurface',
  
  // Color Nodes
  ColorRamp = 'ShaderNodeValToRGB',
  MixRGB = 'ShaderNodeMixRGB',
  RGBCurve = 'ShaderNodeRGBCurve',
  BrightContrast = 'CompositorNodeBrightContrast',
  Exposure = 'CompositorNodeExposure',
  CombineHSV = 'ShaderNodeCombineHSV',
  SeparateRGB = 'ShaderNodeSeparateRGB',
  SeparateColor = 'ShaderNodeSeparateColor',
  CombineRGB = 'ShaderNodeCombineRGB',
  CombineColor = 'ShaderNodeCombineColor',
  FunctionCombineColor = 'FunctionNodeCombineColor',
  
  // Curve Nodes
  CurveToMesh = 'GeometryNodeCurveToMesh',
  CurveToPoints = 'GeometryNodeCurveToPoints',
  MeshToCurve = 'GeometryNodeMeshToCurve',
  SampleCurve = 'GeometryNodeSampleCurve',
  SetCurveRadius = 'GeometryNodeSetCurveRadius',
  SetCurveTilt = 'GeometryNodeSetCurveTilt',
  CurveLength = 'GeometryNodeCurveLength',
  CurveSplineType = 'GeometryNodeCurveSplineType',
  SetHandlePositions = 'GeometryNodeSetCurveHandlePositions',
  SubdivideCurve = 'GeometryNodeSubdivideCurve',
  ResampleCurve = 'GeometryNodeResampleCurve',
  TrimCurve = 'GeometryNodeTrimCurve',
  ReverseCurve = 'GeometryNodeReverseCurve',
  FillCurve = 'GeometryNodeFillCurve',
  FilletCurve = 'GeometryNodeFilletCurve',
  
  // Curve Primitives
  CurveCircle = 'GeometryNodeCurvePrimitiveCircle',
  CurveLine = 'GeometryNodeCurvePrimitiveLine',
  CurveBezierSegment = 'GeometryNodeCurvePrimitiveBezierSegment',
  QuadraticBezier = 'GeometryNodeCurveQuadraticBezier',
  
  // Geometry Nodes
  SetPosition = 'GeometryNodeSetPosition',
  JoinGeometry = 'GeometryNodeJoinGeometry',
  MergeByDistance = 'GeometryNodeMergeByDistance',
  SeparateGeometry = 'GeometryNodeSeparateGeometry',
  BoundingBox = 'GeometryNodeBoundBox',
  Transform = 'GeometryNodeTransform',
  DeleteGeometry = 'GeometryNodeDeleteGeometry',
  Proximity = 'GeometryNodeProximity',
  ConvexHull = 'GeometryNodeConvexHull',
  Raycast = 'GeometryNodeRaycast',
  DuplicateElements = 'GeometryNodeDuplicateElements',
  Triangulate = 'GeometryNodeTriangulate',
  
  // Input Nodes
  GroupInput = 'NodeGroupInput',
  RGB = 'ShaderNodeRGB',
  Boolean = 'FunctionNodeInputBool',
  Value = 'ShaderNodeValue',
  RandomValue = 'FunctionNodeRandomValue',
  CollectionInfo = 'GeometryNodeCollectionInfo',
  ObjectInfo = 'GeometryNodeObjectInfo',
  Vector = 'FunctionNodeInputVector',
  InputID = 'GeometryNodeInputID',
  InputPosition = 'GeometryNodeInputPosition',
  InputNormal = 'GeometryNodeInputNormal',
  InputEdgeVertices = 'GeometryNodeInputMeshEdgeVertices',
  InputEdgeAngle = 'GeometryNodeInputMeshEdgeAngle',
  InputColor = 'FunctionNodeInputColor',
  InputMeshFaceArea = 'GeometryNodeInputMeshFaceArea',
  TextureCoord = 'ShaderNodeTexCoord',
  Index = 'GeometryNodeInputIndex',
  AmbientOcclusion = 'ShaderNodeAmbientOcclusion',
  Integer = 'FunctionNodeInputInt',
  LightPath = 'ShaderNodeLightPath',
  
  // Instance Nodes
  RealizeInstances = 'GeometryNodeRealizeInstances',
  InstanceOnPoints = 'GeometryNodeInstanceOnPoints',
  TranslateInstances = 'GeometryNodeTranslateInstances',
  RotateInstances = 'GeometryNodeRotateInstances',
  ScaleInstances = 'GeometryNodeScaleInstances',
  
  // Material Nodes
  SetMaterial = 'GeometryNodeSetMaterial',
  SetMaterialIndex = 'GeometryNodeSetMaterialIndex',
  MaterialIndex = 'GeometryNodeInputMaterialIndex',
  
  // Mesh Nodes
  SubdivideMesh = 'GeometryNodeSubdivideMesh',
  SetShadeSmooth = 'GeometryNodeSetShadeSmooth',
  SplitEdges = 'GeometryNodeSplitEdges',
  ExtrudeMesh = 'GeometryNodeExtrudeMesh',
  ExtrudeMeshFace = 'GeometryNodeExtrudeMeshFace',
  OffsetFace = 'GeometryNodeOffsetFace',
  MeshBoolean = 'GeometryNodeMeshBoolean',
  MeshToPoints = 'GeometryNodeMeshToPoints',
  DualMesh = 'GeometryNodeDualMesh',
  ScaleElements = 'GeometryNodeScaleElements',
  SetMaterialNodes = 'GeometryNodeSetMaterial',
  
  // Mesh Primitives
  Cube = 'GeometryNodeMeshCube',
  Cylinder = 'GeometryNodeMeshCylinder',
  Cone = 'GeometryNodeMeshCone',
  Sphere = 'GeometryNodeMeshUVSphere',
  Icosphere = 'GeometryNodeMeshIcoSphere',
  Torus = 'GeometryNodeMeshTorus',
  Plane = 'GeometryNodeMeshPlane',
  Circle = 'GeometryNodeMeshCircle',
  Grid = 'GeometryNodeGrid',
  Monkey = 'GeometryNodeMeshMonkey',
  
  // Modifier Nodes
  ArrayModifier = 'GeometryNodeArrayModifier',
  BevelModifier = 'GeometryNodeBevelModifier',
  BooleanModifier = 'GeometryNodeBooleanModifier',
  BuildModifier = 'GeometryNodeBuildModifier',
  DecimateModifier = 'GeometryNodeDecimateModifier',
  EdgeSplitModifier = 'GeometryNodeEdgeSplitModifier',
  MaskModifier = 'GeometryNodeMaskModifier',
  MirrorModifier = 'GeometryNodeMirrorModifier',
  RemeshModifier = 'GeometryNodeRemeshModifier',
  ScrewModifier = 'GeometryNodeScrewModifier',
  SkinModifier = 'GeometryNodeSkinModifier',
  SolidifyModifier = 'GeometryNodeSolidifyModifier',
  SubdivisionSurfaceModifier = 'GeometryNodeSubdivisionSurfaceModifier',
  WeldModifier = 'GeometryNodeWeldModifier',
  
  // Output Nodes
  GroupOutput = 'NodeGroupOutput',
  MaterialOutput = 'ShaderNodeOutputMaterial',
  WorldOutput = 'ShaderNodeOutputWorld',
  CompositeOutput = 'CompositorNodeComposite',
  Viewer = 'CompositorNodeViewer',
  
  // Texture Nodes
  TextureCoordinate = 'ShaderNodeTexCoord',
  Mapping = 'ShaderNodeMapping',
  ImageTexture = 'ShaderNodeTexImage',
  VoronoiTexture = 'ShaderNodeTexVoronoi',
  NoiseTexture = 'ShaderNodeTexNoise',
  GradientTexture = 'ShaderNodeTexGradient',
  MagicTexture = 'ShaderNodeTexMagic',
  WaveTexture = 'ShaderNodeTexWave',
  BrickTexture = 'ShaderNodeTexBrick',
  CheckerTexture = 'ShaderNodeTexChecker',
  PointDensity = 'ShaderNodePointDensity',
  WhiteNoiseTexture = 'ShaderNodeTexWhiteNoise',
  MusgraveTexture = 'ShaderNodeTexMusgrave',
  SkyTexture = 'ShaderNodeTexSky',
  EnvironmentTexture = 'ShaderNodeTexEnvironment',
  
  // Converter Nodes
  ValToRGB = 'ShaderNodeValToRGB',
  RGBToBW = 'ShaderNodeRGBToBW',
  MapRange = 'ShaderNodeMapRange',
  Math = 'ShaderNodeMath',
  VectorMath = 'ShaderNodeVectorMath',
  FloatCurve = 'ShaderNodeFloatCurve',
  Clamp = 'ShaderNodeClamp',
  CombineXYZ = 'ShaderNodeCombineXYZ',
  SeparateXYZ = 'ShaderNodeSeparateXYZ',
  CombineRGBA = 'ShaderNodeCombineRGBA',
  SeparateRGBA = 'ShaderNodeSeparateRGBA',
  // CombineHSV already defined in Color Nodes section
  SeparateHSV = 'ShaderNodeSeparateHSV',
  // ColorRamp already defined as ValToRGB alias in Color Nodes section
  
  // Vector Nodes
  Normal = 'ShaderNodeNormal',
  NormalMap = 'ShaderNodeNormalMap',
  Tangent = 'ShaderNodeTangent',
  VectorRotate = 'ShaderNodeVectorRotate',
  VectorTransform = 'ShaderNodeVectorTransform',
  
  // Shader Nodes
  DiffuseBSDF = 'ShaderNodeBsdfDiffuse',
  GlossyBSDF = 'ShaderNodeBsdfGlossy',
  GlassBSDF = 'ShaderNodeBsdfGlass',
  TransparentBSDF = 'ShaderNodeBsdfTransparent',
  RefractionBSDF = 'ShaderNodeBsdfRefraction',
  Emission = 'ShaderNodeEmission',
  HairBSDF = 'ShaderNodeBsdfHair',
  Holdout = 'ShaderNodeHoldout',
  VolumeAbsorption = 'ShaderNodeVolumeAbsorption',
  VolumeScatter = 'ShaderNodeVolumeScatter',
  PrincipledBSDF = 'ShaderNodeBsdfPrincipled',
  SheenBSDF = 'ShaderNodeBsdfSheen',
  VelvetBSDF = 'ShaderNodeBsdfVelvet',
  LayerWeight = 'ShaderNodeLayerWeight',
  HairInfo = 'ShaderNodeHairInfo',
  Wireframe = 'ShaderNodeWireframe',
  ShaderObjectInfo = 'ShaderNodeObjectInfo',
  ParticleInfo = 'ShaderNodeParticleInfo',
  AddShader = 'ShaderNodeAddShader',
  MixShader = 'ShaderNodeMixShader',
  
  // Simulate Nodes
  SimulateInput = 'GeometryNodeSimulateInput',
  RepeatZone = 'GeometryNodeRepeatZone',
  RepeatOutput = 'GeometryNodeRepeatOutput',
  WhileLoop = 'GeometryNodeWhileLoop',
  
  // Text Nodes
  StringJoin = 'GeometryNodeStringJoin',
  StringLength = 'GeometryNodeStringLength',
  StringSlice = 'GeometryNodeStringSlice',
  ValueToString = 'GeometryNodeValueToString',
  FontString = 'GeometryNodeFontString',
  
  // Utility Nodes
  Compare = 'FunctionNodeCompare',
  Switch = 'GeometryNodeSwitch',
  ForEachElementBegin = 'GeometryNodeForEachElementBegin',
  ForEachElementEnd = 'GeometryNodeForEachElementEnd',
}

/**
 * Socket definition for node inputs/outputs
 * Generic over the value type carried by the socket
 */
export interface NodeSocket<T = any> {
  name: string;
  type: SocketType | string;
  defaultValue?: T;
  default?: T;
  value?: T;
  min?: number;
  max?: number;
  required?: boolean;
  description?: string;
  [key: string]: any; // Allow additional properties for flexibility
}

/**
 * Node definition structure
 * Generic over the node data type
 */
export interface NodeDefinition<T = any> {
  name?: string;
  type: NodeType | string;
  category?: NodeCategory | string;
  label?: string;
  description?: string;
  inputs: NodeSocket[];
  outputs: NodeSocket[];
  properties?: Record<string, any>;
  params?: Record<string, any>;
  parameters?: any[];
  defaults?: Record<string, any>;
  defaultData?: T;
}

/**
 * Runtime node instance in a graph
 */
export interface NodeInstance {
  id: string;
  type: NodeType;
  name: string;
  position: { x: number; y: number };
  settings: Record<string, any>;
  inputs: Map<string, any>;
  outputs: Map<string, any>;
}

/**
 * Link between two nodes
 */
export interface NodeLink {
  fromNode: string;
  fromSocket: string;
  toNode: string;
  toSocket: string;
}

/**
 * Node group/socket interface
 */
export interface NodeGroupInterface {
  inputs: Map<string, NodeSocket>;
  outputs: Map<string, NodeSocket>;
}

/**
 * Base Node interface for typed node definitions
 * Used when defining specific node interfaces with typed sockets
 */
export interface Node {
  type: NodeType | string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  params?: Record<string, any>;
  settings?: Record<string, any>;
}

/**
 * Geometry type placeholder - represents geometry data in the node system
 */
export type GeometryType = any;

/**
 * Node group definition
 */
export interface NodeGroup {
  id: string;
  name: string;
  nodes: Map<string, NodeInstance>;
  links: NodeLink[];
  interface: NodeGroupInterface;
}

/**
 * Complete node tree (material or geometry)
 */
export interface NodeTree {
  id: string;
  name: string;
  type: 'GeometryNodeTree' | 'ShaderNodeTree' | 'CompositorNodeTree';
  nodes: Map<string, NodeInstance>;
  links: NodeLink[];
  groups: Map<string, NodeGroup>;
  interface: NodeGroupInterface;
}

/**
 * Type guard for checking socket type compatibility
 */
export function areSocketsCompatible(source: SocketType, target: SocketType): boolean {
  if (source === target) return true;
  
  // Some implicit conversions allowed
  const compatiblePairs: [SocketType, SocketType][] = [
    [SocketType.FLOAT, SocketType.INTEGER],
    [SocketType.INTEGER, SocketType.FLOAT],
    [SocketType.MESH, SocketType.GEOMETRY],
    [SocketType.CURVE, SocketType.GEOMETRY],
    [SocketType.POINTS, SocketType.GEOMETRY],
    [SocketType.INSTANCE, SocketType.GEOMETRY],
  ];
  
  return compatiblePairs.some(([a, b]) => 
    (source === a && target === b) || (source === b && target === a)
  );
}

/**
 * Get default value for a socket type
 */
export function getDefaultValueForType(type: SocketType): any {
  switch (type) {
    case SocketType.GEOMETRY:
    case SocketType.MESH:
    case SocketType.CURVE:
    case SocketType.POINTS:
    case SocketType.INSTANCE:
    case SocketType.VOLUME:
      return null;
    case SocketType.VECTOR:
      return { x: 0, y: 0, z: 0 };
    case SocketType.COLOR:
      return { r: 0, g: 0, b: 0, a: 1 };
    case SocketType.FLOAT:
      return 0;
    case SocketType.INTEGER:
      return 0;
    case SocketType.BOOLEAN:
      return false;
    case SocketType.STRING:
      return '';
    case SocketType.TEXTURE:
    case SocketType.MATERIAL:
    case SocketType.OBJECT:
    case SocketType.COLLECTION:
      return null;
    default:
      return null;
  }
}
