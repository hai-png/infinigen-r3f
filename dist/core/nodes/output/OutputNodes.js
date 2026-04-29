/**
 * Output Nodes - Render and scene output
 * Based on Blender output nodes and infinigen rendering pipeline
 *
 * These nodes handle final scene output, rendering, and data export
 */
import { NodeTypes } from '../core/node-types';
// ============================================================================
// Node Implementations
// ============================================================================
/**
 * Group Output Node
 * Final output of a node group
 */
export class GroupOutputNode {
    constructor() {
        this.type = NodeTypes.GroupOutput;
        this.name = 'Group Output';
        this.inputs = {
            geometry: null,
        };
        this.outputs = {
            geometry: null,
        };
    }
    execute() {
        this.outputs.geometry = this.inputs.geometry || null;
        return this.outputs;
    }
}
/**
 * Material Output Node
 * Final material output for shading
 */
export class MaterialOutputNode {
    constructor() {
        this.type = NodeTypes.MaterialOutput;
        this.name = 'Material Output';
        this.inputs = {
            surface: null,
            volume: null,
            displacement: null,
            alpha: 1,
        };
        this.outputs = {
            material: null,
        };
    }
    execute() {
        const material = {
            surface: this.inputs.surface,
            volume: this.inputs.volume,
            displacement: this.inputs.displacement,
            alpha: this.inputs.alpha ?? 1,
        };
        this.outputs.material = material;
        return this.outputs;
    }
}
/**
 * Composite Output Node
 * Combines multiple render passes
 */
export class CompositeOutputNode {
    constructor() {
        this.type = NodeTypes.CompositeOutput;
        this.name = 'Composite Output';
        this.inputs = {
            image: null,
            depth: null,
            normal: null,
            uv: null,
            albedo: null,
            emission: null,
            shadow: null,
            ambientOcclusion: null,
        };
        this.outputs = {
            result: null,
        };
    }
    execute() {
        this.outputs.result = {
            image: this.inputs.image,
            depth: this.inputs.depth,
            normal: this.inputs.normal,
            uv: this.inputs.uv,
            albedo: this.inputs.albedo,
            emission: this.inputs.emission,
            shadow: this.inputs.shadow,
            ambientOcclusion: this.inputs.ambientOcclusion,
        };
        return this.outputs;
    }
}
/**
 * Viewer Node
 * Displays intermediate results for debugging
 */
export class ViewerNode {
    constructor() {
        this.type = NodeTypes.Viewer;
        this.name = 'Viewer';
        this.inputs = {
            value: null,
            label: 'Value',
        };
        this.outputs = {
            value: null,
        };
    }
    execute() {
        this.outputs.value = this.inputs.value;
        console.log(`[Viewer ${this.inputs.label}]:`, this.inputs.value);
        return this.outputs;
    }
}
/**
 * Split Viewer Node
 * Compares two images side by side
 */
export class SplitViewerNode {
    constructor() {
        this.type = NodeTypes.SplitViewer;
        this.name = 'Split Viewer';
        this.inputs = {
            image1: null,
            image2: null,
            factor: 0.5,
        };
        this.outputs = {
            image1: null,
            image2: null,
            blended: null,
        };
    }
    execute() {
        this.outputs.image1 = this.inputs.image1;
        this.outputs.image2 = this.inputs.image2;
        // Simplified blend - in production would do actual image blending
        const factor = this.inputs.factor ?? 0.5;
        this.outputs.blended = {
            image1: this.inputs.image1,
            image2: this.inputs.image2,
            factor,
        };
        return this.outputs;
    }
}
/**
 * Level of Detail Node
 * Selects appropriate LOD based on distance
 */
export class LevelOfDetailNode {
    constructor() {
        this.type = NodeTypes.LevelOfDetail;
        this.name = 'Level of Detail';
        this.inputs = {
            geometry: null,
            distance: 10,
            minLevel: 0,
            maxLevel: 3,
        };
        this.outputs = {
            geometry: null,
            level: 0,
        };
    }
    execute() {
        const distance = this.inputs.distance ?? 10;
        const minLevel = this.inputs.minLevel ?? 0;
        const maxLevel = this.inputs.maxLevel ?? 3;
        // Calculate LOD level based on distance (simplified)
        const level = Math.min(maxLevel, Math.max(minLevel, Math.floor(distance / 10)));
        this.outputs.level = level;
        this.outputs.geometry = this.inputs.geometry;
        return this.outputs;
    }
}
/**
 * LOD Group Output Node
 * Outputs geometry with multiple LOD levels
 */
