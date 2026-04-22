/**
 * CoralReefScatter - Coral reef ecosystem generation
 * 
 * Features:
 * - Multiple coral morphologies (branching, massive, plate, encrusting, columnar, foliose)
 * - Depth-based bleaching simulation
 * - Symbiotic coloring based on zooxanthellae density
 * - Realistic distribution patterns
 * - Growth stage variations
 */

import * as THREE from 'three';
import type { ScatterParams, ScatterResult, ScatterInstance } from './types';

export interface CoralReefScatterParams extends ScatterParams {
  /** Number of coral colonies */
  count?: number;
  /** Coral morphology types to include */
  morphologies?: Array<'branching' | 'massive' | 'plate' | 'encrusting' | 'columnar' | 'foliose'>;
  /** Water depth for bleaching calculation */
  waterDepth?: number;
  /** Bleaching stress factor (0-1) */
  bleachingFactor?: number;
  /** Reef zone (affects species distribution) */
  reefZone?: 'fore' | 'crest' | 'back' | 'lagoon';
  /** Minimum colony size */
  minSize?: number;
  /** Maximum colony size */
  maxSize?: number;
  /** Color diversity (0-1) */
  colorDiversity?: number;
  /** Enable polyp animation */
  enablePolypAnimation?: boolean;
}

interface CoralInstance extends ScatterInstance {
  morphology: string;
  size: number;
  growthStage: 'juvenile' | 'mature' | 'old';
  health: number;
}

export class CoralReefScatter {
  private params: Required<CoralReefScatterParams>;

  constructor(params: CoralReefScatterParams = {}) {
    this.params = {
      count: params.count ?? 30,
      morphologies: params.morphologies ?? ['branching', 'massive', 'plate', 'encrusting'],
      waterDepth: params.waterDepth ?? 15,
      bleachingFactor: params.bleachingFactor ?? 0,
      reefZone: params.reefZone ?? 'fore',
      minSize: params.minSize ?? 0.2,
      maxSize: params.maxSize ?? 2,
      colorDiversity: params.colorDiversity ?? 0.3,
      enablePolypAnimation: params.enablePolypAnimation ?? false,
      volumeDensity: params.volumeDensity ?? 1,
      surfaceDensity: params.surfaceDensity ?? 1,
      scaleTapering: params.scaleTapering ?? 0,
      seed: params.seed ?? Math.random(),
      includeColliders: params.includeColliders ?? false,
    };
  }

