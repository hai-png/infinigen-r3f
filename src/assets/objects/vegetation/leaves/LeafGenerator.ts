/**
 * LeafGenerator.ts — Parametric Leaf Geometry with Vein Structure and Wave Deformation
 *
 * Generates detailed leaf geometries with:
 * - Parametric shapes (broadleaf, ginkgo, maple, pine, oak)
 * - Vein structure as vertex displacement (raised veins)
 * - Wave deformation (sinusoidal displacement + gravity droop)
 *
 * Shape formulas reference the original Infinigen leaf.py:
 *   - Broadleaf: x = sin(a) * width, y = -cos(0.9*(a-alpha)), z = x² * zScale
 *   - Ginkgo: fan shape with central notch
 *   - Maple: 5-lobed star shape
 *   - Pine: narrow needle shape
 *   - Oak: lobed edge pattern
 *
 * Ported from: infinigen/terrain/objects/leaves/leaf.py
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Types & Interfaces
// ============================================================================

/** Supported leaf shape types */
export type LeafShapeType = 'broadleaf' | 'ginkgo' | 'maple' | 'pine' | 'oak';

/** Vein structure parameters */
export interface VeinParams {
  /** Number of secondary veins per side (default 5) */
  veinDensity: number;
  /** Angle of secondary veins from main vein in radians (default 0.5) */
  veinAngle: number;
  /** Height of vein displacement (default 0.005) */
  veinProminence: number;
}

/** Wave deformation parameters */
export interface WaveParams {
  /** Whether to apply wave deformation (default true) */
  useWave: boolean;
  /** Height of sinusoidal wave (default 0.01) */
  waveHeight: number;
  /** Width (frequency) of wave pattern (default 3.0) */
  waveWidth: number;
  /** Speed factor for wave animation (default 0.0, static) */
  waveSpeed: number;
  /** Amount of gravity droop at the tip (default 0.02) */
  droopAmount: number;
}

/** Leaf generator parameters */
export interface LeafGeneratorParams {
  /** Leaf shape type (default 'broadleaf') */
  leafType: LeafShapeType;
  /** Overall leaf length (default 0.15) */
  length: number;
  /** Overall leaf width (default 0.08) */
  width: number;
  /** Number of segments along the leaf length (default 12) */
  lengthSegments: number;
  /** Number of segments across the leaf width (default 6) */
  widthSegments: number;
  /** Vein structure parameters */
  veins: VeinParams;
  /** Wave deformation parameters */
  wave: WaveParams;
  /** Random seed for deterministic generation (default 42) */
  seed: number;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_VEIN_PARAMS: VeinParams = {
  veinDensity: 5,
  veinAngle: 0.5,
  veinProminence: 0.005,
};

const DEFAULT_WAVE_PARAMS: WaveParams = {
  useWave: true,
  waveHeight: 0.01,
  waveWidth: 3.0,
  waveSpeed: 0.0,
  droopAmount: 0.02,
};

const DEFAULT_LEAF_PARAMS: LeafGeneratorParams = {
  leafType: 'broadleaf',
  length: 0.15,
  width: 0.08,
  lengthSegments: 12,
  widthSegments: 6,
  veins: { ...DEFAULT_VEIN_PARAMS },
  wave: { ...DEFAULT_WAVE_PARAMS },
  seed: 42,
};

// ============================================================================
// LeafGenerator
// ============================================================================

/**
 * LeafGenerator creates detailed leaf geometries with vein structure
 * and wave deformation, following the Infinigen leaf.py parametric approach.
 *
 * Each leaf shape is defined by a parametric curve that determines the
 * outline, then vein structure is applied as vertex displacement,
 * and wave deformation adds organic curl and droop.
 *
 * Usage:
 *   const gen = new LeafGenerator({ leafType: 'maple', seed: 42 });
 *   const geometry = gen.generate();
 */
export class LeafGenerator {
  private params: LeafGeneratorParams;
  private rng: SeededRandom;

  constructor(params: Partial<LeafGeneratorParams> = {}) {
    this.params = {
      ...DEFAULT_LEAF_PARAMS,
      ...params,
      veins: { ...DEFAULT_VEIN_PARAMS, ...params.veins },
      wave: { ...DEFAULT_WAVE_PARAMS, ...params.wave },
    };
    this.rng = new SeededRandom(this.params.seed);
  }

