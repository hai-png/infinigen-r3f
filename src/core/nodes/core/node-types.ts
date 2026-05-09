/**
 * @deprecated Use `CanonicalNodeType` from './NodeTypeRegistry' for new code.
 * This enum is kept for backward compatibility. New code should use canonical
 * Blender-style identifiers (e.g., 'ShaderNodeTexNoise' instead of 'TextureNoiseNode').
 * 
 * Migration: Replace `NodeTypes.Foo` with the canonical string from NodeTypeRegistry.
 * Example: NodeTypes.TextureNoise → 'ShaderNodeTexNoise' (import { CanonicalNodeType } from './NodeTypeRegistry')
 */

/**
 * Node Info - TypeScript equivalent of Blender node types
 * Based on infinigen/core/nodes/node_info.py
 * 
 * This enum maps to Three.js node types and shader node equivalents
 */

export enum NodeTypes {
  // Mix
  Mix = 'MixNode',

  // Attribute
  Attribute = 'AttributeNode',
  CaptureAttribute = 'CaptureAttributeNode',
  AttributeStatistic = 'AttributeStatisticNode',
  TransferAttribute = 'TransferAttributeNode',
  DomainSize = 'DomainSizeNode',
  StoreNamedAttribute = 'StoreNamedAttributeNode',
  NamedAttribute = 'NamedAttributeNode',
  RemoveAttribute = 'RemoveAttributeNode',
  SampleIndex = 'SampleIndexNode',
  SampleNearest = 'SampleNearestNode',
  SampleNearestSurface = 'SampleNearestSurfaceNode',

  // Color
  ColorRamp = 'ColorRampNode',
  MixRGB = 'MixRGBNode',
  RGBCurve = 'RGBCurveNode',
  BrightContrast = 'BrightContrastNode',
  Exposure = 'ExposureNode',
  CombineHSV = 'CombineHSVNode',
  SeparateRGB = 'SeparateRGBNode',
  SeparateColor = 'SeparateColorNode',
  CompSeparateColor = 'CompositorNodeSeparateColor',
  CombineRGB = 'CombineRGBNode',
  CombineColor = 'CombineColorNode',
  FunctionCombineColor = 'FunctionNodeCombineColor',
  CompCombineColor = 'CompositorNodeCombineColor',

  // Curve
  CurveToMesh = 'CurveToMeshNode',
  CurveToPoints = 'CurveToPointsNode',
  MeshToCurve = 'MeshToCurveNode',
  SampleCurve = 'SampleCurveNode',
  SetCurveRadius = 'SetCurveRadiusNode',
  SetCurveTilt = 'SetCurveTiltNode',
  CurveLength = 'CurveLengthNode',
  CurveSplineType = 'CurveSplineTypeNode',
  SetHandlePositions = 'SetHandlePositionsNode',
  SetHandleType = 'GeometryNodeCurveSetHandles',
  CurveTangent = 'GeometryNodeInputTangent',
  SplineParameter = 'SplineParameterNode',
  SplineType = 'GeometryNodeCurveSplineType',
  SubdivideCurve = 'SubdivideCurveNode',
  ResampleCurve = 'ResampleCurveNode',
  TrimCurve = 'TrimCurveNode',
  ReverseCurve = 'ReverseCurveNode',
  SplineLength = 'GeometryNodeSplineLength',
  FillCurve = 'FillCurveNode',
  FilletCurve = 'FilletCurveNode',

  // Curve Primitives
  QuadraticBezier = 'QuadraticBezierNode',
  CurveCircle = 'CurveCircleNode',
  CurveLine = 'CurveLineNode',
  CurveBezierSegment = 'CurveBezierSegmentNode',
  BezierSegment = 'GeometryNodeCurvePrimitiveBezierSegment',

