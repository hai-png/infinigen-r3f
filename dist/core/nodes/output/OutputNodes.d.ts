/**
 * Output Nodes - Render and scene output
 * Based on Blender output nodes and infinigen rendering pipeline
 *
 * These nodes handle final scene output, rendering, and data export
 */
import { NodeTypes } from '../core/node-types';
export interface OutputNodeBase {
    type: NodeTypes;
    name: string;
    inputs: Record<string, any>;
    outputs: Record<string, any>;
}
export interface GroupOutputInputs {
    geometry?: any;
    [key: string]: any;
}
export interface GroupOutputOutputs {
    geometry: any;
}
export interface MaterialOutputInputs {
    surface?: any;
    volume?: any;
    displacement?: any;
    alpha?: number;
}
export interface MaterialOutputOutputs {
    material: any;
}
export interface CompositeOutputInputs {
    image?: any;
    depth?: any;
    normal?: any;
    uv?: any;
    albedo?: any;
    emission?: any;
    shadow?: any;
    ambientOcclusion?: any;
}
export interface CompositeOutputOutputs {
    result: any;
}
export interface ViewerNodeInputs {
    value?: any;
    label?: string;
}
export interface ViewerNodeOutputs {
    value: any;
}
export interface SplitViewerNodeInputs {
    image1?: any;
    image2?: any;
    factor?: number;
}
export interface SplitViewerNodeOutputs {
    image1: any;
    image2: any;
    blended: any;
}
export interface LevelOfDetailInputs {
    geometry?: any;
    distance?: number;
    minLevel?: number;
    maxLevel?: number;
}
export interface LevelOfDetailOutputs {
    geometry: any;
    level: number;
}
export interface LODGroupOutputInputs {
    geometries?: any[];
    distances?: number[];
}
export interface LODGroupOutputOutputs {
    geometry: any;
}
export interface RenderLayerInputs {
    geometry?: any;
    materialIndex?: number;
    passType?: 'combined' | 'depth' | 'normal' | 'albedo' | 'emission' | 'shadow' | 'ao';
    layerName?: string;
}
export interface RenderLayerOutputs {
    layer: any;
    passType: string;
}
export interface FileOutputSlot {
    path: string;
    format: 'png' | 'jpg' | 'exr' | 'webp';
    colorDepth: 8 | 16 | 32;
}
export interface FileOutputInputs {
    baseDirectory?: string;
    fileName?: string;
    slots?: FileOutputSlot[];
    startFrame?: number;
    endFrame?: number;
    fileFormat?: 'png' | 'jpg' | 'exr' | 'webp';
    colorDepth?: 8 | 16 | 32;
    overwrite?: boolean;
}
export interface FileOutputOutputs {
    files: string[];
}
export interface ImageOutputInputs {
    image?: any;
    width?: number;
    height?: number;
    format?: 'png' | 'jpg' | 'exr';
    quality?: number;
}
export interface ImageOutputOutputs {
    url: string;
    blob?: Blob;
}
export interface DepthOutputInputs {
    depth?: any;
    near?: number;
    far?: number;
    normalize?: boolean;
}
export interface DepthOutputOutputs {
    depthMap: any;
    minDepth: number;
    maxDepth: number;
}
export interface NormalOutputInputs {
    normal?: any;
    space?: 'camera' | 'world' | 'tangent';
}
export interface NormalOutputOutputs {
    normalMap: any;
}
export interface UVOutputInputs {
    uv?: any;
    width?: number;
    height?: number;
}
export interface UVOutputOutputs {
    uvMap: any;
}
export interface AlbedoOutputInputs {
    albedo?: any;
}
export interface AlbedoOutputOutputs {
    albedoMap: any;
}
export interface EmissionOutputInputs {
    emission?: any;
    intensity?: number;
}
export interface EmissionOutputOutputs {
    emissionMap: any;
}
export interface ShadowOutputInputs {
    shadow?: any;
    lightPosition?: [number, number, number];
}
export interface ShadowOutputOutputs {
    shadowMap: any;
}
export interface AmbientOcclusionOutputInputs {
    ao?: any;
    samples?: number;
    distance?: number;
}
export interface AmbientOcclusionOutputOutputs {
    aoMap: any;
}
export interface InstanceOutputInputs {
    instances?: any;
    transformMatrix?: number[];
    randomId?: number;
}
export interface InstanceOutputOutputs {
    instanceData: any;
}
export interface PointCloudOutputInputs {
    points?: any;
    positions?: [number, number, number][];
    colors?: [number, number, number][];
    sizes?: number[];
}
export interface PointCloudOutputOutputs {
    pointCloud: any;
}
export interface LineOutputInputs {
    start?: [number, number, number];
    end?: [number, number, number];
    color?: [number, number, number];
    lineWidth?: number;
}
export interface LineOutputOutputs {
    line: any;
}
export interface TextOutputInputs {
    text?: string;
    fontSize?: number;
    color?: [number, number, number];
    position?: [number, number, number];
}
export interface TextOutputOutputs {
    textMesh: any;
}
export interface BoundingBoxOutputInputs {
    geometry?: any;
    color?: [number, number, number];
    lineWidth?: number;
}
export interface BoundingBoxOutputOutputs {
    boundingBox: any;
    min: [number, number, number];
    max: [number, number, number];
    center: [number, number, number];
    size: [number, number, number];
}
export interface WireframeOutputInputs {
    geometry?: any;
    color?: [number, number, number];
    lineWidth?: number;
    opacity?: number;
}
export interface WireframeOutputOutputs {
    wireframe: any;
}
export interface DebugOutputInputs {
    value?: any;
    label?: string;
    enabled?: boolean;
}
export interface DebugOutputOutputs {
    value: any;
    logged: boolean;
}
/**
 * Group Output Node
 * Final output of a node group
 */
