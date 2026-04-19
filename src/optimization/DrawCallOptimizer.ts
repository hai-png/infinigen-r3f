/**
 * DrawCallOptimizer - Analyzes and optimizes draw calls for better rendering performance
 * 
 * Provides tools to batch geometries, merge materials, and reduce state changes
 * to minimize GPU overhead in large scenes.
 */

import * as THREE from 'three';
import type { Object3D, Material, Geometry, BufferGeometry, Mesh } from 'three';

export interface DrawCallStats {
  /** Total number of draw calls */
  totalDrawCalls: number;
  /** Number of unique materials */
  uniqueMaterials: number;
  /** Number of unique geometries */
  uniqueGeometries: number;
  /** Objects grouped by material */
  materialGroups: Map<Material, Object3D[]>;
  /** Potential draw call reduction */
  potentialReduction: number;
  /** Optimization suggestions */
  suggestions: string[];
}

export interface OptimizationResult {
  /** Optimized scene graph */
  optimizedRoot: Object3D;
  /** Number of draw calls before optimization */
  beforeDrawCalls: number;
  /** Number of draw calls after optimization */
  afterDrawCalls: number;
  /** Reduction percentage */
  reductionPercent: number;
  /** Merged objects count */
  mergedObjects: number;
}

export interface BatchConfig {
  /** Maximum batch size (objects per batch) */
  maxBatchSize?: number;
  /** Merge objects with same material */
  mergeByMaterial?: boolean;
  /** Merge objects with same geometry */
  mergeByGeometry?: boolean;
  /** Minimum distance to consider objects separate */
  minDistance?: number;
  /** Preserve individual object transforms */
  preserveTransforms?: boolean;
}

/**
 * Analyzes a scene for draw call optimization opportunities
 */
export class DrawCallOptimizer {
  private scene: Object3D;
  
  constructor(scene: Object3D) {
    this.scene = scene;
  }
  
  /**
   * Analyze current draw call statistics
   */
  analyze(): DrawCallStats {
    const materialGroups = new Map<Material, Object3D[]>();
    const geometrySet = new Set<string>();
    let totalDrawCalls = 0;
    
    this.scene.traverse((object: Object3D) => {
      if (this.isRenderable(object)) {
        const mesh = object as Mesh;
        
        // Count draw calls
        if (mesh.geometry) {
          totalDrawCalls++;
          
          // Track unique geometries
          const geomId = this.getGeometryId(mesh.geometry);
          geometrySet.add(geomId);
        }
        
        // Group by material
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          
          materials.forEach(material => {
            if (!materialGroups.has(material)) {
              materialGroups.set(material, []);
            }
            materialGroups.get(material)!.push(object);
          });
        }
      }
    });
    
    const uniqueMaterials = materialGroups.size;
    const uniqueGeometries = geometrySet.size;
    
    // Calculate potential reduction
    // Objects with same material could potentially be batched
    let potentialBatches = 0;
    materialGroups.forEach(objects => {
      potentialBatches += Math.ceil(objects.length / 10); // Assume 10 objects per batch
    });
    
    const potentialReduction = totalDrawCalls - potentialBatches;
    
    // Generate suggestions
    const suggestions = this.generateSuggestions({
      totalDrawCalls,
      uniqueMaterials,
      uniqueGeometries,
      materialGroups,
      potentialReduction,
      suggestions: []
    });
    
