/**
 * BrainCoralGenerator — SphereGeometry with reaction-diffusion displacement.
 *
 * Generates brain coral using a sphere base with ridged multifractal noise
 * to approximate the meandering groove patterns characteristic of brain coral.
 * Vertices are displaced inward along normals where the pattern is "low"
 * (valleys), creating the distinctive grooved surface.
 *
 * @module objects/coral
 */

import * as THREE from 'three';
import { SeededRandom, seededFbm } from '@/core/util/MathUtils';

// ── Types ──────────────────────────────────────────────────────────────

export interface BrainCoralConfig {
  radius: number;
  resolution: number;
  grooveDepth: number;
  patternScale: number;
  color: string;
  grooveColor: string;
  flattenFactor: number;
  seed: number;
}

const DEFAULT_CONFIG: BrainCoralConfig = {
  radius: 0.5,
  resolution: 48,
  grooveDepth: 0.03,
  patternScale: 6.0,
  color: '#8B7355',
  grooveColor: '#5C4033',
  flattenFactor: 0.3,
  seed: 42,
};

// ── BrainCoralGenerator Class ─────────────────────────────────────────

export class BrainCoralGenerator {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Generate a brain coral group.
   */
  generate(config: Partial<BrainCoralConfig> = {}): THREE.Group {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    this.rng = new SeededRandom(cfg.seed);

    const group = new THREE.Group();
    group.name = 'BrainCoral';

    // Base sphere
    const sphereGeo = new THREE.SphereGeometry(cfg.radius, cfg.resolution, cfg.resolution);

    // Flatten into dome shape
    const positions = sphereGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      let y = positions.getY(i);
      if (y < 0) {
        y = y * (1 - cfg.flattenFactor);
        positions.setY(i, y);
      }
    }

    // Apply reaction-diffusion-like displacement
    this.applyDisplacement(sphereGeo, cfg);

    // Vertex colors from displacement pattern
    const colors = new Float32Array(positions.count * 3);
    const baseColor = new THREE.Color(cfg.color);
    const grooveColor = new THREE.Color(cfg.grooveColor);

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      const pattern = this.computePattern(x, y, z, cfg);
      const t = Math.max(0, Math.min(1, (pattern + 1) * 0.5));
      const color = baseColor.clone().lerp(grooveColor, 1 - t);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    sphereGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.8, metalness: 0.0,
    });
    const mesh = new THREE.Mesh(sphereGeo, material);
    mesh.name = 'brainCoral';
    group.add(mesh);

    // Base attachment
    const baseMat = new THREE.MeshStandardMaterial({ color: cfg.grooveColor, roughness: 0.9 });
    const baseGeo = new THREE.CylinderGeometry(cfg.radius * 0.3, cfg.radius * 0.4, cfg.radius * 0.15, 16);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -cfg.radius * (1 - cfg.flattenFactor) - cfg.radius * 0.075;
    base.name = 'base';
    group.add(base);

    return group;
  }

  /** Apply reaction-diffusion-like displacement to sphere geometry */
  private applyDisplacement(geometry: THREE.BufferGeometry, config: BrainCoralConfig): void {
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      // Skip bottom vertices
      if (y < -config.radius * (1 - config.flattenFactor) * 0.5) continue;

      const pattern = this.computePattern(x, y, z, config);
      const displacement = pattern * config.grooveDepth;

      const nx = normals.getX(i);
      const ny = normals.getY(i);
      const nz = normals.getZ(i);

      positions.setX(i, x + nx * displacement);
      positions.setY(i, y + ny * displacement);
      positions.setZ(i, z + nz * displacement);
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  /** Compute brain coral pattern using ridged multifractal noise */
  private computePattern(x: number, y: number, z: number, config: BrainCoralConfig): number {
    const scale = config.patternScale;

    const ridge1 = this.ridgedMultifractal(
      x * scale, y * scale, z * scale,
      4, 2.0, 0.5, 0.7, config.seed,
    );
    const ridge2 = this.ridgedMultifractal(
      x * scale * 1.7 + 100, y * scale * 1.7, z * scale * 1.7 + 100,
      3, 2.0, 0.5, 0.6, config.seed + 50,
    );

    const combined = ridge1 * 0.7 + ridge2 * 0.3;
    return combined > 0 ? combined * 0.3 : combined;
  }

  /** Ridged multifractal noise approximation */
  private ridgedMultifractal(
    x: number, y: number, z: number,
    octaves: number, lacunarity: number, persistence: number,
    offset: number, seed: number,
  ): number {
    let value = 0;
    let amplitude = 1.0;
    let frequency = 1.0;
    let maxAmplitude = 0;

    for (let i = 0; i < octaves; i++) {
      const noise = seededFbm(
        x * frequency + seed * 0.1 + i * 31.7,
        y * frequency + i * 47.3,
        z * frequency + seed * 0.1 + i * 73.1,
        1, lacunarity, persistence, seed + i * 53,
      );
      const ridged = offset - Math.abs(noise);
      value += ridged * ridged * amplitude;
      maxAmplitude += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return value / maxAmplitude - 0.5;
  }
}

// ── Convenience function ───────────────────────────────────────────────

export function generateBrainCoral(config: Partial<BrainCoralConfig> = {}): THREE.Group {
  const generator = new BrainCoralGenerator(config.seed ?? 42);
  return generator.generate(config);
}
