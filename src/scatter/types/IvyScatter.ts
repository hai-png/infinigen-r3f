/**
 * IvyScatter - Climbing vine and ivy distribution system
 * 
 * Implements procedural ivy placement on vertical surfaces,
 * walls, trees, and structures with realistic growth patterns.
 * 
 * @module Scatter/Vegetation
 */

import * as THREE from 'three';
import { ScatterParams, ScatterInstance, ScatterResult } from './types/types';

export interface IvyScatterParams extends ScatterParams {
  /** Number of ivy patches to place */
  count?: number;
  /** Coverage density (0-1) */
  coverage?: number;
  /** Ivy species */
  species?: 'english' | 'boston' | 'poison' | 'mixed';
  /** Growth stage */
  growthStage?: 'young' | 'mature' | 'overgrown';
  /** Leaf size variation */
  leafSizeVariation?: number;
  /** Vine thickness */
  vineThickness?: number;
  /** Clinging probability */
  clingProbability?: number;
  /** Growth direction bias (0 = random, 1 = strictly upward) */
  upwardBias?: number;
  /** Maximum spread distance from origin */
  maxSpread?: number;
  /** Enable seasonal color variation */
  seasonalColor?: boolean;
}

export interface IvyInstance extends ScatterInstance {
  species: string;
  growthStage: string;
  vineLength: number;
  leafCount: number;
  coverageArea: number;
}

/**
 * IvyScatter class for distributing climbing vines on surfaces
 * 
 * Features:
 * - Multiple ivy species with unique characteristics
 * - Realistic growth patterns following surface topology
 * - Seasonal color variations
 * - Growth stage progression
 * - Surface-aware placement (walls, trees, rocks)
 */
export class IvyScatter {
  private params: Required<IvyScatterParams>;
  private instances: IvyInstance[] = [];

  constructor(params: IvyScatterParams = {}) {
    this.params = {
      count: params.count ?? 30,
      coverage: params.coverage ?? 0.4,
      species: params.species ?? 'mixed',
      growthStage: params.growthStage ?? 'mature',
      leafSizeVariation: params.leafSizeVariation ?? 0.3,
      vineThickness: params.vineThickness ?? 0.02,
      clingProbability: params.clingProbability ?? 0.8,
      upwardBias: params.upwardBias ?? 0.7,
      maxSpread: params.maxSpread ?? 5,
      seasonalColor: params.seasonalColor ?? true,
    };
  }

  /**
   * Apply ivy scattering to a surface mesh
   */
  async apply(surface: THREE.Mesh): Promise<ScatterResult> {
    const geometry = surface.geometry;
    const positions = geometry.attributes.position.array as Float32Array;
    const normals = geometry.attributes.normal?.array as Float32Array;
    
    // Filter for suitable ivy attachment points (vertical or near-vertical surfaces)
    const suitablePoints = this.findSuitablePoints(positions, normals);
    
    // Generate ivy growth paths
    this.instances = this.generateGrowthPaths(suitablePoints, normals);
    
    // Create ivy mesh with vines and leaves
    const scatterObject = await this.createIvyMesh();
    
    // Calculate bounding box
    const boundingBox = this.calculateBoundingBox();
    
    return {
      scatterObject,
      instances: this.instances,
      boundingBox,
      metadata: {
        scatterType: 'ivy',
        count: this.instances.length,
        species: this.params.species,
        coverage: this.params.coverage,
      },
    };
  }

