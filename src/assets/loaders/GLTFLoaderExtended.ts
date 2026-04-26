/**
 * GLTFLoaderExtended.ts
 * Advanced GLTF loading with Draco compression, KTX2 textures, and instancing support
 * Part of Phase 3: Assets & Materials - 100% Completion
 */

import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as THREE from 'three';
import type { AssetMetadata, LODDescription } from '../core/AssetTypes';

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

export class GLTFLoaderExtended {
  private loader: GLTFLoader;
  private dracoLoader?: DRACOLoader;
  private ktx2Loader?: KTX2Loader;
  private resourceCache: Map<string, LoadedGLTF>;
  private defaultOptions: Required<GLTFLoadOptions>;

  constructor(baseUrl: string = '') {
    this.loader = new GLTFLoader();
    if (baseUrl) {
      this.loader.setPath(baseUrl);
    }
    
    this.resourceCache = new Map();
    this.defaultOptions = {
      enableDraco: true,
      enableKTX2: true,
      enableMeshopt: true,
      generateMipmaps: true,
      anisotropy: 16,
      instantiateClusters: true,
      clusterDistanceThreshold: 0.01,
    };

    this.initializeLoaders();
  }

  private initializeLoaders(): void {
    // Initialize Draco Loader
    if (this.defaultOptions.enableDraco) {
      this.dracoLoader = new DRACOLoader();
      this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
      this.dracoLoader.setDecoderConfig({ type: 'js' });
      this.loader.setDRACOLoader(this.dracoLoader);
    }

    // Initialize KTX2 Loader
    if (this.defaultOptions.enableKTX2) {
      this.ktx2Loader = new KTX2Loader();
      this.ktx2Loader.setTranscoderPath('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/jsm/libs/basis/');
      this.ktx2Loader.detectSupport(new THREE.WebGLRenderer());
      this.loader.setKTX2Loader(this.ktx2Loader);
    }

    // Initialize Meshopt Decoder
    if (this.defaultOptions.enableMeshopt) {
      this.loader.setMeshoptDecoder(MeshoptDecoder);
    }
  }

  async load(
    url: string,
    options: GLTFLoadOptions = {}
  ): Promise<LoadedGLTF> {
    const startTime = performance.now();
    const opts = { ...this.defaultOptions, ...options };

    // Check cache
    const cacheKey = `${url}_${JSON.stringify(opts)}`;
    if (this.resourceCache.has(cacheKey)) {
      const cached = this.resourceCache.get(cacheKey)!;
      return {
        ...cached,
        loadTime: performance.now() - startTime,
      };
    }

    try {
      const gltf = await new Promise<GLTF>((resolve, reject) => {
        this.loader.load(
          url,
          resolve,
          (progress) => {
            console.debug(`Loading ${url}: ${(progress.loaded / progress.total) * 100}%`);
          },
          reject
        );
      });

      // Process materials and textures
      this.processMaterials(gltf, opts);

      // Generate metadata
      const metadata = this.generateMetadata(url, gltf);

      // Create instanced meshes for clustered geometry
      let instances: THREE.InstancedMesh[] | undefined;
      if (opts.instantiateClusters) {
        instances = this.createInstancedClusters(gltf, opts.clusterDistanceThreshold);
      }

      const result: LoadedGLTF = {
        gltf,
        metadata,
        instances,
        loadTime: performance.now() - startTime,
      };

      // Cache result
      this.resourceCache.set(cacheKey, result);

      return result;
    } catch (error) {
      console.error(`Failed to load GLTF ${url}:`, error);
      throw error;
    }
  }

  private processMaterials(gltf: GLTF, options: Required<GLTFLoadOptions>): void {
    gltf.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const material = child.material as THREE.MeshStandardMaterial;
        
        if (material.map && options.generateMipmaps) {
          material.map.needsUpdate = true;
          material.map.anisotropy = options.anisotropy;
        }

        if (material.normalMap) {
          material.normalMap.anisotropy = options.anisotropy;
        }

        if (material.roughnessMap) {
          material.roughnessMap.anisotropy = options.anisotropy;
        }

        if (material.metalnessMap) {
          material.metalnessMap.anisotropy = options.anisotropy;
        }

        // Enable shadow casting
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  private generateMetadata(url: string, gltf: GLTF): AssetMetadata {
    let triangleCount = 0;
    let vertexCount = 0;
    const materialCount = new Set<string>();
    const textureCount = new Set<string>();

    gltf.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const geometry = child.geometry;
        if (geometry.index) {
          triangleCount += geometry.index.count / 3;
        } else if (geometry.attributes.position) {
          triangleCount += geometry.attributes.position.count / 3;
        }
        vertexCount += geometry.attributes.position?.count || 0;

        if (child.material) {
          const materials = Array.isArray(child.material) 
            ? child.material 
            : [child.material];
          
          materials.forEach((mat, idx) => {
            materialCount.add(`${mat.uuid}-${idx}`);
            
            // Count textures
            Object.values(mat).forEach((prop) => {
              if (prop instanceof THREE.Texture) {
                textureCount.add(prop.uuid);
              }
            });
          });
        }
      }
    });

    return {
      name: url.split('/').pop() || 'unknown',
      url,
      type: 'model',
      category: 'imported',
      triangleCount: Math.floor(triangleCount),
      vertexCount,
      materialCount: materialCount.size,
      textureCount: textureCount.size,
      lodLevels: [],
      tags: ['imported', 'gltf'],
      createdAt: Date.now(),
    };
  }

  private createInstancedClusters(
    gltf: GLTF,
    threshold: number
  ): THREE.InstancedMesh[] {
    const instances: THREE.InstancedMesh[] = [];
    const meshGroups = new Map<string, { mesh: THREE.Mesh; matrices: THREE.Matrix4[] }>();

    // Group identical meshes
    gltf.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const key = `${child.geometry.uuid}-${Array.isArray(child.material) 
          ? child.material.map(m => m.uuid).join(',') 
          : child.material.uuid}`;

        if (!meshGroups.has(key)) {
          meshGroups.set(key, {
            mesh: child,
            matrices: [],
          });
        }

        const group = meshGroups.get(key)!;
        
        // Check if this transform is close to an existing one
        const isDuplicate = group.matrices.some((matrix) => {
          const diff = new THREE.Matrix4().copy(child.matrixWorld).multiply(matrix.clone().invert());
          const position = new THREE.Vector3();
          diff.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
          return position.length() < threshold;
        });

        if (!isDuplicate) {
          group.matrices.push(child.matrixWorld.clone());
        }
      }
    });

    // Create instanced meshes
    meshGroups.forEach(({ mesh, matrices }) => {
      if (matrices.length > 1) {
        const instancedMesh = new THREE.InstancedMesh(
          mesh.geometry,
          mesh.material,
          matrices.length
        );

        matrices.forEach((matrix, i) => {
          instancedMesh.setMatrixAt(i, matrix);
        });

        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;
        instances.push(instancedMesh);

        // Hide original meshes
        mesh.visible = false;
      }
    });

    return instances;
  }

  clearCache(): void {
    this.resourceCache.clear();
  }

  removeFromCache(url: string): void {
    const keysToDelete: string[] = [];
    this.resourceCache.forEach((_, key) => {
      if (key.startsWith(url)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => this.resourceCache.delete(key));
  }

  dispose(): void {
    this.clearCache();
    
    if (this.dracoLoader) {
      this.dracoLoader.dispose();
    }
    
    if (this.ktx2Loader) {
      this.ktx2Loader.dispose();
    }
  }
}

export default GLTFLoaderExtended;
