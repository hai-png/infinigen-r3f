/**
 * ChoppedTreesScatter - Logging debris and felled tree distribution
 * 
 * Features:
 * - Multiple debris types (stumps, logs, branches, wood chips)
 * - Cut directionality simulation
 * - Decay states (fresh to decomposed)
 * - Logging pattern distributions (clear cut, selective)
 * - Size variations based on tree species
 */

import * as THREE from 'three';
import type { ScatterParams, ScatterResult, ScatterInstance } from './types';

export interface ChoppedTreesScatterParams extends ScatterParams {
  /** Number of debris pieces */
  count?: number;
  /** Debris types to include */
  debrisTypes?: Array<'stump' | 'log' | 'branch' | 'woodchip'>;
  /** Logging pattern */
  loggingPattern?: 'clearcut' | 'selective' | 'strip' | 'shelterwood';
  /** Tree species (affects size) */
  treeSpecies?: 'pine' | 'oak' | 'birch' | 'mixed';
  /** Decay state */
  decayState?: 'fresh' | 'weathered' | 'decaying' | 'decomposed';
  /** Stump height range */
  stumpHeightRange?: [number, number];
  /** Log length range */
  logLengthRange?: [number, number];
  /** Include bark debris */
  includeBark?: boolean;
}

interface ChoppedTreeInstance extends ScatterInstance {
  debrisType: string;
  decayState: string;
  originalHeight?: number;
  cutAngle?: number;
}

export class ChoppedTreesScatter {
  private params: Required<ChoppedTreesScatterParams>;

  constructor(params: ChoppedTreesScatterParams = {}) {
    this.params = {
      count: params.count ?? 20,
      debrisTypes: params.debrisTypes ?? ['stump', 'log', 'branch'],
      loggingPattern: params.loggingPattern ?? 'selective',
      treeSpecies: params.treeSpecies ?? 'mixed',
      decayState: params.decayState ?? 'weathered',
      stumpHeightRange: params.stumpHeightRange ?? [0.3, 1.2],
      logLengthRange: params.logLengthRange ?? [2, 8],
      includeBark: params.includeBark ?? true,
      volumeDensity: params.volumeDensity ?? 1,
      surfaceDensity: params.surfaceDensity ?? 1,
      scaleTapering: params.scaleTapering ?? 0,
      seed: params.seed ?? Math.random(),
      includeColliders: params.includeColliders ?? false,
    };
  }

  /**
   * Generate debris geometry based on type
   */
  private createDebrisGeometry(debrisType: string, size: number, decay: number): THREE.BufferGeometry {
    switch (debrisType) {
      case 'stump':
        return this.createStumpGeometry(size, decay);
      case 'log':
        return this.createLogGeometry(size, decay);
      case 'branch':
        return this.createBranchGeometry(size, decay);
      case 'woodchip':
        return this.createWoodchipGeometry(size, decay);
      default:
        return this.createLogGeometry(size, decay);
    }
  }

