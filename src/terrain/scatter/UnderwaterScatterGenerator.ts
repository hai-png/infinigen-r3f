/**
 * UnderwaterScatterGenerator - Procedural underwater scatter elements
 * 
 * Based on InfiniGen's underwater scatter systems including:
 * - Coral reef scattering
 * - Seaweed distribution
 * - Jellyfish placement
 * - Urchin scattering
 * - Mollusk distribution
 * - Seashell placement
 */

import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

export interface UnderwaterScatterParams {
  seed: number;
  coralDensity: number;
  seaweedDensity: number;
  jellyfishDensity: number;
  urchinDensity: number;
  molluskDensity: number;
  seashellDensity: number;
  minSpacing: number;
  scaleVariation: number;
  depthRange: [number, number];
  horizontalMode: boolean;
}

export interface ScatterInstance {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  type: 'coral' | 'seaweed' | 'jellyfish' | 'urchin' | 'mollusk' | 'seashell';
}

export class UnderwaterScatterGenerator {
  private params: UnderwaterScatterParams;
  private noise: SimplexNoise;
  private instances: ScatterInstance[] = [];

  constructor(params: Partial<UnderwaterScatterParams> = {}) {
    this.params = {
      seed: params.seed ?? Math.floor(Math.random() * 100000),
      coralDensity: params.coralDensity ?? 5.0,
      seaweedDensity: params.seaweedDensity ?? 1.0,
      jellyfishDensity: params.jellyfishDensity ?? 0.5,
      urchinDensity: params.urchinDensity ?? 2.0,
      molluskDensity: params.molluskDensity ?? 1.5,
      seashellDensity: params.seashellDensity ?? 3.0,
      minSpacing: params.minSpacing ?? 0.5,
      scaleVariation: params.scaleVariation ?? 0.5,
      depthRange: params.depthRange ?? [-10, -1],
      horizontalMode: params.horizontalMode ?? false,
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
    octaves: number = 4,
    lacunarity: number = 2,
    gain: number = 0.5
  ): number {
    let value = 0;
    let amplitude = 1;
    let frequency = baseFreq;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise.noise3d(x * frequency, y * frequency, z * frequency);
      maxValue += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
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

  private generateCoralInstances(
    area: THREE.Box3,
    count: number,
    rng: () => number
  ): void {
    const nSpecies = Math.floor(rng() * 5) + 5; // 5-10 species
    
    for (let i = 0; i < count; i++) {
      const x = area.min.x + rng() * (area.max.x - area.min.x);
      const z = area.min.z + rng() * (area.max.z - area.min.z);
      
      // Depth-based positioning
      const depth = this.params.depthRange[0] + 
                    rng() * (this.params.depthRange[1] - this.params.depthRange[0]);
      const y = depth;

      const position = new THREE.Vector3(x, y, z);

      if (!this.checkSpacing(position, this.params.minSpacing * 0.7)) {
        continue;
      }

      // Scale variation
      const baseScale = 1.0;
      const scaleRand = 0.5 + rng() * 0.5;
      const scaleRandAxi = rng() * 0.2;

      const scale = new THREE.Vector3(
        baseScale * scaleRand,
        baseScale * scaleRand * (1 - scaleRandAxi),
        baseScale * scaleRand * (1 - scaleRandAxi)
      );

      // Rotation
      const rotation = new THREE.Euler(
        (rng() - 0.5) * 0.2,
        rng() * Math.PI * 2,
        (rng() - 0.5) * 0.2
      );

      this.instances.push({
        position,
        rotation,
        scale,
        type: 'coral',
      });
    }
  }

  private generateSeaweedInstances(
    area: THREE.Box3,
    count: number,
    rng: () => number
  ): void {
    const nSpecies = Math.floor(rng() * 3) + 2; // 2-5 species

    for (let i = 0; i < count; i++) {
      const x = area.min.x + rng() * (area.max.x - area.min.x);
      const z = area.min.z + rng() * (area.max.z - area.min.z);
      
      // Seaweed grows from the bottom
      const y = area.min.y;

      const position = new THREE.Vector3(x, y, z);

      if (!this.checkSpacing(position, 0.02)) {
        continue;
      }

      // Scale variation for seaweed
      const scale = new THREE.Vector3(
        0.2 + rng() * 0.8,
        0.2 + rng() * 0.8,
        0.2 + rng() * 0.8
      );

      // Slight rotation with normal factor
      const normalFac = 0.3;
      const rotation = new THREE.Euler(
        (rng() - 0.5) * normalFac,
        rng() * Math.PI * 2,
        (rng() - 0.5) * normalFac
      );

      this.instances.push({
        position,
        rotation,
        scale,
        type: 'seaweed',
      });
    }
  }

  private generateJellyfishInstances(
    area: THREE.Box3,
    count: number,
    rng: () => number
  ): void {
    for (let i = 0; i < count; i++) {
      const x = area.min.x + rng() * (area.max.x - area.min.x);
      const y = area.min.y + rng() * (area.max.y - area.min.y);
      const z = area.min.z + rng() * (area.max.z - area.min.z);

      const position = new THREE.Vector3(x, y, z);

      if (!this.checkSpacing(position, this.params.minSpacing * 2)) {
        continue;
      }

      const scale = new THREE.Vector3(
        0.5 + rng() * 1.0,
        0.5 + rng() * 1.0,
        0.5 + rng() * 1.0
      );

      // Jellyfish float and rotate slowly
      const rotation = new THREE.Euler(
        (rng() - 0.5) * 0.5,
        rng() * Math.PI * 2,
        (rng() - 0.5) * 0.5
      );

      this.instances.push({
        position,
        rotation,
        scale,
        type: 'jellyfish',
      });
    }
  }

  private generateUrchinInstances(
    area: THREE.Box3,
    count: number,
    rng: () => number
  ): void {
    for (let i = 0; i < count; i++) {
      const x = area.min.x + rng() * (area.max.x - area.min.x);
      const z = area.min.z + rng() * (area.max.z - area.min.z);
      const y = area.min.y; // On the seabed

      const position = new THREE.Vector3(x, y, z);

      if (!this.checkSpacing(position, 0.1)) {
        continue;
      }

      const scale = new THREE.Vector3(
        0.1 + rng() * 0.2,
        0.1 + rng() * 0.2,
        0.1 + rng() * 0.2
      );

      const rotation = new THREE.Euler(
        rng() * Math.PI * 2,
        rng() * Math.PI * 2,
        rng() * Math.PI * 2
      );

      this.instances.push({
        position,
        rotation,
        scale,
        type: 'urchin',
      });
    }
  }

  private generateMolluskInstances(
    area: THREE.Box3,
    count: number,
    rng: () => number
  ): void {
    for (let i = 0; i < count; i++) {
      const x = area.min.x + rng() * (area.max.x - area.min.x);
      const z = area.min.z + rng() * (area.max.z - area.min.z);
      const y = area.min.y;

      const position = new THREE.Vector3(x, y, z);

      if (!this.checkSpacing(position, 0.05)) {
        continue;
      }

      const scale = new THREE.Vector3(
        0.05 + rng() * 0.1,
        0.05 + rng() * 0.1,
        0.05 + rng() * 0.1
      );

      const rotation = new THREE.Euler(
        0,
        rng() * Math.PI * 2,
        0
      );

      this.instances.push({
        position,
        rotation,
        scale,
        type: 'mollusk',
      });
    }
  }

  private generateSeashellInstances(
    area: THREE.Box3,
    count: number,
    rng: () => number
  ): void {
    for (let i = 0; i < count; i++) {
      const x = area.min.x + rng() * (area.max.x - area.min.x);
      const z = area.min.z + rng() * (area.max.z - area.min.z);
      const y = area.min.y + rng() * 0.05; // Slightly above seabed

      const position = new THREE.Vector3(x, y, z);

      if (!this.checkSpacing(position, 0.03)) {
        continue;
      }

      const scale = new THREE.Vector3(
        0.02 + rng() * 0.05,
        0.02 + rng() * 0.05,
        0.02 + rng() * 0.05
      );

      const rotation = new THREE.Euler(
        (rng() - 0.5) * 0.5,
        rng() * Math.PI * 2,
        (rng() - 0.5) * 0.5
      );

      this.instances.push({
        position,
        rotation,
        scale,
        type: 'seashell',
      });
    }
  }

  public generate(area: THREE.Box3): ScatterInstance[] {
    this.instances = [];
    const rng = this.createSeededRandom(this.params.seed);

    // Calculate instance counts based on area and density
    const areaSize = (area.max.x - area.min.x) * (area.max.z - area.min.z);
    
    const coralCount = Math.floor(areaSize * this.params.coralDensity);
    const seaweedCount = Math.floor(areaSize * this.params.seaweedDensity);
    const jellyfishCount = Math.floor(areaSize * this.params.jellyfishDensity);
    const urchinCount = Math.floor(areaSize * this.params.urchinDensity);
    const molluskCount = Math.floor(areaSize * this.params.molluskDensity);
    const seashellCount = Math.floor(areaSize * this.params.seashellDensity);

    // Generate different types of underwater elements
    this.generateCoralInstances(area, coralCount, rng);
    this.generateSeaweedInstances(area, seaweedCount, rng);
    this.generateJellyfishInstances(area, jellyfishCount, rng);
    this.generateUrchinInstances(area, urchinCount, rng);
    this.generateMolluskInstances(area, molluskCount, rng);
    this.generateSeashellInstances(area, seashellCount, rng);

    return this.instances;
  }

  public getInstances(): ScatterInstance[] {
    return [...this.instances];
  }

  public getParams(): UnderwaterScatterParams {
    return { ...this.params };
  }

  public setParams(params: Partial<UnderwaterScatterParams>): void {
    this.params = { ...this.params, ...params };
  }

  public clear(): void {
    this.instances = [];
  }
}

export default UnderwaterScatterGenerator;
