/**
 * Pebbles Scatter - Scatters small rocks/pebbles on surfaces
 * Based on infinigen/assets/scatters/pebbles.py
 */

import * as THREE from 'three';
import { ScatterParams, ScatterResult } from './types';
import { RockFactory } from '../../assets/factories/rock';
import { MaterialAssignment } from '../../materials/types';
import { weightedSample } from '../../core/util/random';
import { rockMaterials } from '../../materials/categories/rock';

export interface PebblesParams extends ScatterParams {
  count?: number;
  detailLevel?: number;
  scaleMin?: number;
  scaleMax?: number;
  scaleRandomness?: number;
  scaleAxisRandomness?: number;
  volumeDensity?: number;
  groundOffset?: number;
  taperDensity?: boolean;
}

export class PebblesScatter {
  private params: Required<PebblesParams>;

  constructor(params: PebblesParams = {}) {
    this.params = {
      count: params.count ?? 5,
      detailLevel: params.detailLevel ?? 3,
      scaleMin: params.scaleMin ?? 0.05,
      scaleMax: params.scaleMax ?? 1.0,
      scaleRandomness: params.scaleRandomness ?? 0.85,
      scaleAxisRandomness: params.scaleAxisRandomness ?? 0.5,
      volumeDensity: params.volumeDensity ?? 0.2,
      groundOffset: params.groundOffset ?? 0.03,
      taperDensity: params.taperDensity ?? true,
    };
  }

  async apply(baseObject: THREE.Object3D): Promise<ScatterResult> {
    const seed = Math.floor(Math.random() * 1e5);
    const rockFactory = new RockFactory(seed, this.params.detailLevel);
    
    // Generate pebble instances
    const pebbles: THREE.Object3D[] = [];
    for (let i = 0; i < this.params.count; i++) {
      const pebble = await rockFactory.create();
      
      // Apply random rock material
      const material = weightedSample(rockMaterials)();
      if (material && pebble instanceof THREE.Mesh) {
        pebble.material = material;
      }
      
      pebbles.push(pebble);
    }

    // Create scatter container
    const scatterContainer = new THREE.Group();
    scatterContainer.name = 'PebblesScatter';

    // Distribute pebbles on surface
    const density = this.params.volumeDensity * (this.params.taperDensity ? 0.5 : 1);
    const positions = this.generatePositions(baseObject, density);

    positions.forEach((position, index) => {
      if (index >= pebbles.length) return;
      
      const pebble = pebbles[index];
      
      // Apply scale variation
      const scale = this.params.scaleMin + Math.random() * (this.params.scaleMax - this.params.scaleMin);
      const scaleVar = this.params.scaleMin + (this.params.scaleMax - this.params.scaleMin) * this.params.scaleRandomness;
      const finalScale = scale * scaleVar;
      
      pebble.scale.setScalar(finalScale);
      
      // Add axis-specific randomness
      pebble.scale.x *= this.params.scaleAxisRandomness + 0.5;
      pebble.scale.z *= this.params.scaleAxisRandomness + 0.5;
      
      // Position with ground offset
      pebble.position.copy(position);
      pebble.position.y += this.params.groundOffset;
      
      // Random rotation
      pebble.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      
      scatterContainer.add(pebble);
    });

    return {
      scatterObject: scatterContainer,
      instances: pebbles,
      params: this.params,
    };
  }

  private generatePositions(baseObject: THREE.Object3D, density: number): THREE.Vector3[] {
    const positions: THREE.Vector3[] = [];
    
    // Get bounding box for distribution
    const box = new THREE.Box3().setFromObject(baseObject);
    const size = new THREE.Vector3();
    box.getSize(size);
    
    // Estimate number of pebbles based on surface area and density
    const surfaceArea = 2 * (size.x * size.y + size.y * size.z + size.z * size.x);
    const count = Math.floor(surfaceArea * density * 10);
    
    // Simple grid-based distribution with jitter
    const gridX = Math.ceil(Math.sqrt(count * (size.x / size.z)));
    const gridZ = Math.ceil(count / gridX);
    
    const stepX = size.x / gridX;
    const stepZ = size.z / gridZ;
    
    for (let i = 0; i < gridX; i++) {
      for (let j = 0; j < gridZ; j++) {
        if (Math.random() > density) continue;
        
        const x = box.min.x + i * stepX + Math.random() * stepX * 0.5;
        const z = box.min.z + j * stepZ + Math.random() * stepZ * 0.5;
        
        // Raycast to find surface position (simplified - uses base object center Y)
        const y = box.min.y + this.params.groundOffset;
        
        positions.push(new THREE.Vector3(x, y, z));
      }
    }
    
    return positions;
  }
}

export default PebblesScatter;
