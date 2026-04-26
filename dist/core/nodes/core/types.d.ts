/**
 * Node System - Core Types and Interfaces
 *
 * Ports: infinigen/core/nodes/node_info.py
 *
 * Defines the type system for Blender-style node graphs in TypeScript.
 * This enables procedural material and geometry generation similar to the original Infinigen.
 */
/**
 * Socket types supported by the node system
 */
export declare enum SocketType {
    GEOMETRY = "GEOMETRY",
    VECTOR = "VECTOR",
    COLOR = "COLOR",
    FLOAT = "FLOAT",
    INTEGER = "INTEGER",
    BOOLEAN = "BOOLEAN",
    STRING = "STRING",
    TEXTURE = "TEXTURE",
    MATERIAL = "MATERIAL",
    OBJECT = "OBJECT",
    COLLECTION = "COLLECTION",
    CURVE = "CURVE",
    MESH = "MESH",
    POINTS = "POINTS",
    INSTANCE = "INSTANCE",
    VOLUME = "VOLUME"
}
/**
 * Node categories organized by Blender's Shift-A menu structure
 */
export declare enum NodeCategory {
    ATTRIBUTE = "ATTRIBUTE",
    CURVE = "CURVE",
    CURVE_PRIMITIVES = "CURVE_PRIMITIVES",
    GEOMETRY = "GEOMETRY",
    INPUT = "INPUT",
    INSTANCES = "INSTANCES",
    MATERIAL = "MATERIAL",
    MESH = "MESH",
    MESH_PRIMITIVES = "MESH_PRIMITIVES",
    MODIFIERS = "MODIFIERS",
    OUTPUT = "OUTPUT",
    SIMULATE = "SIMULATE",
    TEXT = "TEXT",
    TEXTURE = "TEXTURE",
    TRANSFORM = "TRANSFORM",
    UTILITY = "UTILITY",
    SHADER_INPUT = "SHADER_INPUT",
    SHADER_OUTPUT = "SHADER_OUTPUT",
    SHADER = "SHADER",
    TEXTURE = "TEXTURE_SHADER",
    COLOR = "COLOR",
    CONVERTER = "CONVERTER",
    VECTOR = "VECTOR_SHADER",
    COMPOSIT_INPUT = "COMPOSIT_INPUT",
    COMPOSIT_OUTPUT = "COMPOSIT_OUTPUT",
    COMPOSIT_FILTER = "COMPOSIT_FILTER",
    COMPOSIT_COLOR = "COMPOSIT_COLOR"
}
/**
 * Node type definitions - maps to Blender node identifiers
 */