  /**
   * Generate the leaf geometry.
   *
   * @returns THREE.BufferGeometry with position, normal, uv attributes
   */
  generate(): THREE.BufferGeometry {
    const { leafType } = this.params;

    switch (leafType) {
      case 'broadleaf':  return this.generateBroadleaf();
      case 'ginkgo':     return this.generateGinkgo();
      case 'maple':      return this.generateMaple();
      case 'pine':       return this.generatePine();
      case 'oak':        return this.generateOak();
      default:           return this.generateBroadleaf();
    }
  }

  // --------------------------------------------------------------------------
  // Broadleaf
  // --------------------------------------------------------------------------

  /**
   * Broadleaf shape:
   *   x = sin(a) * width
   *   y = -cos(0.9 * (a - alpha))  (alpha is the opening angle)
   *   z = x² * zScale (curvature)
   */
  private generateBroadleaf(): THREE.BufferGeometry {
    const { length, width, lengthSegments, widthSegments, veins, wave } = this.params;
    const alpha = Math.PI * 0.45; // Opening angle

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Generate grid of vertices
    for (let iy = 0; iy <= lengthSegments; iy++) {
      const t = iy / lengthSegments; // 0 (base) → 1 (tip)
      const a = t * Math.PI; // Parameter for the parametric curve

      // Parametric shape
      const halfWidth = Math.sin(a) * width;
      const y = -Math.cos(0.9 * (a - alpha)) * length;

      for (let ix = 0; ix <= widthSegments; ix++) {
        const s = ix / widthSegments; // 0 (left) → 1 (right)
        const x = (s - 0.5) * 2 * halfWidth;

        // Curvature: z = x² * zScale
        const zScale = 0.5;
        let z = x * x * zScale;

        // Apply vein displacement
        z += this.computeVeinDisplacement(t, s, halfWidth, veins);

        // Apply wave deformation
        if (wave.useWave) {
          z += this.computeWaveDisplacement(x, y, t, wave);
        }

        positions.push(x, y, z);
        normals.push(0, 0, 1); // Will be recomputed
        uvs.push(s, t);
      }
    }

    // Build triangle indices
    this.buildGridIndices(indices, lengthSegments, widthSegments);

    return this.buildGeometry(positions, normals, uvs, indices);
  }

  // --------------------------------------------------------------------------
  // Ginkgo
  // --------------------------------------------------------------------------

  /**
   * Ginkgo: Fan shape with central notch.
   * Wide fan that splits at the top with a V-notch.
   */
  private generateGinkgo(): THREE.BufferGeometry {
    const { length, width, lengthSegments, widthSegments, veins, wave } = this.params;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let iy = 0; iy <= lengthSegments; iy++) {
      const t = iy / lengthSegments; // 0 = base (stem), 1 = top (fan edge)
      const y = t * length;

      // Fan width: starts narrow at base, widens dramatically, then has a central notch at top
      let fanWidth: number;
      if (t < 0.4) {
        // Narrow stem region
        fanWidth = width * 0.3 * (t / 0.4);
      } else {
        // Fan region — widens
        const fanT = (t - 0.4) / 0.6;
        fanWidth = width * (0.3 + fanT * 1.4);
      }

      // Central notch depth increases toward the tip
      const notchDepth = t > 0.7 ? (t - 0.7) / 0.3 * width * 0.3 : 0;

      for (let ix = 0; ix <= widthSegments; ix++) {
        const s = ix / widthSegments; // 0 → 1
        const x = (s - 0.5) * 2 * fanWidth;

        // Notch: pull center vertices downward near tip
        let yNotch = 0;
        if (notchDepth > 0) {
          const distFromCenter = Math.abs(s - 0.5) * 2;
          if (distFromCenter < 0.2) {
            yNotch = -notchDepth * (1 - distFromCenter / 0.2);
          }
        }

        let z = x * x * 0.3;
        z += this.computeVeinDisplacement(t, s, fanWidth, veins);
        if (wave.useWave) {
          z += this.computeWaveDisplacement(x, y, t, wave);
        }

        positions.push(x, y + yNotch, z);
        normals.push(0, 0, 1);
        uvs.push(s, t);
      }
    }

    this.buildGridIndices(indices, lengthSegments, widthSegments);
    return this.buildGeometry(positions, normals, uvs, indices);
  }