  // Geometry
  SetPosition = 'SetPositionNode',
  JoinGeometry = 'JoinGeometryNode',
  MergeByDistance = 'MergeByDistanceNode',
  SeparateGeometry = 'SeparateGeometryNode',
  BoundingBox = 'BoundingBoxNode',
  Transform = 'TransformNode',
  DeleteGeometry = 'DeleteGeometryNode',
  Proximity = 'ProximityNode',
  ConvexHull = 'ConvexHullNode',
  Raycast = 'RaycastNode',
  DuplicateElements = 'DuplicateElementsNode',
  Triangulate = 'TriangulateNode',

  // Input
  GroupInput = 'GroupInputNode',
  RGB = 'RGBNode',
  Boolean = 'BooleanNode',
  Value = 'ValueNode',
  RandomValue = 'RandomValueNode',
  CollectionInfo = 'CollectionInfoNode',
  ObjectInfo = 'ObjectInfoNode',
  ObjectInfo_Shader = 'ShaderNodeObjectInfo',
  Vector = 'VectorNode',
  InputID = 'InputIDNode',
  InputPosition = 'InputPositionNode',
  InputNormal = 'InputNormalNode',
  InputEdgeVertices = 'InputEdgeVerticesNode',
  InputEdgeAngle = 'InputEdgeAngleNode',
  InputColor = 'InputColorNode',
  InputMeshFaceArea = 'InputMeshFaceAreaNode',
  TextureCoord = 'TextureCoordNode',
  Index = 'IndexNode',
  AmbientOcclusion = 'AmbientOcclusionNode',
  Integer = 'IntegerNode',
  ShortestEdgePath = 'GeometryNodeInputShortestEdgePaths',
  ShaderNodeNormalMap = 'ShaderNodeNormalMap',
  HueSaturationValue = 'HueSaturationNode',
  BlackBody = 'BlackBodyNode',

  // Instances
  RealizeInstances = 'RealizeInstancesNode',
  InstanceOnPoints = 'InstanceOnPointsNode',
  TranslateInstances = 'TranslateInstancesNode',
  RotateInstances = 'RotateInstancesNode',
  ScaleInstances = 'ScaleInstancesNode',

  // Material
  SetMaterial = 'SetMaterialNode',
  SetMaterialIndex = 'SetMaterialIndexNode',
  MaterialIndex = 'MaterialIndexNode',

  // Mesh
  SubdivideMesh = 'SubdivideMeshNode',
  MeshToVolume = 'MeshToVolumeNode',
  MeshToPoints = 'MeshToPointsNode',
  MeshBoolean = 'GeometryNodeMeshBoolean',
  SetMeshNormals = 'SetMeshNormalsNode',
  DualMesh = 'DualMeshNode',
  ScaleElements = 'GeometryNodeScaleElements',
  IcoSphere = 'GeometryNodeMeshIcoSphere',
  ExtrudeMesh = 'ExtrudeMeshNode',
  ExtrudeMeshAlongNormal = 'ExtrudeMeshAlongNormalNode',
  OffsetMesh = 'OffsetMeshNode',
  FlipFaces = 'FlipFacesNode',
  FaceArea = 'FaceAreaNode',
  FaceNeighbors = 'GeometryNodeInputMeshFaceNeighbors',
  EdgePathToCurve = 'GeometryNodeEdgePathsToCurves',
  DeleteGeom = 'GeometryNodeDeleteGeometry',
  SplitEdges = 'GeometryNodeSplitEdges',
  VertexNeighbors = 'GeometryNodeInputMeshVertexNeighbors',
  EdgesOfVertex = 'EdgesOfVertexNode',
  VerticesOfEdge = 'VerticesOfEdgeNode',
  VerticesOfFace = 'VerticesOfFaceNode',
  EdgesOfFace = 'EdgesOfFaceNode',
  FacesOfEdge = 'FacesOfEdgeNode',
  FacesOfVertex = 'FacesOfVertexNode',
  EdgeAngle = 'EdgeAngleNode',
  EdgeVertices = 'EdgeVerticesNode',
  FaceCorners = 'FaceCornersNode',
  NamedCorner = 'NamedCornerNode',
  CornerNormal = 'CornerNormalNode',
  CornerAngle = 'CornerAngleNode',
  CornerVertexIndex = 'CornerVertexIndexNode',
  CornerEdgeIndex = 'CornerEdgeIndexNode',
  CornerFaceIndex = 'CornerFaceIndexNode',
  UVMap = 'UVMapNode',
  UVWarp = 'UVWarpNode',
  SetUV = 'SetUVNode',
  // StoreNamedAttribute already defined in Attribute section
  // SetMaterial already defined in Material section

