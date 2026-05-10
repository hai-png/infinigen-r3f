/**
 * WaveTextureNode — Blender-style Wave Texture for procedural patterns
 *
 * Implements the Blender Wave Texture node used heavily in Infinigen for
 * wood grain, marble veins, and many other natural patterns.
 *
 * Wave types:
 *   - Bands: Parallel bands along the chosen direction
 *   - Rings: Concentric rings from the origin
 *   - Ridges: Inverted bands creating sharp ridge lines (like wood grain)
 *   - Wave: Sine-based smooth wave pattern
 *
 * Directions:
 *   - X, Y, Z: Bands aligned along the respective axis
 *   - Diagonal: Bands at 45° in the XY plane
 *
 * Parameters:
 *   - scale: Overall frequency multiplier
 *   - distortion: Warps the wave pattern using noise
 *   - detail: Number of noise octaves for distortion
 *   - detailScale: Frequency multiplier for distortion noise
 *   - detailRoughness: Roughness of distortion noise
 *   - phaseOffset: Phase offset for animation
 *
 * GLSL implementation is added to GLSLNodeFunctions.ts.
 *
 * @module core/nodes/texture
 */

import { NodeTypes } from '../core/node-types';
import type { ColorLike } from '../color/ColorNodes';
import { SeededRandom } from '../../util/MathUtils';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Wave type determines the basic pattern shape.
 */
export type WaveType = 'bands' | 'rings' | 'ridges' | 'wave';

/**
 * Direction axis for band/ring orientation.
 */
export type WaveDirection = 'x' | 'y' | 'z' | 'diagonal';

/**
 * Input parameters for the Wave Texture node.
 * Matches Blender's ShaderNodeTexWave interface.
 */
export interface WaveTextureInputs {
  /** Input vector (typically UV or generated coordinates) */
  vector?: [number, number, number];
  /** Overall pattern scale (default 5.0) */
  scale?: number;
  /** Distortion amount — warps pattern using noise (default 0.0) */
  distortion?: number;
  /** Number of noise octaves for distortion detail (default 2.0) */
  detail?: number;
  /** Scale multiplier for distortion noise frequency (default 1.0) */
  detailScale?: number;
  /** Roughness of the distortion noise (0=smooth, 1=rough, default 0.5) */
  detailRoughness?: number;
  /** Phase offset for animation (default 0.0) */
  phaseOffset?: number;
  /** Wave type pattern (default 'bands') */
  waveType?: WaveType;
  /** Direction of the wave bands (default 'x') */
  direction?: WaveDirection;
  /** Seed for deterministic noise (default 42) */
  seed?: number;
}

/**
 * Output structure for the Wave Texture node.
 */
export interface WaveTextureOutputs {
  /** Color output (grayscale wave pattern as RGB) */
  color: ColorLike;
  /** Fac output (scalar wave value [0, 1]) */
  float: number;
}

// ============================================================================
// Node Interface
// ============================================================================

export interface TextureNodeBase {
  type: NodeTypes;
  name: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
}

// ============================================================================
// WaveTextureNode Implementation
// ============================================================================

/**
 * Wave Texture Node — Procedural wave pattern generator.
 *
 * Produces Bands, Rings, Ridges, or smooth Wave patterns with optional
 * noise-based distortion. This matches Blender's ShaderNodeTexWave and
 * is heavily used in Infinigen for wood grain, marble, and other natural
 * surface patterns.
 *
 * @example
 * ```ts
 * // Wood grain
 * const wood = new WaveTextureNode();
 * wood.inputs.waveType = 'ridges';
 * wood.inputs.direction = 'x';
 * wood.inputs.scale = 10;
 * wood.inputs.distortion = 1.5;
 * wood.inputs.detail = 3;
 *
 * // Marble
 * const marble = new WaveTextureNode();
 * marble.inputs.waveType = 'bands';
 * marble.inputs.direction = 'diagonal';
 * marble.inputs.scale = 5;
 * marble.inputs.distortion = 2.0;
 * marble.inputs.detail = 5;
 * ```
 */
