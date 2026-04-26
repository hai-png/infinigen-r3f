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
export var SocketType;
(function (SocketType) {
    SocketType["GEOMETRY"] = "GEOMETRY";
    SocketType["VECTOR"] = "VECTOR";
    SocketType["COLOR"] = "COLOR";
    SocketType["FLOAT"] = "FLOAT";
    SocketType["INTEGER"] = "INTEGER";
    SocketType["BOOLEAN"] = "BOOLEAN";
    SocketType["STRING"] = "STRING";
    SocketType["TEXTURE"] = "TEXTURE";
    SocketType["MATERIAL"] = "MATERIAL";
    SocketType["OBJECT"] = "OBJECT";
    SocketType["COLLECTION"] = "COLLECTION";
    SocketType["CURVE"] = "CURVE";
    SocketType["MESH"] = "MESH";
    SocketType["POINTS"] = "POINTS";
    SocketType["INSTANCE"] = "INSTANCE";
    SocketType["VOLUME"] = "VOLUME";
})(SocketType || (SocketType = {}));
/**
 * Node categories organized by Blender's Shift-A menu structure
 */
export var NodeCategory;
(function (NodeCategory) {
    // Geometry Nodes
    NodeCategory["ATTRIBUTE"] = "ATTRIBUTE";
    NodeCategory["CURVE"] = "CURVE";
    NodeCategory["CURVE_PRIMITIVES"] = "CURVE_PRIMITIVES";
    NodeCategory["GEOMETRY"] = "GEOMETRY";
    NodeCategory["INPUT"] = "INPUT";
    NodeCategory["INSTANCES"] = "INSTANCES";
    NodeCategory["MATERIAL"] = "MATERIAL";
    NodeCategory["MESH"] = "MESH";
    NodeCategory["MESH_PRIMITIVES"] = "MESH_PRIMITIVES";
    NodeCategory["MODIFIERS"] = "MODIFIERS";
    NodeCategory["OUTPUT"] = "OUTPUT";
    NodeCategory["SIMULATE"] = "SIMULATE";
    NodeCategory["TEXT"] = "TEXT";
    NodeCategory["TEXTURE"] = "TEXTURE";
    NodeCategory["TRANSFORM"] = "TRANSFORM";
    NodeCategory["UTILITY"] = "UTILITY";
    // Shader Nodes
    NodeCategory["SHADER_INPUT"] = "SHADER_INPUT";
    NodeCategory["SHADER_OUTPUT"] = "SHADER_OUTPUT";
    NodeCategory["SHADER"] = "SHADER";
    NodeCategory["TEXTURE"] = "TEXTURE_SHADER";
    NodeCategory["COLOR"] = "COLOR";
    NodeCategory["CONVERTER"] = "CONVERTER";
    NodeCategory["VECTOR"] = "VECTOR_SHADER";
    // Compositor Nodes
    NodeCategory["COMPOSIT_INPUT"] = "COMPOSIT_INPUT";
    NodeCategory["COMPOSIT_OUTPUT"] = "COMPOSIT_OUTPUT";
    NodeCategory["COMPOSIT_FILTER"] = "COMPOSIT_FILTER";
    NodeCategory["COMPOSIT_COLOR"] = "COMPOSIT_COLOR";
})(NodeCategory || (NodeCategory = {}));
/**
 * Node type definitions - maps to Blender node identifiers
 */
