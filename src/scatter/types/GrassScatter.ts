/**
 * Grass Scatter - Scatters grass tufts on terrain
 * Based on infinigen/assets/scatters/grass.py
 */

import * as THREE from 'three';
import { ScatterParams, ScatterResult } from './types';
import { GrassTuftFactory } from '../../assets/factories/grass';
import { windRotation } from '../utils/wind';

export interface GrassScatterParams extends ScatterParams {
  factoryCount?: number;
  instancesPerFactory?: number;
  scaleMin?: number;
  scaleMax?: number;
  scaleRandomness?: number;
  scaleAxisRandomness?: number;
  volumeDensity?: number;
  groundOffset?: number;
  normalFactor?: number;
  windStrength?: number;
  taperScale?: boolean;
}

export class GrassScatter {
  private params: Required<GrassScatterParams>;

  constructor(params: GrassScatterParams = {}) {
    this.params = {
      factoryCount: params.factoryCount ?? 1,
      instancesPerFactory: params.instancesPerFactory ?? 10,
      scaleMin: params.scaleMin ?? 1.0,
      scaleMax: params.scaleMax ?? 3.0,
      scaleRandomness: params.scaleRandomness ?? 0.85,
      scaleAxisRandomness: params.scaleAxisRandomness ?? 0.1,
      volumeDensity: params.volumeDensity ?? 2.5,
      groundOffset: params.groundOffset ?? 0,
      normalFactor: params.normalFactor ?? 0.25,
      windStrength: params.windStrength ?? 10,
      taperScale: params.taperScale ?? true,
    };
  }

  async apply(baseObject: THREE.Object3D): Promise<ScatterResult> {
    // Create multiple grass factories for variety
    const factories: GrassTuftFactory[] = [];
    for (let i = 0; i < this.params.factoryCount; i++) {
      const seed = Math.floor(Math.random() * 1e7);
      factories.push(new GrassTuftFactory(seed));
    }

    // Generate grass tuft collection
    const grassTufts: THREE.Object3D[] = [];
    const totalInstances = this.params.factoryCount * this.params.instancesPerFactory;
    
    for (let i = 0; i < totalInstances; i++) {
      const factoryIndex = i % factories.length;
      const tuft = await factories[factoryIndex].create();
      grassTufts.push(tuft);
    }

    // Create scatter container
    const scatterContainer = new THREE.Group();
    scatterContainer.name = 'GrassScatter';

    // Generate positions based on volume density
    const positions = this.generatePositions(baseObject);

    positions.forEach((positionData, index) => {
      if (index >= grassTufts.length) return;
      
      const tuft = grassTufts[index];
      const { position, normal } = positionData;
      
      // Apply scale variation with tapering
      let baseScale = this.params.scaleMin + Math.random() * (this.params.scaleMax - this.params.scaleMin);
      
      if (this.params.taperScale) {
        // Taper scale based on position (edges have smaller grass)
        const box = new THREE.Box3().setFromObject(baseObject);
        const center = new THREE.Vector3();
        box.getCenter(center);
        
        const distanceFromCenter = position.distanceTo(center);
        const maxDistance = Math.max(box.size.x, box.size.z) / 2;
        const taperFactor = 1 - (distanceFromCenter / maxDistance) * 0.5;
        baseScale *= taperFactor;
      }
      
      const scaleVar = this.params.scaleMin + (this.params.scaleMax - this.params.scaleMin) * this.params.scaleRandomness;
      const finalScale = baseScale * scaleVar;
      
      tuft.scale.setScalar(finalScale);
      
      // Reduce vertical scale slightly for natural look
      tuft.scale.z *= 1 - this.params.scaleAxisRandomness;
      
      // Position
      tuft.position.copy(position);
      tuft.position.y += this.params.groundOffset;
      
      // Align to surface normal
      if (normal && this.params.normalFactor > 0) {
        const up = new THREE.Vector3(0, 1, 0);
        const target = up.clone().lerp(normal.normalize(), this.params.normalFactor);
        
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(up, target);
        tuft.quaternion.multiply(quaternion);
      }
      
      // Apply wind rotation
      const windRot = windRotation(this.params.windStrength);
      tuft.rotation.z += windRot.z;
      tuft.rotation.x += windRot.x;
      
      // Random Y rotation for variety
      tuft.rotation.y += Math.random() * Math.PI * 2;
      
      scatterContainer.add(tuft);
    });

    return {
      scatterObject: scatterContainer,
      instances: grassTufts,
      params: this.params,
    };
  }

  private generatePositions(baseObject: THREE.Object3D): Array<{ position: THREE.Vector3; normal?: THREE.Vector3 }> {
    const result: Array<{ position: THREE.Vector3; normal?: THREE.Vector3 }> = [];
    
    const box = new THREE.Box3().setFromObject(baseObject);
    const size = new THREE.Vector3();
    box.getSize(size);
    
    // Calculate number of grass tufts based on area and density
    const area = size.x * size.z;
    const count = Math.floor(area * this.params.volumeDensity * 5);
    
    // Grid-based distribution with jitter
    const gridX = Math.ceil(Math.sqrt(count * (size.x / size.z)));
    const gridZ = Math.ceil(count / gridX);
    
    const stepX = size.x / gridX;
    const stepZ = size.z / gridZ;
    
    for (let i = 0; i < gridX; i++) {
      for (let j = 0; j < gridZ; j++) {
        // Skip some cells for natural variation
        if (Math.random() > this.params.volumeDensity / 5) continue;
        
        const x = box.min.x + i * stepX + Math.random() * stepX * 0.8;
        const z = box.min.z + j * stepZ + Math.random() * stepZ * 0.8;
        const y = box.min.y;
        
        // Get normal at this position (simplified - uses average slope)
        const normal = new THREE.Vector3(
          (Math.random() - 0.5) * this.params.normalFactor,
          1,
          (Math.random() - 0.5) * this.params.normalFactor
        ).normalize();
        
        result.push({
          position: new THREE.Vector3(x, y, z),
          normal,
        });
      }
    }
    
    return result;
  }
}

export default GrassScatter;