export class WaveTextureNode implements TextureNodeBase {
  readonly type = NodeTypes.TextureWave;
  readonly name = 'Wave Texture';

  inputs: WaveTextureInputs = {
    vector: [0, 0, 0],
    scale: 5.0,
    distortion: 0.0,
    detail: 2.0,
    detailScale: 1.0,
    detailRoughness: 0.5,
    phaseOffset: 0.0,
    waveType: 'bands',
    direction: 'x',
    seed: 42,
  };

  outputs: WaveTextureOutputs = {
    color: { r: 0, g: 0, b: 0 },
    float: 0,
  };

  /** Permutation table for noise-based distortion */
  private perm: Uint8Array;

  constructor(seed: number = 42) {
    this.inputs.seed = seed;
    this.perm = this.buildPermutationTable(seed);
  }

  /**
   * Execute the wave texture computation.
   *
   * @returns WaveTextureOutputs with color and float values
   */
  execute(): WaveTextureOutputs {
    const {
      vector = [0, 0, 0],
      scale = 5.0,
      distortion = 0.0,
      detail = 2.0,
      detailScale = 1.0,
      detailRoughness = 0.5,
      phaseOffset = 0.0,
      waveType = 'bands',
      direction = 'x',
    } = this.inputs;

    const x = vector[0];
    const y = vector[1];
    const z = vector[2] || 0;

    // Step 1: Compute the base coordinate based on direction
    let coord: number;
    switch (direction) {
      case 'x':
        coord = x;
        break;
      case 'y':
        coord = y;
        break;
      case 'z':
        coord = z;
        break;
      case 'diagonal':
        coord = (x + y + z) / Math.sqrt(3);
        break;
      default:
        coord = x;
    }

    // Step 2: Apply noise-based distortion
    if (distortion > 0.0) {
      const octaves = Math.min(Math.floor(detail), 8);
      const distortionNoise = this.computeDistortionNoise(
        x * detailScale,
        y * detailScale,
        z * detailScale,
        octaves,
        detailRoughness,
      );
      coord += distortionNoise * distortion;
    }

    // Step 3: Scale the coordinate
    coord *= scale;

    // Step 4: Add phase offset
    coord += phaseOffset;

    // Step 5: Compute the wave value based on wave type
    let value: number;
    switch (waveType) {
      case 'bands':
        // Sawtooth-like bands: repeat from 0 to 1
        value = coord - Math.floor(coord);
        break;

      case 'rings': {
        // Concentric rings: distance from origin
        const dist = Math.sqrt(
          direction === 'x' ? y * y + z * z :
          direction === 'y' ? x * x + z * z :
          direction === 'z' ? x * x + y * y :
          x * x + y * y + z * z
        );
        const ringCoord = dist * scale + phaseOffset;
        if (distortion > 0.0) {
          const ringDistNoise = this.computeDistortionNoise(
            x * detailScale,
            y * detailScale,
            z * detailScale,
            Math.min(Math.floor(detail), 8),
            detailRoughness,
          );
          value = (ringCoord + ringDistNoise * distortion) -
                  Math.floor(ringCoord + ringDistNoise * distortion);
        } else {
          value = ringCoord - Math.floor(ringCoord);
        }
        break;
      }

      case 'ridges': {
        // Sharp ridges: inverted triangle wave creating peak lines
        // like wood grain. |1 - 2 * frac(x)| gives V-shaped ridges
        const frac = coord - Math.floor(coord);
        value = 1.0 - Math.abs(2.0 * frac - 1.0);
        break;
      }

      case 'wave': {
        // Smooth sine wave
        value = Math.sin(coord * Math.PI * 2.0) * 0.5 + 0.5;
        break;
      }

      default:
        value = coord - Math.floor(coord);
    }

    // Clamp to [0, 1]
    value = Math.max(0, Math.min(1, value));

    this.outputs.float = value;
    this.outputs.color = { r: value, g: value, b: value };

    return this.outputs;
  }