    return {
      totalDrawCalls,
      uniqueMaterials,
      uniqueGeometries,
      materialGroups,
      potentialReduction: Math.max(0, potentialReduction),
      suggestions
    };
  }
  
  /**
   * Optimize scene by batching objects
   */
  optimize(config: BatchConfig = {}): OptimizationResult {
    const {
      maxBatchSize = 100,
      mergeByMaterial = true,
      mergeByGeometry = false,
      minDistance = 0.1,
      preserveTransforms = false
    } = config;
    
    const stats = this.analyze();
    const beforeDrawCalls = stats.totalDrawCalls;
    
    const optimizedRoot = new THREE.Group();
    let mergedObjects = 0;
    
    if (mergeByMaterial) {
      // Batch by material
      stats.materialGroups.forEach((objects, material) => {
        const batches = this.createMaterialBatches(objects, material, maxBatchSize, preserveTransforms);
        batches.forEach(batch => {
          optimizedRoot.add(batch);
          mergedObjects += objects.length;
        });
      });
    } else {
      // Keep original structure but apply optimizations
      this.scene.traverse((object: Object3D) => {
        if (this.isRenderable(object)) {
          const clone = object.clone();
          optimizedRoot.add(clone);
        }
      });
    }
    
    // Recalculate draw calls after optimization
    const afterDrawCalls = this.countDrawCalls(optimizedRoot);
    const reductionPercent = beforeDrawCalls > 0 
      ? ((beforeDrawCalls - afterDrawCalls) / beforeDrawCalls) * 100 
      : 0;
    
    return {
      optimizedRoot,
      beforeDrawCalls,
      afterDrawCalls,
      reductionPercent: Math.max(0, reductionPercent),
      mergedObjects
    };
  }
  
  /**
   * Create batches from objects sharing the same material
   */
  private createMaterialBatches(
    objects: Object3D[],
    material: Material,
    maxBatchSize: number,
    preserveTransforms: boolean
  ): Mesh[] {
    const batches: Mesh[] = [];
    
    for (let i = 0; i < objects.length; i += maxBatchSize) {
      const batchObjects = objects.slice(i, i + maxBatchSize);
      
      if (batchObjects.length === 1 && !preserveTransforms) {
        // Single object, just clone
        const obj = batchObjects[0] as Mesh;
        const batch = obj.clone() as Mesh;
        batches.push(batch);
      } else {
        // Multiple objects, merge geometries
        const mergedGeometry = this.mergeGeometries(
          batchObjects.map(obj => (obj as Mesh).geometry),
          batchObjects,
          preserveTransforms
        );
        
        if (mergedGeometry) {
          const batch = new THREE.Mesh(mergedGeometry, material);
          batches.push(batch);
        }
      }
    }
    
    return batches;
  }
  
  /**
   * Merge multiple geometries into one
   */
  private mergeGeometries(
    geometries: (BufferGeometry | null)[],
    objects: Object3D[],
    preserveTransforms: boolean
  ): BufferGeometry | null {
    const validGeometries = geometries.filter((g): g is BufferGeometry => g !== null);
    
    if (validGeometries.length === 0) return null;
    
    if (preserveTransforms) {
      // Apply transforms to geometries before merging
      const transformedGeometries = validGeometries.map((geom, idx) => {
        const cloned = geom.clone();
        const obj = objects[idx];
        if (obj) {
          cloned.applyMatrix4(obj.matrixWorld);
        }
        return cloned;
      });
      
      return this.mergeBufferGeometries(transformedGeometries);
    } else {
      return this.mergeBufferGeometries(validGeometries);
    }
  }
  
  /**
   * Merge array of buffer geometries
   */
  private mergeBufferGeometries(geometries: BufferGeometry[]): BufferGeometry | null {
    if (geometries.length === 0) return null;
    if (geometries.length === 1) return geometries[0].clone();
    
    try {
      // Use Three.js built-in merge if available
      const merged = new THREE.BufferGeometry();
      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      
      let indexOffset = 0;
      
      geometries.forEach(geom => {
        const pos = geom.attributes.position?.array as Float32Array;
        const norm = geom.attributes.normal?.array as Float32Array;
        const uv = geom.attributes.uv?.array as Float32Array;
        const idx = geom.index?.array as Uint16Array | Uint32Array;
        
        if (pos) positions.push(...Array.from(pos));
        if (norm) normals.push(...Array.from(norm));
        if (uv) uvs.push(...Array.from(uv));
        
        if (idx) {
          for (let i = 0; i < idx.length; i++) {
            indices.push(idx[i] + indexOffset);
          }
        } else {
          // No index, create one
          const vertexCount = pos ? pos.length / 3 : 0;
          for (let i = 0; i < vertexCount; i++) {
            indices.push(i + indexOffset);
          }
        }
        
        indexOffset += pos ? pos.length / 3 : 0;
      });
      
      merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      if (normals.length > 0) {
        merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      }
      if (uvs.length > 0) {
        merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      }
      merged.setIndex(indices);
      
      return merged;
    } catch (error) {
      console.warn('Failed to merge geometries:', error);
      return null;
    }
  }
  
  /**
   * Count draw calls in a scene
   */
  private countDrawCalls(root: Object3D): number {
    let count = 0;
    
    root.traverse((object: Object3D) => {
      if (this.isRenderable(object)) {
        const mesh = object as Mesh;
        if (mesh.geometry) {
          count++;
        }
      }
    });
    
    return count;
  }
  
  /**
   * Check if object is renderable
   */
  private isRenderable(object: Object3D): boolean {
    return 'isMesh' in object && object.visible;
  }
  
  /**
   * Get unique identifier for geometry
   */
  private getGeometryId(geometry: BufferGeometry): string {
    return `${geometry.id}-${geometry.attributes.position?.count || 0}`;
  }
  
  /**
   * Generate optimization suggestions
   */
  private generateSuggestions(stats: DrawCallStats): string[] {
    const suggestions: string[] = [];
    
    if (stats.totalDrawCalls > 1000) {
      suggestions.push(`High draw call count (${stats.totalDrawCalls}). Consider batching objects by material.`);
    }
    
    if (stats.uniqueMaterials > 50) {
      suggestions.push(`Many unique materials (${stats.uniqueMaterials}). Consider using texture atlases or shared materials.`);
    }
    
    if (stats.uniqueGeometries > 100) {
      suggestions.push(`Many unique geometries (${stats.uniqueGeometries}). Consider instancing for repeated objects.`);
    }
    
    // Check for small batches
    let smallBatchCount = 0;
    stats.materialGroups.forEach(objects => {
      if (objects.length < 5) {
        smallBatchCount++;
      }
    });
    
    if (smallBatchCount > stats.uniqueMaterials * 0.5) {
      suggestions.push(`Many materials have few objects. Consider consolidating materials.`);
    }
    
    if (stats.potentialReduction > 100) {
      suggestions.push(`Potential to reduce ${stats.potentialReduction} draw calls through batching.`);
    }
    
    return suggestions;
  }
  
  /**
   * Enable instancing for repeated geometries
   */
  convertToInstancedMeshes(maxInstances: number = 100): Object3D {
    const result = new THREE.Group();
    const geometryMap = new Map<string, { geometry: BufferGeometry, matrices: THREE.Matrix4[] }>();
    
    this.scene.traverse((object: Object3D) => {
      if (this.isRenderable(object)) {
        const mesh = object as Mesh;
        if (mesh.geometry) {
          const geomId = this.getGeometryId(mesh.geometry);
          
          if (!geometryMap.has(geomId)) {
            geometryMap.set(geomId, {
              geometry: mesh.geometry,
              matrices: []
            });
          }
          
          geometryMap.get(geomId)!.matrices.push(mesh.matrixWorld.clone());
        }
      }
    });
    
    // Create instanced meshes
    geometryMap.forEach(({ geometry, matrices }, geomId) => {
      if (matrices.length >= 2) {
        // Use instancing for repeated geometries
        const instanceCount = Math.min(matrices.length, maxInstances);
        const instancedMesh = new THREE.InstancedMesh(
          geometry,
          new THREE.MeshStandardMaterial(),
          instanceCount
        );
        
        for (let i = 0; i < instanceCount; i++) {
          instancedMesh.setMatrixAt(i, matrices[i]);
        }
        
        instancedMesh.instanceMatrix.needsUpdate = true;
        result.add(instancedMesh);
      } else {
        // Keep single objects as regular meshes
        matrices.forEach(matrix => {
          const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
          mesh.matrix.copy(matrix);
          mesh.matrixAutoUpdate = false;
          result.add(mesh);
        });
      }
    });
    
    return result;
  }
}

export default DrawCallOptimizer;
