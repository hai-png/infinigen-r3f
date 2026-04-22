/**
 * SeashellsScatter - Beach and shoreline shell distribution
 * 
 * Features:
 * - Multiple shell architectures (spiral, bivalve, cone, tusk, flat)
 * - Beach deposition logic (tide lines, wave sorting)
 * - Procedural wear and erosion simulation
 * - Size and color variations
 * - Orientation based on wave action
 */

import * as THREE from 'three';
import type { ScatterParams, ScatterResult, ScatterInstance } from './types';

export interface SeashellsScatterParams extends ScatterParams {
  /** Number of shells */
  count?: number;
  /** Shell types to include */
  shellTypes?: Array<'spiral' | 'bivalve' | 'cone' | 'tusk' | 'flat'>;
  /** Beach zone (affects distribution) */
  beachZone?: 'supratidal' | 'intertidal' | 'subtidal' | 'wrack';
  /** Wave energy level */
  waveEnergy?: 'low' | 'medium' | 'high';
  /** Erosion level (0-1) */
  erosionLevel?: number;
  /** Tide line position (0-1 along beach) */
  tideLinePosition?: number;
  /** Minimum size */
  minSize?: number;
  /** Maximum size */
  maxSize?: number;
}

interface SeashellInstance extends ScatterInstance {
  shellType: string;
  size: number;
  erosion: number;
  burialDepth: number;
}

export class SeashellsScatter {
  private params: Required<SeashellsScatterParams>;

  constructor(params: SeashellsScatterParams = {}) {
    this.params = {
      count: params.count ?? 60,
      shellTypes: params.shellTypes ?? ['spiral', 'bivalve', 'cone'],
      beachZone: params.beachZone ?? 'intertidal',
      waveEnergy: params.waveEnergy ?? 'medium',
      erosionLevel: params.erosionLevel ?? 0.3,
      tideLinePosition: params.tideLinePosition ?? 0.5,
      minSize: params.minSize ?? 0.02,
      maxSize: params.maxSize ?? 0.15,
      volumeDensity: params.volumeDensity ?? 1,
      surfaceDensity: params.surfaceDensity ?? 1,
      scaleTapering: params.scaleTapering ?? 0,
      seed: params.seed ?? Math.random(),
      includeColliders: params.includeColliders ?? false,
    };
  }

  /**
   * Generate shell geometry based on type
   */
  private createShellGeometry(shellType: string, size: number, erosion: number): THREE.BufferGeometry {
    switch (shellType) {
      case 'spiral':
        return this.createSpiralShell(size, erosion);
      case 'bivalve':
        return this.createBivalveShell(size, erosion);
      case 'cone':
        return this.createConeShell(size, erosion);
      case 'tusk':
        return this.createTuskShell(size, erosion);
      case 'flat':
        return this.createFlatShell(size, erosion);
      default:
        return this.createSpiralShell(size, erosion);
    }
  }