export class LODGroupOutputNode {
    constructor() {
        this.type = NodeTypes.LODGroupOutput;
        this.name = 'LOD Group Output';
        this.inputs = {
            geometries: [],
            distances: [0, 10, 20, 50],
        };
        this.outputs = {
            geometry: null,
        };
    }
    execute() {
        const geometries = this.inputs.geometries || [];
        const distances = this.inputs.distances || [0, 10, 20, 50];
        this.outputs.geometry = {
            lodLevels: geometries.map((geo, i) => ({
                geometry: geo,
                distance: distances[i] || i * 10,
            })),
        };
        return this.outputs;
    }
}
/**
 * Render Layer Node
 * Outputs a specific render pass/layer
 */
export class RenderLayerNode {
    constructor() {
        this.type = NodeTypes.RenderLayer;
        this.name = 'Render Layer';
        this.inputs = {
            geometry: null,
            materialIndex: 0,
            passType: 'combined',
            layerName: 'Layer',
        };
        this.outputs = {
            layer: null,
            passType: 'combined',
        };
    }
    execute() {
        this.outputs.layer = {
            geometry: this.inputs.geometry,
            materialIndex: this.inputs.materialIndex,
            layerName: this.inputs.layerName,
        };
        this.outputs.passType = this.inputs.passType || 'combined';
        return this.outputs;
    }
}
/**
 * File Output Node
 * Saves rendered output to files
 */
export class FileOutputNode {
    constructor() {
        this.type = NodeTypes.FileOutput;
        this.name = 'File Output';
        this.inputs = {
            baseDirectory: './output',
            fileName: 'render',
            slots: [],
            startFrame: 1,
            endFrame: 1,
            fileFormat: 'png',
            colorDepth: 8,
            overwrite: false,
        };
        this.outputs = {
            files: [],
        };
    }
    execute() {
        const baseDir = this.inputs.baseDirectory || './output';
        const fileName = this.inputs.fileName || 'render';
        const format = this.inputs.fileFormat || 'png';
        const startFrame = this.inputs.startFrame ?? 1;
        const endFrame = this.inputs.endFrame ?? 1;
        const files = [];
        for (let frame = startFrame; frame <= endFrame; frame++) {
            const slotFiles = (this.inputs.slots || []).map(slot => {
                return `${baseDir}/${fileName}_${slot.path}.${format}`;
            });
            if (slotFiles.length === 0) {
                files.push(`${baseDir}/${fileName}_${frame.toString().padStart(4, '0')}.${format}`);
            }
            else {
                files.push(...slotFiles);
            }
        }
        this.outputs.files = files;
        console.log(`[File Output] Would save ${files.length} files`);
        return this.outputs;
    }
}
/**
 * Image Output Node
 * Outputs image data
 */
export class ImageOutputNode {
    constructor() {
        this.type = NodeTypes.ImageOutput;
        this.name = 'Image Output';
        this.inputs = {
            image: null,
            width: 1920,
            height: 1080,
            format: 'png',
            quality: 90,
        };
        this.outputs = {
            url: '',
            blob: undefined,
        };
    }
    execute() {
        const width = this.inputs.width ?? 1920;
        const height = this.inputs.height ?? 1080;
        const format = this.inputs.format || 'png';
        const quality = this.inputs.quality ?? 90;
        // In production, would encode actual image data
        this.outputs.url = `data:image/${format};base64,placeholder_${width}x${height}_q${quality}`;
        return this.outputs;
    }
}
/**
 * Depth Output Node
 * Outputs depth map
 */
export class DepthOutputNode {
    constructor() {
        this.type = NodeTypes.DepthOutput;
        this.name = 'Depth Output';
        this.inputs = {
            depth: null,
            near: 0.1,
            far: 1000,
            normalize: true,
        };
        this.outputs = {
            depthMap: null,
            minDepth: 0,
            maxDepth: 0,
        };
    }
    execute() {
        const near = this.inputs.near ?? 0.1;
        const far = this.inputs.far ?? 1000;
        const normalize = this.inputs.normalize ?? true;
        this.outputs.depthMap = this.inputs.depth;
        this.outputs.minDepth = near;
        this.outputs.maxDepth = far;
        return this.outputs;
    }
}
/**
 * Normal Output Node
 * Outputs normal map
 */
export class NormalOutputNode {
    constructor() {
        this.type = NodeTypes.NormalOutput;
        this.name = 'Normal Output';
        this.inputs = {
            normal: null,
            space: 'camera',
        };
        this.outputs = {
            normalMap: null,
        };
    }
    execute() {
        this.outputs.normalMap = this.inputs.normal;
        return this.outputs;
    }
}
/**
 * UV Output Node
 * Outputs UV map
 */
