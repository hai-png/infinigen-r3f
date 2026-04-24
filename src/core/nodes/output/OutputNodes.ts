/**
 * Output Nodes - Render and scene output
 * Based on Blender output nodes and infinigen rendering pipeline
 * 
 * These nodes handle final scene output, rendering, and data export
 */

import { NodeTypes } from '../core/node-types';

// ============================================================================
// Type Definitions
// ============================================================================

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

// ============================================================================
// Node Implementations
// ============================================================================

/**
 * Group Output Node
 * Final output of a node group
 */
export class GroupOutputNode implements OutputNodeBase {
  readonly type = NodeTypes.GroupOutput;
  readonly name = 'Group Output';
  
  inputs: GroupOutputInputs = {
    geometry: null,
  };
  
  outputs: GroupOutputOutputs = {
    geometry: null,
  };

  execute(): GroupOutputOutputs {
    this.outputs.geometry = this.inputs.geometry || null;
    return this.outputs;
  }
}

/**
 * Material Output Node
 * Final material output for shading
 */
export class MaterialOutputNode implements OutputNodeBase {
  readonly type = NodeTypes.MaterialOutput;
  readonly name = 'Material Output';
  
  inputs: MaterialOutputInputs = {
    surface: null,
    volume: null,
    displacement: null,
    alpha: 1,
  };
  
  outputs: MaterialOutputOutputs = {
    material: null,
  };

