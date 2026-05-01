/**
 * Output Nodes - Render and scene output
 * Based on Blender output nodes and infinigen rendering pipeline
 * 
 * These nodes handle final scene output, rendering, and data export
 */

import * as THREE from 'three';
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
// Internal Utility
// ============================================================================

/** Try to extract a THREE.BufferGeometry from various input forms */
function toBufferGeometry(input: any): THREE.BufferGeometry | null {
  if (!input) return null;
  if (input instanceof THREE.BufferGeometry) return input;
  if (input instanceof THREE.Mesh) return input.geometry;
  if (input instanceof THREE.Group) {
    const mesh = input.children.find(c => c instanceof THREE.Mesh) as THREE.Mesh | undefined;
    return mesh?.geometry ?? null;
  }
  if (input.geometry instanceof THREE.BufferGeometry) return input.geometry;
  return null;
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
      lodLevels: geometries.map((geo: any, i: number) => ({
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
      const slotFiles = (this.inputs.slots || []).map((slot: FileOutputSlot) => {
        return `${baseDir}/${fileName}_${slot.path}.${format}`;
      });
      
      if (slotFiles.length === 0) {
        files.push(`${baseDir}/${fileName}_${frame.toString().padStart(4, '0')}.${format}`);
      } else {
        files.push(...slotFiles);
      }
    }
    
    this.outputs.files = files;
    return this.outputs;
  }
}

/**
 * Image Output Node
 * Encodes image data to base64 PNG via canvas
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
    const quality = (this.inputs.quality ?? 90) / 100;
    const image = this.inputs.image;

    // If we already have a data URL or blob, pass through
    if (typeof image === 'string' && image.startsWith('data:')) {
      this.outputs.url = image;
      return this.outputs;
    }
    if (image instanceof Blob) {
      this.outputs.blob = image;
      this.outputs.url = URL.createObjectURL(image);
      return this.outputs;
    }

    // If we have pixel data (Uint8ClampedArray / Float32Array / number[]), encode via canvas
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (image instanceof ImageData) {
          ctx.putImageData(image, 0, 0);
        } else if (image instanceof Uint8ClampedArray || image instanceof Uint8Array) {
          // Create a fresh Uint8ClampedArray backed by a plain ArrayBuffer
          const pixelData = new Uint8ClampedArray(image.length);
          pixelData.set(image instanceof Uint8ClampedArray ? image : new Uint8ClampedArray(image));
          const imageData = new ImageData(pixelData, width, height);
          ctx.putImageData(imageData, 0, 0);
        } else if (ArrayBuffer.isView(image) || image instanceof ArrayBuffer) {
          const raw = image instanceof ArrayBuffer ? new Uint8Array(image) : new Uint8Array((image as ArrayBufferView).buffer);
          const pixelData = new Uint8ClampedArray(raw.length);
          pixelData.set(raw);
          const imageData = new ImageData(pixelData, width, height);
          ctx.putImageData(imageData, 0, 0);
        } else if (image && typeof image === 'object' && image.data) {
          // Handle structured pixel data objects
          const src = image.data instanceof Uint8ClampedArray
            ? image.data
            : new Uint8ClampedArray(image.data as ArrayLike<number>);
          const pixelData = new Uint8ClampedArray(src.length);
          pixelData.set(src);
          const imageData = new ImageData(pixelData, width, height);
          ctx.putImageData(imageData, 0, 0);
        }

        const fmt: string = format;
        const mimeType = fmt === 'jpg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png';
        this.outputs.url = canvas.toDataURL(mimeType, quality);
        canvas.toBlob((blob) => {
          if (blob) this.outputs.blob = blob;
        }, mimeType, quality);
      }
    } catch {
      // Fallback for non-browser environments (e.g., SSR / node)
      this.outputs.url = `data:image/${format};base64,placeholder_${width}x${height}_q${Math.round(quality * 100)}`;
    }

    return this.outputs;
  }
}

/**
 * Depth Output Node
 * Computes depth from geometry positions
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
    const depth = this.inputs.depth;

    // If depth data is already provided, process it
    if (depth instanceof Float32Array || depth instanceof Uint8Array || Array.isArray(depth)) {
      const values = Array.isArray(depth) ? depth : Array.from(depth as ArrayLike<number>);
      const numericValues = values.filter((v: any) => typeof v === 'number') as number[];

      if (numericValues.length > 0) {
        const minDepth = Math.min(...numericValues);
        const maxDepth = Math.max(...numericValues);

        if (normalize && maxDepth > minDepth) {
          const normalized = numericValues.map(v => (v - minDepth) / (maxDepth - minDepth));
          this.outputs.depthMap = normalized;
        } else {
          this.outputs.depthMap = numericValues;
        }

        this.outputs.minDepth = minDepth;
        this.outputs.maxDepth = maxDepth;
        return this.outputs;
      }
    }

    // Try to extract depth from geometry
    const geometry = toBufferGeometry(depth);
    if (geometry && geometry.attributes.position) {
      const positions = geometry.attributes.position;
      const depths: number[] = [];
      let minD = Infinity;
      let maxD = -Infinity;

      for (let i = 0; i < positions.count; i++) {
        const z = positions.getZ(i);
        depths.push(z);
        if (z < minD) minD = z;
        if (z > maxD) maxD = z;
      }

      this.outputs.minDepth = minD;
      this.outputs.maxDepth = maxD;

      if (normalize && maxD > minD) {
        this.outputs.depthMap = depths.map(d => (d - minD) / (maxD - minD));
      } else {
        this.outputs.depthMap = depths;
      }
      return this.outputs;
    }

    // Fallback: use near/far range
    this.outputs.depthMap = depth;
    this.outputs.minDepth = near;
    this.outputs.maxDepth = far;
    return this.outputs;
  }
}

/**
 * Normal Output Node
 * Processes normals from geometry, supports space conversion
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
    const space = this.inputs.space || 'camera';
    const normal = this.inputs.normal;

    // If normal data is already provided, just annotate with space
    if (normal && typeof normal === 'object' && !((normal as any) instanceof THREE.BufferGeometry)) {
      this.outputs.normalMap = { data: normal, space };
      return this.outputs;
    }

    // Try to extract normals from geometry
    const geometry = toBufferGeometry(normal);
    if (geometry) {
      if (!geometry.attributes.normal) {
        geometry.computeVertexNormals();
      }

      const normalAttr = geometry.attributes.normal;
      if (normalAttr) {
        const normals: [number, number, number][] = [];
        for (let i = 0; i < normalAttr.count; i++) {
          const nx = normalAttr.getX(i);
          const ny = normalAttr.getY(i);
          const nz = normalAttr.getZ(i);
          // Encode normals from [-1,1] to [0,1] for texture storage
          if (space === 'world' || space === 'camera') {
            normals.push([nx * 0.5 + 0.5, ny * 0.5 + 0.5, nz * 0.5 + 0.5]);
          } else {
            normals.push([nx, ny, nz]);
          }
        }
        this.outputs.normalMap = { data: normals, space, count: normalAttr.count };
        return this.outputs;
      }
    }

    this.outputs.normalMap = null;
    return this.outputs;
  }
}

/**
 * UV Output Node
 * Processes UV data from geometry
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
    const width = this.inputs.width ?? 1024;
    const height = this.inputs.height ?? 1024;
    const uv = this.inputs.uv;

    // If UV data is already processed, pass through
    if (uv && typeof uv === 'object' && !((uv as any) instanceof THREE.BufferGeometry)) {
      this.outputs.uvMap = { data: uv, width, height };
      return this.outputs;
    }

    // Try to extract UVs from geometry
    const geometry = toBufferGeometry(uv);
    if (geometry) {
      const uvAttr = geometry.attributes.uv || geometry.getAttribute('uv1') || geometry.getAttribute('uv2');
      if (uvAttr) {
        const uvs: [number, number][] = [];
        for (let i = 0; i < uvAttr.count; i++) {
          uvs.push([uvAttr.getX(i), uvAttr.getY(i)]);
        }
        this.outputs.uvMap = { data: uvs, width, height, count: uvAttr.count };
        return this.outputs;
      }
    }

    this.outputs.uvMap = null;
    return this.outputs;
  }
}

/**
 * Albedo Output Node
 * Extracts vertex colors from geometry as albedo data
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
    const albedo = this.inputs.albedo;

    // If albedo data is already provided, pass through
    if (albedo && typeof albedo === 'object' && !((albedo as any) instanceof THREE.BufferGeometry)) {
      this.outputs.albedoMap = albedo;
      return this.outputs;
    }

    // Try to extract vertex colors from geometry
    const geometry = toBufferGeometry(albedo);
    if (geometry) {
      for (const attrName of ['color', 'color0']) {
        if (geometry.hasAttribute(attrName)) {
          const colorAttr = geometry.getAttribute(attrName);
          const colors: [number, number, number][] = [];
          for (let i = 0; i < colorAttr.count; i++) {
            if (colorAttr.itemSize >= 3) {
              colors.push([colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i)]);
            } else {
              const v = colorAttr.getX(i);
              colors.push([v, v, v]);
            }
          }
          this.outputs.albedoMap = { data: colors, count: colorAttr.count };
          return this.outputs;
        }
      }

      // Fallback: use material color if available
      const mesh = albedo instanceof THREE.Mesh ? albedo : null;
      if (mesh && mesh.material instanceof THREE.MeshStandardMaterial) {
        const c = mesh.material.color;
        this.outputs.albedoMap = { data: [[c.r, c.g, c.b]], count: 1 };
        return this.outputs;
      }
    }

    this.outputs.albedoMap = null;
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
 * Computes shadow map using N·L (dot product of normal and light direction)
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
    const lightPos = this.inputs.lightPosition || [0, 10, 0];
    const shadow = this.inputs.shadow;

    // Try to compute shadow from geometry
    const geometry = toBufferGeometry(shadow);
    if (geometry) {
      if (!geometry.attributes.normal) {
        geometry.computeVertexNormals();
      }

      const normalAttr = geometry.attributes.normal;
      const posAttr = geometry.attributes.position;

      if (normalAttr && posAttr) {
        const lightDir = new THREE.Vector3(lightPos[0], lightPos[1], lightPos[2]).normalize();
        const shadowValues: number[] = [];

        for (let i = 0; i < normalAttr.count; i++) {
          const nx = normalAttr.getX(i);
          const ny = normalAttr.getY(i);
          const nz = normalAttr.getZ(i);
          const normal = new THREE.Vector3(nx, ny, nz).normalize();

          // N·L shadow: 1 = fully lit, 0 = fully shadowed, negative = backface
          const nDotL = Math.max(0, normal.dot(lightDir));
          shadowValues.push(nDotL);
        }

        this.outputs.shadowMap = {
          data: shadowValues,
          lightPosition: lightPos,
          count: normalAttr.count,
        };
        return this.outputs;
      }
    }

    this.outputs.shadowMap = {
      data: shadow,
      lightPosition: lightPos,
    };
    return this.outputs;
  }
}

/**
 * Ambient Occlusion Output Node
 * Computes hemisphere AO sampling for each vertex
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
    const sampleCount = this.inputs.samples ?? 16;
    const aoDistance = this.inputs.distance ?? 1;
    const ao = this.inputs.ao;

    // Try to compute AO from geometry
    const geometry = toBufferGeometry(ao);
    if (geometry) {
      if (!geometry.attributes.normal) {
        geometry.computeVertexNormals();
      }

      const normalAttr = geometry.attributes.normal;
      const posAttr = geometry.attributes.position;

      if (normalAttr && posAttr) {
        const aoValues: number[] = [];

        for (let i = 0; i < normalAttr.count; i++) {
          const nx = normalAttr.getX(i);
          const ny = normalAttr.getY(i);
          const nz = normalAttr.getZ(i);
          const normal = new THREE.Vector3(nx, ny, nz).normalize();

          // Build tangent frame for hemisphere sampling
          const up = Math.abs(normal.y) < 0.99
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(1, 0, 0);
          const tangent = new THREE.Vector3().crossVectors(normal, up).normalize();
          const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();

          // Cosine-weighted hemisphere sampling (simplified AO)
          let occlusion = 0;
          for (let s = 0; s < sampleCount; s++) {
            // Random direction in hemisphere using Fibonacci sphere + cos-weighting
            const phi = 2 * Math.PI * s / sampleCount;
            const cosTheta = Math.random(); // cos-weighted
            const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);

            const sampleDir = new THREE.Vector3()
              .addScaledVector(tangent, sinTheta * Math.cos(phi))
              .addScaledVector(bitangent, sinTheta * Math.sin(phi))
              .addScaledVector(normal, cosTheta)
              .normalize();

            // Check if sample direction is occluded by other faces
            // Simplified: use face normal consistency as proxy
            const sampleOcclusion = sampleDir.dot(normal) < 0 ? 1 : 0;
            occlusion += sampleOcclusion;
          }

          // AO value: 0 = fully occluded, 1 = fully open
          const aoValue = 1 - occlusion / sampleCount;
          aoValues.push(aoValue);
        }

        this.outputs.aoMap = {
          data: aoValues,
          samples: sampleCount,
          distance: aoDistance,
          count: normalAttr.count,
        };
        return this.outputs;
      }
    }

    this.outputs.aoMap = {
      data: ao,
      samples: sampleCount,
      distance: aoDistance,
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
 * Computes actual bounding box from geometry
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
    const geometry = toBufferGeometry(this.inputs.geometry);

    if (geometry) {
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;

      if (box) {
        const min = box.min;
        const max = box.max;
        const center = new THREE.Vector3();
        box.getCenter(center);
        const size = new THREE.Vector3();
        box.getSize(size);

        this.outputs.min = [min.x, min.y, min.z];
        this.outputs.max = [max.x, max.y, max.z];
        this.outputs.center = [center.x, center.y, center.z];
        this.outputs.size = [size.x, size.y, size.z];

        // Create a visible bounding box mesh using Box3Helper-style geometry
        const boxGeo = new THREE.BoxGeometry(size.x, size.y, size.z);
        const edges = new THREE.EdgesGeometry(boxGeo);
        const lineMat = new THREE.LineBasicMaterial({
          color: new THREE.Color(
            (this.inputs.color?.[0] ?? 1),
            (this.inputs.color?.[1] ?? 1),
            (this.inputs.color?.[2] ?? 1)
          ),
        });
        const lineSegments = new THREE.LineSegments(edges, lineMat);
        lineSegments.position.copy(center);

        this.outputs.boundingBox = lineSegments;
        return this.outputs;
      }
    }

    // Fallback for non-geometry inputs that might be Object3D
    if (this.inputs.geometry instanceof THREE.Object3D) {
      const box = new THREE.Box3().setFromObject(this.inputs.geometry);
      const min = box.min;
      const max = box.max;
      const center = new THREE.Vector3();
      box.getCenter(center);
      const size = new THREE.Vector3();
      box.getSize(size);

      this.outputs.min = [min.x, min.y, min.z];
      this.outputs.max = [max.x, max.y, max.z];
      this.outputs.center = [center.x, center.y, center.z];
      this.outputs.size = [size.x, size.y, size.z];

      const boxGeo = new THREE.BoxGeometry(size.x, size.y, size.z);
      const edges = new THREE.EdgesGeometry(boxGeo);
      const lineMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(
          (this.inputs.color?.[0] ?? 1),
          (this.inputs.color?.[1] ?? 1),
          (this.inputs.color?.[2] ?? 1)
        ),
      });
      const lineSegments = new THREE.LineSegments(edges, lineMat);
      lineSegments.position.copy(center);
      this.outputs.boundingBox = lineSegments;
      return this.outputs;
    }

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
 * Extracts edges via EdgesGeometry from input geometry
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
    const geometry = toBufferGeometry(this.inputs.geometry);
    const color = this.inputs.color || [1, 1, 1];
    const lineWidth = this.inputs.lineWidth ?? 1;
    const opacity = this.inputs.opacity ?? 1;

    if (geometry) {
      // Create wireframe using EdgesGeometry
      const edges = new THREE.EdgesGeometry(geometry);
      const lineMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(color[0], color[1], color[2]),
        transparent: opacity < 1,
        opacity: opacity,
      });
      const wireframe = new THREE.LineSegments(edges, lineMat);
      this.outputs.wireframe = wireframe;
      return this.outputs;
    }

    this.outputs.wireframe = {
      geometry: this.inputs.geometry,
      color,
      lineWidth,
      opacity,
    };
    return this.outputs;
  }
}

/**
 * Debug Output Node
 * Produces structured debug output with type info
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
      const value = this.inputs.value;
      // Produce structured debug info
      const debugInfo = {
        label: this.inputs.label || 'Debug',
        timestamp: Date.now(),
        type: value === null ? 'null'
          : value === undefined ? 'undefined'
          : Array.isArray(value) ? `array[${value.length}]`
          : value instanceof THREE.BufferGeometry ? 'BufferGeometry'
          : value instanceof THREE.Mesh ? 'Mesh'
          : value instanceof THREE.Object3D ? 'Object3D'
          : typeof value,
        value: value,
      };
      console.log(`[Debug ${debugInfo.label}]:`, debugInfo);
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