export declare class GroupOutputNode implements OutputNodeBase {
    readonly type = NodeTypes.GroupOutput;
    readonly name = "Group Output";
    inputs: GroupOutputInputs;
    outputs: GroupOutputOutputs;
    execute(): GroupOutputOutputs;
}
/**
 * Material Output Node
 * Final material output for shading
 */
export declare class MaterialOutputNode implements OutputNodeBase {
    readonly type = NodeTypes.MaterialOutput;
    readonly name = "Material Output";
    inputs: MaterialOutputInputs;
    outputs: MaterialOutputOutputs;
    execute(): MaterialOutputOutputs;
}
/**
 * Composite Output Node
 * Combines multiple render passes
 */
export declare class CompositeOutputNode implements OutputNodeBase {
    readonly type: any;
    readonly name = "Composite Output";
    inputs: CompositeOutputInputs;
    outputs: CompositeOutputOutputs;
    execute(): CompositeOutputOutputs;
}
/**
 * Viewer Node
 * Displays intermediate results for debugging
 */
export declare class ViewerNode implements OutputNodeBase {
    readonly type = NodeTypes.Viewer;
    readonly name = "Viewer";
    inputs: ViewerNodeInputs;
    outputs: ViewerNodeOutputs;
    execute(): ViewerNodeOutputs;
}
/**
 * Split Viewer Node
 * Compares two images side by side
 */
export declare class SplitViewerNode implements OutputNodeBase {
    readonly type = NodeTypes.SplitViewer;
    readonly name = "Split Viewer";
    inputs: SplitViewerNodeInputs;
    outputs: SplitViewerNodeOutputs;
    execute(): SplitViewerNodeOutputs;
}
/**
 * Level of Detail Node
 * Selects appropriate LOD based on distance
 */
export declare class LevelOfDetailNode implements OutputNodeBase {
    readonly type: any;
    readonly name = "Level of Detail";
    inputs: LevelOfDetailInputs;
    outputs: LevelOfDetailOutputs;
    execute(): LevelOfDetailOutputs;
}
/**
 * LOD Group Output Node
 * Outputs geometry with multiple LOD levels
 */
export declare class LODGroupOutputNode implements OutputNodeBase {
    readonly type: any;
    readonly name = "LOD Group Output";
    inputs: LODGroupOutputInputs;
    outputs: LODGroupOutputOutputs;
    execute(): LODGroupOutputOutputs;
}
/**
 * Render Layer Node
 * Outputs a specific render pass/layer
 */