  // ========================================================================
  // Noise for Distortion
  // ========================================================================

  /**
   * Compute multi-octave gradient noise for wave distortion.
   * Uses the same Perlin noise approach as other texture nodes.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param z - Z coordinate
   * @param octaves - Number of noise octaves
   * @param roughness - Roughness (gain) per octave
   * @returns Noise value in approximately [-1, 1]
   */
  private computeDistortionNoise(
    x: number, y: number, z: number,
    octaves: number, roughness: number,
  ): number {
    let value = 0;
    let amplitude = 1.0;
    let frequency = 1.0;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.gradientNoise3D(
        x * frequency, y * frequency, z * frequency,
      );
      maxValue += amplitude;
      amplitude *= roughness;
      frequency *= 2.0;
    }

    return maxValue > 0 ? value / maxValue : 0;
  }

  /**
   * 3D Perlin gradient noise using the permutation table.
   */
  private gradientNoise3D(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    const u = this.fade(x);
    const v = this.fade(y);
    const w = this.fade(z);

    const A  = this.perm[X] + Y;
    const AA = this.perm[A] + Z;
    const AB = this.perm[A + 1] + Z;
    const B  = this.perm[X + 1] + Y;
    const BA = this.perm[B] + Z;
    const BB = this.perm[B + 1] + Z;

    return this.lerp(w,
      this.lerp(v,
        this.lerp(u, this.grad(this.perm[AA], x, y, z), this.grad(this.perm[BA], x - 1, y, z)),
        this.lerp(u, this.grad(this.perm[AB], x, y - 1, z), this.grad(this.perm[BB], x - 1, y - 1, z))
      ),
      this.lerp(v,
        this.lerp(u, this.grad(this.perm[AA + 1], x, y, z - 1), this.grad(this.perm[BA + 1], x - 1, y, z - 1)),
        this.lerp(u, this.grad(this.perm[AB + 1], x, y - 1, z - 1), this.grad(this.perm[BB + 1], x - 1, y - 1, z - 1))
      )
    );
  }

  /** Quintic fade curve: 6t^5 - 15t^4 + 10t^3 */
  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  /** Linear interpolation */
  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  /** Gradient dot product from permutation table */
  private grad(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  /**
   * Build a 512-entry permutation table using Fisher-Yates shuffle
   * from a seeded PRNG for deterministic results.
   */
  private buildPermutationTable(seed: number): Uint8Array {
    const p = new Uint8Array(512);
    const base = new Uint8Array(256);
    for (let i = 0; i < 256; i++) base[i] = i;

    // Seeded LCG PRNG
    let s = seed | 0;
    const nextRand = () => {
      s = (s * 1664525 + 1013904223) & 0x7fffffff;
      return s / 0x7fffffff;
    };

    for (let i = 255; i > 0; i--) {
      const j = Math.floor(nextRand() * (i + 1));
      [base[i], base[j]] = [base[j], base[i]];
    }

    for (let i = 0; i < 256; i++) {
      p[i] = base[i];
      p[i + 256] = base[i];
    }
    return p;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a WaveTextureNode with optional input overrides.
 *
 * @param inputs - Partial wave texture parameters
 * @returns Configured WaveTextureNode
 *
 * @example
 * ```ts
 * const woodGrain = createWaveTextureNode({
 *   waveType: 'ridges',
 *   direction: 'x',
 *   scale: 10,
 *   distortion: 1.5,
 *   detail: 3,
 * });
 * ```
 */
export function createWaveTextureNode(inputs?: Partial<WaveTextureInputs>): WaveTextureNode {
  const node = new WaveTextureNode(inputs?.seed);
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}