  // Point
  DistributePointsInVolume = 'DistributePointsInVolumeNode',
  DistributePointsOnFaces = 'DistributePointsOnFacesNode',
  PointsToCurves = 'PointsToCurvesNode',
  PointsToVolumes = 'PointsToVolumesNode',
  PointsToVertices = 'PointsToVerticesNode',
  SetPointRadius = 'GeometryNodeSetPointRadius',
  Points = 'PointsNode',
  PointDomain = 'PointDomainNode',
  PointDomainSize = 'PointDomainSizeNode',
  PointIndex = 'PointIndexNode',
  PointPosition = 'PointPositionNode',
  PointVelocity = 'PointVelocityNode',
  PointRotation = 'PointRotationNode',
  PointScale = 'PointScaleNode',
  PointCount = 'PointCountNode',
  PointMaterialIndex = 'PointMaterialIndexNode',
  PointNamedAttribute = 'PointNamedAttributeNode',
  PointCaptureAttribute = 'PointCaptureAttributeNode',
  PointTransferAttribute = 'PointTransferAttributeNode',
  PointStoreNamedAttribute = 'PointStoreNamedAttributeNode',
  PointSampleIndex = 'PointSampleIndexNode',
  PointSampleNearest = 'PointSampleNearestNode',
  PointSampleNearestSurface = 'PointSampleNearestSurfaceNode',
  PointAttributeStatistic = 'PointAttributeStatisticNode',
  PointBlurAttribute = 'PointBlurAttributeNode',
  PointAccumulateAttribute = 'PointAccumulateAttributeNode',
  PointEvaluateonDomain = 'PointEvaluateonDomainNode',
  PointInterpolateCurves = 'PointInterpolateCurvesNode',
  PointSampleUVSurface = 'PointSampleUVSurfaceNode',
  PointIsViewport = 'PointIsViewportNode',
  PointImageInfo = 'PointImageInfoNode',
  PointCurveofPoint = 'PointCurveofPointNode',
  PointCurvesInfo = 'PointCurvesInfoNode',
  PointRadius = 'PointRadiusNode',
  PointEndpointSelection = 'PointEndpointSelectionNode',
  PointsofCurve = 'PointsofCurveNode',
  PointSplineResolution = 'PointSplineResolutionNode',
  PointOffsetPointinCurve = 'PointOffsetPointinCurveNode',
  PointSplineType = 'PointSplineTypeNode',
  PointSplineLength = 'PointSplineLengthNode',
  PointCurveTangent = 'PointCurveTangentNode',

  // Volume
  VolumeToMesh = 'VolumeToMeshNode',
  VolumeToPoints = 'VolumeToPointsNode',
  VolumeToCurve = 'VolumeToCurveNode',
  VolumeSample = 'VolumeSampleNode',
  VolumeValue = 'VolumeValueNode',
  VolumeDensity = 'VolumeDensityNode',
  VolumeEmission = 'VolumeEmissionNode',
  VolumeAbsorption = 'VolumeAbsorptionNode',
  VolumeScattering = 'VolumeScatteringNode',
  VolumePrincipled = 'VolumePrincipledNode',
  VolumeInfo = 'VolumeInfoNode',
  VolumeMaterialIndex = 'VolumeMaterialIndexNode',
  VolumeNamedAttribute = 'VolumeNamedAttributeNode',
  VolumeCaptureAttribute = 'VolumeCaptureAttributeNode',
  VolumeTransferAttribute = 'VolumeTransferAttributeNode',
  VolumeStoreNamedAttribute = 'VolumeStoreNamedAttributeNode',
  VolumeSampleIndex = 'VolumeSampleIndexNode',
  VolumeSampleNearest = 'VolumeSampleNearestNode',
  VolumeSampleNearestSurface = 'VolumeSampleNearestSurfaceNode',
  VolumeAttributeStatistic = 'VolumeAttributeStatisticNode',
  VolumeBlurAttribute = 'VolumeBlurAttributeNode',
  VolumeAccumulateAttribute = 'VolumeAccumulateAttributeNode',
  VolumeEvaluateonDomain = 'VolumeEvaluateonDomainNode',

