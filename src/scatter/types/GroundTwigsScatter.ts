/**
 * Ground Twigs Scatter - Scatters fallen twigs and branches on ground
 * Based on infinigen/assets/scatters/ground_twigs.py
 */

import * as THREE from 'three';
import { ScatterParams, ScatterResult } from './types';
import { TwigFactory } from '../../assets/factories/twig';
import { weightedSample } from '../../core/util/random';
import { barkMaterials } from '../../materials/categories/organic';

export interface GroundTwigsParams extends ScatterParams {
  leafCount?: number;
  twigCount?: number;
  scaleMin?: number;
  scaleMax?: number;
  scaleRandomness?: number;
  scaleAxisRandomness?: number;
  density?: number;
  groundOffset?: number;
  taperDensity?: boolean;
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
}

export class GroundTwigsScatter {
  private params: Required<GroundTwigsParams>;

  constructor(params: GroundTwigsParams = {}) {
    this.params = {
      leafCount: params.leafCount ?? 0,
      twigCount: params.twigCount ?? 10,
      scaleMin: params.scaleMin ?? 0.15,
      scaleMax: params.scaleMax ?? 0.3,
      scaleRandomness: params.scaleRandomness ?? 0.3,
      scaleAxisRandomness: params.scaleAxisRandomness ?? 0.2,
      density: params.density ?? 10,
      groundOffset: params.groundOffset ?? 0.05,
      taperDensity: params.taperDensity ?? true,
      season: params.season ?? 'winter',
    };
  }

  async apply(baseObject: THREE.Object3D): Promise<ScatterResult> {
    const seed = Math.floor(Math.random() * 1e5);
    
    // Generate twig collection
    const twigs: THREE.Object3D[] = [];
    for (let i = 0; i < this.params.twigCount; i++) {
      const twigFactory = new TwigFactory(seed + i, this.params.season);
      const twig = await twigFactory.create({
        leafCount: this.params.leafCount,
      });
      
      // Apply bark material
      const material = weightedSample(barkMaterials)();
      if (material && twig instanceof THREE.Mesh) {
        twig.material = material;
      }
      
      // Settle transformation (simulate gravity settling)
      this.approxSettleTransform(twig);
      
      twigs.push(twig);
    }

    // Create scatter container
    const scatterContainer = new THREE.Group();
    scatterContainer.name = 'GroundTwigsScatter';

    // Calculate positions based on density
    const positions = this.generatePositions(baseObject);

    positions.forEach((position, index) => {
      if (index >= twigs.length) return;
      
      const twig = twigs[index];
      
      // Apply scale variation
      const baseScale = this.params.scaleMin + Math.random() * (this.params.scaleMax - this.params.scaleMin);
      const scaleVar = 1 - Math.random() * this.params.scaleRandomness;
      const finalScale = baseScale * scaleVar;
      
      twig.scale.setScalar(finalScale);
      
      // Add axis-specific randomness for natural look
      twig.scale.x *= 1 - Math.random() * this.params.scaleAxisRandomness;
      twig.scale.z *= 1 - Math.random() * this.params.scaleAxisRandomness;
      
      // Position with ground offset
      twig.position.copy(position);
      twig.position.y += this.params.groundOffset;
      
      // Random rotation around Y axis
      twig.rotation.y = Math.random() * Math.PI * 2;
      
      // Slight tilt for natural appearance
      twig.rotation.x = (Math.random() - 0.5) * 0.3;
      twig.rotation.z = (Math.random() - 0.5) * 0.3;
      
      scatterContainer.add(twig);
    });

    return {
      scatterObject: scatterContainer,
      instances: twigs,
      params: this.params,
    };
  }

  /**
   * Approximate settling transformation - simulates twigs falling and settling
   */
  private approxSettleTransform(obj: THREE.Object3D, samples: number = 40): void {
    // Simulate multiple settling iterations
    for (let i = 0; i < samples; i++) {
      // Slight random rotation to simulate tumbling
      obj.rotation.x += (Math.random() - 0.5) * 0.1;
      obj.rotation.z += (Math.random() - 0.5) * 0.1;
      
      // Gradually reduce to horizontal orientation
      obj.rotation.x *= 0.95;
      obj.rotation.z *= 0.95;
    }
    
    // Final adjustment to lie flat
    obj.rotation.x = (Math.random() - 0.5) * 0.2;
    obj.rotation.z = (Math.random() - 0.5) * 0.2;
  }

  private generatePositions(baseObject: THREE.Object3D): THREE.Vector3[] {
    const positions: THREE.Vector3[] = [];
    
    const box = new THREE.Box3().setFromObject(baseObject);
    const size = new THREE.Vector3();
    box.getSize(size);
    
    // Calculate number of twigs based on area and density
    const area = size.x * size.z;
    const count = Math.floor(area * this.params.density);
    
    // Random distribution with minimum spacing
    const minSpacing = Math.max(size.x, size.z) / 20;
    
    for (let i = 0; i < count; i++) {
      let position: THREE.Vector3;
      let attempts = 0;
      const maxAttempts = 50;
      
      do {
        position = new THREE.Vector3(
          box.min.x + Math.random() * size.x,
          0,
          box.min.z + Math.random() * size.z
        );
        attempts++;
      } while (
        this.isTooClose(position, positions, minSpacing) &&
        attempts < maxAttempts
      );
      
      if (attempts < maxAttempts) {
        positions.push(position);
      }
    }
    
    return positions;
  }

  private isTooClose(
    position: THREE.Vector3,
    existing: THREE.Vector3[],
    minDistance: number
  ): boolean {
    for (const existingPos of existing) {
      const distance = position.distanceTo(existingPos);
      if (distance < minDistance) {
        return true;
      }
    }
    return false;
  }
}

export default GroundTwigsScatter;