export declare class RenderLayerNode implements OutputNodeBase {
    readonly type: any;
    readonly name = "Render Layer";
    inputs: RenderLayerInputs;
    outputs: RenderLayerOutputs;
    execute(): RenderLayerOutputs;
}
/**
 * File Output Node
 * Saves rendered output to files
 */
export declare class FileOutputNode implements OutputNodeBase {
    readonly type = NodeTypes.FileOutput;
    readonly name = "File Output";
    inputs: FileOutputInputs;
    outputs: FileOutputOutputs;
    execute(): FileOutputOutputs;
}
/**
 * Image Output Node
 * Outputs image data
 */
export declare class ImageOutputNode implements OutputNodeBase {
    readonly type = NodeTypes.ImageOutput;
    readonly name = "Image Output";
    inputs: ImageOutputInputs;
    outputs: ImageOutputOutputs;
    execute(): ImageOutputOutputs;
}
/**
 * Depth Output Node
 * Outputs depth map
 */
export declare class DepthOutputNode implements OutputNodeBase {
    readonly type = NodeTypes.DepthOutput;
    readonly name = "Depth Output";
    inputs: DepthOutputInputs;
    outputs: DepthOutputOutputs;
    execute(): DepthOutputOutputs;
}
/**
 * Normal Output Node
 * Outputs normal map
 */
export declare class NormalOutputNode implements OutputNodeBase {
    readonly type = NodeTypes.NormalOutput;
    readonly name = "Normal Output";
    inputs: NormalOutputInputs;
    outputs: NormalOutputOutputs;
    execute(): NormalOutputOutputs;
}
/**
 * UV Output Node
 * Outputs UV map
 */
export declare class UVOutputNode implements OutputNodeBase {
    readonly type: any;
    readonly name = "UV Output";
    inputs: UVOutputInputs;
    outputs: UVOutputOutputs;
    execute(): UVOutputOutputs;
}
/**
 * Albedo Output Node
 * Outputs albedo/diffuse map
 */
export declare class AlbedoOutputNode implements OutputNodeBase {
    readonly type = NodeTypes.AlbedoOutput;
    readonly name = "Albedo Output";
    inputs: AlbedoOutputInputs;
    outputs: AlbedoOutputOutputs;
    execute(): AlbedoOutputOutputs;
}
/**
 * Emission Output Node
 * Outputs emission map
 */
export declare class EmissionOutputNode implements OutputNodeBase {
    readonly type = NodeTypes.EmissionOutput;
    readonly name = "Emission Output";
    inputs: EmissionOutputInputs;
    outputs: EmissionOutputOutputs;
    execute(): EmissionOutputOutputs;
}
/**
 * Shadow Output Node
 * Outputs shadow map
 */
export declare class ShadowOutputNode implements OutputNodeBase {
    readonly type = NodeTypes.ShadowOutput;
    readonly name = "Shadow Output";
    inputs: ShadowOutputInputs;
    outputs: ShadowOutputOutputs;
    execute(): ShadowOutputOutputs;
}
/**
 * Ambient Occlusion Output Node
 * Outputs AO map
 */
export declare class AmbientOcclusionOutputNode implements OutputNodeBase {
    readonly type: any;
    readonly name = "Ambient Occlusion Output";
    inputs: AmbientOcclusionOutputInputs;
    outputs: AmbientOcclusionOutputOutputs;
    execute(): AmbientOcclusionOutputOutputs;
}
/**
 * Instance Output Node
 * Outputs instance data
 */
export declare class InstanceOutputNode implements OutputNodeBase {
    readonly type: any;
    readonly name = "Instance Output";
    inputs: InstanceOutputInputs;
    outputs: InstanceOutputOutputs;
    execute(): InstanceOutputOutputs;
}
/**
 * Point Cloud Output Node
 * Outputs point cloud data
 */
export declare class PointCloudOutputNode implements OutputNodeBase {
    readonly type: any;
    readonly name = "Point Cloud Output";
    inputs: PointCloudOutputInputs;
    outputs: PointCloudOutputOutputs;
    execute(): PointCloudOutputOutputs;
}
/**
 * Line Output Node
 * Outputs line geometry
 */
export declare class LineOutputNode implements OutputNodeBase {
    readonly type: any;
    readonly name = "Line Output";
    inputs: LineOutputInputs;
    outputs: LineOutputOutputs;
    execute(): LineOutputOutputs;
}
/**
 * Text Output Node
 * Outputs text mesh
 */