  execute(): MaterialOutputOutputs {
    const material: any = {
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
export class CompositeOutputNode implements OutputNodeBase {
  readonly type = NodeTypes.CompositeOutput;
  readonly name = 'Composite Output';
  
  inputs: CompositeOutputInputs = {
    image: null,
    depth: null,
    normal: null,
    uv: null,
    albedo: null,
    emission: null,
    shadow: null,
    ambientOcclusion: null,
  };
  
  outputs: CompositeOutputOutputs = {
    result: null,
  };

  execute(): CompositeOutputOutputs {
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
export class ViewerNode implements OutputNodeBase {
  readonly type = NodeTypes.Viewer;
  readonly name = 'Viewer';
  
  inputs: ViewerNodeInputs = {
    value: null,
    label: 'Value',
  };
  
  outputs: ViewerNodeOutputs = {
    value: null,
  };

  execute(): ViewerNodeOutputs {
    this.outputs.value = this.inputs.value;
    console.log(`[Viewer ${this.inputs.label}]:`, this.inputs.value);
    return this.outputs;
  }
}

/**
 * Split Viewer Node
 * Compares two images side by side
 */
export class SplitViewerNode implements OutputNodeBase {
  readonly type = NodeTypes.SplitViewer;
  readonly name = 'Split Viewer';
  
  inputs: SplitViewerNodeInputs = {
    image1: null,
    image2: null,
    factor: 0.5,
  };
  
  outputs: SplitViewerNodeOutputs = {
    image1: null,
    image2: null,
    blended: null,
  };

  execute(): SplitViewerNodeOutputs {
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
export class LevelOfDetailNode implements OutputNodeBase {
  readonly type = NodeTypes.LevelOfDetail;
  readonly name = 'Level of Detail';
  
  inputs: LevelOfDetailInputs = {
    geometry: null,
    distance: 10,
    minLevel: 0,
    maxLevel: 3,
  };
  
  outputs: LevelOfDetailOutputs = {
    geometry: null,
    level: 0,
  };

  execute(): LevelOfDetailOutputs {
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
export class LODGroupOutputNode implements OutputNodeBase {
  readonly type = NodeTypes.LODGroupOutput;
  readonly name = 'LOD Group Output';
  
  inputs: LODGroupOutputInputs = {
    geometries: [],
    distances: [0, 10, 20, 50],
  };
  
  outputs: LODGroupOutputOutputs = {
    geometry: null,
  };

  execute(): LODGroupOutputOutputs {
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
export class RenderLayerNode implements OutputNodeBase {
  readonly type = NodeTypes.RenderLayer;
  readonly name = 'Render Layer';
  
  inputs: RenderLayerInputs = {
    geometry: null,
    materialIndex: 0,
    passType: 'combined',
    layerName: 'Layer',
  };
  
  outputs: RenderLayerOutputs = {
    layer: null,
    passType: 'combined',
  };

  execute(): RenderLayerOutputs {
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
export class FileOutputNode implements OutputNodeBase {
  readonly type = NodeTypes.FileOutput;
  readonly name = 'File Output';
  
  inputs: FileOutputInputs = {
    baseDirectory: './output',
    fileName: 'render',
    slots: [],
    startFrame: 1,
    endFrame: 1,
    fileFormat: 'png',
    colorDepth: 8,
    overwrite: false,
  };
  
  outputs: FileOutputOutputs = {
    files: [],
  };

  execute(): FileOutputOutputs {
    const baseDir = this.inputs.baseDirectory || './output';
    const fileName = this.inputs.fileName || 'render';
    const format = this.inputs.fileFormat || 'png';
    const startFrame = this.inputs.startFrame ?? 1;
    const endFrame = this.inputs.endFrame ?? 1;
    
    const files: string[] = [];
    
    for (let frame = startFrame; frame <= endFrame; frame++) {
      const slotFiles = (this.inputs.slots || []).map(slot => {
        return `${baseDir}/${fileName}_${slot.path}.${format}`;
      });
      
      if (slotFiles.length === 0) {
        files.push(`${baseDir}/${fileName}_${frame.toString().padStart(4, '0')}.${format}`);
      } else {
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
export class ImageOutputNode implements OutputNodeBase {
  readonly type = NodeTypes.ImageOutput;
  readonly name = 'Image Output';
  
  inputs: ImageOutputInputs = {
    image: null,
    width: 1920,
    height: 1080,
    format: 'png',
    quality: 90,
  };
  
  outputs: ImageOutputOutputs = {
    url: '',
    blob: undefined,
  };

  execute(): ImageOutputOutputs {
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
export class DepthOutputNode implements OutputNodeBase {
  readonly type = NodeTypes.DepthOutput;
  readonly name = 'Depth Output';
  
  inputs: DepthOutputInputs = {
    depth: null,
    near: 0.1,
    far: 1000,
    normalize: true,
  };
  
  outputs: DepthOutputOutputs = {
    depthMap: null,
    minDepth: 0,
    maxDepth: 0,
  };

  execute(): DepthOutputOutputs {
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
export class NormalOutputNode implements OutputNodeBase {
  readonly type = NodeTypes.NormalOutput;
  readonly name = 'Normal Output';
  
  inputs: NormalOutputInputs = {
    normal: null,
    space: 'camera',
  };
  
  outputs: NormalOutputOutputs = {
    normalMap: null,
  };

  execute(): NormalOutputOutputs {
    this.outputs.normalMap = this.inputs.normal;
    return this.outputs;
  }
}

/**
 * UV Output Node
 * Outputs UV map
 */
export class UVOutputNode implements OutputNodeBase {
  readonly type = NodeTypes.UVOutput;
  readonly name = 'UV Output';
  
  inputs: UVOutputInputs = {
    uv: null,
    width: 1024,
    height: 1024,
  };
  
  outputs: UVOutputOutputs = {
    uvMap: null,
  };

  execute(): UVOutputOutputs {
    this.outputs.uvMap = this.inputs.uv;
    return this.outputs;
  }
}

/**
 * Albedo Output Node
 * Outputs albedo/diffuse map
 */
export class AlbedoOutputNode implements OutputNodeBase {
  readonly type = NodeTypes.AlbedoOutput;
  readonly name = 'Albedo Output';
  
  inputs: AlbedoOutputInputs = {
    albedo: null,
  };
  
  outputs: AlbedoOutputOutputs = {
    albedoMap: null,
  };

  execute(): AlbedoOutputOutputs {
    this.outputs.albedoMap = this.inputs.albedo;
    return this.outputs;
  }
}

/**
 * Emission Output Node
 * Outputs emission map
 */
export class EmissionOutputNode implements OutputNodeBase {
  readonly type = NodeTypes.EmissionOutput;
  readonly name = 'Emission Output';
  
  inputs: EmissionOutputInputs = {
    emission: null,
    intensity: 1,
  };
  
  outputs: EmissionOutputOutputs = {
    emissionMap: null,
  };

  execute(): EmissionOutputOutputs {
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
export class ShadowOutputNode implements OutputNodeBase {
  readonly type = NodeTypes.ShadowOutput;
  readonly name = 'Shadow Output';
  
  inputs: ShadowOutputInputs = {
    shadow: null,
    lightPosition: [0, 10, 0],
  };
  
  outputs: ShadowOutputOutputs = {
    shadowMap: null,
  };

  execute(): ShadowOutputOutputs {
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
export class AmbientOcclusionOutputNode implements OutputNodeBase {
  readonly type = NodeTypes.AmbientOcclusionOutput;
  readonly name = 'Ambient Occlusion Output';
  
  inputs: AmbientOcclusionOutputInputs = {
    ao: null,
    samples: 16,
    distance: 1,
  };
  
  outputs: AmbientOcclusionOutputOutputs = {
    aoMap: null,
  };

  execute(): AmbientOcclusionOutputOutputs {
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
export class InstanceOutputNode implements OutputNodeBase {
  readonly type = NodeTypes.InstanceOutput;
  readonly name = 'Instance Output';
  
  inputs: InstanceOutputInputs = {
    instances: null,
    transformMatrix: [],
    randomId: 0,
  };
  
  outputs: InstanceOutputOutputs = {
    instanceData: null,
  };

  execute(): InstanceOutputOutputs {
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
export class PointCloudOutputNode implements OutputNodeBase {
  readonly type = NodeTypes.PointCloudOutput;
  readonly name = 'Point Cloud Output';
  
  inputs: PointCloudOutputInputs = {
    points: null,
    positions: [],
    colors: [],
    sizes: [],
  };
  
  outputs: PointCloudOutputOutputs = {
    pointCloud: null,
  };

  execute(): PointCloudOutputOutputs {
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
export class LineOutputNode implements OutputNodeBase {
  readonly type = NodeTypes.LineOutput;
  readonly name = 'Line Output';
  
  inputs: LineOutputInputs = {
    start: [0, 0, 0],
    end: [1, 1, 1],
    color: [1, 1, 1],
    lineWidth: 1,
  };
  
  outputs: LineOutputOutputs = {
    line: null,
  };

  execute(): LineOutputOutputs {
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
export class TextOutputNode implements OutputNodeBase {
  readonly type = NodeTypes.TextOutput;
  readonly name = 'Text Output';
  
  inputs: TextOutputInputs = {
    text: 'Text',
    fontSize: 1,
    color: [1, 1, 1],
    position: [0, 0, 0],
  };
  
  outputs: TextOutputOutputs = {
    textMesh: null,
  };

  execute(): TextOutputOutputs {
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
export class BoundingBoxOutputNode implements OutputNodeBase {
  readonly type = NodeTypes.BoundingBoxOutput;
  readonly name = 'Bounding Box Output';
  
  inputs: BoundingBoxOutputInputs = {
    geometry: null,
    color: [1, 1, 1],
    lineWidth: 1,
  };
  
  outputs: BoundingBoxOutputOutputs = {
    boundingBox: null,
    min: [0, 0, 0],
    max: [0, 0, 0],
    center: [0, 0, 0],
    size: [0, 0, 0],
  };

  execute(): BoundingBoxOutputOutputs {
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
export class WireframeOutputNode implements OutputNodeBase {
  readonly type = NodeTypes.WireframeOutput;
  readonly name = 'Wireframe Output';
  
  inputs: WireframeOutputInputs = {
    geometry: null,
    color: [1, 1, 1],
    lineWidth: 1,
    opacity: 1,
  };
  
  outputs: WireframeOutputOutputs = {
    wireframe: null,
  };

  execute(): WireframeOutputOutputs {
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
export class DebugOutputNode implements OutputNodeBase {
  readonly type = NodeTypes.DebugOutput;
  readonly name = 'Debug Output';
  
  inputs: DebugOutputInputs = {
    value: null,
    label: 'Debug',
    enabled: true,
  };
  
  outputs: DebugOutputOutputs = {
    value: null,
    logged: false,
  };

  execute(): DebugOutputOutputs {
    const enabled = this.inputs.enabled ?? true;
    
    if (enabled) {
      console.log(`[Debug ${this.inputs.label}]:`, this.inputs.value);
      this.outputs.logged = true;
    } else {
      this.outputs.logged = false;
    }
    
    this.outputs.value = this.inputs.value;
    return this.outputs;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createGroupOutputNode(inputs?: Partial<GroupOutputInputs>): GroupOutputNode {
  const node = new GroupOutputNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createMaterialOutputNode(inputs?: Partial<MaterialOutputInputs>): MaterialOutputNode {
  const node = new MaterialOutputNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createCompositeOutputNode(inputs?: Partial<CompositeOutputInputs>): CompositeOutputNode {
  const node = new CompositeOutputNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createViewerNode(inputs?: Partial<ViewerNodeInputs>): ViewerNode {
  const node = new ViewerNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createSplitViewerNode(inputs?: Partial<SplitViewerNodeInputs>): SplitViewerNode {
  const node = new SplitViewerNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createLevelOfDetailNode(inputs?: Partial<LevelOfDetailInputs>): LevelOfDetailNode {
  const node = new LevelOfDetailNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createLODGroupOutputNode(inputs?: Partial<LODGroupOutputInputs>): LODGroupOutputNode {
  const node = new LODGroupOutputNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createRenderLayerNode(inputs?: Partial<RenderLayerInputs>): RenderLayerNode {
  const node = new RenderLayerNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createFileOutputNode(inputs?: Partial<FileOutputInputs>): FileOutputNode {
  const node = new FileOutputNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createImageOutputNode(inputs?: Partial<ImageOutputInputs>): ImageOutputNode {
  const node = new ImageOutputNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createDepthOutputNode(inputs?: Partial<DepthOutputInputs>): DepthOutputNode {
  const node = new DepthOutputNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createNormalOutputNode(inputs?: Partial<NormalOutputInputs>): NormalOutputNode {
  const node = new NormalOutputNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createUVOutputNode(inputs?: Partial<UVOutputInputs>): UVOutputNode {
  const node = new UVOutputNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createAlbedoOutputNode(inputs?: Partial<AlbedoOutputInputs>): AlbedoOutputNode {
  const node = new AlbedoOutputNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createEmissionOutputNode(inputs?: Partial<EmissionOutputInputs>): EmissionOutputNode {
  const node = new EmissionOutputNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createShadowOutputNode(inputs?: Partial<ShadowOutputInputs>): ShadowOutputNode {
  const node = new ShadowOutputNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createAmbientOcclusionOutputNode(inputs?: Partial<AmbientOcclusionOutputInputs>): AmbientOcclusionOutputNode {
  const node = new AmbientOcclusionOutputNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createInstanceOutputNode(inputs?: Partial<InstanceOutputInputs>): InstanceOutputNode {
  const node = new InstanceOutputNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createPointCloudOutputNode(inputs?: Partial<PointCloudOutputInputs>): PointCloudOutputNode {
  const node = new PointCloudOutputNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createLineOutputNode(inputs?: Partial<LineOutputInputs>): LineOutputNode {
  const node = new LineOutputNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createTextOutputNode(inputs?: Partial<TextOutputInputs>): TextOutputNode {
  const node = new TextOutputNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createBoundingBoxOutputNode(inputs?: Partial<BoundingBoxOutputInputs>): BoundingBoxOutputNode {
  const node = new BoundingBoxOutputNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createWireframeOutputNode(inputs?: Partial<WireframeOutputInputs>): WireframeOutputNode {
  const node = new WireframeOutputNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createDebugOutputNode(inputs?: Partial<DebugOutputInputs>): DebugOutputNode {
  const node = new DebugOutputNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}