  // Texture
  TextureBrick = 'TextureBrickNode',
  TextureChecker = 'TextureCheckerNode',
  TextureGradient = 'TextureGradientNode',
  TextureMagic = 'TextureMagicNode',
  TextureNoise = 'TextureNoiseNode',
  TextureVoronoi = 'TextureVoronoiNode',
  TextureWave = 'TextureWaveNode',
  TextureWhiteNoise = 'TextureWhiteNoiseNode',
  TextureMusgrave = 'TextureMusgraveNode',
  TextureGabor = 'TextureGaborNode',
  ImageTexture = 'GeometryNodeImageTexture',
  GradientTexture = 'ShaderNodeTexGradient',
  ShaderImageTexture = 'ShaderNodeTexImage',
  EnvironmentTexture = 'ShaderNodeTexEnvironment',

  // Vector
  VectorMath = 'VectorMathNode',
  VectorRotate = 'VectorRotateNode',
  VectorTransform = 'VectorTransformNode',
  NormalMap = 'NormalMapNode',
  Normal = 'NormalNode',
  Tangent = 'TangentNode',
  TrueNormal = 'TrueNormalNode',
  Geometry = 'GeometryNode',
  HairInfo = 'HairInfoNode',
  ParticleInfo = 'ParticleInfoNode',
  Wireframe = 'WireframeNode',
  Wavelength = 'WavelengthNode',
  LightPath = 'ShaderNodeLightPath',
  ShaderObjectInfo = 'ShaderObjectInfoNode',
  ParticleInfo_Shader = 'ParticleInfoShaderNode',
  LayerWeight = 'LayerWeightNode',
  UVMap_Shader = 'UVMapShaderNode',
  TextureCoord_Shader = 'TextureCoordShaderNode',
  Bevel = 'BevelNode',
  CameraData = 'CameraDataNode',
  NewGeometry = 'NewGeometryNode',
  JoinGeometry_Shader = 'JoinGeometryShaderNode',
  MeshInfo = 'MeshInfoNode',
  MaterialInfo = 'MaterialInfoNode',
  Value_Shader = 'ValueShaderNode',
  TexCoord = 'TexCoordNode',
  ObjectIndex = 'ObjectIndexNode',
  MaterialIndex_Shader = 'MaterialIndexShaderNode',
  RandomPerIsland = 'RandomPerIslandNode',
  IsCameraRay = 'IsCameraRayNode',
  IsShadowRay = 'IsShadowRayNode',
  IsDiffuseRay = 'IsDiffuseRayNode',
  IsGlossyRay = 'IsGlossyRayNode',
  IsTransmissionRay = 'IsTransmissionRayNode',
  IsVolumeRay = 'IsVolumeRayNode',
  IsReflectionRay = 'IsReflectionRayNode',
  IsRefractionRay = 'IsRefractionRayNode',
  RayDepth = 'RayDepthNode',
  RayLength = 'RayLengthNode',

