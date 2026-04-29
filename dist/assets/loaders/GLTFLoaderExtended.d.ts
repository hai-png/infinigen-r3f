/**
 * GLTFLoaderExtended.ts
 * Advanced GLTF loading with Draco compression, KTX2 textures, and instancing support
 * Part of Phase 3: Assets & Materials - 100% Completion
 */
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import type { AssetMetadata } from '../core/AssetTypes';
export interface GLTFLoadOptions {
    enableDraco?: boolean;
    enableKTX2?: boolean;
    enableMeshopt?: boolean;
    generateMipmaps?: boolean;
    anisotropy?: number;
    instantiateClusters?: boolean;
    clusterDistanceThreshold?: number;
}
export interface LoadedGLTF {
    gltf: GLTF;
    metadata: AssetMetadata;
    instances?: THREE.InstancedMesh[];
    loadTime: number;
}
export declare class GLTFLoaderExtended {
    private loader;
    private dracoLoader?;
    private ktx2Loader?;
    private resourceCache;
    private defaultOptions;
    constructor(baseUrl?: string);
    private initializeLoaders;
    load(url: string, options?: GLTFLoadOptions): Promise<LoadedGLTF>;
    private processMaterials;
    private generateMetadata;
    private createInstancedClusters;
    clearCache(): void;
    removeFromCache(url: string): void;
    dispose(): void;
}
export default GLTFLoaderExtended;
//# sourceMappingURL=GLTFLoaderExtended.d.ts.map