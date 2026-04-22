/**
 * DecorativePlantsScatter - Procedural decorative plant scattering
 * 
 * Based on InfiniGen's decorative plants scatter system for adding
 * succulents and small decorative plants to surfaces.
 */

import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

export interface DecorativePlantsParams {
  seed: number;
  density: number;
  minSpacing: number;
  scaleRange: [number, number];
  scaleRandomness: number;
  normalFactor: number;
  taperDensity: boolean;
  windStrength: number;
}

export interface PlantInstance {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  type: 'succulent' | 'monocot' | 'smallPlant';
}

export class DecorativePlantsScatter {
  private params: DecorativePlantsParams;
  private noise: SimplexNoise;
  private instances: PlantInstance[] = [];

  constructor(params: Partial<DecorativePlantsParams> = {}) {
    this.params = {
      seed: params.seed ?? Math.floor(Math.random() * 100000),
      density: params.density ?? 0.5,
      minSpacing: params.minSpacing ?? 0.1,
      scaleRange: params.scaleRange ?? [0.3, 1.0],
      scaleRandomness: params.scaleRandomness ?? 0.7,
      normalFactor: params.normalFactor ?? 0.5,
      taperDensity: params.taperDensity ?? true,
      windStrength: params.windStrength ?? 10,
    };

    this.noise = new SimplexNoise();
  }

  private createSeededRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  private fbm(
    x: number,
    y: number,
    z: number,
    baseFreq: number = 1,
    octaves: number = 4
  ): number {
    let value = 0;
    let amplitude = 1;
    let frequency = baseFreq;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise.noise3d(x * frequency, y * frequency, z * frequency);
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    return value / maxValue;
  }

  private checkSpacing(position: THREE.Vector3, minSpacing: number): boolean {
    for (const instance of this.instances) {
      if (instance.position.distanceTo(position) < minSpacing) {
        return false;
      }
    }
    return true;
  }

  private calculateWindRotation(rng: () => number): THREE.Euler {
    const strength = this.params.windStrength;
    return new THREE.Euler(
      (rng() - 0.5) * strength * 0.01,
      rng() * Math.PI * 2,
      (rng() - 0.5) * strength * 0.01
    );
  }

  public generateOnSurface(
    geometry: THREE.BufferGeometry,
    count: number
  ): PlantInstance[] {
    this.instances = [];
    const rng = this.createSeededRandom(this.params.seed);

    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal?.array;
    const vertexCount = positions.length / 3;

    let attempts = 0;
    const maxAttempts = count * 10;

    while (this.instances.length < count && attempts < maxAttempts) {
      attempts++;

      // Select random vertex
      const vertexIndex = Math.floor(rng() * vertexCount) * 3;
      
      const x = positions[vertexIndex];
      const y = positions[vertexIndex + 1];
      const z = positions[vertexIndex + 2];

      let position: THREE.Vector3;
      let normal: THREE.Vector3;

      if (normals) {
        const nx = normals[vertexIndex];
        const ny = normals[vertexIndex + 1];
        const nz = normals[vertexIndex + 2];
        normal = new THREE.Vector3(nx, ny, nz);
        
        // Offset along normal
        position = new THREE.Vector3(x, y, z).add(
          normal.clone().multiplyScalar(rng() * this.params.normalFactor)
        );
      } else {
        position = new THREE.Vector3(x, y, z);
        normal = new THREE.Vector3(0, 1, 0);
      }

      // Check spacing
      if (!this.checkSpacing(position, this.params.minSpacing)) {
        continue;
      }

      // Taper density based on position (optional)
      if (this.params.taperDensity) {
        const densityFactor = this.fbm(x * 0.1, y * 0.1, z * 0.1, 0.5, 3);
        if (densityFactor < 0 && rng() > 0.5) {
          continue;
        }
      }

      // Calculate scale
      const baseScale = this.params.scaleRange[0] + 
                        rng() * (this.params.scaleRange[1] - this.params.scaleRange[0]);
      const scaleRand = this.params.scaleRandomness * rng() + (1 - this.params.scaleRandomness);
      
      const scale = new THREE.Vector3(
        baseScale * scaleRand,
        baseScale * scaleRand,
        baseScale * scaleRand
      );

      // Calculate rotation aligned with surface normal
      const up = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(up, normal);
      
      const rotation = new THREE.Euler();
      rotation.setFromQuaternion(quaternion);
      
      // Add wind effect
      const windRotation = this.calculateWindRotation(rng);
      rotation.x += windRotation.x;
      rotation.z += windRotation.z;

      // Randomly select plant type
      const types: ('succulent' | 'monocot' | 'smallPlant')[] = ['succulent', 'monocot', 'smallPlant'];
      const type = types[Math.floor(rng() * types.length)];

      this.instances.push({
        position,
        rotation,
        scale,
        type,
      });
    }

    return this.instances;
  }

  public generateInBox(
    box: THREE.Box3,
    count: number
  ): PlantInstance[] {
    this.instances = [];
    const rng = this.createSeededRandom(this.params.seed);

    let attempts = 0;
    const maxAttempts = count * 10;

    while (this.instances.length < count && attempts < maxAttempts) {
      attempts++;

      const x = box.min.x + rng() * (box.max.x - box.min.x);
      const y = box.max.y; // Place on top surface
      const z = box.min.z + rng() * (box.max.z - box.min.z);

      const position = new THREE.Vector3(x, y, z);

      if (!this.checkSpacing(position, this.params.minSpacing)) {
        continue;
      }

      // Calculate scale
      const baseScale = this.params.scaleRange[0] + 
                        rng() * (this.params.scaleRange[1] - this.params.scaleRange[0]);
      const scaleRand = this.params.scaleRandomness * rng() + (1 - this.params.scaleRandomness);
      
      const scale = new THREE.Vector3(
        baseScale * scaleRand,
        baseScale * scaleRand,
        baseScale * scaleRand
      );

      // Rotation with wind
      const rotation = this.calculateWindRotation(rng);

      const types: ('succulent' | 'monocot' | 'smallPlant')[] = ['succulent', 'monocot', 'smallPlant'];
      const type = types[Math.floor(rng() * types.length)];

      this.instances.push({
        position,
        rotation,
        scale,
        type,
      });
    }

    return this.instances;
  }

  public getInstances(): PlantInstance[] {
    return [...this.instances];
  }

  public getParams(): DecorativePlantsParams {
    return { ...this.params };
  }

  public setParams(params: Partial<DecorativePlantsParams>): void {
    this.params = { ...this.params, ...params };
  }

  public clear(): void {
    this.instances = [];
  }
}

export default DecorativePlantsScatter;
