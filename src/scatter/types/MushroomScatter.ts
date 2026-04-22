/**
 * Mushroom Scatter - Scatters mushrooms on forest floors and damp surfaces
 * Based on infinigen/assets/scatters/mushroom.py
 * 
 * Features:
 * - Multiple mushroom species with procedural generation
 * - Surface-aware placement with normal alignment
 * - Clustering for natural distribution
 * - Size and rotation variation
 * - Damp environment preference simulation
 */

import * as THREE from 'three';
import { ScatterParams, ScatterResult } from './types';
import { MushroomFactory } from '../../assets/factories/mushroom';
import { weightedSample } from '../../core/util/random';

export interface MushroomParams extends ScatterParams {
  count?: number;
  species?: string[];
  clusterCount?: number;
  clusterSize?: number;
  scaleMin?: number;
  scaleMax?: number;
  scaleRandomness?: number;
  groundOffset?: number;
  normalAlignment?: number;
  dampPreference?: number;
  selection?: THREE.Object3D | null;
}

interface MushroomInstance {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  species: string;
}

export class MushroomScatter {
  private params: Required<MushroomParams>;
  private mushroomFactory: MushroomFactory;

  constructor(params: MushroomParams = {}) {
    this.params = {
      count: params.count ?? 15,
      species: params.species ?? ['amanita', 'boletus', 'chanterelle', 'morel'],
      clusterCount: params.clusterCount ?? 5,
      clusterSize: params.clusterSize ?? 3,
      scaleMin: params.scaleMin ?? 0.3,
      scaleMax: params.scaleMax ?? 1.0,
      scaleRandomness: params.scaleRandomness ?? 0.4,
      groundOffset: params.groundOffset ?? 0.02,
      normalAlignment: params.normalAlignment ?? 0.8,
      dampPreference: params.dampPreference ?? 0.7,
      selection: params.selection ?? null,
    };

    const seed = Math.floor(Math.random() * 1e5);
    this.mushroomFactory = new MushroomFactory(seed);
  }

  async apply(baseObject: THREE.Object3D): Promise<ScatterResult> {
    const mushrooms: MushroomInstance[] = [];
    const scatterContainer = new THREE.Group();
    scatterContainer.name = 'MushroomScatter';

    // Generate clusters of mushrooms
    const totalMushrooms = this.params.clusterCount * this.params.clusterSize;
    
    for (let cluster = 0; cluster < this.params.clusterCount; cluster++) {
      // Find cluster center on surface
      const clusterCenter = this.findClusterPosition(baseObject);
      
      if (!clusterCenter) continue;

      // Get surface normal at cluster center
      const normal = this.getSurfaceNormal(baseObject, clusterCenter);

      // Generate mushrooms in this cluster
      const clusterMushrooms = Math.floor(
        this.params.clusterSize * (0.8 + Math.random() * 0.4)
      );

      for (let i = 0; i < clusterMushrooms; i++) {
        // Offset from cluster center
        const offset = new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          0,
          (Math.random() - 0.5) * 0.5
        );

        const position = clusterCenter.clone().add(offset);
        
        // Project position onto surface
        const projectedPosition = this.projectToSurface(baseObject, position);
        
        if (!projectedPosition) continue;

        // Select random species
        const species = weightedSample(this.params.species)();
        
        // Create mushroom mesh
        const mushroom = await this.mushroomFactory.create(species);
        
        if (!(mushroom instanceof THREE.Mesh)) continue;

        // Calculate scale with variation
        const baseScale = this.params.scaleMin + 
          Math.random() * (this.params.scaleMax - this.params.scaleMin);
        const scaleVar = 1 - Math.random() * this.params.scaleRandomness;
        const finalScale = baseScale * scaleVar;

        mushroom.scale.setScalar(finalScale);

        // Position with ground offset
        mushroom.position.copy(projectedPosition);
        mushroom.position.y += this.params.groundOffset;

        // Align to surface normal
        const rotation = this.alignToNormal(normal, projectedPosition);
        mushroom.rotation.copy(rotation);

        scatterContainer.add(mushroom);

        mushrooms.push({
          mesh: mushroom,
          position: mushroom.position.clone(),
          rotation: mushroom.rotation.clone(),
          scale: mushroom.scale.clone(),
          species,
        });
      }
    }

    return {
      scatterObject: scatterContainer,
      instances: mushrooms.map(m => m.mesh),
      params: this.params,
    };
  }

  private findClusterPosition(baseObject: THREE.Object3D): THREE.Vector3 | null {
    const box = new THREE.Box3().setFromObject(baseObject);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Try to find valid position on surface
    for (let attempt = 0; attempt < 10; attempt++) {
      const x = box.min.x + Math.random() * size.x;
      const z = box.min.z + Math.random() * size.z;
      
      // Prefer damp areas (simplified: lower areas and shaded regions)
      const dampFactor = this.params.dampPreference;
      const yPreference = box.min.y + (box.max.y - box.min.y) * (1 - dampFactor * 0.5);
      
      const position = new THREE.Vector3(x, yPreference, z);
      const projected = this.projectToSurface(baseObject, position);
      
      if (projected) {
        return projected;
      }
    }

    // Fallback to center
    return new THREE.Vector3(
      (box.min.x + box.max.x) / 2,
      box.min.y,
      (box.min.z + box.max.z) / 2
    );
  }

  private getSurfaceNormal(baseObject: THREE.Object3D, position: THREE.Vector3): THREE.Vector3 {
    // Simplified: return up vector with slight variation
    const normal = new THREE.Vector3(0, 1, 0);
    
    // Add slight variation based on position
    normal.x += (Math.random() - 0.5) * 0.2;
    normal.z += (Math.random() - 0.5) * 0.2;
    normal.normalize();
    
    return normal;
  }

  private projectToSurface(baseObject: THREE.Object3D, position: THREE.Vector3): THREE.Vector3 | null {
    // Simplified projection using bounding box
    const box = new THREE.Box3().setFromObject(baseObject);
    
    if (!box.containsPoint(position)) {
      // Clamp to box
      position.clamp(box.min, box.max);
    }
    
    // Set Y to surface level
    position.y = box.min.y;
    
    return position.clone();
  }

  private alignToNormal(normal: THREE.Vector3, position: THREE.Vector3): THREE.Euler {
    // Create rotation matrix from normal
    const up = new THREE.Vector3(0, 1, 0);
    const axis = new THREE.Vector3().crossVectors(up, normal).normalize();
    const angle = Math.acos(up.dot(normal));
    
    const quaternion = new THREE.Quaternion();
    quaternion.setFromAxisAngle(axis, angle);
    
    // Add random rotation around normal axis
    const randomRotation = new THREE.Quaternion();
    randomRotation.setFromAxisAngle(normal, Math.random() * Math.PI * 2);
    quaternion.multiply(randomRotation);
    
    const euler = new THREE.Euler().setFromQuaternion(quaternion);
    
    return euler;
  }
}

export default MushroomScatter;