export class UVOutputNode {
    constructor() {
        this.type = NodeTypes.UVOutput;
        this.name = 'UV Output';
        this.inputs = {
            uv: null,
            width: 1024,
            height: 1024,
        };
        this.outputs = {
            uvMap: null,
        };
    }
    execute() {
        this.outputs.uvMap = this.inputs.uv;
        return this.outputs;
    }
}
/**
 * Albedo Output Node
 * Outputs albedo/diffuse map
 */
export class AlbedoOutputNode {
    constructor() {
        this.type = NodeTypes.AlbedoOutput;
        this.name = 'Albedo Output';
        this.inputs = {
            albedo: null,
        };
        this.outputs = {
            albedoMap: null,
        };
    }
    execute() {
        this.outputs.albedoMap = this.inputs.albedo;
        return this.outputs;
    }
}
/**
 * Emission Output Node
 * Outputs emission map
 */
export class EmissionOutputNode {
    constructor() {
        this.type = NodeTypes.EmissionOutput;
        this.name = 'Emission Output';
        this.inputs = {
            emission: null,
            intensity: 1,
        };
        this.outputs = {
            emissionMap: null,
        };
    }
    execute() {
        this.outputs.emissionMap = {
            data: this.inputs.emission,
            intensity: this.inputs.intensity ?? 1,
        };
        return this.outputs;
    }
}
/**
 * Shadow Output Node
 * Outputs shadow map
 */
export class ShadowOutputNode {
    constructor() {
        this.type = NodeTypes.ShadowOutput;
        this.name = 'Shadow Output';
        this.inputs = {
            shadow: null,
            lightPosition: [0, 10, 0],
        };
        this.outputs = {
            shadowMap: null,
        };
    }
    execute() {
        this.outputs.shadowMap = {
            data: this.inputs.shadow,
            lightPosition: this.inputs.lightPosition,
        };
        return this.outputs;
    }
}
/**
 * Ambient Occlusion Output Node
 * Outputs AO map
 */
export class AmbientOcclusionOutputNode {
    constructor() {
        this.type = NodeTypes.AmbientOcclusionOutput;
        this.name = 'Ambient Occlusion Output';
        this.inputs = {
            ao: null,
            samples: 16,
            distance: 1,
        };
        this.outputs = {
            aoMap: null,
        };
    }
    execute() {
        this.outputs.aoMap = {
            data: this.inputs.ao,
            samples: this.inputs.samples ?? 16,
            distance: this.inputs.distance ?? 1,
        };
        return this.outputs;
    }
}
/**
 * Instance Output Node
 * Outputs instance data
 */
export class InstanceOutputNode {
    constructor() {
        this.type = NodeTypes.InstanceOutput;
        this.name = 'Instance Output';
        this.inputs = {
            instances: null,
            transformMatrix: [],
            randomId: 0,
        };
        this.outputs = {
            instanceData: null,
        };
    }
    execute() {
        this.outputs.instanceData = {
            instances: this.inputs.instances,
            transformMatrix: this.inputs.transformMatrix,
            randomId: this.inputs.randomId ?? 0,
        };
        return this.outputs;
    }
}
/**
 * Point Cloud Output Node
 * Outputs point cloud data
 */
export class PointCloudOutputNode {
    constructor() {
        this.type = NodeTypes.PointCloudOutput;
        this.name = 'Point Cloud Output';
        this.inputs = {
            points: null,
            positions: [],
            colors: [],
            sizes: [],
        };
        this.outputs = {
            pointCloud: null,
        };
    }
    execute() {
        this.outputs.pointCloud = {
            positions: this.inputs.positions || [],
            colors: this.inputs.colors || [],
            sizes: this.inputs.sizes || [],
        };
        return this.outputs;
    }
}
/**
 * Line Output Node
 * Outputs line geometry
 */
export class LineOutputNode {
    constructor() {
        this.type = NodeTypes.LineOutput;
        this.name = 'Line Output';
        this.inputs = {
            start: [0, 0, 0],
            end: [1, 1, 1],
            color: [1, 1, 1],
            lineWidth: 1,
        };
        this.outputs = {
            line: null,
        };
    }
    execute() {
        this.outputs.line = {
            start: this.inputs.start || [0, 0, 0],
            end: this.inputs.end || [1, 1, 1],
            color: this.inputs.color || [1, 1, 1],
            lineWidth: this.inputs.lineWidth ?? 1,
        };
        return this.outputs;
    }
}
/**
 * Text Output Node
 * Outputs text mesh
 */
