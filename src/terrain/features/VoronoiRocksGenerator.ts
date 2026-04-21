/**
 * VoronoiRocksGenerator - Procedural Voronoi-based rock formations
 * 
 * Based on InfiniGen's VoronoiRocks element for generating realistic
 * rock formations using Voronoi diagrams with warping and gap effects.
 */

import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

export interface VoronoiRocksParams {
  seed: number;
  nLattice: number;
  minFreq: number;
  maxFreq: number;
  gapMinFreq: number;
  gapMaxFreq: number;
  gapScale: number;
  gapOctaves: number;
  gapBase: number;
  warpMinFreq: number;
  warpMaxFreq: number;
  warpOctaves: number;
  warpProb: number;
  warpModuSigmoidScale: number;
  warpModuScale: number;
  warpModuOctaves: number;
  warpModuFreq: number;
  maskOctaves: number;
  maskFreq: number;
  maskShift: number;
  heightModification?: boolean;
  attributeModificationStartHeight?: number;
  attributeModificationEndHeight?: number;
}

export class VoronoiRocksGenerator {
  private params: VoronoiRocksParams;
  private noise: SimplexNoise;
  private latticePoints: THREE.Vector3[] = [];

  constructor(params: Partial<VoronoiRocksParams> = {}) {
    this.params = {
      seed: params.seed ?? Math.floor(Math.random() * 100000),
      nLattice: params.nLattice ?? 3,
      minFreq: params.minFreq ?? 1,
      maxFreq: params.maxFreq ?? 10,
      gapMinFreq: params.gapMinFreq ?? 0.003,
      gapMaxFreq: params.gapMaxFreq ?? 0.03,
      gapScale: params.gapScale ?? 0.1,
      gapOctaves: params.gapOctaves ?? 2,
      gapBase: params.gapBase ?? 10,
      warpMinFreq: params.warpMinFreq ?? 0.1,
      warpMaxFreq: params.warpMaxFreq ?? 0.5,
      warpOctaves: params.warpOctaves ?? 3,
      warpProb: params.warpProb ?? 0.5,
      warpModuSigmoidScale: params.warpModuSigmoidScale ?? 3,
      warpModuScale: params.warpModuScale ?? 0.4,
      warpModuOctaves: params.warpModuOctaves ?? 2,
      warpModuFreq: params.warpModuFreq ?? 0.01,
      maskOctaves: params.maskOctaves ?? 11,
      maskFreq: params.maskFreq ?? 0.05,
      maskShift: params.maskShift ?? -0.2,
      heightModification: params.heightModification ?? false,
      attributeModificationStartHeight: params.attributeModificationStartHeight,
      attributeModificationEndHeight: params.attributeModificationEndHeight,
    };

    this.noise = new SimplexNoise();
    this.initializeLattice();
  }

  private initializeLattice(): void {
    const rng = this.createSeededRandom(this.params.seed);
    const count = this.params.nLattice * this.params.nLattice * this.params.nLattice;
    
    for (let i = 0; i < count; i++) {
      const x = (rng() - 0.5) * 2 * this.params.nLattice;
      const y = (rng() - 0.5) * 2 * this.params.nLattice;
      const z = (rng() - 0.5) * 2 * this.params.nLattice;
      this.latticePoints.push(new THREE.Vector3(x, y, z));
    }
  }

  private createSeededRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  private voronoiDistance(point: THREE.Vector3): number {
    let minDist = Infinity;
    
    for (const latticePoint of this.latticePoints) {
      const dist = point.distanceTo(latticePoint);
      if (dist < minDist) {
        minDist = dist;
      }
    }
    
    return minDist;
  }

  private warpNoise(point: THREE.Vector3, freq: number, octaves: number): number {
    let value = 0;
    let amplitude = 1;
    let frequency = freq;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise.noise3d(
        point.x * frequency,
        point.y * frequency,
        point.z * frequency
      );
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    return value / maxValue;
  }

  private gapNoise(point: THREE.Vector3): number {
    const freq = this.lerp(
      this.params.gapMinFreq,
      this.params.gapMaxFreq,
      Math.abs(this.warpNoise(point, this.params.warpMinFreq, 1))
    );
    
    return this.warpNoise(point, freq, this.params.gapOctaves) * this.params.gapScale;
  }

  private warpModulation(point: THREE.Vector3): number {
    if (Math.random() > this.params.warpProb) {
      return 0;
    }

    const baseWarp = this.warpNoise(
      point,
      this.lerp(this.params.warpMinFreq, this.params.warpMaxFreq, 0.5),
      this.params.warpOctaves
    );

    const modulation = this.warpNoise(
      point,
      this.params.warpModuFreq,
      this.params.warpModuOctaves
    ) * this.params.warpModuScale;

    const sigmoidScale = this.params.warpModuSigmoidScale;
    const modulated = modulation / (1 + Math.exp(-sigmoidScale * baseWarp));

    return modulated;
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Math.max(0, Math.min(1, t));
  }

  private maskNoise(point: THREE.Vector3): number {
    let value = 0;
    let amplitude = 1;
    let frequency = this.params.maskFreq;
    let maxValue = 0;

    for (let i = 0; i < this.params.maskOctaves; i++) {
      value += amplitude * this.noise.noise3d(
        point.x * frequency,
        point.y * frequency,
        point.z * frequency
      );
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    return (value / maxValue) + this.params.maskShift;
  }

  public evaluate(point: THREE.Vector3): number {
    // Calculate base Voronoi distance
    const voronoiDist = this.voronoiDistance(point);
    
    // Apply frequency scaling
    const freq = this.lerp(
      this.params.minFreq,
      this.params.maxFreq,
      Math.abs(this.warpNoise(point, 0.5, 2))
    );
    
    // Apply warping
    const warp = this.warpModulation(point);
    const warpedPoint = point.clone().addScalar(warp);
    
    // Calculate gap effect
    const gap = this.gapNoise(warpedPoint);
    
    // Combine effects
    const baseValue = voronoiDist * freq + gap;
    
    // Apply mask
    const mask = this.maskNoise(point);
    
    // Final evaluation with height modification support
    let result = baseValue * mask;
    
    if (this.params.heightModification && 
        this.params.attributeModificationStartHeight !== undefined &&
        this.params.attributeModificationEndHeight !== undefined) {
      const height = point.y;
      const startH = this.params.attributeModificationStartHeight;
      const endH = this.params.attributeModificationEndHeight;
      
      if (height < startH) {
        result *= 0; // Beach material zone
      } else if (height < endH) {
        const t = (height - startH) / (endH - startH);
        result *= t;
      }
    }
    
    return result;
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
      
      // Displace vertices based on Voronoi evaluation
      positions[i * 3 + 2] = height * 0.5;
    }

    geometry.computeVertexNormals();
    return geometry;
  }

  public getParams(): VoronoiRocksParams {
    return { ...this.params };
  }

  public setParams(params: Partial<VoronoiRocksParams>): void {
    this.params = { ...this.params, ...params };
    this.initializeLattice();
  }
}

export default VoronoiRocksGenerator;