  /**
   * Create spiral shell (gastropod-like)
   */
  private createSpiralShell(size: number, erosion: number): THREE.BufferGeometry {
    const geometry = new THREE.TorusKnotGeometry(size * 0.3, size * 0.1, 64, 8, 2, 3);
    
    // Apply erosion by smoothing vertices
    const positions = geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const noise = Math.sin(positions[i] * 20) * Math.cos(positions[i + 1] * 20) * erosion * 0.1;
      positions[i] += noise;
      positions[i + 1] += noise;
      positions[i + 2] += noise;
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Create bivalve shell (clam-like)
   */
  private createBivalveShell(size: number, erosion: number): THREE.BufferGeometry {
    const geometry = new THREE.SphereGeometry(size * 0.5, 24, 16);
    const positions = geometry.attributes.position.array as Float32Array;
    
    // Flatten to create bivalve shape
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] *= 0.3;
      positions[i + 2] *= 0.6;
      
      // Add growth rings
      const y = positions[i + 1];
      const ringAmount = Math.sin(y * 30) * erosion * 0.05;
      positions[i] *= (1 + ringAmount);
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Create cone shell (conch-like)
   */
  private createConeShell(size: number, erosion: number): THREE.BufferGeometry {
    const geometry = new THREE.ConeGeometry(size * 0.3, size * 0.8, 16);
    const positions = geometry.attributes.position.array as Float32Array;
    
    // Add spiral ridges
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const angle = Math.atan2(positions[i + 2], positions[i]);
      const ridge = Math.sin(angle * 5 + y * 10) * erosion * 0.1;
      
      positions[i] *= (1 + ridge);
      positions[i + 2] *= (1 + ridge);
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Create tusk shell (scaphopod-like)
   */
  private createTuskShell(size: number, erosion: number): THREE.BufferGeometry {
    const geometry = new THREE.CylinderGeometry(size * 0.1, size * 0.2, size, 12);
    const positions = geometry.attributes.position.array as Float32Array;
    
    // Curve the cylinder slightly
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const bend = Math.sin((y + size * 0.5) / size * Math.PI) * size * 0.2;
      positions[i] += bend;
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Create flat shell (sand dollar-like)
   */
  private createFlatShell(size: number, erosion: number): THREE.BufferGeometry {
    const geometry = new THREE.CylinderGeometry(size * 0.4, size * 0.4, size * 0.05, 32);
    const positions = geometry.attributes.position.array as Float32Array;
    
    // Add radial pattern
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      const angle = Math.atan2(z, x);
      const pattern = Math.sin(angle * 10) * erosion * 0.05;
      
      positions[i + 1] += pattern;
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Create shell material with weathering
   */
  private createShellMaterial(shellType: string, erosion: number): THREE.Material {
    const colors: Record<string, number> = {
      spiral: 0xd2b48c,
      bivalve: 0xf5f5dc,
      cone: 0xff7f50,
      tusk: 0xffffff,
      flat: 0xe8dcc4,
    };
    
    const baseColor = colors[shellType] || colors.spiral;
    const color = new THREE.Color(baseColor);
    
    // Desaturate with erosion
    const gray = new THREE.Color(0x888888);
    color.lerp(gray, erosion * 0.3);
    
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5 + erosion * 0.3,
      metalness: 0.1,
    });
  }

  /**
   * Apply seashell scatter to a beach surface
   */
  async apply(surface: THREE.Object3D): Promise<ScatterResult> {
    const rng = this.createRNG(this.params.seed);
    const instances: SeashellInstance[] = [];
    const geometries: Map<string, THREE.BufferGeometry> = new Map();
    const materials: Map<string, THREE.Material> = new Map();
    
    // Get surface bounding box
    const bbox = new THREE.Box3().setFromObject(surface);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    
    // Determine tide line influence
    const tideInfluence = this.calculateTideInfluence();
    
    for (let i = 0; i < this.params.count; i++) {
      const shellType = this.params.shellTypes[Math.floor(rng() * this.params.shellTypes.length)];
      const shellSize = this.params.minSize + rng() * (this.params.maxSize - this.params.minSize);
      
      // Position biased toward tide line
      let x, z;
      
      if (rng() < tideInfluence) {
        // Near tide line
        const tideX = center.x - size.x / 2 + this.params.tideLinePosition * size.x;
        const spread = size.z * 0.2;
        x = tideX + (rng() - 0.5) * spread;
        z = center.z - size.z / 2 + rng() * size.z;
      } else {
        // Random across beach
        x = center.x - size.x / 2 + rng() * size.x;
        z = center.z - size.z / 2 + rng() * size.z;
      }
      
      const y = center.y;
      
      // Erosion varies by location and wave energy
      const baseErosion = this.params.erosionLevel;
      const waveErosion = this.params.waveEnergy === 'high' ? 0.3 : this.params.waveEnergy === 'medium' ? 0.15 : 0.05;
      const erosion = Math.min(1, baseErosion + waveErosion * rng());
      
      // Burial depth (some shells partially buried in sand)
      const burialDepth = rng() < 0.4 ? rng() * shellSize * 0.5 : 0;
      
      // Orientation influenced by wave action
      const rotationY = rng() * Math.PI * 2;
      const tilt = this.params.waveEnergy === 'high' ? rng() * Math.PI * 0.3 : rng() * Math.PI * 0.1;
      
      const rotation = new THREE.Euler(
        tilt * (rng() - 0.5),
        rotationY,
        tilt * (rng() - 0.5)
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
        shellType,
        size: shellSize,
        erosion,
        burialDepth,
      });
    }
    
    // Create meshes per type
    const scatterGroup = new THREE.Group();
    
    for (const shellType of this.params.shellTypes) {
      const typeInstances = instances.filter(inst => inst.shellType === shellType);
      if (typeInstances.length === 0) continue;
      
      const avgSize = typeInstances.reduce((sum, inst) => sum + inst.size, 0) / typeInstances.length;
      const avgErosion = typeInstances.reduce((sum, inst) => sum + inst.erosion, 0) / typeInstances.length;
      
      const key = shellType;
      let geometry = geometries.get(key);
      if (!geometry) {
        geometry = this.createShellGeometry(shellType, avgSize, avgErosion);
        geometries.set(key, geometry);
      }
      
      let material = materials.get(key);
      if (!material) {
        material = this.createShellMaterial(shellType, avgErosion);
        materials.set(key, material);
      }
      
      typeInstances.forEach((instance, index) => {
        const mesh = new THREE.Mesh(geometry.clone(), material);
        mesh.position.copy(instance.position);
        mesh.position.y -= instance.burialDepth; // Partially bury
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
        beachZone: this.params.beachZone,
        waveEnergy: this.params.waveEnergy,
        tideInfluence,
      },
    };
  }

  /**
   * Calculate tide line influence based on beach zone
   */
  private calculateTideInfluence(): number {
    const zoneInfluence: Record<string, number> = {
      supratidal: 0.3,
      intertidal: 0.7,
      subtidal: 0.4,
      wrack: 0.9,
    };
    
    return zoneInfluence[this.params.beachZone] || 0.5;
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
  updateParams(params: Partial<SeashellsScatterParams>): void {
    this.params = { ...this.params, ...params };
  }
}