  /**
   * Find suitable points for ivy attachment (vertical surfaces)
   */
  private findSuitablePoints(
    positions: Float32Array,
    normals: Float32Array
  ): { position: THREE.Vector3; normal: THREE.Vector3 }[] {
    const suitablePoints: { position: THREE.Vector3; normal: THREE.Vector3 }[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    
    for (let i = 0; i < positions.length; i += 3) {
      const normal = new THREE.Vector3(
        normals[i],
        normals[i + 1],
        normals[i + 2]
      ).normalize();
      
      // Check if surface is vertical or near-vertical (normal is mostly horizontal)
      const verticality = Math.abs(normal.dot(up));
      
      // Ivy grows on vertical surfaces (normal perpendicular to up)
      if (verticality < 0.5) {
        suitablePoints.push({
          position: new THREE.Vector3(
            positions[i],
            positions[i + 1],
            positions[i + 2]
          ),
          normal,
        });
      }
    }
    
    return suitablePoints;
  }

  /**
   * Generate ivy growth paths from attachment points
   */
  private generateGrowthPaths(
    suitablePoints: { position: THREE.Vector3; normal: THREE.Vector3 }[],
    normals: Float32Array
  ): IvyInstance[] {
    const instances: IvyInstance[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    
    // Select starting points
    const numStarts = Math.min(this.params.count, suitablePoints.length);
    const shuffled = suitablePoints.sort(() => Math.random() - 0.5);
    const startPoints = shuffled.slice(0, numStarts);
    
    // Species selection
    const availableSpecies = this.getAvailableSpecies();
    
    for (const startPoint of startPoints) {
      // Determine growth parameters
      const species = availableSpecies[Math.floor(Math.random() * availableSpecies.length)];
      const vineLength = this.calculateVineLength(species);
      const leafCount = Math.floor(vineLength * (15 + Math.random() * 10));
      
      // Generate growth path
      const path = this.generateGrowthPath(startPoint.position, startPoint.normal, vineLength);
      
      // Calculate coverage area
      const coverageArea = this.calculateCoverageArea(path);
      
      instances.push({
        position: startPoint.position,
        rotation: new THREE.Euler(0, 0, 0),
        scale: new THREE.Vector3(1, 1, 1),
        species,
        growthStage: this.params.growthStage,
        vineLength,
        leafCount,
        coverageArea,
        path, // Store path for mesh generation
      } as IvyInstance);
    }
    
    return instances;
  }

  /**
   * Generate a growth path for ivy
   */
  private generateGrowthPath(
    start: THREE.Vector3,
    normal: THREE.Vector3,
    length: number
  ): THREE.Vector3[] {
    const path: THREE.Vector3[] = [start.clone()];
    const segmentLength = 0.15;
    const numSegments = Math.floor(length / segmentLength);
    
    let currentPos = start.clone();
    let currentDir = new THREE.Vector3(0, 1, 0); // Start growing upward
    
    for (let i = 0; i < numSegments; i++) {
      // Mix upward bias with random horizontal movement
      const randomDir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        this.params.upwardBias,
        (Math.random() - 0.5) * 2
      ).normalize();
      
      // Blend with upward direction
      currentDir.lerp(randomDir, 0.3).normalize();
      
      // Move along path
      const nextPos = currentPos.clone().add(currentDir.clone().multiplyScalar(segmentLength));
      
      // Check if still on surface (simple approximation)
      // In a full implementation, this would raycast to the surface
      path.push(nextPos);
      currentPos = nextPos;
    }
    
    return path;
  }

  /**
   * Calculate vine length based on species and growth stage
   */
  private calculateVineLength(species: string): number {
    const baseLengths: Record<string, number> = {
      english: 3,
      boston: 5,
      poison: 4,
    };
    
    const stageMultipliers: Record<string, number> = {
      young: 0.5,
      mature: 1.0,
      overgrown: 1.8,
    };
    
    const base = baseLengths[species] ?? 3;
    const stage = stageMultipliers[this.params.growthStage] ?? 1.0;
    
    return base * stage * (0.8 + Math.random() * 0.4);
  }

  /**
   * Calculate coverage area from path
   */
  private calculateCoverageArea(path: THREE.Vector3[]): number {
    if (path.length < 2) return 0;
    
    // Approximate as length * width
    let totalLength = 0;
    for (let i = 1; i < path.length; i++) {
      totalLength += path[i].distanceTo(path[i - 1]);
    }
    
    const width = 0.3 + Math.random() * 0.2;
    return totalLength * width;
  }

  /**
   * Get available species based on parameter
   */
  private getAvailableSpecies(): string[] {
    if (this.params.species === 'mixed') {
      return ['english', 'boston', 'poison'];
    }
    return [this.params.species];
  }

  /**
   * Create ivy mesh with vines and leaves
   */
  private async createIvyMesh(): Promise<THREE.Group> {
    const group = new THREE.Group();
    
    // Create vine geometry
    const vineGeometry = this.createVineGeometry();
    const vineMaterial = this.createVineMaterial();
    
    // Create leaf geometry
    const leafGeometry = this.createLeafGeometry();
    const leafMaterial = this.createLeafMaterial();
    
    // Generate meshes for each instance
    for (const instance of this.instances) {
      const instanceGroup = new THREE.Group();
      
      // Add vine segments
      if ((instance as any).path) {
        const vineMesh = new THREE.Mesh(vineGeometry, vineMaterial);
        this.setupVineMesh(vineMesh, instance);
        instanceGroup.add(vineMesh);
      }
      
      // Add leaves along the path
      const leafMesh = new THREE.InstancedMesh(leafGeometry, leafMaterial, instance.leafCount);
      this.setupLeafInstances(leafMesh, instance);
      instanceGroup.add(leafMesh);
      
      group.add(instanceGroup);
    }
    
    return group;
  }

  /**
   * Create vine segment geometry
   */
  private createVineGeometry(): THREE.BufferGeometry {
    // Create a curved tube-like geometry for vines
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.05, 0.1, 0),
      new THREE.Vector3(-0.03, 0.2, 0.02),
      new THREE.Vector3(0.02, 0.3, -0.01),
    ]);
    
    return new THREE.TubeGeometry(curve, 8, this.params.vineThickness, 6, false);
  }

  /**
   * Create leaf geometry
   */
  private createLeafGeometry(): THREE.BufferGeometry {
    // Create a simple leaf shape
    const shape = new THREE.Shape();
    const width = 0.04;
    const length = 0.08;
    
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(width, length * 0.3, width, length * 0.7);
    shape.quadraticCurveTo(width * 0.5, length, 0, length);
    shape.quadraticCurveTo(-width * 0.5, length, -width, length * 0.7);
    shape.quadraticCurveTo(-width, length * 0.3, 0, 0);
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.002,
      bevelEnabled: false,
    });
    
    // Center the geometry
    geometry.center();
    
    return geometry;
  }

  /**
   * Create vine material
   */
  private createVineMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x3d2817,
      roughness: 0.9,
      metalness: 0.0,
    });
  }

  /**
   * Create leaf material with seasonal variation
   */
  private createLeafMaterial(): THREE.MeshStandardMaterial {
    let color = 0x2d5a1e; // Default summer green
    
    if (this.params.seasonalColor) {
      const seasonColors: Record<string, number> = {
        spring: 0x4a7c23,
        summer: 0x2d5a1e,
        autumn: 0xb85c1e,
        winter: 0x4a4a4a,
      };
      
      // Simple seasonal determination (could be passed as parameter)
      const month = new Date().getMonth();
      let season: string;
      if (month >= 2 && month <= 4) season = 'spring';
      else if (month >= 5 && month <= 7) season = 'summer';
      else if (month >= 8 && month <= 10) season = 'autumn';
      else season = 'winter';
      
      color = seasonColors[season] ?? 0x2d5a1e;
    }
    
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.7,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Setup vine mesh transform
   */
  private setupVineMesh(mesh: THREE.Mesh, instance: IvyInstance): void {
    mesh.position.copy(instance.position);
    
    // Scale based on vine length
    const scaleY = instance.vineLength / 0.3; // Normalize to base length
    mesh.scale.set(1, scaleY, 1);
  }

  /**
   * Setup leaf instance matrices
   */
  private setupLeafInstances(mesh: THREE.InstancedMesh, instance: IvyInstance): void {
    const dummy = new THREE.Object3D();
    const path = (instance as any).path as THREE.Vector3[];
    
    if (!path || path.length === 0) return;
    
    for (let i = 0; i < instance.leafCount; i++) {
      // Distribute leaves along the path
      const t = i / instance.leafCount;
      const pathIndex = Math.floor(t * (path.length - 1));
      const pathPos = path[pathIndex];
      
      // Offset from path
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 0.15,
        (Math.random() - 0.5) * 0.15,
        (Math.random() - 0.5) * 0.15
      );
      
      dummy.position.copy(pathPos).add(offset);
      
      // Random rotation
      dummy.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      
      // Size variation
      const size = 0.8 + Math.random() * this.params.leafSizeVariation;
      dummy.scale.set(size, size, size);
      
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    
    mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Calculate bounding box for all instances
   */
  private calculateBoundingBox(): THREE.Box3 {
    const box = new THREE.Box3();
    for (const instance of this.instances) {
      box.expandByPoint(instance.position);
      
      // Expand by coverage area
      const radius = Math.sqrt(instance.coverageArea / Math.PI);
      box.expandByPoint(instance.position.clone().addScalar(radius));
      box.expandByPoint(instance.position.clone().subScalar(radius));
    }
    return box;
  }
}

export default IvyScatter;
