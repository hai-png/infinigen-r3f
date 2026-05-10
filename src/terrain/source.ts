/**
 * Terrain Source - Noise sources and sampling for terrain generation
 *
 * Provides proper Perlin, Simplex, and OpenSimplex2S noise generation,
 * heightfield sources, and sampling utilities for terrain data.
 *
 * All noise sources return values in the [-1, 1] range.
 */

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

/** Build a 256-entry permutation table from a seed using Fisher-Yates shuffle */
function buildPermutationTable(seed: number): Uint8Array {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;

  // Seeded Fisher-Yates shuffle
  let s = seed | 0;
  for (let i = 255; i > 0; i--) {
    // xorshift32 step for deterministic pseudo-random
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    const j = ((s >>> 0) % (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }

  // Duplicate to avoid wrapping in noise lookups
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return perm;
}

/** 6t^5 - 15t^4 + 10t^3  (improved Perlin fade curve) */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Linear interpolation */
function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

// ---------------------------------------------------------------------------
// NoiseSource interface
// ---------------------------------------------------------------------------

export interface NoiseSource {
  sample(x: number, y: number, z?: number): number;
  sample2D(x: number, y: number): number;
  sample3D(x: number, y: number, z: number): number;
}

// ---------------------------------------------------------------------------
// Perlin Noise Source  (gradient noise with permutation table)
// ---------------------------------------------------------------------------

/**
 * Classic 3D Perlin noise with proper gradient vectors and smoothstep.
 *
 * - Uses 12 standard gradient directions + 4 duplicates for 256 permutations.
 * - Fade: 6t^5 - 15t^4 + 10t^3 (C² continuity).
 * - Returns values in approximately [-1, 1].
 */
export class PerlinNoiseSource implements NoiseSource {
  private perm: Uint8Array;

  constructor(seed: number = 42) {
    this.perm = buildPermutationTable(seed);
  }

  sample(x: number, y: number, z: number = 0): number {
    return this.sample3D(x, y, z);
  }

  sample2D(x: number, y: number): number {
    return this.sample3D(x, y, 0);
  }

  sample3D(x: number, y: number, z: number): number {
    const perm = this.perm;

    // Find unit cube that contains the point
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    // Relative position inside the cube
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);

    // Fade curves
    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);

    // Hash coordinates of the 8 cube corners
    const A  = perm[X] + Y;
    const AA = perm[A] + Z;
    const AB = perm[A + 1] + Z;
    const B  = perm[X + 1] + Y;
    const BA = perm[B] + Z;
    const BB = perm[B + 1] + Z;

    // Gradient dot products at each corner, blended
    return lerp(
      lerp(
        lerp(this.grad3d(perm[AA],     xf,     yf,     zf),
             this.grad3d(perm[BA],     xf - 1, yf,     zf), u),
        lerp(this.grad3d(perm[AB],     xf,     yf - 1, zf),
             this.grad3d(perm[BB],     xf - 1, yf - 1, zf), u),
        v,
      ),
      lerp(
        lerp(this.grad3d(perm[AA + 1], xf,     yf,     zf - 1),
             this.grad3d(perm[BA + 1], xf - 1, yf,     zf - 1), u),
        lerp(this.grad3d(perm[AB + 1], xf,     yf - 1, zf - 1),
             this.grad3d(perm[BB + 1], xf - 1, yf - 1, zf - 1), u),
        v,
      ),
      w,
    );
  }

  /** Dot product between a gradient direction and the distance vector */
  private grad3d(hash: number, x: number, y: number, z: number): number {
    // 12 gradient directions mapped from the lower 4 bits of hash
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
}

// ---------------------------------------------------------------------------
// Simplex Noise Source  (skew/unskew with proper gradient contributions)
// ---------------------------------------------------------------------------

/**
 * 2D and 3D simplex noise using the standard skew/unskew approach.
 *
 * - 2D: three corner contributions (equilateral triangle grid).
 * - 3D: four corner contributions (tetrahedral grid).
 * - Returns values in approximately [-1, 1].
 */
export class SimplexNoiseSource implements NoiseSource {
  private perm: Uint8Array;
  private permMod12: Uint8Array;

  /** 3D gradient vectors for simplex noise */
  private static readonly GRAD3: ReadonlyArray<[number, number, number]> = [
    [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
    [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
    [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
  ];

  // Skewing factors
  private static readonly F2 = (Math.sqrt(3) - 1) / 2; // ≈ 0.3660
  private static readonly G2 = (3 - Math.sqrt(3)) / 6;  // ≈ 0.2113
  private static readonly F3 = 1 / 3;
  private static readonly G3 = 1 / 6;

  constructor(seed: number = 42) {
    this.perm = buildPermutationTable(seed);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.permMod12[i] = this.perm[i] % 12;
  }

  sample(x: number, y: number, z: number = 0): number {
    return this.sample3D(x, y, z);
  }

  sample2D(x: number, y: number): number {
    const { F2, G2, GRAD3 } = SimplexNoiseSource;
    const perm = this.perm;
    const permMod12 = this.permMod12;

    // Skew input space to determine which simplex cell we're in
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);

    const t = (i + j) * G2;
    // Unskew the cell origin back to (x, y) space
    const X0 = i - t;
    const Y0 = j - t;
    // Distances from cell origin
    const x0 = x - X0;
    const y0 = y - Y0;

    // Determine which simplex we are in
    let i1: number, j1: number;
    if (x0 > y0) { i1 = 1; j1 = 0; } // lower triangle
    else          { i1 = 0; j1 = 1; } // upper triangle

    // Offsets for middle corner
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    // Offsets for last corner
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    // Hash indices
    const ii = i & 255;
    const jj = j & 255;

    // Contribution from each corner
    let n0 = 0, n1 = 0, n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const gi0 = permMod12[ii + perm[jj]];
      t0 *= t0;
      n0 = t0 * t0 * (GRAD3[gi0][0] * x0 + GRAD3[gi0][1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const gi1 = permMod12[ii + i1 + perm[jj + j1]];
      t1 *= t1;
      n1 = t1 * t1 * (GRAD3[gi1][0] * x1 + GRAD3[gi1][1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const gi2 = permMod12[ii + 1 + perm[jj + 1]];
      t2 *= t2;
      n2 = t2 * t2 * (GRAD3[gi2][0] * x2 + GRAD3[gi2][1] * y2);
    }

    // Scale to [-1, 1]
    return 70 * (n0 + n1 + n2);
  }

  sample3D(x: number, y: number, z: number): number {
    const { F3, G3, GRAD3 } = SimplexNoiseSource;
    const perm = this.perm;
    const permMod12 = this.permMod12;

    // Skew input space
    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);

    const t = (i + j + k) * G3;
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    const x0 = x - X0;
    const y0 = y - Y0;
    const z0 = z - Z0;

    // Determine simplex
    let i1: number, j1: number, k1: number;
    let i2: number, j2: number, k2: number;
    if (x0 >= y0) {
      if (y0 >= z0)      { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
      else if (x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
      else               { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
    } else {
      if (y0 < z0)       { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
      else if (x0 < z0)  { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
      else               { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    let n0 = 0, n1 = 0, n2 = 0, n3 = 0;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 >= 0) {
      const gi0 = permMod12[ii + perm[jj + perm[kk]]];
      t0 *= t0;
      n0 = t0 * t0 * (GRAD3[gi0][0] * x0 + GRAD3[gi0][1] * y0 + GRAD3[gi0][2] * z0);
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 >= 0) {
      const gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]];
      t1 *= t1;
      n1 = t1 * t1 * (GRAD3[gi1][0] * x1 + GRAD3[gi1][1] * y1 + GRAD3[gi1][2] * z1);
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 >= 0) {
      const gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]];
      t2 *= t2;
      n2 = t2 * t2 * (GRAD3[gi2][0] * x2 + GRAD3[gi2][1] * y2 + GRAD3[gi2][2] * z2);
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 >= 0) {
      const gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]];
      t3 *= t3;
      n3 = t3 * t3 * (GRAD3[gi3][0] * x3 + GRAD3[gi3][1] * y3 + GRAD3[gi3][2] * z3);
    }

    return 32 * (n0 + n1 + n2 + n3);
  }
}

// ---------------------------------------------------------------------------
// OpenSimplex 2S Noise Source  (Kdotani's OpenSimplex2S algorithm)
// ---------------------------------------------------------------------------

/**
 * OpenSimplex2S (Super-simplex) noise — 2D and 3D.
 *
 * This is the same algorithm used by FastNoiseLite's OpenSimplex2S mode,
 * which the original infinigen uses for many terrain layers.
 *
 * Key properties:
 *   - Oriented-square lattice for 2D (rotated 45° from axis-aligned)
 *   - Better isotropy than classic Perlin / Simplex
 *   - Returns values in approximately [-1, 1]
 */
export class OpenSimplexNoiseSource implements NoiseSource {
  private perm: Uint8Array;
  private perm2D: Uint8Array;

  /** Gradients for 2D (length 16, pairs) */
  private static readonly GRADIENTS_2D: Float64Array = new Float64Array([
     5,  2,    2,  5,   -5,  2,   -2,  5,
     5, -2,    2, -5,   -5, -2,   -2, -5,
  ]);

  /** Gradients for 3D (length 48, triples) */
  private static readonly GRADIENTS_3D: Float64Array = new Float64Array([
    -11,  4,  4,   -4,  11,  4,   -4,  4,  11,
     11,  4,  4,    4,  11,  4,    4,  4,  11,
    -11, -4,  4,   -4, -11,  4,   -4, -4,  11,
     11, -4,  4,    4, -11,  4,    4, -4,  11,
    -11,  4, -4,   -4,  11, -4,   -4,  4, -11,
     11,  4, -4,    4,  11, -4,    4,  4, -11,
    -11, -4, -4,   -4, -11, -4,   -4, -4, -11,
     11, -4, -4,    4, -11, -4,    4, -4, -11,
  ]);

  private static readonly STRETCH_2D = -0.211324865405187;   // (1/sqrt(2+1)-1)/2
  private static readonly SQUISH_2D  =  0.366025403784439;   // (sqrt(2+1)-1)/2
  private static readonly STRETCH_3D = -1 / 6;               // (1/sqrt(3+1)-1)/3
  private static readonly SQUISH_3D  =  1 / 3;               // (sqrt(3+1)-1)/3
  private static readonly NORM_2D = 1 / 47;                  // normalization factor
  private static readonly NORM_3D = 1 / 103;

  constructor(seed: number = 42) {
    this.perm = buildPermutationTable(seed);
    // Pre-compute 2D lookup (maps permutation index → gradient pair index)
    this.perm2D = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm2D[i] = (this.perm[i] % 16) * 2;
    }
  }

  sample(x: number, y: number, z: number = 0): number {
    return this.sample3D(x, y, z);
  }

  sample2D(x: number, y: number): number {
    const { STRETCH_2D, SQUISH_2D, NORM_2D, GRADIENTS_2D } = OpenSimplexNoiseSource;
    const perm = this.perm;
    const perm2D = this.perm2D;

    // Place input onto lattice
    const xs = x + (x + y) * STRETCH_2D;
    const ys = y + (x + y) * STRETCH_2D;

    const xsb = Math.floor(xs);
    const ysb = Math.floor(ys);
    const xsi = xs - xsb;
    const ysi = ys - ysb;

    // Determine which of the four lattice points to contribute
    // (standard 4-point contribution pattern for 2D OpenSimplex2S)
    const p0 = xsi + ysi;
    const p1 = xsi;
    const p2 = ysi;
    const p3 = xsi + ysi - 1;

    // Scale back to input space
    const x0 = xsb + (xsb + ysb) * SQUISH_2D;
    const y0 = ysb + (xsb + ysb) * SQUISH_2D;
    const dx0 = x - x0;
    const dy0 = y - y0;

    // Index base
    const xsbi = xsb & 255;
    const ysbi = ysb & 255;

    let value = 0;

    // --- Contribution 0: (0,0) base lattice point ---
    const d0 = 2 - dx0 * dx0 - dy0 * dy0;
    if (d0 > 0) {
      const gi = perm2D[(xsbi + perm[ysbi]) & 511];
      value += d0 * d0 * d0 * d0 * (GRADIENTS_2D[gi] * dx0 + GRADIENTS_2D[gi + 1] * dy0);
    }

    // --- Contribution 1 & 2: the two closest off-diagonal points ---
    // Point A: (1,0) in skewed space
    const dx1 = dx0 - 1 - SQUISH_2D;
    const dy1 = dy0 - 0 - SQUISH_2D;
    const d1 = 2 - dx1 * dx1 - dy1 * dy1;
    if (d1 > 0) {
      const gi = perm2D[(xsbi + 1 + perm[ysbi]) & 511];
      value += d1 * d1 * d1 * d1 * (GRADIENTS_2D[gi] * dx1 + GRADIENTS_2D[gi + 1] * dy1);
    }

    // Point B: (0,1) in skewed space
    const dx2 = dx0 - 0 - SQUISH_2D;
    const dy2 = dy0 - 1 - SQUISH_2D;
    const d2 = 2 - dx2 * dx2 - dy2 * dy2;
    if (d2 > 0) {
      const gi = perm2D[(xsbi + perm[ysbi + 1]) & 511];
      value += d2 * d2 * d2 * d2 * (GRADIENTS_2D[gi] * dx2 + GRADIENTS_2D[gi + 1] * dy2);
    }

    // --- Contribution 3: (1,1) diagonal ---
    const dx3 = dx0 - 1 - 2 * SQUISH_2D;
    const dy3 = dy0 - 1 - 2 * SQUISH_2D;
    const d3 = 2 - dx3 * dx3 - dy3 * dy3;
    if (d3 > 0) {
      const gi = perm2D[(xsbi + 1 + perm[ysbi + 1]) & 511];
      value += d3 * d3 * d3 * d3 * (GRADIENTS_2D[gi] * dx3 + GRADIENTS_2D[gi + 1] * dy3);
    }

    return value * NORM_2D;
  }

  sample3D(x: number, y: number, z: number): number {
    const { STRETCH_3D, SQUISH_3D, NORM_3D, GRADIENTS_3D } = OpenSimplexNoiseSource;
    const perm = this.perm;

    // Place input onto lattice
    const xs = x + (x + y + z) * STRETCH_3D;
    const ys = y + (x + y + z) * STRETCH_3D;
    const zs = z + (x + y + z) * STRETCH_3D;

    const xsb = Math.floor(xs);
    const ysb = Math.floor(ys);
    const zsb = Math.floor(zs);

    const xsi = xs - xsb;
    const ysi = ys - ysb;
    const zsi = zs - zsb;

    // Scale back to input space
    const x0 = xsb + (xsb + ysb + zsb) * SQUISH_3D;
    const y0 = ysb + (xsb + ysb + zsb) * SQUISH_3D;
    const z0 = zsb + (xsb + ysb + zsb) * SQUISH_3D;
    const dx0 = x - x0;
    const dy0 = y - y0;
    const dz0 = z - z0;

    const xsbi = xsb & 255;
    const ysbi = ysb & 255;
    const zsbi = zsb & 255;

    let value = 0;

    // The 7-point contribution set for 3D OpenSimplex2S:
    // Base point (0,0,0), 3 face-adjacent, 3 edge-adjacent
    // We use the standard lattice point contributions.

    // Helper: compute contribution at a lattice offset (ox, oy, oz) in skewed space
    const contribute = (ox: number, oy: number, oz: number): void => {
      const dx = dx0 - ox - SQUISH_3D * (ox + oy + oz);
      const dy = dy0 - oy - SQUISH_3D * (ox + oy + oz);
      const dz = dz0 - oz - SQUISH_3D * (ox + oy + oz);
      const d = 2.5 - dx * dx - dy * dy - dz * dz;
      if (d > 0) {
        const gi = (perm[(xsbi + ox + perm[(ysbi + oy + perm[(zsbi + oz) & 255]) & 255]) & 255] % 16) * 3;
        value += d * d * d * d * (GRADIENTS_3D[gi] * dx + GRADIENTS_3D[gi + 1] * dy + GRADIENTS_3D[gi + 2] * dz);
      }
    };

    // Primary tetrahedron contribution set (ordered by proximity)
    // Base point
    contribute(0, 0, 0);
    // Reachability depends on xsi, ysi, zsi ordering
    // We test all 7 lattice neighbors:
    contribute(1, 0, 0);
    contribute(0, 1, 0);
    contribute(0, 0, 1);
    contribute(1, 1, 0);
    contribute(1, 0, 1);
    contribute(0, 1, 1);
    // Diagonal (1,1,1)
    contribute(1, 1, 1);

    return value * NORM_3D;
  }
}

// ---------------------------------------------------------------------------
// Heightfield sampling functions (FBM variants)
// ---------------------------------------------------------------------------

/**
 * Standard fractal Brownian motion (fBm).
 * Returns values in approximately [-1, 1].
 */
export function sampleHeightField(
  source: NoiseSource,
  x: number,
  y: number,
  octaves: number = 6,
  persistence: number = 0.5,
  lacunarity: number = 2.0,
  scale: number = 1.0,
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = scale;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += source.sample2D(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

/**
 * Ridged multifractal — creates sharp ridges and valleys.
 *
 * The ridging formula is:  |noise| * -2 + 1  which inverts valleys to ridges.
 * Each octave also modulates the amplitude of the next, producing a more
 * natural ridge-and-valley pattern typical of mountainous terrain.
 *
 * Returns values in approximately [0, 1].
 */
export function sampleHeightFieldRidged(
  source: NoiseSource,
  x: number,
  y: number,
  octaves: number = 6,
  persistence: number = 0.5,
  lacunarity: number = 2.0,
  scale: number = 1.0,
  offset: number = 1.0,
  gain: number = 2.0,
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = scale;
  let weight = 1;

  for (let i = 0; i < octaves; i++) {
    let signal = source.sample2D(x * frequency, y * frequency);

    // Apply ridging: absolute value creates sharp transitions at zero-crossings
    signal = Math.abs(signal);
    // Invert: ridge peaks at zero-crossings of original noise
    signal = offset - signal;

    // Weight the signal by the previous octave's weight (ridged feedback)
    signal *= weight;
    weight = Math.min(1, Math.max(0, signal * gain));

    value += signal * amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  // Normalize (theoretical max is offset * sum of amplitudes)
  let maxVal = 0;
  let amp = 1;
  for (let i = 0; i < octaves; i++) {
    maxVal += offset * amp;
    amp *= persistence;
  }

  return value / maxVal;
}

/**
 * Terrace / strata noise — quantized FBM that produces stepped terrain.
 *
 * The continuous FBM output is quantized into `terraceCount` discrete levels,
 * creating plateau-and-step structures. The `smoothing` parameter controls
 * how sharp the transitions are between terraces (0 = hard steps, 1 = smooth).
 *
 * Returns values in approximately [-1, 1].
 */
export function sampleHeightFieldTerrace(
  source: NoiseSource,
  x: number,
  y: number,
  octaves: number = 6,
  persistence: number = 0.5,
  lacunarity: number = 2.0,
  scale: number = 1.0,
  terraceCount: number = 8,
  smoothing: number = 0.15,
): number {
  // Get base FBM value in [-1, 1]
  const fbm = sampleHeightField(source, x, y, octaves, persistence, lacunarity, scale);

  // Map to [0, 1] for terracing
  const normalized = (fbm + 1) * 0.5;

  // Quantize into terrace levels
  const terraceWidth = 1 / terraceCount;
  const terraceIndex = Math.floor(normalized / terraceWidth);
  const terraceFraction = (normalized - terraceIndex * terraceWidth) / terraceWidth;

  // Smooth transition between terraces
  let smoothed: number;
  if (terraceFraction < smoothing && smoothing > 0) {
    // Smooth transition zone at the start of each terrace
    const t = terraceFraction / smoothing;
    const smoothT = t * t * (3 - 2 * t); // smoothstep
    smoothed = (terraceIndex + smoothT) * terraceWidth;
  } else {
    smoothed = (terraceIndex + 1) * terraceWidth;
  }

  // Map back to [-1, 1]
  return smoothed * 2 - 1;
}
