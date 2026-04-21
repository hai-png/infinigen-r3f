/**
 * Fern Scatter - Scatters fern plants in shaded forest areas
 * Based on infinigen/assets/scatters/fern.py
 * 
 * Features:
 * - Multiple fern variations with procedural generation
 * - Wind animation support
 * - Density-based distribution
 * - Normal alignment for sloped surfaces
 * - Shade preference simulation
 */

import * as THREE from 'three';
import { ScatterParams, ScatterResult } from './types';
import { FernFactory } from '../../assets/factories/fern';
import { applyWindRotation, WindParams } from '../utils/wind';

export interface FernParams extends ScatterParams {
  count?: number;
  scale?: number;
  scaleRandomness?: number;
  scaleAxisRandomness?: number;
  volumeDensity?: number | [string, number, number];
  groundOffset?: number;
  normalFac?: number;
  windStrength?: number;
  shadePreference?: number;
  selection?: THREE.Object3D | null;
}

interface FernInstance {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

export class FernScatter {
  private params: Required<FernParams>;
  private fernFactory: FernFactory;

  constructor(params: FernParams = {}) {
    // Handle density as tuple or single value
    let volumeDensity = 3;
    if (Array.isArray(params.volumeDensity)) {
      const [type, min, max] = params.volumeDensity;
      volumeDensity = type === 'uniform' ? (min + max) / 2 : min;
    } else if (typeof params.volumeDensity === 'number') {
      volumeDensity = params.volumeDensity;
    }

    this.params = {
      count: params.count ?? 10,
      scale: params.scale ?? 0.7,
      scaleRandomness: params.scaleRandomness ?? 0.7,
      scaleAxisRandomness: params.scaleAxisRandomness ?? 0.3,
      volumeDensity,
      groundOffset: params.groundOffset ?? 0,
      normalFac: params.normalFac ?? 0.3,
      windStrength: params.windStrength ?? 10,
      shadePreference: params.shadePreference ?? 0.8,
      selection: params.selection ?? null,
    };

    const seed = Math.floor(Math.random() * 1e5);
    this.fernFactory = new FernFactory(seed);
  }

  async apply(baseObject: THREE.Object3D): Promise<ScatterResult> {
    const ferns: FernInstance[] = [];
    const scatterContainer = new THREE.Group();
    scatterContainer.name = 'FernScatter';

    // Generate fern variations
    const fernVariations: THREE.Mesh[] = [];
    for (let i = 0; i < 2; i++) {
      const fern = await this.fernFactory.create();
      if (fern instanceof THREE.Mesh) {
        fernVariations.push(fern);
      }
    }

    if (fernVariations.length === 0) {
      return {
        scatterObject: scatterContainer,
        instances: [],
        params: this.params,
      };
    }

    // Calculate number of ferns based on density and surface area
    const box = new THREE.Box3().setFromObject(baseObject);
    const size = new THREE.Vector3();
    box.getSize(size);
    const surfaceArea = 2 * (size.x * size.y + size.y * size.z + size.z * size.x);
    const fernCount = Math.floor(surfaceArea * this.params.volumeDensity);

    // Distribute ferns
    for (let i = 0; i < fernCount; i++) {
      // Find position preferring shaded areas
      const position = this.findShadedPosition(baseObject);
      
      if (!position) continue;

      // Get surface normal
      const normal = this.getSurfaceNormal(baseObject, position);

      // Select random fern variation
      const fernTemplate = fernVariations[Math.floor(Math.random() * fernVariations.length)];
      const fern = fernTemplate.clone();

      // Apply scale variation
      const baseScale = this.params.scale;
      const scaleVar = 1 - Math.random() * this.params.scaleRandomness;
      const finalScale = baseScale * scaleVar;

      fern.scale.setScalar(finalScale);
      
      // Add axis-specific scaling
      fern.scale.y *= 1 - this.params.scaleAxisRandomness * 0.5;

      // Position with ground offset
      fern.position.copy(position);
      fern.position.y += this.params.groundOffset;

      // Align to surface normal
      const rotation = this.alignToNormal(normal, this.params.normalFac);
      
      // Apply wind rotation
      const windRotation = applyWindRotation({
        strength: this.params.windStrength,
        direction: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5),
      });
      
      rotation.x += windRotation.x;
      rotation.z += windRotation.z;

      fern.rotation.copy(rotation);

      scatterContainer.add(fern);

      ferns.push({
        mesh: fern,
        position: fern.position.clone(),
        rotation: fern.rotation.clone(),
        scale: fern.scale.clone(),
      });
    }

    return {
      scatterObject: scatterContainer,
      instances: ferns.map(f => f.mesh),
      params: this.params,
    };
  }

  private findShadedPosition(baseObject: THREE.Object3D): THREE.Vector3 | null {
    const box = new THREE.Box3().setFromObject(baseObject);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Try to find valid position in shaded area
    for (let attempt = 0; attempt < 10; attempt++) {
      const x = box.min.x + Math.random() * size.x;
      const z = box.min.z + Math.random() * size.z;
      
      // Prefer lower/shaded areas
      const shadeFactor = this.params.shadePreference;
      const y = box.min.y + (box.max.y - box.min.y) * (1 - shadeFactor * 0.7);
      
      const position = new THREE.Vector3(x, y, z);
      const projected = this.projectToSurface(baseObject, position);
      
      if (projected) {
        return projected;
      }
    }

    // Fallback to random position
    return new THREE.Vector3(
      box.min.x + Math.random() * size.x,
      box.min.y,
      box.min.z + Math.random() * size.z
    );
  }

  private getSurfaceNormal(baseObject: THREE.Object3D, position: THREE.Vector3): THREE.Vector3 {
    const normal = new THREE.Vector3(0, 1, 0);
    
    // Add slight variation
    normal.x += (Math.random() - 0.5) * 0.3;
    normal.z += (Math.random() - 0.5) * 0.3;
    normal.normalize();
    
    return normal;
  }

  private projectToSurface(baseObject: THREE.Object3D, position: THREE.Vector3): THREE.Vector3 | null {
    const box = new THREE.Box3().setFromObject(baseObject);
    
    if (!box.containsPoint(position)) {
      position.clamp(box.min, box.max);
    }
    
    position.y = box.min.y;
    
    return position.clone();
  }

  private alignToNormal(normal: THREE.Vector3, normalFac: number): THREE.Euler {
    const up = new THREE.Vector3(0, 1, 0);
    const axis = new THREE.Vector3().crossVectors(up, normal).normalize();
    const angle = Math.acos(up.dot(normal)) * normalFac;
    
    const quaternion = new THREE.Quaternion();
    quaternion.setFromAxisAngle(axis, angle);
    
    const euler = new THREE.Euler().setFromQuaternion(quaternion);
    
    return euler;
  }
}

export default FernScatter;
