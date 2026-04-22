/**
 * UpsidedownMountainsGenerator - Procedural inverted mountain formations
 * 
 * Based on InfiniGen's UpsidedownMountains element for generating
 * hanging/stalactite-like mountain structures.
 */

import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

export interface UpsidedownMountainsParams {
  seed: number;
  floatingHeight: number;
  randomness: number;
  frequency: number;
  perturbOctaves: number;
  perturbFreq: number;
  perturbScale: number;
}

export interface MountainAsset {
  upside: number[];
  downside: number[];
  peak: number[];
}

export class UpsidedownMountainsGenerator {
  private params: UpsidedownMountainsParams;
  private noise: SimplexNoise;
  private assets: MountainAsset[] = [];

  constructor(params: Partial<UpsidedownMountainsParams> = {}) {
    this.params = {
      seed: params.seed ?? Math.floor(Math.random() * 100000),
      floatingHeight: params.floatingHeight ?? 5,
      randomness: params.randomness ?? 0,
      frequency: params.frequency ?? 0.005,
      perturbOctaves: params.perturbOctaves ?? 9,
      perturbFreq: params.perturbFreq ?? 1,
      perturbScale: params.perturbScale ?? 0.2,
    };

    this.noise = new SimplexNoise();
    this.generateAssets();
  }

  private createSeededRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  private generateAssets(): void {
    const rng = this.createSeededRandom(this.params.seed);
    const assetCount = 5; // Generate 5 base assets

    for (let i = 0; i < assetCount; i++) {
      const asset: MountainAsset = {
        upside: [],
        downside: [],
        peak: [],
      };

      // Generate profile points for the mountain
      const points = 50;
      for (let j = 0; j < points; j++) {
        const t = j / points;
        
        // Generate upside profile (hanging part)
        const upside = this.generateMountainProfile(t, rng, true);
        asset.upside.push(upside);
        
        // Generate downside profile (lower part)
        const downside = this.generateMountainProfile(t, rng, false);
        asset.downside.push(downside);
        
        // Generate peak height
        const peak = this.generatePeakHeight(t, rng);
        asset.peak.push(peak);
      }

      this.assets.push(asset);
    }
  }

  private generateMountainProfile(t: number, rng: () => number, isUpside: boolean): number {
    const base = Math.sin(t * Math.PI);
    const noise = this.fbm(t * 10, 0, 0, this.params.perturbFreq, this.params.perturbOctaves);
    const randomVariation = (rng() - 0.5) * this.params.randomness;
    
    let profile = base + noise * this.params.perturbScale + randomVariation;
    
    if (isUpside) {
      profile = -Math.abs(profile); // Make it hang downward
    }
    
    return profile;
  }

  private generatePeakHeight(t: number, rng: () => number): number {
    const base = Math.sin(t * Math.PI) * this.params.floatingHeight;
    const noise = this.fbm(t * 5, 0, 0, this.params.frequency, 3);
    const randomVariation = (rng() - 0.5) * this.params.randomness;
    
    return base + noise + randomVariation;
  }

  private fbm(
    x: number,
    y: number,
    z: number,
    baseFreq: number,
    octaves: number,
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

  public evaluate(point: THREE.Vector3): number {
    // Select a random asset
    const assetIndex = Math.floor(Math.abs(this.fbm(
      point.x * 0.01,
      point.y * 0.01,
      point.z * 0.01,
      0.1,
      2
    )) * this.assets.length) % this.assets.length;
    
    const asset = this.assets[assetIndex];
    
    // Calculate position along the mountain profile
    const t = ((point.x % 1) + 1) / 2; // Normalize to [0, 1]
    const pointIndex = Math.floor(t * asset.peak.length);
    
    if (pointIndex < 0 || pointIndex >= asset.peak.length) {
      return 0;
    }
    
    const upside = asset.upside[pointIndex];
    const downside = asset.downside[pointIndex];
    const peak = asset.peak[pointIndex];
    
    // Determine if point is inside the upsidedown mountain
    const relativeY = point.y - (peak + this.params.floatingHeight);
    
    if (relativeY < 0 && relativeY > upside) {
      // Inside the hanging part
      return 1 - Math.abs(relativeY / upside);
    } else if (relativeY >= 0 && relativeY < downside) {
      // Inside the lower part
      return 1 - Math.abs(relativeY / downside);
    }
    
    return 0;
  }

  public generateGeometry(
    width: number,
    depth: number,
    resolution: number = 64
  ): THREE.BufferGeometry {
    const geometry = new THREE.PlaneGeometry(width, depth, resolution, resolution);
    const positions = geometry.attributes.position.array;
    const vertexCount = positions.length / 3;

    for (let i = 0; i < vertexCount; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      
      const point = new THREE.Vector3(x, y, z);
      const value = this.evaluate(point);
      
      // Create hanging stalactite-like formations
      if (value > 0.1) {
        positions[i * 3 + 1] = this.params.floatingHeight - value * 2;
      }
    }

    geometry.computeVertexNormals();
    return geometry;
  }

  public generateLowerPartGeometry(
    width: number,
    depth: number,
    resolution: number = 64
  ): THREE.BufferGeometry {
    const geometry = new THREE.PlaneGeometry(width, depth, resolution, resolution);
    const positions = geometry.attributes.position.array;
    const vertexCount = positions.length / 3;

    for (let i = 0; i < vertexCount; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      
      const point = new THREE.Vector3(x, y, z);
      const value = this.evaluate(point);
      
      // Create upward stalagmite-like formations for lower part
      if (value > 0.1) {
        positions[i * 3 + 1] = -this.params.floatingHeight + value * 2;
      }
    }

    geometry.computeVertexNormals();
    return geometry;
  }

  public getParams(): UpsidedownMountainsParams {
    return { ...this.params };
  }

  public setParams(params: Partial<UpsidedownMountainsParams>): void {
    this.params = { ...this.params, ...params };
    this.generateAssets();
  }

  public getAssets(): MountainAsset[] {
    return this.assets.map(asset => ({
      upside: [...asset.upside],
      downside: [...asset.downside],
      peak: [...asset.peak],
    }));
  }
}

export default UpsidedownMountainsGenerator;