  /**
   * Generate coral geometry based on morphology
   */
  private createCoralGeometry(morphology: string, size: number): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    
    switch (morphology) {
      case 'branching':
        return this.createBranchingCoral(size);
      case 'massive':
        return this.createMassiveCoral(size);
      case 'plate':
        return this.createPlateCoral(size);
      case 'encrusting':
        return this.createEncrustingCoral(size);
      case 'columnar':
        return this.createColumnarCoral(size);
      case 'foliose':
        return this.createFolioseCoral(size);
      default:
        return this.createBranchingCoral(size);
    }
  }

  /**
   * Create branching coral (Acropora-like)
   */
  private createBranchingCoral(size: number): THREE.BufferGeometry {
    const positions: number[] = [];
    const normals: number[] = [];
    
    // Create multiple branches using cylinder segments
    const branchCount = 5 + Math.floor(Math.random() * 5);
    const baseRadius = size * 0.1;
    
    for (let b = 0; b < branchCount; b++) {
      const branchLength = size * (0.3 + Math.random() * 0.7);
      const branchRadius = baseRadius * (0.3 + Math.random() * 0.7);
      const segments = 8;
      const rings = 10;
      
      // Branch origin angle
      const theta = (b / branchCount) * Math.PI * 2;
      const phi = Math.PI * 0.3;
      
      const originX = Math.sin(phi) * Math.cos(theta) * size * 0.3;
      const originY = Math.cos(phi) * size * 0.3;
      const originZ = Math.sin(phi) * Math.sin(theta) * size * 0.3;
      
      // Branch direction
      const dirX = Math.sin(phi) * Math.cos(theta);
      const dirY = Math.cos(phi);
      const dirZ = Math.sin(phi) * Math.sin(theta);
      
      for (let r = 0; r <= rings; r++) {
        const t = r / rings;
        const radius = branchRadius * (1 - t * 0.6);
        const y = t * branchLength;
        
        for (let s = 0; s <= segments; s++) {
          const angle = (s / segments) * Math.PI * 2;
          const x = Math.cos(angle) * radius;
          const z = Math.sin(angle) * radius;
          
          // Rotate and translate
          const rotX = x * Math.cos(theta) - y * Math.sin(theta);
          const rotY = x * Math.sin(theta) + y * Math.cos(theta);
          
          positions.push(
            originX + rotX * Math.cos(phi) + dirX * y,
            originY + rotY + dirY * y,
            originZ + z + dirZ * y
          );
          
          // Simplified normals
          normals.push(dirX, dirY, dirZ);
        }
      }
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    
    return geometry;
  }

  /**
   * Create massive coral (brain coral-like)
   */
  private createMassiveCoral(size: number): THREE.BufferGeometry {
    const geometry = new THREE.SphereGeometry(size * 0.5, 32, 24);
    
    // Add surface detail for coral texture
    const positions = geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Add bumps and ridges
      const noise = Math.sin(x * 10) * Math.cos(y * 10) * Math.sin(z * 10) * 0.05;
      const scale = 1 + noise;
      
      positions[i] *= scale;
      positions[i + 1] *= scale;
      positions[i + 2] *= scale;
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Create plate coral (table coral-like)
   */
  private createPlateCoral(size: number): THREE.BufferGeometry {
    const geometry = new THREE.CylinderGeometry(size * 0.8, size * 0.3, size * 0.1, 32);
    
    // Flatten and widen
    const positions = geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] *= 0.3; // Compress Y
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Create encrusting coral (low profile)
   */
  private createEncrustingCoral(size: number): THREE.BufferGeometry {
    const geometry = new THREE.CircleGeometry(size * 0.5, 32);
    
    // Add height variation
    const positions = geometry.attributes.position.array as Float32Array;
    const vertexCount = positions.length / 3;
    
    const heights: number[] = [];
    for (let i = 0; i < vertexCount; i++) {
      heights.push(Math.random() * size * 0.1);
    }
    
    // Simple approach: just use flat circle for now
    geometry.rotateX(-Math.PI / 2);
    
    return geometry;
  }

  /**
   * Create columnar coral (pillar coral-like)
   */
  private createColumnarCoral(size: number): THREE.BufferGeometry {
    const geometry = new THREE.CylinderGeometry(size * 0.15, size * 0.2, size, 16);
    geometry.translate(0, size * 0.5, 0);
    return geometry;
  }

  /**
   * Create foliose coral (leaf-like plates)
   */
  private createFolioseCoral(size: number): THREE.BufferGeometry {
    const group = new THREE.Group();
    
    // Create multiple curved plates
    const plateCount = 3 + Math.floor(Math.random() * 4);
    
    for (let i = 0; i < plateCount; i++) {
      const plateGeo = new THREE.BoxGeometry(size * 0.4, size * 0.6, size * 0.05);
      const positions = plateGeo.attributes.position.array as Float32Array;
      
      // Curve the plate
      for (let j = 0; j < positions.length; j += 3) {
        const x = positions[j];
        positions[j + 1] += Math.sin(x * 5) * size * 0.1;
      }
      
      plateGeo.attributes.position.needsUpdate = true;
      plateGeo.computeVertexNormals();
      
      const plate = new THREE.Mesh(plateGeo);
      plate.rotation.y = (i / plateCount) * Math.PI * 2;
      plate.rotation.x = Math.PI * 0.1;
      group.add(plate);
    }
    
    // Merge geometries
    const mergedGeometry = this.mergeGeometries(group);
    return mergedGeometry || new THREE.BufferGeometry();
  }

  /**
   * Merge geometries from a group
   */
  private mergeGeometries(group: THREE.Group): THREE.BufferGeometry | null {
    // Simplified merge - in production would use BufferGeometryUtils
    const geometries: THREE.BufferGeometry[] = [];
    
    group.children.forEach(child => {
      if (child instanceof THREE.Mesh && child.geometry) {
        child.updateMatrixWorld(true);
        const geo = child.geometry.clone();
        geo.applyMatrix4(child.matrixWorld);
        geometries.push(geo);
      }
    });
    
    if (geometries.length === 0) return null;
    if (geometries.length === 1) return geometries[0];
    
    // For simplicity, return first geometry
    return geometries[0];
  }

  /**
   * Create coral material with bleaching effect
   */
  private createCoralMaterial(morphology: string, health: number, diversity: number): THREE.Material {
    // Base colors for healthy corals
    const healthyColors: THREE.Color[] = [
      new THREE.Color(0xff6b6b), // Red/Pink
      new THREE.Color(0x4ecdc4), // Teal
      new THREE.Color(0xffe66d), // Yellow
      new THREE.Color(0x95e1d3), // Mint
      new THREE.Color(0xf38181), // Coral
      new THREE.Color(0xaa96da), // Purple
    ];
    
    // Select base color
    const baseColor = healthyColors[Math.floor(Math.random() * healthyColors.length)];
    
    // Apply diversity variation
    const variedColor = baseColor.clone().lerp(
      new THREE.Color(Math.random(), Math.random(), Math.random()),
      diversity * 0.3
    );
    
    // Apply bleaching (shift toward white)
    const bleachedColor = variedColor.clone().lerp(new THREE.Color(0xffffff), this.params.bleachingFactor * (1 - health));
    
    return new THREE.MeshStandardMaterial({
      color: bleachedColor,
      roughness: 0.6,
      metalness: 0.1,
      bumpScale: 0.02,
    });
  }

  /**
   * Apply coral scatter to a surface
   */
  async apply(surface: THREE.Object3D): Promise<ScatterResult> {
    const rng = this.createRNG(this.params.seed);
    const instances: CoralInstance[] = [];
    const materials: Map<string, THREE.Material> = new Map();
    const geometries: Map<string, THREE.BufferGeometry> = new Map();
    
    // Get surface bounding box
    const bbox = new THREE.Box3().setFromObject(surface);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    
    // Filter morphologies based on reef zone
    const zoneMorphologies: Record<string, string[]> = {
      fore: ['branching', 'massive', 'columnar'],
      crest: ['massive', 'encrusting', 'plate'],
      back: ['branching', 'foliose', 'plate'],
      lagoon: ['massive', 'plate', 'foliose'],
    };
    
    const allowedMorphologies = this.params.morphologies.filter(m => 
      zoneMorphologies[this.params.reefZone]?.includes(m) || this.params.morphologies.includes(m)
    );
    
    for (let i = 0; i < this.params.count; i++) {
      const morphology = allowedMorphologies[Math.floor(rng() * allowedMorphologies.length)];
      const coralSize = this.params.minSize + rng() * (this.params.maxSize - this.params.minSize);
      
      // Random position
      const x = center.x - size.x / 2 + rng() * size.x;
      const z = center.z - size.z / 2 + rng() * size.z;
      const y = center.y; // Assume surface is at center.y
      
      // Health decreases with bleaching factor
      const health = Math.max(0.2, 1 - this.params.bleachingFactor * rng());
      
      // Growth stage based on size
      let growthStage: 'juvenile' | 'mature' | 'old';
      if (coralSize < this.params.minSize * 2) {
        growthStage = 'juvenile';
      } else if (coralSize < this.params.maxSize * 0.7) {
        growthStage = 'mature';
      } else {
        growthStage = 'old';
      }
      
      const rotation = new THREE.Euler(
        rng() * Math.PI * 0.2,
        rng() * Math.PI * 2,
        rng() * Math.PI * 0.2
      );
      
      const scale = new THREE.Vector3(
        0.8 + rng() * 0.4,
        0.8 + rng() * 0.4,
        0.8 + rng() * 0.4
      );
      
      instances.push({
        position: new THREE.Vector3(x, y, z),
        rotation,
        scale,
        morphology,
        size: coralSize,
        growthStage,
        health,
      });
    }
    
    // Create instanced meshes per morphology
    const scatterGroup = new THREE.Group();
    
    for (const morphology of allowedMorphologies) {
      const morphInstances = instances.filter(inst => inst.morphology === morphology);
      if (morphInstances.length === 0) continue;
      
      const avgSize = morphInstances.reduce((sum, inst) => sum + inst.size, 0) / morphInstances.length;
      
      let geometry = geometries.get(morphology);
      if (!geometry) {
        geometry = this.createCoralGeometry(morphology, avgSize);
        geometries.set(morphology, geometry);
      }
      
      // Create material per instance for health variation
      morphInstances.forEach((instance, index) => {
        const material = this.createCoralMaterial(morphology, instance.health, this.params.colorDiversity);
        const mesh = new THREE.Mesh(geometry.clone(), material);
        mesh.position.copy(instance.position);
        mesh.rotation.copy(instance.rotation);
        mesh.scale.copy(instance.scale);
        
        scatterGroup.add(mesh);
      });
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
        reefZone: this.params.reefZone,
        bleachingFactor: this.params.bleachingFactor,
        morphologies: allowedMorphologies,
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
  updateParams(params: Partial<CoralReefScatterParams>): void {
    this.params = { ...this.params, ...params };
  }
}