export declare enum NodeType {
    Mix = "ShaderNodeMix",
    Attribute = "ShaderNodeAttribute",
    CaptureAttribute = "GeometryNodeCaptureAttribute",
    AttributeStatistic = "GeometryNodeAttributeStatistic",
    TransferAttribute = "GeometryNodeAttributeTransfer",
    DomainSize = "GeometryNodeAttributeDomainSize",
    StoreNamedAttribute = "GeometryNodeStoreNamedAttribute",
    NamedAttribute = "GeometryNodeInputNamedAttribute",
    SampleIndex = "GeometryNodeSampleIndex",
    SampleNearest = "GeometryNodeSampleNearest",
    SampleNearestSurface = "GeometryNodeSampleNearestSurface",
    ColorRamp = "ShaderNodeValToRGB",
    MixRGB = "ShaderNodeMixRGB",
    RGBCurve = "ShaderNodeRGBCurve",
    BrightContrast = "CompositorNodeBrightContrast",
    Exposure = "CompositorNodeExposure",
    CombineHSV = "ShaderNodeCombineHSV",
    SeparateRGB = "ShaderNodeSeparateRGB",
    SeparateColor = "ShaderNodeSeparateColor",
    CombineRGB = "ShaderNodeCombineRGB",
    CombineColor = "ShaderNodeCombineColor",
    FunctionCombineColor = "FunctionNodeCombineColor",
    CurveToMesh = "GeometryNodeCurveToMesh",
    CurveToPoints = "GeometryNodeCurveToPoints",
    MeshToCurve = "GeometryNodeMeshToCurve",
    SampleCurve = "GeometryNodeSampleCurve",
    SetCurveRadius = "GeometryNodeSetCurveRadius",
    SetCurveTilt = "GeometryNodeSetCurveTilt",
    CurveLength = "GeometryNodeCurveLength",
    CurveSplineType = "GeometryNodeCurveSplineType",
    SetHandlePositions = "GeometryNodeSetCurveHandlePositions",
    SubdivideCurve = "GeometryNodeSubdivideCurve",
    ResampleCurve = "GeometryNodeResampleCurve",
    TrimCurve = "GeometryNodeTrimCurve",
    ReverseCurve = "GeometryNodeReverseCurve",
    FillCurve = "GeometryNodeFillCurve",
    FilletCurve = "GeometryNodeFilletCurve",
    CurveCircle = "GeometryNodeCurvePrimitiveCircle",
    CurveLine = "GeometryNodeCurvePrimitiveLine",
    CurveBezierSegment = "GeometryNodeCurvePrimitiveBezierSegment",
    QuadraticBezier = "GeometryNodeCurveQuadraticBezier",
    SetPosition = "GeometryNodeSetPosition",
    JoinGeometry = "GeometryNodeJoinGeometry",
    MergeByDistance = "GeometryNodeMergeByDistance",
    SeparateGeometry = "GeometryNodeSeparateGeometry",
    BoundingBox = "GeometryNodeBoundBox",
    Transform = "GeometryNodeTransform",
    DeleteGeometry = "GeometryNodeDeleteGeometry",
    Proximity = "GeometryNodeProximity",
    ConvexHull = "GeometryNodeConvexHull",
    Raycast = "GeometryNodeRaycast",
    DuplicateElements = "GeometryNodeDuplicateElements",
    Triangulate = "GeometryNodeTriangulate",
    GroupInput = "NodeGroupInput",
    RGB = "ShaderNodeRGB",
    Boolean = "FunctionNodeInputBool",
    Value = "ShaderNodeValue",
    RandomValue = "FunctionNodeRandomValue",
    CollectionInfo = "GeometryNodeCollectionInfo",
    ObjectInfo = "GeometryNodeObjectInfo",
    Vector = "FunctionNodeInputVector",
    InputID = "GeometryNodeInputID",
    InputPosition = "GeometryNodeInputPosition",
    InputNormal = "GeometryNodeInputNormal",
    InputEdgeVertices = "GeometryNodeInputMeshEdgeVertices",
    InputEdgeAngle = "GeometryNodeInputMeshEdgeAngle",
    InputColor = "FunctionNodeInputColor",
    InputMeshFaceArea = "GeometryNodeInputMeshFaceArea",
    TextureCoord = "ShaderNodeTexCoord",
    Index = "GeometryNodeInputIndex",
    AmbientOcclusion = "ShaderNodeAmbientOcclusion",
    Integer = "FunctionNodeInputInt",
    LightPath = "ShaderNodeLightPath",
    RealizeInstances = "GeometryNodeRealizeInstances",
    InstanceOnPoints = "GeometryNodeInstanceOnPoints",
    TranslateInstances = "GeometryNodeTranslateInstances",
    RotateInstances = "GeometryNodeRotateInstances",
    ScaleInstances = "GeometryNodeScaleInstances",
    SetMaterial = "GeometryNodeSetMaterial",
    SetMaterialIndex = "GeometryNodeSetMaterialIndex",
    MaterialIndex = "GeometryNodeInputMaterialIndex",
    SubdivideMesh = "GeometryNodeSubdivideMesh",
    SetShadeSmooth = "GeometryNodeSetShadeSmooth",
    SplitEdges = "GeometryNodeSplitEdges",
    ExtrudeMesh = "GeometryNodeExtrudeMesh",
    ExtrudeMeshFace = "GeometryNodeExtrudeMeshFace",
    OffsetFace = "GeometryNodeOffsetFace",
    MeshBoolean = "GeometryNodeMeshBoolean",
    MeshToPoints = "GeometryNodeMeshToPoints",
    DualMesh = "GeometryNodeDualMesh",
    ScaleElements = "GeometryNodeScaleElements",
    SetMaterialNodes = "GeometryNodeSetMaterial",
    Cube = "GeometryNodeMeshCube",
    Cylinder = "GeometryNodeMeshCylinder",
    Cone = "GeometryNodeMeshCone",
    Sphere = "GeometryNodeMeshUVSphere",
    Icosphere = "GeometryNodeMeshIcoSphere",
    Torus = "GeometryNodeMeshTorus",
    Plane = "GeometryNodeMeshPlane",
    Circle = "GeometryNodeMeshCircle",
    Grid = "GeometryNodeGrid",
    Monkey = "GeometryNodeMeshMonkey",
    ArrayModifier = "GeometryNodeArrayModifier",
    BevelModifier = "GeometryNodeBevelModifier",
    BooleanModifier = "GeometryNodeBooleanModifier",
    BuildModifier = "GeometryNodeBuildModifier",
    DecimateModifier = "GeometryNodeDecimateModifier",
    EdgeSplitModifier = "GeometryNodeEdgeSplitModifier",
    MaskModifier = "GeometryNodeMaskModifier",
    MirrorModifier = "GeometryNodeMirrorModifier",
    RemeshModifier = "GeometryNodeRemeshModifier",
    ScrewModifier = "GeometryNodeScrewModifier",
    SkinModifier = "GeometryNodeSkinModifier",
    SolidifyModifier = "GeometryNodeSolidifyModifier",
    SubdivisionSurfaceModifier = "GeometryNodeSubdivisionSurfaceModifier",
    WeldModifier = "GeometryNodeWeldModifier",
    GroupOutput = "NodeGroupOutput",
    MaterialOutput = "ShaderNodeOutputMaterial",
    WorldOutput = "ShaderNodeOutputWorld",
    CompositeOutput = "CompositorNodeComposite",
    Viewer = "CompositorNodeViewer",
    TextureCoordinate = "ShaderNodeTexCoord",
    Mapping = "ShaderNodeMapping",
    ImageTexture = "ShaderNodeTexImage",
    VoronoiTexture = "ShaderNodeTexVoronoi",
    NoiseTexture = "ShaderNodeTexNoise",
    GradientTexture = "ShaderNodeTexGradient",
    MagicTexture = "ShaderNodeTexMagic",
    WaveTexture = "ShaderNodeTexWave",
    BrickTexture = "ShaderNodeTexBrick",
    CheckerTexture = "ShaderNodeTexChecker",
    PointDensity = "ShaderNodePointDensity",
    WhiteNoiseTexture = "ShaderNodeTexWhiteNoise",
    MusgraveTexture = "ShaderNodeTexMusgrave",
    SkyTexture = "ShaderNodeTexSky",
    EnvironmentTexture = "ShaderNodeTexEnvironment",
    ValToRGB = "ShaderNodeValToRGB",
    RGBToBW = "ShaderNodeRGBToBW",
    MapRange = "ShaderNodeMapRange",
    Math = "ShaderNodeMath",
    VectorMath = "ShaderNodeVectorMath",
    FloatCurve = "ShaderNodeFloatCurve",
    Clamp = "ShaderNodeClamp",
    CombineXYZ = "ShaderNodeCombineXYZ",
    SeparateXYZ = "ShaderNodeSeparateXYZ",
    CombineRGBA = "ShaderNodeCombineRGBA",
    SeparateRGBA = "ShaderNodeSeparateRGBA",
    CombineHSV = "ShaderNodeCombineHSV",
    SeparateHSV = "ShaderNodeSeparateHSV",
    ColorRamp = "ShaderNodeValToRGB",
    Normal = "ShaderNodeNormal",
    NormalMap = "ShaderNodeNormalMap",
    Tangent = "ShaderNodeTangent",
    VectorRotate = "ShaderNodeVectorRotate",
    VectorTransform = "ShaderNodeVectorTransform",
    DiffuseBSDF = "ShaderNodeBsdfDiffuse",
    GlossyBSDF = "ShaderNodeBsdfGlossy",
    GlassBSDF = "ShaderNodeBsdfGlass",
    TransparentBSDF = "ShaderNodeBsdfTransparent",
    RefractionBSDF = "ShaderNodeBsdfRefraction",
    Emission = "ShaderNodeEmission",
    HairBSDF = "ShaderNodeBsdfHair",
    Holdout = "ShaderNodeHoldout",
    VolumeAbsorption = "ShaderNodeVolumeAbsorption",
    VolumeScatter = "ShaderNodeVolumeScatter",
    PrincipledBSDF = "ShaderNodeBsdfPrincipled",
    SheenBSDF = "ShaderNodeBsdfSheen",
    VelvetBSDF = "ShaderNodeBsdfVelvet",
    LayerWeight = "ShaderNodeLayerWeight",
    HairInfo = "ShaderNodeHairInfo",
    Wireframe = "ShaderNodeWireframe",
    ObjectInfo = "ShaderNodeObjectInfo",
    ParticleInfo = "ShaderNodeParticleInfo",
    AddShader = "ShaderNodeAddShader",
    MixShader = "ShaderNodeMixShader",
    SimulateInput = "GeometryNodeSimulateInput",
    RepeatZone = "GeometryNodeRepeatZone",
    RepeatOutput = "GeometryNodeRepeatOutput",
    WhileLoop = "GeometryNodeWhileLoop",
    StringJoin = "GeometryNodeStringJoin",
    StringLength = "GeometryNodeStringLength",
    StringSlice = "GeometryNodeStringSlice",
    ValueToString = "GeometryNodeValueToString",
    FontString = "GeometryNodeFontString",
    Compare = "FunctionNodeCompare",
    Switch = "GeometryNodeSwitch",
    ForEachElementBegin = "GeometryNodeForEachElementBegin",
    ForEachElementEnd = "GeometryNodeForEachElementEnd"
}
/**
 * Socket definition for node inputs/outputs
 */
export interface NodeSocket {
    name: string;
    type: SocketType;
    defaultValue?: any;
    min?: number;
    max?: number;
    required?: boolean;
}
/**
 * Node definition structure
 */
export interface NodeDefinition {
    type: NodeType;
    category: NodeCategory;
    inputs: NodeSocket[];
    outputs: NodeSocket[];
    properties?: Record<string, any>;
}
/**
 * Runtime node instance in a graph
 */
export interface NodeInstance {
    id: string;
    type: NodeType;
    name: string;
    position: {
        x: number;
        y: number;
    };
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
export declare function areSocketsCompatible(source: SocketType, target: SocketType): boolean;
/**
 * Get default value for a socket type
 */
export declare function getDefaultValueForType(type: SocketType): any;
//# sourceMappingURL=types.d.ts.map