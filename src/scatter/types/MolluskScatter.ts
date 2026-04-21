/**
 * MolluskScatter - Clams, mussels, oysters and bivalve distribution
 * 
 * Features:
 * - Multiple mollusk types (clam, mussel, oyster, scallop)
 * - Opening/closing states based on environmental factors
 * - Clustered distribution on rocky substrates
 * - Size and age variations
 * - Substrate attachment simulation
 */

import * as THREE from 'three';
import type { ScatterParams, ScatterResult, ScatterInstance } from './types';

export interface MolluskScatterParams extends ScatterParams {
  /** Number of mollusk instances */
  count?: number;
  /** Mollusk types to include */
  types?: Array<'clam' | 'mussel' | 'oyster' | 'scallop'>;
  /** Substrate type */
  substrate?: 'rock' | 'sand' | 'mixed';
  /** Water depth */
  waterDepth?: number;
  /** Open probability (0-1) */
  openProbability?: number;
  /** Cluster factor for grouping */
  clusterFactor?: number;
  /** Minimum size */
  minSize?: number;
  /** Maximum size */
  maxSize?: number;
}

interface MolluskInstance extends ScatterInstance {
  type: string;
  size: number;
  isOpen: boolean;
  age: 'juvenile' | 'adult' | 'old';
}

export class MolluskScatter {
  private params: Required<MolluskScatterParams>;

  constructor(params: MolluskScatterParams = {}) {
    this.params = {
      count: params.count ?? 40,
      types: params.types ?? ['clam', 'mussel', 'oyster'],
      substrate: params.substrate ?? 'mixed',
      waterDepth: params.waterDepth ?? 5,
      openProbability: params.openProbability ?? 0.3,
      clusterFactor: params.clusterFactor ?? 0.6,
      minSize: params.minSize ?? 0.05,
      maxSize: params.maxSize ?? 0.3,
      volumeDensity: params.volumeDensity ?? 1,
      surfaceDensity: params.surfaceDensity ?? 1,
      scaleTapering: params.scaleTapering ?? 0,
      seed: params.seed ?? Math.random(),
      includeColliders: params.includeColliders ?? false,
    };
  }

  /**
   * Generate mollusk geometry based on type
   */
  private createMolluskGeometry(type: string, size: number, isOpen: boolean): THREE.BufferGeometry {
    switch (type) {
      case 'clam':
        return this.createClamGeometry(size, isOpen);
      case 'mussel':
        return this.createMusselGeometry(size, isOpen);
      case 'oyster':
        return this.createOysterGeometry(size, isOpen);
      case 'scallop':
        return this.createScallopGeometry(size, isOpen);
      default:
        return this.createClamGeometry(size, isOpen);
    }
  }

