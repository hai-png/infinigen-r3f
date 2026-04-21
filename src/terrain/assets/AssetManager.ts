/**
 * Asset Integration System
 * 
 * Provides GLTF model loading, instancing, and scattering for terrain decoration.
 * Integrates with the existing scatter systems to place 3D assets on terrain.
 * 
 * Features:
 * - GLTF/GLB model loading
 * - GPU instancing for performance
 * - LOD support for distant objects
 * - Procedural placement with constraints
 * - Batch rendering optimization
 * 
 * @see https://github.com/princeton-vl/infinigen
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { InstancedMesh } from 'three';

export interface AssetParams {
  // Loading
  modelPath: string;
  loadTimeout: number;
  
  // Instancing
  maxInstances: number;
  enableLOD: boolean;
  lodDistances: number[];
  
  // Placement
  minScale: number;
  maxScale: number;
  scaleVariation: number;
  rotationVariation: number;
  
  // Performance
  frustumCulled: boolean;
  shadowCaster: boolean;
  shadowReceiver: boolean;
}

const DEFAULT_ASSET_PARAMS: AssetParams = {
  modelPath: '',
  loadTimeout: 30000,
  maxInstances: 1000,
  enableLOD: true,
  lodDistances: [20, 50, 100],
  minScale: 0.8,
  maxScale: 1.2,
  scaleVariation: 0.3,
  rotationVariation: Math.PI * 2,
  frustumCulled: true,
  shadowCaster: true,
  shadowReceiver: false,
};

export interface AssetInstance {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  metadata?: Record<string, any>;
}

/**
 * Asset loader and manager for terrain decoration
 */
export class AssetManager {
  private scene: THREE.Scene;
  private loader: GLTFLoader;
  private params: AssetParams;
  
  private loadedModels: Map<string, THREE.Group>;
  private instancedMeshes: Map<string, InstancedMesh>;
  private instanceData: Map<string, AssetInstance[]>;
  private dummyMatrix: THREE.Matrix4;
  
  constructor(
    scene: THREE.Scene,
    params: Partial<AssetParams> = {}
  ) {
    this.scene = scene;
    this.params = { ...DEFAULT_ASSET_PARAMS, ...params };
    
    this.loader = new GLTFLoader();
    this.loadedModels = new Map();
    this.instancedMeshes = new Map();
    this.instanceData = new Map();
    this.dummyMatrix = new THREE.Matrix4();
  }
  