export declare class TextOutputNode implements OutputNodeBase {
    readonly type: any;
    readonly name = "Text Output";
    inputs: TextOutputInputs;
    outputs: TextOutputOutputs;
    execute(): TextOutputOutputs;
}
/**
 * Bounding Box Output Node
 * Outputs bounding box visualization
 */
export declare class BoundingBoxOutputNode implements OutputNodeBase {
    readonly type: any;
    readonly name = "Bounding Box Output";
    inputs: BoundingBoxOutputInputs;
    outputs: BoundingBoxOutputOutputs;
    execute(): BoundingBoxOutputOutputs;
}
/**
 * Wireframe Output Node
 * Outputs wireframe representation
 */
export declare class WireframeOutputNode implements OutputNodeBase {
    readonly type: any;
    readonly name = "Wireframe Output";
    inputs: WireframeOutputInputs;
    outputs: WireframeOutputOutputs;
    execute(): WireframeOutputOutputs;
}
/**
 * Debug Output Node
 * Logs debug information
 */
export declare class DebugOutputNode implements OutputNodeBase {
    readonly type: any;
    readonly name = "Debug Output";
    inputs: DebugOutputInputs;
    outputs: DebugOutputOutputs;
    execute(): DebugOutputOutputs;
}
export declare function createGroupOutputNode(inputs?: Partial<GroupOutputInputs>): GroupOutputNode;
export declare function createMaterialOutputNode(inputs?: Partial<MaterialOutputInputs>): MaterialOutputNode;
export declare function createCompositeOutputNode(inputs?: Partial<CompositeOutputInputs>): CompositeOutputNode;
export declare function createViewerNode(inputs?: Partial<ViewerNodeInputs>): ViewerNode;
export declare function createSplitViewerNode(inputs?: Partial<SplitViewerNodeInputs>): SplitViewerNode;
export declare function createLevelOfDetailNode(inputs?: Partial<LevelOfDetailInputs>): LevelOfDetailNode;
export declare function createLODGroupOutputNode(inputs?: Partial<LODGroupOutputInputs>): LODGroupOutputNode;
export declare function createRenderLayerNode(inputs?: Partial<RenderLayerInputs>): RenderLayerNode;
export declare function createFileOutputNode(inputs?: Partial<FileOutputInputs>): FileOutputNode;
export declare function createImageOutputNode(inputs?: Partial<ImageOutputInputs>): ImageOutputNode;
export declare function createDepthOutputNode(inputs?: Partial<DepthOutputInputs>): DepthOutputNode;
export declare function createNormalOutputNode(inputs?: Partial<NormalOutputInputs>): NormalOutputNode;
export declare function createUVOutputNode(inputs?: Partial<UVOutputInputs>): UVOutputNode;
export declare function createAlbedoOutputNode(inputs?: Partial<AlbedoOutputInputs>): AlbedoOutputNode;
export declare function createEmissionOutputNode(inputs?: Partial<EmissionOutputInputs>): EmissionOutputNode;
export declare function createShadowOutputNode(inputs?: Partial<ShadowOutputInputs>): ShadowOutputNode;
export declare function createAmbientOcclusionOutputNode(inputs?: Partial<AmbientOcclusionOutputInputs>): AmbientOcclusionOutputNode;
export declare function createInstanceOutputNode(inputs?: Partial<InstanceOutputInputs>): InstanceOutputNode;
export declare function createPointCloudOutputNode(inputs?: Partial<PointCloudOutputInputs>): PointCloudOutputNode;
export declare function createLineOutputNode(inputs?: Partial<LineOutputInputs>): LineOutputNode;
export declare function createTextOutputNode(inputs?: Partial<TextOutputInputs>): TextOutputNode;
export declare function createBoundingBoxOutputNode(inputs?: Partial<BoundingBoxOutputInputs>): BoundingBoxOutputNode;
export declare function createWireframeOutputNode(inputs?: Partial<WireframeOutputInputs>): WireframeOutputNode;
export declare function createDebugOutputNode(inputs?: Partial<DebugOutputInputs>): DebugOutputNode;
//# sourceMappingURL=OutputNodes.d.ts.map