  /**
   * Create clam geometry (rounded bivalve)
   */
  private createClamGeometry(size: number, isOpen: boolean): THREE.BufferGeometry {
    const geometry = new THREE.SphereGeometry(size * 0.5, 16, 12);
    
    // Flatten to create bivalve shape
    const positions = geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] *= 0.4; // Compress Y
      positions[i + 2] *= 0.7; // Slight Z compression
    }
    
    // If open, separate the shells
    if (isOpen) {
      const originalPositions = positions.slice();
      const center = new THREE.Vector3();
      
      for (let i = 0; i < positions.length / 3; i++) {
        const y = positions[i * 3 + 1];
        if (y > 0) {
          positions[i * 3 + 1] += size * 0.15;
          positions[i * 3] += size * 0.05;
        } else {
          positions[i * 3 + 1] -= size * 0.15;
          positions[i * 3] -= size * 0.05;
        }
      }
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Create mussel geometry (elongated bivalve)
   */
  private createMusselGeometry(size: number, isOpen: boolean): THREE.BufferGeometry {
    const geometry = new THREE.CapsuleGeometry(size * 0.2, size * 0.6, 8, 12);
    
    // Orient horizontally
    geometry.rotateZ(Math.PI / 2);
    
    // Flatten slightly
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] *= 0.5;
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    if (isOpen) {
      // Separate shells slightly
      const posArray = geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < posArray.length / 3; i++) {
        const y = posArray[i * 3 + 1];
        if (y > 0) {
          posArray[i * 3 + 1] += size * 0.05;
        } else {
          posArray[i * 3 + 1] -= size * 0.05;
        }
      }
      geometry.attributes.position.needsUpdate = true;
    }
    
    return geometry;
  }

  /**
   * Create oyster geometry (irregular shape)
   */
  private createOysterGeometry(size: number, isOpen: boolean): THREE.BufferGeometry {
    const geometry = new THREE.SphereGeometry(size * 0.5, 16, 12);
    const positions = geometry.attributes.position.array as Float32Array;
    
    // Add irregular bumps
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      const noise = Math.sin(x * 15) * Math.cos(y * 15) * Math.sin(z * 15) * 0.1;
      const scale = 1 + noise;
      
      positions[i] *= scale;
      positions[i + 1] *= scale * 0.5;
      positions[i + 2] *= scale;
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Create scallop geometry (fan-shaped)
   */
  private createScallopGeometry(size: number, isOpen: boolean): THREE.BufferGeometry {
    // Create fan shape using partial sphere
    const geometry = new THREE.SphereGeometry(size * 0.5, 24, 12, 0, Math.PI * 1.5, 0, Math.PI * 0.5);
    
    const positions = geometry.attributes.position.array as Float32Array;
    
    // Flatten and add ridges
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Add radial ridges
      const angle = Math.atan2(z, x);
      const ridge = Math.sin(angle * 12) * 0.05;
      
      positions[i + 1] *= 0.3;
      positions[i] *= (1 + ridge);
      positions[i + 2] *= (1 + ridge);
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Create mollusk material
   */
  private createMolluskMaterial(type: string, size: number): THREE.Material {
    const colors: Record<string, number> = {
      clam: 0xf5deb3,
      mussel: 0x2c1810,
      oyster: 0x8b7355,
      scallop: 0xff6347,
    };
    
    const baseColor = colors[type] || colors.clam;
    
    return new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: type === 'mussel' ? 0.3 : 0.7,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Apply mollusk scatter to a surface
   */
  async apply(surface: THREE.Object3D): Promise<ScatterResult> {
    const rng = this.createRNG(this.params.seed);
    const instances: MolluskInstance[] = [];
    const geometries: Map<string, THREE.BufferGeometry> = new Map();
    const materials: Map<string, THREE.Material> = new Map();
    
    // Get surface bounding box
    const bbox = new THREE.Box3().setFromObject(surface);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    
    // Generate cluster centers if clustering is enabled
    const clusterCenters: THREE.Vector3[] = [];
    const numClusters = Math.floor(this.params.count * (1 - this.params.clusterFactor));
    
    for (let i = 0; i < numClusters; i++) {
      clusterCenters.push(
        new THREE.Vector3(
          center.x - size.x / 2 + rng() * size.x,
          center.y,
          center.z - size.z / 2 + rng() * size.z
        )
      );
    }
    
    for (let i = 0; i < this.params.count; i++) {
      const type = this.params.types[Math.floor(rng() * this.params.types.length)];
      const molluskSize = this.params.minSize + rng() * (this.params.maxSize - this.params.minSize);
      
      // Determine position (clustered or random)
      let position: THREE.Vector3;
      if (rng() < this.params.clusterFactor && clusterCenters.length > 0) {
        const clusterCenter = clusterCenters[Math.floor(rng() * clusterCenters.length)];
        const clusterRadius = Math.min(size.x, size.z) * 0.15;
        const angle = rng() * Math.PI * 2;
        const radius = rng() * clusterRadius;
        
        position = new THREE.Vector3(
          clusterCenter.x + Math.cos(angle) * radius,
          center.y,
          clusterCenter.z + Math.sin(angle) * radius
        );
      } else {
        position = new THREE.Vector3(
          center.x - size.x / 2 + rng() * size.x,
          center.y,
          center.z - size.z / 2 + rng() * size.z
        );
      }
      
      // Determine if open
      const isOpen = rng() < this.params.openProbability;
      
      // Age based on size
      let age: 'juvenile' | 'adult' | 'old';
      if (molluskSize < this.params.minSize * 1.5) {
        age = 'juvenile';
      } else if (molluskSize < this.params.maxSize * 0.7) {
        age = 'adult';
      } else {
        age = 'old';
      }
      
      // Random rotation
      const rotation = new THREE.Euler(
        0,
        rng() * Math.PI * 2,
        rng() * Math.PI * 0.1
      );
      
      const scale = new THREE.Vector3(
        0.8 + rng() * 0.4,
        0.8 + rng() * 0.4,
        0.8 + rng() * 0.4
      );
      
      instances.push({
        position,
        rotation,
        scale,
        type,
        size: molluskSize,
        isOpen,
        age,
      });
    }
    
    // Create meshes per type and open state
    const scatterGroup = new THREE.Group();
    
    for (const type of this.params.types) {
      for (const isOpenState of [false, true]) {
        const typeInstances = instances.filter(
          inst => inst.type === type && inst.isOpen === isOpenState
        );
        
        if (typeInstances.length === 0) continue;
        
        const avgSize = typeInstances.reduce((sum, inst) => sum + inst.size, 0) / typeInstances.length;
        
        const key = `${type}-${isOpenState}`;
        let geometry = geometries.get(key);
        if (!geometry) {
          geometry = this.createMolluskGeometry(type, avgSize, isOpenState);
          geometries.set(key, geometry);
        }
        
        let material = materials.get(type);
        if (!material) {
          material = this.createMolluskMaterial(type, avgSize);
          materials.set(type, material);
        }
        
        typeInstances.forEach((instance, index) => {
          const mesh = new THREE.Mesh(geometry.clone(), material);
          mesh.position.copy(instance.position);
          mesh.rotation.copy(instance.rotation);
          mesh.scale.copy(instance.scale);
          
          scatterGroup.add(mesh);
        });
      }
    }
    
    return {
      scatterObject: scatterGroup,
      instances: instances.map(inst => ({
        position: inst.position,
        rotation: inst.rotation,
        scale: inst.scale,
      })),
      metadata: {
        count: instances.length,
        types: this.params.types,
        substrate: this.params.substrate,
        clusterFactor: this.params.clusterFactor,
      },
    };
  }

  /**
   * Create seeded random number generator
   */
  private createRNG(seed: number): () => number {
    let s = seed * 2147483647;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  /**
   * Update parameters
   */
  updateParams(params: Partial<MolluskScatterParams>): void {
    this.params = { ...this.params, ...params };
  }
}
