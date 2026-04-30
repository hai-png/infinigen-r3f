/**
 * Type declarations for three.js examples/jsm modules
 * These modules exist at runtime but lack TypeScript type declarations
 */

declare module 'three/examples/jsm/loaders/GLTFLoader' {
  import { Loader, LoadingManager, Group, AnimationClip, Scene, Camera } from 'three';
  
  export interface GLTF {
    scene: Group;
    scenes: Group[];
    cameras: Camera[];
    animations: AnimationClip[];
    asset: {
      generator?: string;
      version?: string;
      [key: string]: any;
    };
    parser: any;
    userData: Record<string, any>;
  }
  
  export class GLTFLoader extends Loader {
    constructor(manager?: LoadingManager);
    load(
      url: string,
      onLoad: (gltf: GLTF) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (event: ErrorEvent) => void
    ): void;
    loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<GLTF>;
    setDRACOLoader(dracoLoader: any): this;
    setKTX2Loader(ktx2Loader: any): this;
    setMeshoptDecoder(meshoptDecoder: any): this;
    register(callback: (parser: any) => any): this;
    unregister(callback: (parser: any) => any): this;
    parse(data: ArrayBuffer | string, path: string, onLoad: (gltf: GLTF) => void, onError?: (error: ErrorEvent) => void): void;
    parseAsync(data: ArrayBuffer | string, path: string): Promise<GLTF>;
  }
}

declare module 'three/examples/jsm/loaders/DRACOLoader' {
  import { Loader, LoadingManager } from 'three';
  
  export class DRACOLoader extends Loader {
    constructor(manager?: LoadingManager);
    load(
      url: string,
      onLoad: (geometry: any) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (event: ErrorEvent) => void
    ): void;
    loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<any>;
    setDecoderPath(path: string): this;
    setDecoderConfig(config: { type?: string }): this;
    setWorkerLimit(workerLimit: number): this;
    preload(): this;
    dispose(): void;
  }
}

declare module 'three/examples/jsm/loaders/KTX2Loader' {
  import { Loader, LoadingManager, CompressedTexture, Texture } from 'three';
  
  export class KTX2Loader extends Loader {
    constructor(manager?: LoadingManager);
    load(
      url: string,
      onLoad: (texture: CompressedTexture | Texture) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (event: ErrorEvent) => void
    ): void;
    loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<CompressedTexture | Texture>;
    setTranscodeBasis(transcodeBasis: any): this;
    setTranscodeConfig(config: any): this;
    setWorkerLimit(workerLimit: number): this;
    detectSupport(renderer: any): this;
    dispose(): void;
  }
}

declare module 'three/examples/jsm/utils/BufferGeometryUtils' {
  import { BufferGeometry } from 'three';
  
  export function mergeBufferGeometries(
    geometries: BufferGeometry[],
    useGroups?: boolean
  ): BufferGeometry | null;
  export const mergeGeometries: typeof mergeBufferGeometries;
  export function mergeVertices(
    geometry: BufferGeometry,
    tolerance?: number
  ): BufferGeometry;
  export function computeTangents(
    geometry: BufferGeometry
  ): BufferGeometry;
  export function mergeAttributes(
    attributes: any[]
  ): any;
  export function interleaveAttributes(
    attributes: any[]
  ): any;
  export function estimateBytesUsed(
    geometry: BufferGeometry
  ): number;
}

declare module 'three/examples/jsm/libs/meshopt_decoder.module' {
  const MeshoptDecoder: {
    supported: boolean;
    ready: Promise<void>;
    decode: (
      buffer: ArrayBuffer,
      count: number,
      size: number,
      source?: ArrayBuffer,
      stride?: number
    ) => Promise<ArrayBuffer>;
    useWorkers: (count: number) => void;
  };
  
  export default MeshoptDecoder;
}

declare module 'three/examples/jsm/postprocessing/EffectComposer' {
  import { WebGLRenderer, WebGLRenderTarget } from 'three';
  
  export class EffectComposer {
    renderer: WebGLRenderer;
    renderTarget1: WebGLRenderTarget;
    renderTarget2: WebGLRenderTarget;
    renderToScreen: boolean;
    passes: any[];
    
    constructor(renderer: WebGLRenderer, renderTarget?: WebGLRenderTarget);
    swapBuffers(): void;
    addPass(pass: any): void;
    insertPass(pass: any, index: number): void;
    removePass(pass: any): void;
    isLastEnabledPass(passIndex: number): boolean;
    render(deltaTime?: number): void;
    reset(renderTarget?: WebGLRenderTarget): void;
    setSize(width: number, height: number): void;
    setPixelRatio(pixelRatio: number): void;
    dispose(): void;
  }
}

declare module 'three/examples/jsm/postprocessing/RenderPass' {
  import { Scene, Camera } from 'three';
  
  export class RenderPass {
    enabled: boolean;
    needsSwap: boolean;
    clear: boolean;
    renderToScreen: boolean;
    
    constructor(scene: Scene, camera: Camera, overrideMaterial?: any, clearColor?: number, clearAlpha?: number);
    render(renderer: any, writeBuffer: any, readBuffer: any, deltaTime: number, maskActive: boolean): void;
    setSize(width: number, height: number): void;
    dispose(): void;
  }
}

declare module 'three/examples/jsm/postprocessing/ShaderPass' {
  import { Shader } from 'three';
  
  export class ShaderPass {
    enabled: boolean;
    needsSwap: boolean;
    clear: boolean;
    renderToScreen: boolean;
    uniforms: Record<string, any>;
    material: any;
    fsQuad: any;
    
    constructor(shader: Shader | object, textureID?: string);
    render(renderer: any, writeBuffer: any, readBuffer: any, deltaTime: number, maskActive: boolean): void;
    dispose(): void;
  }
}

declare module 'three/examples/jsm/geometries/ConvexGeometry' {
  import { BufferGeometry, Vector3 } from 'three';
  
  export class ConvexGeometry extends BufferGeometry {
    constructor(points: Vector3[]);
  }
}

declare module 'three/examples/jsm/exporters/GLTFExporter' {
  export interface GLTFExporterOptions {
    binary?: boolean;
    maxTextureSize?: number;
    animations?: any[];
    includeCustomExtensions?: boolean;
    trs?: boolean;
    onlyVisible?: boolean;
    forcePowerOfTwoTextures?: boolean;
    embedImages?: boolean;
  }
  
  export class GLTFExporter {
    register(callback: (writer: any) => any): this;
    unregister(callback: (writer: any) => any): this;
    parse(
      input: any,
      onDone: (result: any) => void,
      onError?: (error: Error) => void,
      options?: GLTFExporterOptions
    ): void;
    parseAsync(
      input: any,
      options?: GLTFExporterOptions
    ): Promise<any>;
  }
}

declare module 'three/examples/jsm/libs/draco/draco_encoder' {
  export class DRACOEncoder {
    setQuantizationBits(quantizationBits: number): void;
    setEncodeSpeed(encodeSpeed: number): void;
    encodeMeshToMeshopt(mesh: any): ArrayBuffer;
    encodeMeshToDraco(mesh: any): ArrayBuffer;
    dispose(): void;
  }
}
