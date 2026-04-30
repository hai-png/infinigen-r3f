/**
 * Asset Factory - Hybrid Implementation
 * 
 * Prioritizes browser-side instantiation for rapid feedback while maintaining
 * hooks for Python-side complex generation.
 * 
 * Features:
 * 1. Procedural Primitive Generation (Box, Sphere, Cylinder, Plane)
 * 2. GLTF Model Loading
 * 3. Semantic Material Assignment based on tags
 * 4. State Application (Position, Rotation, Scale)
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import type { ObjectState } from '../../constraints/solver/types';
export type { ObjectState };
import type { AssetDescription } from '../domain/types';
export type { AssetDescription };

export interface AssetFactoryOptions {
  usePhysics?: boolean;
  defaultScale?: THREE.Vector3;
  assetPathPrefix?: string;
}

export class AssetFactory {
  private loader: GLTFLoader;
  private cache: Map<string, THREE.Object3D>;
  private options: Required<AssetFactoryOptions>;

  constructor(options: AssetFactoryOptions = {}) {
    this.options = {
      usePhysics: false,
      defaultScale: new THREE.Vector3(1, 1, 1),
      assetPathPrefix: '/assets/',
      ...options,
    };
    
    this.loader = new GLTFLoader();
    this.cache = new Map();
  }

  /**
   * Main entry point: Creates an object based on description and state
   */
  async createObject(
    description: AssetDescription,
    state?: ObjectState
  ): Promise<THREE.Object3D> {
    let mesh: THREE.Object3D;

    // 1. Try Procedural Generation first (Fast path)
    if (description.type === 'primitive') {
      mesh = this.createPrimitive(description.primitiveType!, description);
    } 
    // 2. Load External Asset (Async path)
    else if (description.type === 'model') {
      mesh = await this.loadModel(description.modelId!);
    } 
    // 3. Fallback to Box
    else {
      console.warn(`Unknown asset type: ${description.type}, falling back to box`);
      mesh = this.createPrimitive('box', description);
    }

    // 4. Apply Semantic Materials based on tags
    this.applySemanticMaterials(mesh, (description.tags instanceof Set ? Array.from(description.tags) : description.tags || []) as string[]);

    // 5. Apply State (Transform)
    if (state) {
      this.applyState(mesh, state);
    }

    return mesh;
  }

  /**
   * Creates procedural primitives using THREE geometries
   */
  private createPrimitive(
    type: 'box' | 'sphere' | 'cylinder' | 'plane',
    desc: AssetDescription
  ): THREE.Mesh {
    let geometry: THREE.BufferGeometry;
    const scale = this.toVector3(desc.scale || this.options.defaultScale);

    switch (type) {
      case 'box':
        geometry = new THREE.BoxGeometry(scale.x, scale.y, scale.z);
        break;
      case 'sphere':
        const radius = Math.max(scale.x, scale.y, scale.z) / 2;
        geometry = new THREE.SphereGeometry(radius, 32, 32);
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(
          scale.x / 2, 
          scale.z / 2, 
          scale.y, 
          32
        );
        break;
      case 'plane':
        geometry = new THREE.PlaneGeometry(scale.x, scale.z);
        break;
      default:
        geometry = new THREE.BoxGeometry(1, 1, 1);
    }

    const material = new THREE.MeshStandardMaterial({ 
      color: 0xcccccc,
      roughness: 0.5,
      metalness: 0.1
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // Store semantic data in userData for debugging/access
    mesh.userData.assetDescription = desc;
    
    return mesh;
  }

  /**
   * Loads a GLTF model with caching
   */
  private async loadModel(modelId: string): Promise<THREE.Object3D> {
    const cacheKey = modelId;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      return cached.clone(); // Clone to allow independent transforms
    }

    const url = `${this.options.assetPathPrefix}${modelId}.glb`;
    
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          const root = gltf.scene;
          root.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              (child as THREE.Mesh).castShadow = true;
              (child as THREE.Mesh).receiveShadow = true;
            }
          });
          
          this.cache.set(cacheKey, root);
          resolve(root.clone());
        },
        undefined,
        (error) => {
          console.error(`Failed to load model ${modelId}:`, error);
          // Fallback to primitive on error
          resolve(this.createPrimitive('box', { type: 'primitive', primitiveType: 'box' } as any));
        }
      );
    });
  }

  /**
   * Applies materials based on semantic tags
   * Implements hybrid logic: Simple colors in JS, complex shaders could come from Python config
   */
  private applySemanticMaterials(obj: THREE.Object3D, tags: string[]): void {
    const materialProps: Partial<THREE.MeshStandardMaterialParameters> = {};

    if (tags.includes('metal')) {
      materialProps.metalness = 0.9;
      materialProps.roughness = 0.2;
      materialProps.color = 0x888888;
    } else if (tags.includes('wood')) {
      materialProps.metalness = 0.0;
      materialProps.roughness = 0.8;
      materialProps.color = 0x8B4513;
    } else if (tags.includes('glass')) {
      materialProps.metalness = 0.1;
      materialProps.roughness = 0.0;
      materialProps.transparent = true;
      materialProps.opacity = 0.6;
      materialProps.color = 0xaaddff;
    } else if (tags.includes('fabric')) {
      materialProps.metalness = 0.0;
      materialProps.roughness = 1.0;
      materialProps.color = 0xdddddd;
    } else if (tags.includes('liquid')) {
      materialProps.metalness = 0.3;
      materialProps.roughness = 0.1;
      materialProps.transparent = true;
      materialProps.opacity = 0.8;
      materialProps.color = 0x0066cc;
    }

    if (Object.keys(materialProps).length > 0) {
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          // Merge with existing material or create new
          const baseMat = mesh.material as THREE.MeshStandardMaterial;
          mesh.material = baseMat.clone();
          Object.assign(mesh.material, materialProps);
        }
      });
    }
  }

  /**
   * Applies the solved state (position, rotation) to the mesh
   */
  private applyState(obj: THREE.Object3D, state: ObjectState): void {
    // Apply Position
    if (state.position) {
      obj.position.copy(state.position instanceof THREE.Vector3 ? state.position : new THREE.Vector3(state.position.x, state.position.y, state.position.z));
    }

    // Apply Rotation (Quaternion or Euler)
    if (state.rotation) {
      if (state.rotation instanceof THREE.Quaternion) {
        obj.quaternion.copy(state.rotation);
      } else {
        obj.rotation.setFromVector3(state.rotation instanceof THREE.Vector3 ? state.rotation : new THREE.Vector3(state.rotation.x, state.rotation.y, state.rotation.z));
      }
    } else if (state.yaw !== undefined) {
      // Handle specific yaw constraint if full rotation isn't set
      obj.rotation.y = state.yaw;
    }

    // Apply Scale if different from creation scale
    if (state.scale) {
      obj.scale.copy(state.scale instanceof THREE.Vector3 ? state.scale : new THREE.Vector3(state.scale.x, state.scale.y, state.scale.z));
    }
    
    // Mark as active/inactive based on state
    obj.visible = state.active !== false;
  }

  /**
   * Clears the internal model cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Convert a scale value (number or Vector3-like) to THREE.Vector3
   */
  private toVector3(scale: number | { x: number; y: number; z: number } | THREE.Vector3): THREE.Vector3 {
    if (typeof scale === 'number') {
      return new THREE.Vector3(scale, scale, scale);
    }
    if (scale instanceof THREE.Vector3) {
      return scale;
    }
    return new THREE.Vector3(scale.x, scale.y, scale.z);
  }
}

// Export singleton instance for convenience if needed
export const defaultAssetFactory = new AssetFactory();