export var NodeType;
(function (NodeType) {
    // Mix & Utilities
    NodeType["Mix"] = "ShaderNodeMix";
    // Attribute Nodes
    NodeType["Attribute"] = "ShaderNodeAttribute";
    NodeType["CaptureAttribute"] = "GeometryNodeCaptureAttribute";
    NodeType["AttributeStatistic"] = "GeometryNodeAttributeStatistic";
    NodeType["TransferAttribute"] = "GeometryNodeAttributeTransfer";
    NodeType["DomainSize"] = "GeometryNodeAttributeDomainSize";
    NodeType["StoreNamedAttribute"] = "GeometryNodeStoreNamedAttribute";
    NodeType["NamedAttribute"] = "GeometryNodeInputNamedAttribute";
    NodeType["SampleIndex"] = "GeometryNodeSampleIndex";
    NodeType["SampleNearest"] = "GeometryNodeSampleNearest";
    NodeType["SampleNearestSurface"] = "GeometryNodeSampleNearestSurface";
    // Color Nodes
    NodeType["ColorRamp"] = "ShaderNodeValToRGB";
    NodeType["MixRGB"] = "ShaderNodeMixRGB";
    NodeType["RGBCurve"] = "ShaderNodeRGBCurve";
    NodeType["BrightContrast"] = "CompositorNodeBrightContrast";
    NodeType["Exposure"] = "CompositorNodeExposure";
    NodeType["CombineHSV"] = "ShaderNodeCombineHSV";
    NodeType["SeparateRGB"] = "ShaderNodeSeparateRGB";
    NodeType["SeparateColor"] = "ShaderNodeSeparateColor";
    NodeType["CombineRGB"] = "ShaderNodeCombineRGB";
    NodeType["CombineColor"] = "ShaderNodeCombineColor";
    NodeType["FunctionCombineColor"] = "FunctionNodeCombineColor";
    // Curve Nodes
    NodeType["CurveToMesh"] = "GeometryNodeCurveToMesh";
    NodeType["CurveToPoints"] = "GeometryNodeCurveToPoints";
    NodeType["MeshToCurve"] = "GeometryNodeMeshToCurve";
    NodeType["SampleCurve"] = "GeometryNodeSampleCurve";
    NodeType["SetCurveRadius"] = "GeometryNodeSetCurveRadius";
    NodeType["SetCurveTilt"] = "GeometryNodeSetCurveTilt";
    NodeType["CurveLength"] = "GeometryNodeCurveLength";
    NodeType["CurveSplineType"] = "GeometryNodeCurveSplineType";
    NodeType["SetHandlePositions"] = "GeometryNodeSetCurveHandlePositions";
    NodeType["SubdivideCurve"] = "GeometryNodeSubdivideCurve";
    NodeType["ResampleCurve"] = "GeometryNodeResampleCurve";
    NodeType["TrimCurve"] = "GeometryNodeTrimCurve";
    NodeType["ReverseCurve"] = "GeometryNodeReverseCurve";
    NodeType["FillCurve"] = "GeometryNodeFillCurve";
    NodeType["FilletCurve"] = "GeometryNodeFilletCurve";
    // Curve Primitives
    NodeType["CurveCircle"] = "GeometryNodeCurvePrimitiveCircle";
    NodeType["CurveLine"] = "GeometryNodeCurvePrimitiveLine";
    NodeType["CurveBezierSegment"] = "GeometryNodeCurvePrimitiveBezierSegment";
    NodeType["QuadraticBezier"] = "GeometryNodeCurveQuadraticBezier";
    // Geometry Nodes
    NodeType["SetPosition"] = "GeometryNodeSetPosition";
    NodeType["JoinGeometry"] = "GeometryNodeJoinGeometry";
    NodeType["MergeByDistance"] = "GeometryNodeMergeByDistance";
    NodeType["SeparateGeometry"] = "GeometryNodeSeparateGeometry";
    NodeType["BoundingBox"] = "GeometryNodeBoundBox";
    NodeType["Transform"] = "GeometryNodeTransform";
    NodeType["DeleteGeometry"] = "GeometryNodeDeleteGeometry";
    NodeType["Proximity"] = "GeometryNodeProximity";
    NodeType["ConvexHull"] = "GeometryNodeConvexHull";
    NodeType["Raycast"] = "GeometryNodeRaycast";
    NodeType["DuplicateElements"] = "GeometryNodeDuplicateElements";
    NodeType["Triangulate"] = "GeometryNodeTriangulate";
    // Input Nodes
    NodeType["GroupInput"] = "NodeGroupInput";
    NodeType["RGB"] = "ShaderNodeRGB";
    NodeType["Boolean"] = "FunctionNodeInputBool";
    NodeType["Value"] = "ShaderNodeValue";
    NodeType["RandomValue"] = "FunctionNodeRandomValue";
    NodeType["CollectionInfo"] = "GeometryNodeCollectionInfo";
    NodeType["ObjectInfo"] = "GeometryNodeObjectInfo";
    NodeType["Vector"] = "FunctionNodeInputVector";
    NodeType["InputID"] = "GeometryNodeInputID";
    NodeType["InputPosition"] = "GeometryNodeInputPosition";
    NodeType["InputNormal"] = "GeometryNodeInputNormal";
    NodeType["InputEdgeVertices"] = "GeometryNodeInputMeshEdgeVertices";
    NodeType["InputEdgeAngle"] = "GeometryNodeInputMeshEdgeAngle";
    NodeType["InputColor"] = "FunctionNodeInputColor";
    NodeType["InputMeshFaceArea"] = "GeometryNodeInputMeshFaceArea";
    NodeType["TextureCoord"] = "ShaderNodeTexCoord";
    NodeType["Index"] = "GeometryNodeInputIndex";
    NodeType["AmbientOcclusion"] = "ShaderNodeAmbientOcclusion";
    NodeType["Integer"] = "FunctionNodeInputInt";
    NodeType["LightPath"] = "ShaderNodeLightPath";
    // Instance Nodes
    NodeType["RealizeInstances"] = "GeometryNodeRealizeInstances";
    NodeType["InstanceOnPoints"] = "GeometryNodeInstanceOnPoints";
    NodeType["TranslateInstances"] = "GeometryNodeTranslateInstances";
    NodeType["RotateInstances"] = "GeometryNodeRotateInstances";
    NodeType["ScaleInstances"] = "GeometryNodeScaleInstances";
    // Material Nodes
    NodeType["SetMaterial"] = "GeometryNodeSetMaterial";
    NodeType["SetMaterialIndex"] = "GeometryNodeSetMaterialIndex";
    NodeType["MaterialIndex"] = "GeometryNodeInputMaterialIndex";
    // Mesh Nodes
    NodeType["SubdivideMesh"] = "GeometryNodeSubdivideMesh";
    NodeType["SetShadeSmooth"] = "GeometryNodeSetShadeSmooth";
    NodeType["SplitEdges"] = "GeometryNodeSplitEdges";
    NodeType["ExtrudeMesh"] = "GeometryNodeExtrudeMesh";
    NodeType["ExtrudeMeshFace"] = "GeometryNodeExtrudeMeshFace";
    NodeType["OffsetFace"] = "GeometryNodeOffsetFace";
    NodeType["MeshBoolean"] = "GeometryNodeMeshBoolean";
    NodeType["MeshToPoints"] = "GeometryNodeMeshToPoints";
    NodeType["DualMesh"] = "GeometryNodeDualMesh";
    NodeType["ScaleElements"] = "GeometryNodeScaleElements";
    NodeType["SetMaterialNodes"] = "GeometryNodeSetMaterial";
    // Mesh Primitives
    NodeType["Cube"] = "GeometryNodeMeshCube";
    NodeType["Cylinder"] = "GeometryNodeMeshCylinder";
    NodeType["Cone"] = "GeometryNodeMeshCone";
    NodeType["Sphere"] = "GeometryNodeMeshUVSphere";
    NodeType["Icosphere"] = "GeometryNodeMeshIcoSphere";
    NodeType["Torus"] = "GeometryNodeMeshTorus";
    NodeType["Plane"] = "GeometryNodeMeshPlane";
    NodeType["Circle"] = "GeometryNodeMeshCircle";
    NodeType["Grid"] = "GeometryNodeGrid";
    NodeType["Monkey"] = "GeometryNodeMeshMonkey";
    // Modifier Nodes
    NodeType["ArrayModifier"] = "GeometryNodeArrayModifier";
    NodeType["BevelModifier"] = "GeometryNodeBevelModifier";
    NodeType["BooleanModifier"] = "GeometryNodeBooleanModifier";
    NodeType["BuildModifier"] = "GeometryNodeBuildModifier";
    NodeType["DecimateModifier"] = "GeometryNodeDecimateModifier";
    NodeType["EdgeSplitModifier"] = "GeometryNodeEdgeSplitModifier";
    NodeType["MaskModifier"] = "GeometryNodeMaskModifier";
    NodeType["MirrorModifier"] = "GeometryNodeMirrorModifier";
    NodeType["RemeshModifier"] = "GeometryNodeRemeshModifier";
    NodeType["ScrewModifier"] = "GeometryNodeScrewModifier";
    NodeType["SkinModifier"] = "GeometryNodeSkinModifier";
    NodeType["SolidifyModifier"] = "GeometryNodeSolidifyModifier";
    NodeType["SubdivisionSurfaceModifier"] = "GeometryNodeSubdivisionSurfaceModifier";
    NodeType["WeldModifier"] = "GeometryNodeWeldModifier";
    // Output Nodes
    NodeType["GroupOutput"] = "NodeGroupOutput";
    NodeType["MaterialOutput"] = "ShaderNodeOutputMaterial";
    NodeType["WorldOutput"] = "ShaderNodeOutputWorld";
    NodeType["CompositeOutput"] = "CompositorNodeComposite";
    NodeType["Viewer"] = "CompositorNodeViewer";
    // Texture Nodes
    NodeType["TextureCoordinate"] = "ShaderNodeTexCoord";
    NodeType["Mapping"] = "ShaderNodeMapping";
    NodeType["ImageTexture"] = "ShaderNodeTexImage";
    NodeType["VoronoiTexture"] = "ShaderNodeTexVoronoi";
    NodeType["NoiseTexture"] = "ShaderNodeTexNoise";
    NodeType["GradientTexture"] = "ShaderNodeTexGradient";
    NodeType["MagicTexture"] = "ShaderNodeTexMagic";
    NodeType["WaveTexture"] = "ShaderNodeTexWave";
    NodeType["BrickTexture"] = "ShaderNodeTexBrick";
    NodeType["CheckerTexture"] = "ShaderNodeTexChecker";
    NodeType["PointDensity"] = "ShaderNodePointDensity";
    NodeType["WhiteNoiseTexture"] = "ShaderNodeTexWhiteNoise";
    NodeType["MusgraveTexture"] = "ShaderNodeTexMusgrave";
    NodeType["SkyTexture"] = "ShaderNodeTexSky";
    NodeType["EnvironmentTexture"] = "ShaderNodeTexEnvironment";
    // Converter Nodes
    NodeType["ValToRGB"] = "ShaderNodeValToRGB";
    NodeType["RGBToBW"] = "ShaderNodeRGBToBW";
    NodeType["MapRange"] = "ShaderNodeMapRange";
    NodeType["Math"] = "ShaderNodeMath";
    NodeType["VectorMath"] = "ShaderNodeVectorMath";
    NodeType["FloatCurve"] = "ShaderNodeFloatCurve";
    NodeType["Clamp"] = "ShaderNodeClamp";
    NodeType["CombineXYZ"] = "ShaderNodeCombineXYZ";
    NodeType["SeparateXYZ"] = "ShaderNodeSeparateXYZ";
    NodeType["CombineRGBA"] = "ShaderNodeCombineRGBA";
    NodeType["SeparateRGBA"] = "ShaderNodeSeparateRGBA";
    NodeType["CombineHSV"] = "ShaderNodeCombineHSV";
    NodeType["SeparateHSV"] = "ShaderNodeSeparateHSV";
    NodeType["ColorRamp"] = "ShaderNodeValToRGB";
    // Vector Nodes
    NodeType["Normal"] = "ShaderNodeNormal";
    NodeType["NormalMap"] = "ShaderNodeNormalMap";
    NodeType["Tangent"] = "ShaderNodeTangent";
    NodeType["VectorRotate"] = "ShaderNodeVectorRotate";
    NodeType["VectorTransform"] = "ShaderNodeVectorTransform";
    // Shader Nodes
    NodeType["DiffuseBSDF"] = "ShaderNodeBsdfDiffuse";
    NodeType["GlossyBSDF"] = "ShaderNodeBsdfGlossy";
    NodeType["GlassBSDF"] = "ShaderNodeBsdfGlass";
    NodeType["TransparentBSDF"] = "ShaderNodeBsdfTransparent";
    NodeType["RefractionBSDF"] = "ShaderNodeBsdfRefraction";
    NodeType["Emission"] = "ShaderNodeEmission";
    NodeType["HairBSDF"] = "ShaderNodeBsdfHair";
    NodeType["Holdout"] = "ShaderNodeHoldout";
    NodeType["VolumeAbsorption"] = "ShaderNodeVolumeAbsorption";
    NodeType["VolumeScatter"] = "ShaderNodeVolumeScatter";
    NodeType["PrincipledBSDF"] = "ShaderNodeBsdfPrincipled";
    NodeType["SheenBSDF"] = "ShaderNodeBsdfSheen";
    NodeType["VelvetBSDF"] = "ShaderNodeBsdfVelvet";
    NodeType["LayerWeight"] = "ShaderNodeLayerWeight";
    NodeType["HairInfo"] = "ShaderNodeHairInfo";
    NodeType["Wireframe"] = "ShaderNodeWireframe";
    NodeType["ObjectInfo"] = "ShaderNodeObjectInfo";
    NodeType["ParticleInfo"] = "ShaderNodeParticleInfo";
    NodeType["AddShader"] = "ShaderNodeAddShader";
    NodeType["MixShader"] = "ShaderNodeMixShader";
    // Simulate Nodes
    NodeType["SimulateInput"] = "GeometryNodeSimulateInput";
    NodeType["RepeatZone"] = "GeometryNodeRepeatZone";
    NodeType["RepeatOutput"] = "GeometryNodeRepeatOutput";
    NodeType["WhileLoop"] = "GeometryNodeWhileLoop";
    // Text Nodes
    NodeType["StringJoin"] = "GeometryNodeStringJoin";
    NodeType["StringLength"] = "GeometryNodeStringLength";
    NodeType["StringSlice"] = "GeometryNodeStringSlice";
    NodeType["ValueToString"] = "GeometryNodeValueToString";
    NodeType["FontString"] = "GeometryNodeFontString";
    // Utility Nodes
    NodeType["Compare"] = "FunctionNodeCompare";
    NodeType["Switch"] = "GeometryNodeSwitch";
    NodeType["ForEachElementBegin"] = "GeometryNodeForEachElementBegin";
    NodeType["ForEachElementEnd"] = "GeometryNodeForEachElementEnd";
})(NodeType || (NodeType = {}));
/**
 * Type guard for checking socket type compatibility
 */
export function areSocketsCompatible(source, target) {
    if (source === target)
        return true;
    // Some implicit conversions allowed
    const compatiblePairs = [
        [SocketType.FLOAT, SocketType.INTEGER],
        [SocketType.INTEGER, SocketType.FLOAT],
        [SocketType.MESH, SocketType.GEOMETRY],
        [SocketType.CURVE, SocketType.GEOMETRY],
        [SocketType.POINTS, SocketType.GEOMETRY],
        [SocketType.INSTANCE, SocketType.GEOMETRY],
    ];
    return compatiblePairs.some(([a, b]) => (source === a && target === b) || (source === b && target === a));
}
/**
 * Get default value for a socket type
 */
export function getDefaultValueForType(type) {
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
//# sourceMappingURL=types.js.map