  // Output
  GroupOutput = 'GroupOutputNode',
  MaterialOutput = 'MaterialOutputNode',
  LightOutput = 'ShaderNodeOutputLight',
  WorldOutput = 'ShaderNodeOutputWorld',
  Viewer = 'ViewerNode',
  Composite = 'CompositeNode',
  CompositorMixRGB = 'CompositorNodeMixRGB',
  ViewLevel = 'ViewLevelNode',
  SplitViewer = 'SplitViewerNode',
  DepthOutput = 'DepthOutputNode',
  NormalOutput = 'NormalOutputNode',
  AOOutput = 'AOOutputNode',
  EmissionOutput = 'EmissionOutputNode',
  AlbedoOutput = 'AlbedoOutputNode',
  DiffuseOutput = 'DiffuseOutputNode',
  GlossyOutput = 'GlossyOutputNode',
  TransmissionOutput = 'TransmissionOutputNode',
  VolumeOutput = 'VolumeOutputNode',
  ShadowOutput = 'ShadowOutputNode',
  CryptomatteOutput = 'CryptomatteOutputNode',
  CryptomatteMatteOutput = 'CryptomatteMatteOutputNode',
  FileOutput = 'FileOutputNode',
  ImageOutput = 'ImageOutputNode',
  MovieOutput = 'MovieOutputNode',
  SoundOutput = 'SoundOutputNode',
  LevelOfDetail = 'LevelOfDetailNode',
  RenderLayer = 'RenderLayerNode',
  UVOutput = 'UVOutputNode',
  InstanceOutput = 'InstanceOutputNode',
  PointCloudOutput = 'PointCloudOutputNode',
  TextOutput = 'TextOutputNode',
  BoundingBoxOutput = 'BoundingBoxOutputNode',
  WireframeOutput = 'WireframeOutputNode',
  DebugOutput = 'DebugOutputNode',

  // Light
  PointLight = 'PointLightNode',
  SpotLight = 'SpotLightNode',
  SunLight = 'SunLightNode',
  AreaLight = 'AreaLightNode',
  LightFalloff = 'LightFalloffNode',
  LightAttenuation = 'LightAttenuationNode',

  // Boolean
  BooleanUnion = 'BooleanUnionNode',
  BooleanIntersect = 'BooleanIntersectNode',
  BooleanDifference = 'BooleanDifferenceNode',

  // Extended Vector
  CombineXYZ = 'CombineXYZNode',
  SeparateXYZ = 'SeparateXYZNode',
  Normalize = 'NormalizeNode',
  Mapping = 'MappingNode',
  AlignEulerToVector = 'AlignEulerToVectorNode',
  RotateEuler = 'RotateEulerNode',
  Bump = 'BumpNode',
  Displacement = 'DisplacementNode',
  Quaternion = 'QuaternionNode',
  MatrixTransform = 'MatrixTransformNode',
  DirectionToPoint = 'DirectionToPointNode',
  Reflect = 'ReflectNode',
  Refract = 'RefractNode',
  FaceForward = 'FaceForwardNode',
  Wrap = 'WrapNode',
  Snap = 'SnapNode',
  FloorCeil = 'FloorCeilNode',
  Modulo = 'ModuloNode',
  Fraction = 'FractionNode',
  Absolute = 'AbsoluteNode',
  MinMax = 'MinMaxNode',
  Trigonometry = 'TrigonometryNode',
  PowerLog = 'PowerLogNode',
  Sign = 'SignNode',
  Compare = 'CompareNode',
  SmoothMinMax = 'SmoothMinMaxNode',
  AngleBetween = 'AngleBetweenNode',
  Slerp = 'SlerpNode',
  PolarToCart = 'PolarToCartNode',
  CartToPolar = 'CartToPolarNode',
  // Utility / Math
  Math = 'MathNode',
  MapRange = 'MapRangeNode',
  BooleanMath = 'BooleanMathNode',
  // Compare already defined in Extended Vector section
  FloatToInt = 'FunctionNodeFloatToInt',
  FieldAtIndex = 'GeometryNodeFieldAtIndex',
  AccumulateField = 'GeometryNodeAccumulateField',
  Clamp = 'ShaderNodeClamp',
  Switch = 'SwitchNode',
  FloatCurve = 'FloatCurveNode',
  SetShadeSmooth = 'SetShadeSmoothNode',

