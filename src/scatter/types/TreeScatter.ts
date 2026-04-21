/**
 * TreeScatter - Tree distribution system for forest generation
 * 
 * Implements procedural tree placement with species variation,
 * density control, and natural forest patterns.
 * 
 * @module Scatter/Trees
 */

import * as THREE from 'three';
import { ScatterParams, ScatterInstance, ScatterResult } from './types/types';

export interface TreeScatterParams extends ScatterParams {
  /** Number of trees to place */
  count?: number;
  /** Tree density (trees per unit area) */
  density?: number;
  /** Minimum distance between trees */
  minDistance?: number;
  /** Maximum distance between trees */
  maxDistance?: number;
  /** Tree species to use */
  species?: 'oak' | 'pine' | 'birch' | 'maple' | 'mixed';
  /** Tree size category */
  sizeCategory?: 'sapling' | 'medium' | 'large' | 'mixed';
  /** Seasonal variation */
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
  /** Enable clustering for natural forest patterns */
  clustering?: boolean;
  /** Cluster intensity (0-1) */
  clusterIntensity?: number;
  /** Slope tolerance (0 = flat only, 1 = any slope) */
  slopeTolerance?: number;
  /** Height variation multiplier */
  heightVariation?: number;
  /** Trunk thickness variation */
  trunkVariation?: number;
  /** Canopy spread variation */
  canopyVariation?: number;
}

export interface TreeInstance extends ScatterInstance {
  species: string;
  size: 'sapling' | 'medium' | 'large';
  trunkRadius: number;
  canopyRadius: number;
  height: number;
  age: number;
}

/**
 * TreeScatter class for distributing trees across terrain
 * 
 * Features:
 * - Multiple tree species with procedural variation
 * - Natural clustering algorithms
 * - Size and age progression
 * - Slope-aware placement
 * - LOD support for performance
 */
export class TreeScatter {
  private params: Required<TreeScatterParams>;
  private instances: TreeInstance[] = [];

  constructor(params: TreeScatterParams = {}) {
    this.params = {
      count: params.count ?? 50,
      density: params.density ?? 0.5,
      minDistance: params.minDistance ?? 3,
      maxDistance: params.maxDistance ?? 15,
      species: params.species ?? 'mixed',
      sizeCategory: params.sizeCategory ?? 'mixed',
      season: params.season ?? 'summer',
      clustering: params.clustering ?? true,
      clusterIntensity: params.clusterIntensity ?? 0.6,
      slopeTolerance: params.slopeTolerance ?? 0.7,
      heightVariation: params.heightVariation ?? 0.3,
      trunkVariation: params.trunkVariation ?? 0.2,
      canopyVariation: params.canopyVariation ?? 0.25,
    };
  }

  /**
   * Apply tree scattering to a surface mesh
   */
  async apply(surface: THREE.Mesh): Promise<ScatterResult> {
    const geometry = surface.geometry;
    const positions = geometry.attributes.position.array as Float32Array;
    const normals = geometry.attributes.normal?.array as Float32Array;
    
    // Generate tree positions
    this.instances = this.generatePositions(positions, normals);
    
    // Create instanced meshes per species
    const scatterObjects = await this.createInstancedMeshes();
    
    // Create bounding box for culling
    const boundingBox = this.calculateBoundingBox();
    
    return {
      scatterObject: scatterObjects.length === 1 ? scatterObjects[0] : new THREE.Group().add(...scatterObjects),
      instances: this.instances,
      boundingBox,
      metadata: {
        scatterType: 'tree',
        count: this.instances.length,
        species: this.params.species,
        season: this.params.season,
      },
    };
  }

