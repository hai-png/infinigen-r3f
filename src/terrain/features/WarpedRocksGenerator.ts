/**
 * WarpedRocksGenerator - Procedural warped rock formations
 * 
 * Based on InfiniGen's WarpedRocks element for generating realistic
 * rock surfaces with content noise, warping, and slope-based effects.
 */

import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

export interface WarpedRocksParams {
  seed: number;
  slopeIs3D: boolean;
  supressingParam: number;
  contentMinFreq: number;
  contentMaxFreq: number;
  contentOctaves: number;
  contentScale: number;
  warpMinFreq: number;
  warpMaxFreq: number;
  warpOctaves: number;
  warpScale: number;
  slopeFreq: number;
  slopeOctaves: number;
  slopeScale: number;
  slopeShift: number;
}

export class WarpedRocksGenerator {
  private params: WarpedRocksParams;
  private noise: SimplexNoise;

  constructor(params: Partial<WarpedRocksParams> = {}) {
    this.params = {
      seed: params.seed ?? Math.floor(Math.random() * 100000),
      slopeIs3D: params.slopeIs3D ?? false,
      supressingParam: params.supressingParam ?? 3,
      contentMinFreq: params.contentMinFreq ?? 0.06,
      contentMaxFreq: params.contentMaxFreq ?? 0.1,
      contentOctaves: params.contentOctaves ?? 15,
      contentScale: params.contentScale ?? 40,
      warpMinFreq: params.warpMinFreq ?? 0.1,
      warpMaxFreq: params.warpMaxFreq ?? 0.15,
      warpOctaves: params.warpOctaves ?? 3,
      warpScale: params.warpScale ?? 5,
      slopeFreq: params.slopeFreq ?? 0.02,
      slopeOctaves: params.slopeOctaves ?? 5,
      slopeScale: params.slopeScale ?? 20,
      slopeShift: params.slopeShift ?? 0,
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

  private contentNoise(point: THREE.Vector3): number {
    const freq = this.lerp(
      this.params.contentMinFreq,
      this.params.contentMaxFreq,
      Math.abs(this.fbm(point.x, point.y, point.z, 0.5, 3))
    );

    return this.fbm(point.x, point.y, point.z, freq, this.params.contentOctaves) * 
           this.params.contentScale;
  }

  private warpNoise(point: THREE.Vector3): THREE.Vector3 {
    const freq = this.lerp(
      this.params.warpMinFreq,
      this.params.warpMaxFreq,
      Math.abs(this.fbm(point.x, point.y, point.z, 0.3, 2))
    );

    const warpX = this.fbm(point.x, point.y, point.z, freq, this.params.warpOctaves);
    const warpY = this.fbm(point.y, point.z, point.x, freq, this.params.warpOctaves);
    const warpZ = this.fbm(point.z, point.x, point.y, freq, this.params.warpOctaves);

    return new THREE.Vector3(
      warpX * this.params.warpScale,
      warpY * this.params.warpScale,
      warpZ * this.params.warpScale
    );
  }

  private slopeNoise(point: THREE.Vector3): number {
    const baseValue = this.fbm(
      point.x,
      point.y,
      point.z,
      this.params.slopeFreq,
      this.params.slopeOctaves
    );

    return baseValue * this.params.slopeScale + this.params.slopeShift;
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Math.max(0, Math.min(1, t));
  }

  private calculateSlope(point: THREE.Vector3, sampleDist: number = 0.1): number {
    if (!this.params.slopeIs3D) {
      // 2D slope calculation (height-based)
      const h0 = this.evaluate(new THREE.Vector3(point.x, point.y, point.z));
      const h1 = this.evaluate(new THREE.Vector3(point.x + sampleDist, point.y, point.z));
      const h2 = this.evaluate(new THREE.Vector3(point.x, point.y + sampleDist, point.z));
      
      const dx = (h1 - h0) / sampleDist;
      const dy = (h2 - h0) / sampleDist;
      
      return Math.sqrt(dx * dx + dy * dy);
    } else {
      // 3D slope calculation
      const v0 = this.evaluateVector(point);
      const v1 = this.evaluateVector(new THREE.Vector3(point.x + sampleDist, point.y, point.z));
      const v2 = this.evaluateVector(new THREE.Vector3(point.x, point.y + sampleDist, point.z));
      
      const dx = v1.clone().sub(v0).length() / sampleDist;
      const dy = v2.clone().sub(v0).length() / sampleDist;
      
      return Math.sqrt(dx * dx + dy * dy);
    }
  }

  public evaluate(point: THREE.Vector3): number {
    // Calculate base content noise
    const content = this.contentNoise(point);
    
    // Apply warping to the point
    const warp = this.warpNoise(point);
    const warpedPoint = point.clone().add(warp);
    
    // Calculate slope effect
    const slope = this.slopeNoise(warpedPoint);
    
    // Apply suppression based on slope
    const suppression = 1 / (1 + Math.pow(Math.abs(slope) / this.params.supressingParam, 2));
    
    // Combine effects
    const result = content * suppression;
    
    return result;
  }

  public evaluateVector(point: THREE.Vector3): THREE.Vector3 {
    const x = this.evaluate(point);
    const y = this.evaluate(new THREE.Vector3(point.y, point.z, point.x));
    const z = this.evaluate(new THREE.Vector3(point.z, point.x, point.y));
    
    return new THREE.Vector3(x, y, z);
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
      const height = this.evaluate(point);
      
      // Displace vertices based on warped rocks evaluation
      positions[i * 3 + 2] = height * 0.05;
    }

    geometry.computeVertexNormals();
    return geometry;
  }

  public getParams(): WarpedRocksParams {
    return { ...this.params };
  }

  public setParams(params: Partial<WarpedRocksParams>): void {
    this.params = { ...this.params, ...params };
  }
}

export default WarpedRocksGenerator;