  // Mesh Primitives
  MeshCube = 'MeshCubeNode',
  MeshUVSphere = 'MeshUVSphereNode',
  MeshIcoSphere = 'MeshIcoSphereNode',
  MeshCircle = 'MeshCircleNode',
  MeshCylinder = 'MeshCylinderNode',
  MeshCone = 'MeshConeNode',
  MeshGrid = 'MeshGridNode',
  MeshLine = 'MeshLineNode',
  MeshTorus = 'MeshTorusNode',

  // Subdivision
  SubdivisionSurface = 'SubdivisionSurfaceNode',

  // Attribute input aliases
  PositionInput = InputPosition,
  NormalInput = InputNormal,
  TangentInput = Tangent,
  UVMapInput = UVMap,
  ColorInput = InputColor,
  RadiusInput = 'RadiusInputNode',
  IdInput = InputID,
  IndexInput = Index,

  // Shader nodes
  MixShader = 'ShaderNodeMixShader',
  DiffuseBSDF = 'ShaderNodeBsdfDiffuse',
  BSDF_PRINCIPLED = 'PrincipledBSDFNode',
  PrincipledBSDF = 'PrincipledBSDFNode',
  TranslucentBSDF = 'ShaderNodeBsdfTranslucent',
  TransparentBSDF = 'ShaderNodeBsdfTransparent',
  PrincipledVolume = 'ShaderNodeVolumePrincipled',
  PrincipledHairBSDF = 'ShaderNodeBsdfHairPrincipled',
  Emission = 'ShaderNodeEmission',
  Fresnel = 'ShaderNodeFresnel',
  RefractionBSDF = 'ShaderNodeBsdfRefraction',
  GlassBSDF = 'ShaderNodeBsdfGlass',
  GlossyBSDF = 'ShaderNodeBsdfGlossy',
  Invert = 'InvertNode',

  // World / Compositor
  SkyTexture = 'ShaderNodeTexSky',
  Background = 'ShaderNodeBackground',
  RenderLayers = 'CompositorNodeRLayers',
  LensDistortion = 'CompositorNodeLensdist',
  Glare = 'CompositorNodeGlare',

  // Layout
  Reroute = 'NodeReroute',

  // bl3.5+ Geometry additions
  SeparateComponents = 'GeometryNodeSeparateComponents',
  SetID = 'GeometryNodeSetID',
  InterpolateCurves = 'GeometryNodeInterpolateCurves',
  SampleUVSurface = 'GeometryNodeSampleUVSurface',
  MeshIsland = 'GeometryNodeInputMeshIsland',
  IsViewport = 'GeometryNodeIsViewport',
  ImageInfo = 'GeometryNodeImageInfo',
  CurveofPoint = 'GeometryNodeCurveOfPoint',
  CurvesInfo = 'ShaderNodeHairInfo',
  Radius = 'GeometryNodeInputRadius',
  EvaluateonDomain = 'GeometryNodeFieldOnDomain',
  BlurAttribute = 'GeometryNodeBlurAttribute',
  EndpointSelection = 'GeometryNodeCurveEndpointSelection',
  SetSplineResolution = 'GeometryNodeSetSplineResolution',
  OffsetPointinCurve = 'GeometryNodeOffsetPointInCurve',
  SplineResolution = 'GeometryNodeInputSplineResolution',

  // Shader aliases
  NoiseTexture = TextureNoise,
  VoronoiTexture = TextureVoronoi,
  MusgraveTexture = TextureMusgrave,

  // Output file alias (Python compat)
  OutputFile = 'CompositorNodeOutputFile',

