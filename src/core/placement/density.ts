/**
 * Density Filter - Object placement density control
 * 
 * Provides density-based filtering for object placement,
 * including altitude, slope, and biome-based density modifiers.
 */

import * as THREE from 'three';

export interface DensityConfig {
  minDensity: number;
  maxDensity: number;
  altitudeFalloff: number;
  slopeThreshold: number;
  biomeWeight: number;
  noiseScale: number;
  noiseStrength: number;
}

export class DensityFilter {
  private config: DensityConfig;

  constructor(config: Partial<DensityConfig> = {}) {
    this.config = {
      minDensity: 0,
      maxDensity: 1,
      altitudeFalloff: 0.5,
      slopeThreshold: 45,
      biomeWeight: 0.3,
      noiseScale: 1,
      noiseStrength: 0.2,
      ...config,
    };
  }

  filter(
    positions: THREE.Vector3[],
    normals?: THREE.Vector3[]
  ): THREE.Vector3[] {
    return positions.filter((pos, i) => {
      const density = this.calculateDensity(pos, normals?.[i]);
      return density > this.config.minDensity;
    });
  }

  calculateDensity(position: THREE.Vector3, normal?: THREE.Vector3): number {
    let density = this.config.maxDensity;

    // Altitude falloff
    const altitude = position.y;
    density *= Math.exp(-altitude * this.config.altitudeFalloff);

    // Slope filter
    if (normal && this.config.slopeThreshold < 90) {
      const slope = Math.acos(normal.dot(new THREE.Vector3(0, 1, 0))) * (180 / Math.PI);
      if (slope > this.config.slopeThreshold) {
        density *= 1 - (slope - this.config.slopeThreshold) / (90 - this.config.slopeThreshold);
      }
    }

    return Math.max(this.config.minDensity, Math.min(this.config.maxDensity, density));
  }
}