export class TextOutputNode {
    constructor() {
        this.type = NodeTypes.TextOutput;
        this.name = 'Text Output';
        this.inputs = {
            text: 'Text',
            fontSize: 1,
            color: [1, 1, 1],
            position: [0, 0, 0],
        };
        this.outputs = {
            textMesh: null,
        };
    }
    execute() {
        this.outputs.textMesh = {
            text: this.inputs.text || 'Text',
            fontSize: this.inputs.fontSize ?? 1,
            color: this.inputs.color || [1, 1, 1],
            position: this.inputs.position || [0, 0, 0],
        };
        return this.outputs;
    }
}
/**
 * Bounding Box Output Node
 * Outputs bounding box visualization
 */
export class BoundingBoxOutputNode {
    constructor() {
        this.type = NodeTypes.BoundingBoxOutput;
        this.name = 'Bounding Box Output';
        this.inputs = {
            geometry: null,
            color: [1, 1, 1],
            lineWidth: 1,
        };
        this.outputs = {
            boundingBox: null,
            min: [0, 0, 0],
            max: [0, 0, 0],
            center: [0, 0, 0],
            size: [0, 0, 0],
        };
    }
    execute() {
        // Simplified bounding box calculation
        this.outputs.min = [-1, -1, -1];
        this.outputs.max = [1, 1, 1];
        this.outputs.center = [0, 0, 0];
        this.outputs.size = [2, 2, 2];
        this.outputs.boundingBox = {
            min: this.outputs.min,
            max: this.outputs.max,
            color: this.inputs.color || [1, 1, 1],
            lineWidth: this.inputs.lineWidth ?? 1,
        };
        return this.outputs;
    }
}
/**
 * Wireframe Output Node
 * Outputs wireframe representation
 */
export class WireframeOutputNode {
    constructor() {
        this.type = NodeTypes.WireframeOutput;
        this.name = 'Wireframe Output';
        this.inputs = {
            geometry: null,
            color: [1, 1, 1],
            lineWidth: 1,
            opacity: 1,
        };
        this.outputs = {
            wireframe: null,
        };
    }
    execute() {
        this.outputs.wireframe = {
            geometry: this.inputs.geometry,
            color: this.inputs.color || [1, 1, 1],
            lineWidth: this.inputs.lineWidth ?? 1,
            opacity: this.inputs.opacity ?? 1,
        };
        return this.outputs;
    }
}
/**
 * Debug Output Node
 * Logs debug information
 */
export class DebugOutputNode {
    constructor() {
        this.type = NodeTypes.DebugOutput;
        this.name = 'Debug Output';
        this.inputs = {
            value: null,
            label: 'Debug',
            enabled: true,
        };
        this.outputs = {
            value: null,
            logged: false,
        };
    }
    execute() {
        const enabled = this.inputs.enabled ?? true;
        if (enabled) {
            console.log(`[Debug ${this.inputs.label}]:`, this.inputs.value);
            this.outputs.logged = true;
        }
        else {
            this.outputs.logged = false;
        }
        this.outputs.value = this.inputs.value;
        return this.outputs;
    }
}
// ============================================================================
// Factory Functions
// ============================================================================
export function createGroupOutputNode(inputs) {
    const node = new GroupOutputNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createMaterialOutputNode(inputs) {
    const node = new MaterialOutputNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createCompositeOutputNode(inputs) {
    const node = new CompositeOutputNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createViewerNode(inputs) {
    const node = new ViewerNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createSplitViewerNode(inputs) {
    const node = new SplitViewerNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createLevelOfDetailNode(inputs) {
    const node = new LevelOfDetailNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createLODGroupOutputNode(inputs) {
    const node = new LODGroupOutputNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createRenderLayerNode(inputs) {
    const node = new RenderLayerNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createFileOutputNode(inputs) {
    const node = new FileOutputNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createImageOutputNode(inputs) {
    const node = new ImageOutputNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createDepthOutputNode(inputs) {
    const node = new DepthOutputNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createNormalOutputNode(inputs) {
    const node = new NormalOutputNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createUVOutputNode(inputs) {
    const node = new UVOutputNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createAlbedoOutputNode(inputs) {
    const node = new AlbedoOutputNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createEmissionOutputNode(inputs) {
    const node = new EmissionOutputNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createShadowOutputNode(inputs) {
    const node = new ShadowOutputNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createAmbientOcclusionOutputNode(inputs) {
    const node = new AmbientOcclusionOutputNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createInstanceOutputNode(inputs) {
    const node = new InstanceOutputNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createPointCloudOutputNode(inputs) {
    const node = new PointCloudOutputNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createLineOutputNode(inputs) {
    const node = new LineOutputNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createTextOutputNode(inputs) {
    const node = new TextOutputNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createBoundingBoxOutputNode(inputs) {
    const node = new BoundingBoxOutputNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createWireframeOutputNode(inputs) {
    const node = new WireframeOutputNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createDebugOutputNode(inputs) {
    const node = new DebugOutputNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
//# sourceMappingURL=OutputNodes.js.map