  // Aliases - SCREAMING_SNAKE_CASE aliases for PascalCase members
  VECTOR_MATH = VectorMath,
  TEX_COORD = TexCoord,
  TEX_NOISE = TextureNoise,
  NORMAL_MAP = NormalMap,
  MAPPING = Mapping,
  LINE_OUTPUT = FileOutput,
  LOD_GROUP_OUTPUT = GroupOutput,
  LAYER_WEIGHT = LayerWeight,
  BUMP = Bump,
  COMPOSITE_OUTPUT = MovieOutput,
  AMBIENT_OCCLUSION_OUTPUT = AmbientOcclusion,
  COLOR_RAMP = ColorRamp,
  OUTPUT_NORMAL = NormalOutput,
  OUTPUT_COLOR = AlbedoOutput,
  OUTPUT_VECTOR = VectorMath,
  OUTPUT_MATERIAL = MaterialOutput,
  OUTPUT_VALUE = Value,

  // CamelCase aliases for referenced names
  CompositeOutput = MovieOutput,
  LODGroupOutput = GroupOutput,
  AmbientOcclusionOutput = AmbientOcclusion,
  LineOutput = FileOutput,
}

/**
 * NODE_ATTRS_AVAILABLE - documents what properties exist on each node type
 * that might need to be set but are NOT in .inputs.
 *
 * Ported from infinigen/core/nodes/node_info.py
 */
export const NODE_ATTRS_AVAILABLE: Record<string, string[]> = {
  'ShaderNodeMath': ['operation', 'use_clamp'],
  'ShaderNodeVectorMath': ['operation'],
  'FunctionNodeBooleanMath': ['operation'],
  'FunctionNodeCompare': ['mode', 'data_type', 'operation'],
  'ShaderNodeTexNoise': ['noise_dimensions'],
  'ShaderNodeTexMusgrave': ['musgrave_dimensions', 'musgrave_type'],
  'ShaderNodeTexVoronoi': ['voronoi_dimensions', 'feature', 'distance'],
  'ShaderNodeTexGradient': ['gradient_type'],
  'ShaderNodeRGB': ['color'],
  'ShaderNodeAttribute': ['attribute_name', 'attribute_type'],
  'GeometryNodeAttributeStatistic': ['domain', 'data_type'],
  'GeometryNodeCaptureAttribute': ['domain', 'data_type'],
  'ShaderNodeTexCoord': ['from_instancer'],
  'ShaderNodeBsdfPrincipled': ['distribution', 'subsurface_method'],
  'ShaderNodeMapping': ['vector_type'],
  'ShaderNodeMapRange': ['data_type', 'interpolation_type', 'clamp'],
  'ShaderNodeValToRGB': [],
  'ShaderNodeMixRGB': ['blend_type'],
  'ShaderNodeMix': ['data_type', 'blend_type', 'clamp_result', 'clamp_factor'],
  'GeometryNodeAccumulateField': ['data_type'],
  'ShaderNodeCombineColor': ['mode'],
  'ShaderNodeSeparateColor': ['mode'],
  'GeometryNodeDistributePointsOnFaces': ['distribute_method'],
  'GeometryNodeCollectionInfo': ['transform_space'],
  'FunctionNodeRandomValue': ['data_type'],
  'GeometryNodeSwitch': ['input_type'],
  'GeometryNodeAttributeTransfer': ['data_type', 'mapping'],
  'GeometryNodeSeparateGeometry': ['domain'],
  'GeometryNodeMergeByDistance': ['mode'],
  'FunctionNodeInputInt': ['integer'],
  'GeometryNodeMeshBoolean': ['operation'],
  'GeometryNodeMeshCircle': ['fill_type'],
  'GeometryNodeCurveSplineType': ['spline_type'],
  'GeometryNodeSetCurveHandlePositions': ['mode'],
  'GeometryNodeCurveSetHandles': ['handle_type', 'mode'],
  'GeometryNodeInputNamedAttribute': ['data_type'],
  'GeometryNodeStoreNamedAttribute': ['data_type', 'domain'],
  'GeometryNodeCurveToPoints': ['mode'],
  'GeometryNodeFillCurve': ['mode'],
  'GeometryNodeResampleCurve': ['mode'],
  'GeometryNodeTrimCurve': ['mode'],
  'GeometryNodeMeshLine': ['mode'],
  'GeometryNodeMeshToPoints': ['mode'],
  'GeometryNodeDeleteGeometry': ['mode'],
  'GeometryNodeProximity': ['target_element'],
  'GeometryNodeCurvePrimitiveCircle': ['mode'],
  'GeometryNodeSampleCurve': ['mode'],
  'GeometryNodeCurvePrimitiveBezierSegment': ['mode'],
  'GeometryNodeCurvePrimitiveLine': ['mode'],
  'GeometryNodeExtrudeMesh': ['mode'],
  'GeometryNodeRaycast': ['data_type', 'mapping'],
  'FunctionNodeAlignEulerToVector': ['axis', 'pivot_axis'],
  'ShaderNodeVectorRotate': ['invert', 'rotation_type'],
  'FunctionNodeRotateEuler': ['space', 'type'],
  'GeometryNodeDuplicateElements': ['domain'],
  'ShaderNodeSeparateRGB': ['mode'],
  'GeometryNodeAttributeDomainSize': ['component'],
};