  /**
   * Create tree stump geometry
   */
  private createStumpGeometry(height: number, decay: number): THREE.BufferGeometry {
    const topRadius = height * 0.3;
    const baseRadius = height * 0.4;
    const geometry = new THREE.CylinderGeometry(topRadius, baseRadius, height, 12);
    
    const positions = geometry.attributes.position.array as Float32Array;
    
    // Add cut surface irregularity
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      
      // Top surface roughness
      if (y > height * 0.8) {
        const noise = Math.sin(positions[i] * 5) * Math.cos(positions[i + 2] * 5) * decay * 0.1;
        positions[i] += noise;
        positions[i + 2] += noise;
      }
      
      // Bark texture simulation
      const angle = Math.atan2(positions[i + 2], positions[i]);
      const barkRidge = Math.sin(angle * 20 + y * 10) * decay * 0.05;
      if (y < height * 0.9) {
        positions[i] *= (1 + barkRidge);
        positions[i + 2] *= (1 + barkRidge);
      }
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Create fallen log geometry
   */
  private createLogGeometry(length: number, decay: number): THREE.BufferGeometry {
    const radius = length * 0.08;
    const geometry = new THREE.CylinderGeometry(radius * 0.9, radius, length, 12);
    
    // Orient horizontally
    geometry.rotateZ(Math.PI / 2);
    
    const positions = geometry.attributes.position.array as Float32Array;
    
    // Add natural tapering and irregularities
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]; // Now along the length after rotation
      
      // Taper ends
      const taperFactor = 1 - Math.pow((x / (length * 0.5)), 2) * 0.3;
      positions[i + 1] *= taperFactor;
      positions[i + 2] *= taperFactor;
      
      // Bark ridges
      const angle = Math.atan2(positions[i + 2], positions[i + 1]);
      const barkRidge = Math.sin(angle * 15 + x * 5) * decay * 0.05;
      positions[i + 1] *= (1 + barkRidge);
      positions[i + 2] *= (1 + barkRidge);
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Create branch debris geometry
   */
  private createBranchGeometry(size: number, decay: number): THREE.BufferGeometry {
    const length = size * (0.5 + Math.random() * 1.5);
    const radius = length * 0.05;
    
    const geometry = new THREE.CylinderGeometry(radius * 0.6, radius, length, 8);
    geometry.rotateZ(Math.PI / 2);
    
    // Add some curvature
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const bend = Math.sin((x / length + 0.5) * Math.PI) * length * 0.1;
      positions[i + 1] += bend * decay;
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Create wood chip debris geometry
   */
  private createWoodchipGeometry(size: number, decay: number): THREE.BufferGeometry {
    const geometry = new THREE.BoxGeometry(size, size * 0.1, size * 0.5);
    
    const positions = geometry.attributes.position.array as Float32Array;
    
    // Irregular shapes
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += (Math.random() - 0.5) * size * 0.3;
      positions[i + 1] += (Math.random() - 0.5) * size * 0.05;
      positions[i + 2] += (Math.random() - 0.5) * size * 0.2;
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Create debris material based on decay state
   */
  private createDebrisMaterial(debrisType: string, decayState: string): THREE.Material {
    const decayColors: Record<string, number> = {
      fresh: 0xd2b48c,
      weathered: 0x8b7355,
      decaying: 0x654321,
      decomposed: 0x3d2817,
    };
    
    const baseColor = decayColors[decayState] || decayColors.weathered;
    const color = new THREE.Color(baseColor);
    
    // Add moss/green tint for decaying states
    if (decayState === 'decaying' || decayState === 'decomposed') {
      const greenTint = new THREE.Color(0x556b2f);
      color.lerp(greenTint, decayState === 'decomposed' ? 0.3 : 0.15);
    }
    
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness: 0.0,
    });
  }

  /**
   * Apply chopped trees scatter to a surface
   */
  async apply(surface: THREE.Object3D): Promise<ScatterResult> {
    const rng = this.createRNG(this.params.seed);
    const instances: ChoppedTreeInstance[] = [];
    const geometries: Map<string, THREE.BufferGeometry> = new Map();
    const materials: Map<string, THREE.Material> = new Map();
    
    // Get surface bounding box
    const bbox = new THREE.Box3().setFromObject(surface);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    
    // Determine tree size based on species
    const treeSizes: Record<string, [number, number]> = {
      pine: [0.4, 0.8],
      oak: [0.6, 1.2],
      birch: [0.3, 0.7],
      mixed: [0.3, 1.2],
    };
    
    const [minRadius, maxRadius] = treeSizes[this.params.treeSpecies];
    
    // Generate logging pattern
    const positions = this.generateLoggingPattern(rng, center, size);
    
    for (let i = 0; i < Math.min(this.params.count, positions.length); i++) {
      const debrisType = this.params.debrisTypes[Math.floor(rng() * this.params.debrisTypes.length)];
      const position = positions[i];
      
      // Size based on debris type
      let debrisSize: number;
      if (debrisType === 'stump') {
        debrisSize = this.params.stumpHeightRange[0] + rng() * (this.params.stumpHeightRange[1] - this.params.stumpHeightRange[0]);
      } else if (debrisType === 'log') {
        debrisSize = this.params.logLengthRange[0] + rng() * (this.params.logLengthRange[1] - this.params.logLengthRange[0]);
      } else {
        debrisSize = minRadius + rng() * (maxRadius - minRadius);
      }
      
      // Random rotation
      const rotationY = rng() * Math.PI * 2;
      const tilt = debrisType === 'stump' ? 0 : rng() * Math.PI * 0.3;
      
      const rotation = new THREE.Euler(
        debrisType === 'log' ? Math.PI / 2 : tilt,
        rotationY,
        debrisType === 'log' ? 0 : tilt
      );
      
      const scale = new THREE.Vector3(
        0.8 + rng() * 0.4,
        1.0,
        0.8 + rng() * 0.4
      );
      
      // Cut angle for stumps
      const cutAngle = debrisType === 'stump' ? rng() * Math.PI * 0.2 : 0;
      
      instances.push({
        position,
        rotation,
        scale,
        debrisType,
        decayState: this.params.decayState,
        originalHeight: debrisType === 'stump' ? debrisSize * 3 : undefined,
        cutAngle,
      });
    }
    
    // Create meshes per type
    const scatterGroup = new THREE.Group();
    
    for (const debrisType of this.params.debrisTypes) {
      const typeInstances = instances.filter(inst => inst.debrisType === debrisType);
      if (typeInstances.length === 0) continue;
      
      const avgSize = typeInstances.reduce((sum, inst) => {
        if (debrisType === 'stump') return sum + inst.position.y;
        return sum + (inst.scale.x + inst.scale.z) / 2;
      }, 0) / typeInstances.length;
      
      const key = debrisType;
      let geometry = geometries.get(key);
      if (!geometry) {
        geometry = this.createDebrisGeometry(debrisType, avgSize, 0.3);
        geometries.set(key, geometry);
      }
      
      let material = materials.get(key);
      if (!material) {
        material = this.createDebrisMaterial(debrisType, this.params.decayState);
        materials.set(key, material);
      }
      
      typeInstances.forEach((instance, index) => {
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
        loggingPattern: this.params.loggingPattern,
        treeSpecies: this.params.treeSpecies,
        decayState: this.params.decayState,
      },
    };
  }

  /**
   * Generate positions based on logging pattern
   */
  private generateLoggingPattern(rng: () => number, center: THREE.Vector3, size: THREE.Vector3): THREE.Vector3[] {
    const positions: THREE.Vector3[] = [];
    
    switch (this.params.loggingPattern) {
      case 'clearcut':
        // Dense, uniform distribution
        for (let i = 0; i < this.params.count * 2; i++) {
          positions.push(
            new THREE.Vector3(
              center.x - size.x / 2 + rng() * size.x,
              center.y,
              center.z - size.z / 2 + rng() * size.z
            )
          );
        }
        break;
        
      case 'selective':
        // Scattered, random distribution
        for (let i = 0; i < this.params.count; i++) {
          positions.push(
            new THREE.Vector3(
              center.x - size.x / 2 + rng() * size.x,
              center.y,
              center.z - size.z / 2 + rng() * size.z
            )
          );
        }
        break;
        
      case 'strip':
        // Linear strips
        const stripCount = 3 + Math.floor(rng() * 3);
        const stripWidth = size.x / stripCount / 2;
        
        for (let s = 0; s < stripCount; s++) {
          const stripX = center.x - size.x / 2 + s * (size.x / stripCount) + stripWidth / 2;
          for (let i = 0; i < this.params.count / stripCount; i++) {
            positions.push(
              new THREE.Vector3(
                stripX + (rng() - 0.5) * stripWidth,
                center.y,
                center.z - size.z / 2 + rng() * size.z
              )
            );
          }
        }
        break;
        
      case 'shelterwood':
        // Clusters with gaps
        const clusterCount = 4 + Math.floor(rng() * 4);
        for (let c = 0; c < clusterCount; c++) {
          const clusterCenter = new THREE.Vector3(
            center.x - size.x / 2 + rng() * size.x,
            center.y,
            center.z - size.z / 2 + rng() * size.z
          );
          
          const clusterSize = Math.min(size.x, size.z) * 0.15;
          for (let i = 0; i < this.params.count / clusterCount; i++) {
            const angle = rng() * Math.PI * 2;
            const radius = rng() * clusterSize;
            positions.push(
              new THREE.Vector3(
                clusterCenter.x + Math.cos(angle) * radius,
                center.y,
                clusterCenter.z + Math.sin(angle) * radius
              )
            );
          }
        }
        break;
    }
    
    return positions;
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
  updateParams(params: Partial<ChoppedTreesScatterParams>): void {
    this.params = { ...this.params, ...params };
  }
}