  /**
   * Generate tree positions using Poisson-disc sampling with clustering
   */
  private generatePositions(positions: Float32Array, normals: Float32Array): TreeInstance[] {
    const instances: TreeInstance[] = [];
    const vertexCount = positions.length / 3;
    
    // Calculate surface bounds
    const bounds = this.calculateBounds(positions);
    const surfaceArea = this.estimateSurfaceArea(bounds);
    
    // Determine actual count based on density or explicit count
    const targetCount = this.params.density > 0 
      ? Math.floor(surfaceArea * this.params.density)
      : this.params.count;
    
    // Generate cluster centers if clustering is enabled
    const clusterCenters = this.params.clustering 
      ? this.generateClusterCenters(targetCount, bounds)
      : [];
    
    // Species selection
    const availableSpecies = this.getAvailableSpecies();
    
    let attempts = 0;
    const maxAttempts = targetCount * 100;
    
    while (instances.length < targetCount && attempts < maxAttempts) {
      attempts++;
      
      // Select position based on clustering
      let position: THREE.Vector3;
      if (this.params.clustering && clusterCenters.length > 0 && Math.random() < this.params.clusterIntensity) {
        // Position near cluster center
        const cluster = clusterCenters[Math.floor(Math.random() * clusterCenters.length)];
        const offset = new THREE.Vector3(
          (Math.random() - 0.5) * this.params.maxDistance * 2,
          0,
          (Math.random() - 0.5) * this.params.maxDistance * 2
        );
        position = cluster.clone().add(offset);
      } else {
        // Random position on surface
        const vertexIndex = Math.floor(Math.random() * vertexCount) * 3;
        position = new THREE.Vector3(
          positions[vertexIndex],
          positions[vertexIndex + 1],
          positions[vertexIndex + 2]
        );
      }
      
      // Check minimum distance from existing trees
      if (!this.isValidPosition(position, instances)) {
        continue;
      }
      
      // Get normal at position (approximate)
      const normal = this.findNearestNormal(position, positions, normals);
      
      // Check slope tolerance
      if (!this.checkSlope(normal)) {
        continue;
      }
      
      // Select species and size
      const species = availableSpecies[Math.floor(Math.random() * availableSpecies.length)];
      const size = this.selectSize();
      
      // Calculate tree properties
      const baseHeight = this.getBaseHeight(species, size);
      const height = baseHeight * (1 + (Math.random() - 0.5) * this.params.heightVariation);
      const trunkRadius = (height * 0.1) * (1 + (Math.random() - 0.5) * this.params.trunkVariation);
      const canopyRadius = (height * 0.4) * (1 + (Math.random() - 0.5) * this.params.canopyVariation);
      
      // Align to surface normal
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      
      instances.push({
        position,
        rotation: new THREE.Euler().setFromQuaternion(quaternion),
        scale: new THREE.Vector3(1, 1, 1),
        species,
        size,
        trunkRadius,
        canopyRadius,
        height,
        age: this.calculateAge(size),
      });
    }
    
    return instances;
  }

  /**
   * Validate position against minimum distance constraint
   */
  private isValidPosition(position: THREE.Vector3, instances: TreeInstance[]): boolean {
    for (const instance of instances) {
      const distance = position.distanceTo(instance.position);
      if (distance < this.params.minDistance) {
        return false;
      }
    }
    return true;
  }

  /**
   * Generate cluster centers for natural forest patterns
   */
  private generateClusterCenters(targetCount: number, bounds: THREE.Box3): THREE.Vector3[] {
    const numClusters = Math.max(3, Math.floor(targetCount * 0.1));
    const centers: THREE.Vector3[] = [];
    
    for (let i = 0; i < numClusters; i++) {
      centers.push(new THREE.Vector3(
        bounds.min.x + Math.random() * (bounds.max.x - bounds.min.x),
        bounds.min.y + Math.random() * (bounds.max.y - bounds.min.y),
        bounds.min.z + Math.random() * (bounds.max.z - bounds.min.z)
      ));
    }
    
    return centers;
  }

  /**
   * Get available species based on parameter
   */
  private getAvailableSpecies(): string[] {
    if (this.params.species === 'mixed') {
      return ['oak', 'pine', 'birch', 'maple'];
    }
    return [this.params.species];
  }

  /**
   * Select tree size category
   */
  private selectSize(): 'sapling' | 'medium' | 'large' {
    if (this.params.sizeCategory !== 'mixed') {
      return this.params.sizeCategory;
    }
    
    const rand = Math.random();
    if (rand < 0.3) return 'sapling';
    if (rand < 0.7) return 'medium';
    return 'large';
  }

  /**
   * Get base height for species and size
   */
  private getBaseHeight(species: string, size: string): number {
    const heights: Record<string, Record<string, number>> = {
      oak: { sapling: 2, medium: 8, large: 15 },
      pine: { sapling: 3, medium: 12, large: 25 },
      birch: { sapling: 2, medium: 10, large: 18 },
      maple: { sapling: 2, medium: 9, large: 16 },
    };
    
    return heights[species]?.[size] ?? 5;
  }

  /**
   * Calculate tree age based on size
   */
  private calculateAge(size: string): number {
    const ages: Record<string, number> = {
      sapling: Math.floor(Math.random() * 5) + 1,
      medium: Math.floor(Math.random() * 20) + 5,
      large: Math.floor(Math.random() * 50) + 25,
    };
    return ages[size] ?? 10;
  }

  /**
   * Check if slope is within tolerance
   */
  private checkSlope(normal: THREE.Vector3): boolean {
    const up = new THREE.Vector3(0, 1, 0);
    const angle = normal.angleTo(up);
    const maxAngle = Math.PI * 0.5 * this.params.slopeTolerance;
    return angle <= maxAngle;
  }

  /**
   * Find nearest normal for a position
   */
  private findNearestNormal(
    position: THREE.Vector3,
    positions: Float32Array,
    normals: Float32Array
  ): THREE.Vector3 {
    let nearestNormal = new THREE.Vector3(0, 1, 0);
    let minDistance = Infinity;
    
    for (let i = 0; i < positions.length; i += 3) {
      const vertexPos = new THREE.Vector3(
        positions[i],
        positions[i + 1],
        positions[i + 2]
      );
      const distance = position.distanceTo(vertexPos);
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestNormal = new THREE.Vector3(
          normals[i],
          normals[i + 1],
          normals[i + 2]
        ).normalize();
      }
      
      // Early exit if very close
      if (distance < 0.1) break;
    }
    