/**
 * SINGLETON_NODES - node types that should only have a single instance
 * per node group.
 *
 * Ported from infinigen/core/nodes/node_info.py
 */
export const SINGLETON_NODES: string[] = [
  'NodeGroupInput',
  'NodeGroupOutput',
  'ShaderNodeOutputMaterial',
  'ShaderNodeOutputWorld',
  'ShaderNodeOutputLight',
  'CompositorNodeComposite',
  'CompositorNodeViewer',
  'CompositorNodeRLayers',
];

/**
 * NODETYPE_TO_DATATYPE - maps Blender socket type identifiers to
 * the data_type attribute values used by nodes like CaptureAttribute.
 *
 * Ported from infinigen/core/nodes/node_info.py
 */
export const NODETYPE_TO_DATATYPE: Record<string, string> = {
  VALUE: 'FLOAT',
  INT: 'INT',
  VECTOR: 'FLOAT_VECTOR',
  FLOAT_COLOR: 'RGBA',
  BOOLEAN: 'BOOLEAN',
};

/**
 * NODECLASS_TO_DATATYPE - maps Blender socket class names to data_type values.
 *
 * Ported from infinigen/core/nodes/node_info.py
 */
export const NODECLASS_TO_DATATYPE: Record<string, string> = {
  NodeSocketFloat: 'FLOAT',
  NodeSocketInt: 'INT',
  NodeSocketVector: 'FLOAT_VECTOR',
  NodeSocketColor: 'RGBA',
  NodeSocketBool: 'BOOLEAN',
};

/**
 * DATATYPE_TO_NODECLASS - reverse of NODECLASS_TO_DATATYPE.
 */
export const DATATYPE_TO_NODECLASS: Record<string, string> = {
  FLOAT: 'NodeSocketFloat',
  INT: 'NodeSocketInt',
  FLOAT_VECTOR: 'NodeSocketVector',
  RGBA: 'NodeSocketColor',
  BOOLEAN: 'NodeSocketBool',
};

/**
 * DATATYPE_DIMS - dimensionality of each data type.
 *
 * Ported from infinigen/core/nodes/node_info.py
 */
export const DATATYPE_DIMS: Record<string, number> = {
  FLOAT: 1,
  INT: 1,
  FLOAT_VECTOR: 3,
  FLOAT2: 2,
  FLOAT_COLOR: 4,
  BOOLEAN: 1,
  INT32_2D: 2,
};

/**
 * DATATYPE_FIELDS - the field name used for each data type in node sockets.
 *
 * Ported from infinigen/core/nodes/node_info.py
 */
export const DATATYPE_FIELDS: Record<string, string> = {
  FLOAT: 'value',
  INT: 'value',
  FLOAT_VECTOR: 'vector',
  FLOAT_COLOR: 'color',
  BOOLEAN: 'value',
};

/**
 * Re-export resolveNodeType for convenience.
 * Use this to normalize any node type string to its canonical form.
 */
export { resolveNodeType } from './NodeTypeRegistry';

export default NodeTypes;
