/**
 * Lichen Scatter - Scatters lichen patches on rocks and tree bark
 * Based on infinigen/assets/scatters/lichen.py
 * 
 * Features:
 * - Multiple lichen variations with procedural generation
 * - Medium-density distribution with spacing control
 * - Normal distribution for scale variation
 * - Surface-aware placement
 * - Selection support for targeted application
 */

import * as THREE from 'three';
import { ScatterParams, ScatterResult } from './types';
import { LichenFactory } from '../../assets/factories/lichen';

export interface LichenParams extends ScatterParams {
  density?: number;
  minSpacing?: number;
  scale?: number;
  scaleMean?: number;
  scaleStdDev?: number;
  coverage?: number;
  selection?: THREE.Object3D | null;
}

interface LichenInstance {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

export class LichenScatter {
  private params: Required<LichenParams>;
  private lichenFactory: LichenFactory;
  private lichenVariations: THREE.Mesh[] = [];

  constructor(params: LichenParams = {}) {
    this.params = {
      density: params.density ?? 5000,
      minSpacing: params.minSpacing ?? 0.08,
      scale: params.scale ?? 1.0,
      scaleMean: params.scaleMean ?? 0.5,
      scaleStdDev: params.scaleStdDev ?? 0.07,
      coverage: params.coverage ?? 0.7,
      selection: params.selection ?? null,
    };

    const seed = Math.floor(Math.random() * 1e5);
    this.lichenFactory = new LichenFactory(seed);
    
    // Pre-generate lichen variations
    this.initializeLichenVariations();
  }

  private async initializeLichenVariations() {
    for (let i = 0; i < 5; i++) {
      const lichen = await this.lichenFactory.create();
      
      if (lichen instanceof THREE.Mesh) {
        this.lichenVariations.push(lichen);
      }
    }
  }

  async apply(baseObject: THREE.Object3D): Promise<ScatterResult> {
    const lichenInstances: LichenInstance[] = [];
    const scatterContainer = new THREE.Group();
    scatterContainer.name = 'LichenScatter';

    if (this.lichenVariations.length === 0) {
      await this.initializeLichenVariations();
    }

    // Calculate coverage area
    const box = new THREE.Box3().setFromObject(baseObject);
    const size = new THREE.Vector3();
    box.getSize(size);
    const surfaceArea = 2 * (size.x * size.y + size.y * size.z + size.z * size.x);
    
    // Calculate number of lichen instances based on density and coverage
    const targetCount = Math.floor(surfaceArea * this.params.density * this.params.coverage * 0.0001);
    const actualCount = Math.min(targetCount, 2000); // Cap for performance

    // Generate positions with minimum spacing
    const positions = this.generatePositions(actualCount, box);

    // Place lichen instances
    positions.forEach((position, index) => {
      const lichenTemplate = this.lichenVariations[index % this.lichenVariations.length];
      const lichen = lichenTemplate.clone();

      // Apply scale variation using normal distribution approximation
      const scaleVar = this.normalRandom(this.params.scaleMean, this.params.scaleStdDev);
      const finalScale = this.params.scale * Math.max(0.2, scaleVar);
      
      lichen.scale.setScalar(finalScale);

      // Position on surface
      lichen.position.copy(position);

      // Random rotation around normal (lichens grow in various orientations)
      lichen.rotation.set(
        Math.random() * Math.PI * 0.2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 0.2
      );

      scatterContainer.add(lichen);

      lichenInstances.push({
        mesh: lichen,
        position: lichen.position.clone(),
        rotation: lichen.rotation.clone(),
        scale: lichen.scale.clone(),
      });
    });

    return {
      scatterObject: scatterContainer,
      instances: lichenInstances.map(l => l.mesh),
      params: this.params,
    };
  }

  private generatePositions(count: number, box: THREE.Box3): THREE.Vector3[] {
    const positions: THREE.Vector3[] = [];
    const attemptedPositions: THREE.Vector3[] = [];
    
    const surfaceY = box.min.y;
    const attempts = count * 3; // Allow extra attempts for failed placements
    
    for (let i = 0; i < attempts && positions.length < count; i++) {
      const x = box.min.x + Math.random() * box.max.x - box.min.x;
      const z = box.min.z + Math.random() * box.max.z - box.min.z;
      
      const position = new THREE.Vector3(x, surfaceY, z);
      
      // Check minimum spacing
      let tooClose = false;
      for (const existing of attemptedPositions) {
        if (position.distanceTo(existing) < this.params.minSpacing) {
          tooClose = true;
          break;
        }
      }
      
      if (!tooClose) {
        positions.push(position);
        attemptedPositions.push(position);
      }
    }
    
    return positions;
  }

  /**
   * Generate random number from normal distribution
   * Uses Box-Muller transform approximation
   */
  private normalRandom(mean: number, stddev: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    
    return z0 * stddev + mean;
  }
}

export default LichenScatter;