    return nearestNormal;
  }

  /**
   * Create instanced meshes for each species
   */
  private async createInstancedMeshes(): Promise<THREE.Object3D[]> {
    const objects: THREE.Object3D[] = [];
    
    // Group instances by species
    const bySpecies = new Map<string, TreeInstance[]>();
    for (const instance of this.instances) {
      if (!bySpecies.has(instance.species)) {
        bySpecies.set(instance.species, []);
      }
      bySpecies.get(instance.species)!.push(instance);
    }
    
    // Create instanced mesh per species
    for (const [species, speciesInstances] of bySpecies.entries()) {
      const mesh = await this.createTreeMesh(species, speciesInstances.length);
      
      for (let i = 0; i < speciesInstances.length; i++) {
        const instance = speciesInstances[i];
        mesh.setMatrixAt(i, this.getInstanceMatrix(instance));
      }
      
      mesh.instanceMatrix.needsUpdate = true;
      objects.push(mesh);
    }
    
    return objects;
  }

  /**
   * Create procedural tree mesh for a species
   */
  private async createTreeMesh(species: string, count: number): Promise<THREE.InstancedMesh> {
    // Create simple procedural tree geometry
    const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 4, 8);
    trunkGeometry.translate(0, 2, 0);
    
    const canopyGeometry = this.createCanopyGeometry(species);
    
    // Merge geometries
    const mergedGeometry = this.mergeGeometries([trunkGeometry, canopyGeometry]);
    
    // Create material based on species and season
    const material = this.createTreeMaterial(species);
    
    return new THREE.InstancedMesh(mergedGeometry, material, count);
  }

  /**
   * Create canopy geometry based on species
   */
  private createCanopyGeometry(species: string): THREE.BufferGeometry {
    switch (species) {
      case 'pine':
        // Cone-shaped canopy for pine trees
        return new THREE.ConeGeometry(2, 6, 8);
      case 'birch':
        // Elongated oval for birch
        const birchGeo = new THREE.SphereGeometry(2, 8, 8);
        birchGeo.scale(1, 1.5, 1);
        return birchGeo;
      case 'maple':
        // Round canopy for maple
        return new THREE.SphereGeometry(2.5, 8, 8);
      case 'oak':
      default:
        // Broad canopy for oak
        const oakGeo = new THREE.SphereGeometry(3, 8, 8);
        oakGeo.scale(1.2, 0.8, 1.2);
        return oakGeo;
    }
  }

  /**
   * Merge multiple geometries into one
   */
  private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    // Simple merge implementation
    const mergedGeometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    
    for (const geo of geometries) {
      const pos = geo.attributes.position.array as number[];
      const norm = geo.attributes.normal?.array as number[];
      const uv = geo.attributes.uv?.array as number[];
      
      positions.push(...pos);
      if (norm) normals.push(...norm);
      if (uv) uvs.push(...uv);
    }
    
    mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (normals.length > 0) {
      mergedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    }
    if (uvs.length > 0) {
      mergedGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    }
    
    return mergedGeometry;
  }

  /**
   * Create tree material based on species and season
   */
  private createTreeMaterial(species: string): THREE.MeshStandardMaterial {
    const colors: Record<string, Record<string, number>> = {
      spring: { oak: 0x4a7c23, pine: 0x2d5a1e, birch: 0x6b8e23, maple: 0x5a8f29 },
      summer: { oak: 0x2d5a1e, pine: 0x1e3f14, birch: 0x3a5f1f, maple: 0x2f4f1f },
      autumn: { oak: 0xb85c1e, pine: 0x2d5a1e, birch: 0xd4a017, maple: 0xc41e3a },
      winter: { oak: 0x4a4a4a, pine: 0x2d5a1e, birch: 0x5a5a5a, maple: 0x4a4a4a },
    };
    
    const color = colors[this.params.season]?.[species] ?? 0x2d5a1e;
    
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness: 0.1,
    });
  }

  /**
   * Create instance matrix from transform data
   */
  private getInstanceMatrix(instance: TreeInstance): THREE.Matrix4 {
    const matrix = new THREE.Matrix4();
    matrix.compose(instance.position, instance.rotation, instance.scale);
    return matrix;
  }

  /**
   * Calculate bounding box for all instances
   */
  private calculateBoundingBox(): THREE.Box3 {
    const box = new THREE.Box3();
    for (const instance of this.instances) {
      const sphere = new THREE.Sphere(instance.position, instance.canopyRadius);
      box.union(new THREE.Box3().setFromSphere(sphere));
    }
    return box;
  }

  /**
   * Calculate surface bounds from positions
   */
  private calculateBounds(positions: Float32Array): THREE.Box3 {
    const box = new THREE.Box3();
    for (let i = 0; i < positions.length; i += 3) {
      box.expandByPoint(new THREE.Vector3(
        positions[i],
        positions[i + 1],
        positions[i + 2]
      ));
    }
    return box;
  }

  /**
   * Estimate surface area from bounds
   */
  private estimateSurfaceArea(bounds: THREE.Box3): number {
    const width = bounds.max.x - bounds.min.x;
    const depth = bounds.max.z - bounds.min.z;
    return width * depth;
  }
}

export default TreeScatter;