  // --------------------------------------------------------------------------
  // Maple
  // --------------------------------------------------------------------------

  /**
   * Maple: 5-lobed star shape.
   * Alternating large and small lobes.
   */
  private generateMaple(): THREE.BufferGeometry {
    const { length, width, lengthSegments, widthSegments, veins, wave } = this.params;
    const lobeCount = 5;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let iy = 0; iy <= lengthSegments; iy++) {
      const t = iy / lengthSegments;
      const y = t * length;

      // 5-lobed width modulation
      const baseWidth = width * Math.sin(t * Math.PI); // General shape
      const lobeFreq = lobeCount;
      const lobeModulation = 1.0 + 0.4 * Math.sin(t * lobeFreq * Math.PI);
      const effectiveWidth = baseWidth * lobeModulation;

      for (let ix = 0; ix <= widthSegments; ix++) {
        const s = ix / widthSegments;
        const x = (s - 0.5) * 2 * effectiveWidth;

        let z = x * x * 0.4;
        z += this.computeVeinDisplacement(t, s, effectiveWidth, veins);
        if (wave.useWave) {
          z += this.computeWaveDisplacement(x, y, t, wave);
        }

        positions.push(x, y, z);
        normals.push(0, 0, 1);
        uvs.push(s, t);
      }
    }