  /**
   * Load a GLTF model for instancing
   */
  async loadModel(modelPath: string): Promise<THREE.Group | null> {
    // Check cache
    if (this.loadedModels.has(modelPath)) {
      return this.loadedModels.get(modelPath) || null;
    }
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Loading timeout for ${modelPath}`));
      }, this.params.loadTimeout);
      
      this.loader.load(
        modelPath,
        (gltf) => {
          clearTimeout(timeoutId);
          
          const model = gltf.scene;
          
          // Optimize model for instancing
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = this.params.shadowCaster;
              child.receiveShadow = this.params.shadowReceiver;
              
              // Merge geometries if possible
              if (child.geometry) {
                child.geometry.center();
              }
            }
          });
          
          this.loadedModels.set(modelPath, model);
          resolve(model);
        },
        undefined,
        (error) => {
          clearTimeout(timeoutId);
          reject(error);
        }
      );
    });
  }
  
  /**
   * Create instanced mesh for a model
   */
  createInstancedMesh(
    modelPath: string,
    maxCount?: number
  ): Promise<InstancedMesh | null> {
    return new Promise(async (resolve, reject) => {
      try {
        const model = await this.loadModel(modelPath);
        if (!model) {
          resolve(null);
          return;
        }
        
        const count = maxCount || this.params.maxInstances;
        
        // Get first mesh as template
        let templateMesh: THREE.Mesh | null = null;
        model.traverse((child) => {
          if (child instanceof THREE.Mesh && !templateMesh) {
            templateMesh = child;
          }
        });
        
        if (!templateMesh) {
          resolve(null);
          return;
        }
        
        const geometry = templateMesh.geometry;
        const material = templateMesh.material as THREE.Material | THREE.Material[];
        
        const instancedMesh = new InstancedMesh(geometry, material, count);
        instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        instancedMesh.frustumCulled = this.params.frustumCulled;
        instancedMesh.castShadow = this.params.shadowCaster;
        instancedMesh.receiveShadow = this.params.shadowReceiver;
        
        // Initialize with identity matrices
        for (let i = 0; i < count; i++) {
          instancedMesh.setMatrixAt(i, this.dummyMatrix.identity());
        }
        
        this.scene.add(instancedMesh);
        this.instancedMeshes.set(modelPath, instancedMesh);
        this.instanceData.set(modelPath, []);
        
        resolve(instancedMesh);
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Add an instance to the instanced mesh
   */
  addInstance(
    modelPath: string,
    position: THREE.Vector3,
    rotation?: THREE.Euler,
    scale?: THREE.Vector3,
    metadata?: Record<string, any>
  ): number | null {
    const instances = this.instanceData.get(modelPath);
    const instancedMesh = this.instancedMeshes.get(modelPath);
    
    if (!instances || !instancedMesh) {
      return null;
    }
    
    if (instances.length >= this.params.maxInstances) {
      console.warn(`Max instances (${this.params.maxInstances}) reached for ${modelPath}`);
      return null;
    }
    
    // Apply variations
    const finalRotation = rotation || new THREE.Euler(
      0,
      Math.random() * this.params.rotationVariation,
      0
    );
    
    const randomScale = 1.0 + (Math.random() - 0.5) * this.params.scaleVariation;
    const finalScale = scale || new THREE.Vector3(
      randomScale,
      randomScale,
      randomScale
    );
    
    // Create instance data
    const instance: AssetInstance = {
      position: position.clone(),
      rotation: finalRotation,
      scale: finalScale,
      metadata,
    };
    
    const instanceIndex = instances.length;
    instances.push(instance);
    
    // Update matrix
    this.dummyMatrix.makeRotationFromEuler(finalRotation);
    this.dummyMatrix.setPosition(position);
    this.dummyMatrix.scale(finalScale);
    
    instancedMesh.setMatrixAt(instanceIndex, this.dummyMatrix);
    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.count = instances.length;
    
    return instanceIndex;
  }
  
  /**
   * Add multiple instances at once (batch operation)
   */
  addInstances(
    modelPath: string,
    instances: Array<{
      position: THREE.Vector3;
      rotation?: THREE.Euler;
      scale?: THREE.Vector3;
      metadata?: Record<string, any>;
    }>
  ): number[] {
    const indices: number[] = [];
    
    for (const instance of instances) {
      const index = this.addInstance(
        modelPath,
        instance.position,
        instance.rotation,
        instance.scale,
        instance.metadata
      );
      
      if (index !== null) {
        indices.push(index);
      }
    }
    
    return indices;
  }
  
  /**
   * Remove an instance by index
   */
  removeInstance(modelPath: string, index: number): void {
    const instances = this.instanceData.get(modelPath);
    const instancedMesh = this.instancedMeshes.get(modelPath);
    
    if (!instances || !instancedMesh || index < 0 || index >= instances.length) {
      return;
    }
    
    // Remove from array
    instances.splice(index, 1);
    
    // Rebuild matrices
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      this.dummyMatrix.makeRotationFromEuler(inst.rotation);
      this.dummyMatrix.setPosition(inst.position);
      this.dummyMatrix.scale(inst.scale);
      instancedMesh.setMatrixAt(i, this.dummyMatrix);
    }
    
    instancedMesh.count = instances.length;
    instancedMesh.instanceMatrix.needsUpdate = true;
  }
  
  /**
   * Clear all instances for a model
   */
  clearInstances(modelPath: string): void {
    const instances = this.instanceData.get(modelPath);
    if (instances) {
      instances.length = 0;
    }
    
    const instancedMesh = this.instancedMeshes.get(modelPath);
    if (instancedMesh) {
      instancedMesh.count = 0;
      instancedMesh.instanceMatrix.needsUpdate = true;
    }
  }
  
  /**
   * Get instance count for a model
   */
  getInstanceCount(modelPath: string): number {
    const instances = this.instanceData.get(modelPath);
    return instances ? instances.length : 0;
  }
  
  /**
   * Update a single instance transform
   */
  updateInstance(
    modelPath: string,
    index: number,
    position?: THREE.Vector3,
    rotation?: THREE.Euler,
    scale?: THREE.Vector3
  ): void {
    const instances = this.instanceData.get(modelPath);
    const instancedMesh = this.instancedMeshes.get(modelPath);
    
    if (!instances || !instancedMesh || index < 0 || index >= instances.length) {
      return;
    }
    
    const instance = instances[index];
    
    if (position) instance.position.copy(position);
    if (rotation) instance.rotation.copy(rotation);
    if (scale) instance.scale.copy(scale);
    
    this.dummyMatrix.makeRotationFromEuler(instance.rotation);
    this.dummyMatrix.setPosition(instance.position);
    this.dummyMatrix.scale(instance.scale);
    
    instancedMesh.setMatrixAt(index, this.dummyMatrix);
    instancedMesh.instanceMatrix.needsUpdate = true;
  }
  
  /**
   * Get all instances for a model
   */
  getInstances(modelPath: string): AssetInstance[] {
    const instances = this.instanceData.get(modelPath);
    return instances ? [...instances] : [];
  }
  
  /**
   * Unload a model and remove all instances
   */
  unloadModel(modelPath: string): void {
    const instancedMesh = this.instancedMeshes.get(modelPath);
    if (instancedMesh) {
      this.scene.remove(instancedMesh);
      instancedMesh.dispose();
      this.instancedMeshes.delete(modelPath);
    }
    
    this.instanceData.delete(modelPath);
    this.loadedModels.delete(modelPath);
  }
  
  /**
   * Cleanup all resources
   */
  dispose(): void {
    for (const [modelPath, instancedMesh] of this.instancedMeshes) {
      this.scene.remove(instancedMesh);
      instancedMesh.dispose();
    }
    
    for (const model of this.loadedModels.values()) {
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }
    
    this.instancedMeshes.clear();
    this.instanceData.clear();
    this.loadedModels.clear();
  }
}

export default AssetManager;