    this.buildGridIndices(indices, lengthSegments, widthSegments);
    return this.buildGeometry(positions, normals, uvs, indices);
  }

  // --------------------------------------------------------------------------
  // Pine
  // --------------------------------------------------------------------------

  /**
   * Pine: Narrow needle shape.
   * Very elongated with minimal width tapering to a point.
   */
  private generatePine(): THREE.BufferGeometry {
    const { length, width, lengthSegments, widthSegments, veins, wave } = this.params;
    const needleWidth = width * 0.25;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let iy = 0; iy <= lengthSegments; iy++) {
      const t = iy / lengthSegments;
      const y = t * length;

      // Tapered both ends, widest at 1/3 from base
      let taperWidth: number;
      if (t < 0.33) {
        taperWidth = needleWidth * (t / 0.33);
      } else {
        taperWidth = needleWidth * (1 - (t - 0.33) / 0.67);
      }

      for (let ix = 0; ix <= widthSegments; ix++) {
        const s = ix / widthSegments;
        const x = (s - 0.5) * 2 * taperWidth;

        // Needle has slight roundness
        let z = Math.abs(x) * 0.5 - taperWidth * 0.25;
        z = Math.max(z, -taperWidth * 0.25);

        // Minimal veins for needles
        z += this.computeVeinDisplacement(t, s, taperWidth, veins) * 0.3;
        if (wave.useWave) {
          z += this.computeWaveDisplacement(x, y, t, wave) * 0.5;
        }

        positions.push(x, y, z);
        normals.push(0, 0, 1);
        uvs.push(s, t);
      }
    }

    this.buildGridIndices(indices, lengthSegments, widthSegments);
    return this.buildGeometry(positions, normals, uvs, indices);
  }

  // --------------------------------------------------------------------------
  // Oak
  // --------------------------------------------------------------------------

  /**
   * Oak: Lobed edge pattern.
   * Rounded lobes along the sides with deeper sinuses between them.
   */
  private generateOak(): THREE.BufferGeometry {
    const { length, width, lengthSegments, widthSegments, veins, wave } = this.params;
    const lobeCount = 4;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let iy = 0; iy <= lengthSegments; iy++) {
      const t = iy / lengthSegments;
      const y = t * length;

      // Base shape with sinusoidal lobe edges
      const baseWidth = width * Math.sin(t * Math.PI);
      const lobeModulation = 1.0 + 0.3 * Math.sin(t * lobeCount * Math.PI);
      const effectiveWidth = baseWidth * lobeModulation;

      for (let ix = 0; ix <= widthSegments; ix++) {
        const s = ix / widthSegments;
        const x = (s - 0.5) * 2 * effectiveWidth;

        let z = x * x * 0.3;
        z += this.computeVeinDisplacement(t, s, effectiveWidth, veins);
        if (wave.useWave) {
          z += this.computeWaveDisplacement(x, y, t, wave);
        }

        positions.push(x, y, z);
        normals.push(0, 0, 1);
        uvs.push(s, t);
      }
    }

    this.buildGridIndices(indices, lengthSegments, widthSegments);
    return this.buildGeometry(positions, normals, uvs, indices);
  }

  // --------------------------------------------------------------------------
  // Vein Displacement
  // --------------------------------------------------------------------------

  /**
   * Compute vein displacement at a given (t, s) position on the leaf.
   *
   * Main vein: runs along the center (s ≈ 0.5) from base to tip.
   * Secondary veins: branch at regular intervals from the main vein
   * at the configured angle.
   *
   * The displacement is raised (positive Z) where veins are located.
   */
  private computeVeinDisplacement(
    t: number,
    s: number,
    halfWidth: number,
    veins: VeinParams
  ): number {
    if (halfWidth < 0.001) return 0;

    const { veinDensity, veinAngle, veinProminence } = veins;
    let displacement = 0;

    // Main vein: center of the leaf, full length
    const distFromCenter = Math.abs(s - 0.5) * 2; // 0 at center, 1 at edge
    const mainVeinWidth = 0.08; // Narrow main vein
    if (distFromCenter < mainVeinWidth) {
      displacement += veinProminence * (1 - distFromCenter / mainVeinWidth);
    }

    // Secondary veins: branch off at regular intervals
    for (let v = 1; v <= veinDensity; v++) {
      const veinT = v / (veinDensity + 1); // Position along length where this vein branches
      if (t < veinT) continue; // This vein hasn't started yet

      // Each secondary vein extends outward at an angle from the center
      const veinProgress = (t - veinT) / (1 - veinT); // 0→1 along this secondary vein
      if (veinProgress > 1 || veinProgress < 0) continue;

      // Vein extends from center to edge at the given angle
      const veinReach = veinProgress * Math.tan(veinAngle);
      const leftVeinS = 0.5 - veinReach * 0.5;
      const rightVeinS = 0.5 + veinReach * 0.5;

      // Distance to this secondary vein line
      const distToLeft = Math.abs(s - leftVeinS);
      const distToRight = Math.abs(s - rightVeinS);
      const minDist = Math.min(distToLeft, distToRight);

      const secondaryVeinWidth = 0.06;
      if (minDist < secondaryVeinWidth) {
        // Fade vein from center toward edge
        const edgeFade = 1 - veinProgress;
        displacement += veinProminence * 0.6 * (1 - minDist / secondaryVeinWidth) * edgeFade;
      }
    }

    return displacement;
  }

  // --------------------------------------------------------------------------
  // Wave Deformation
  // --------------------------------------------------------------------------

  /**
   * Compute wave deformation at a given position.
   *
   * Wave modifier: sinusoidal displacement along Z
   * Gravity droop: z += (y/maxY)² * droopAmount
   */
  private computeWaveDisplacement(
    x: number,
    _y: number,
    t: number,
    wave: WaveParams
  ): number {
    if (!wave.useWave) return 0;

    let z = 0;

    // Sinusoidal wave across the width
    z += Math.sin(x * wave.waveWidth) * wave.waveHeight;

    // Gravity droop: stronger toward tip
    z -= t * t * wave.droopAmount;

    return z;
  }

  // --------------------------------------------------------------------------
  // Grid Index Builder
  // --------------------------------------------------------------------------

  /**
   * Build triangle indices for a grid mesh.
   */
  private buildGridIndices(
    indices: number[],
    lengthSegs: number,
    widthSegs: number
  ): void {
    for (let iy = 0; iy < lengthSegs; iy++) {
      for (let ix = 0; ix < widthSegs; ix++) {
        const a = iy * (widthSegs + 1) + ix;
        const b = a + 1;
        const c = a + (widthSegs + 1);
        const d = c + 1;

        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Geometry Assembly
  // --------------------------------------------------------------------------

  /**
   * Assemble raw arrays into a THREE.BufferGeometry.
   */
  private buildGeometry(
    positions: number[],
    normals: number[],
    uvs: number[],
    indices: number[]
  ): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick-generate a leaf geometry.
 */
export function generateLeaf(
  leafType: LeafShapeType = 'broadleaf',
  seed: number = 42
): THREE.BufferGeometry {
  const gen = new LeafGenerator({ leafType, seed });
  return gen.generate();
}
