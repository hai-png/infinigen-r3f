/**
 * Procedural Noise Generation System
 * 
 * Implements various noise algorithms for procedural texture generation.
 * Supports Perlin noise, Simplex noise, Voronoi noise, and value noise.
 * 
 * Features:
 * - 2D and 3D noise generation
 * - Fractal Brownian Motion (FBM)
 * - Domain warping
 * - Cellular/Voronoi patterns
 * - Gradient noise
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface NoiseOptions {
  /** Number of octaves for FBM */
  octaves?: number;
  
  /** Persistence (amplitude decrease per octave) */
  persistence?: number;
  
  /** Lacunarity (frequency increase per octave) */
  lacunarity?: number;
  
  /** Seed for randomization */
  seed?: number;
  
  /** Normalization range */
  normalize?: boolean;
}

export interface VoronoiOptions {
  /** Number of points per cell */
  pointsPerCell?: number;
  
  /** Distance metric */
  distanceMetric?: 'euclidean' | 'manhattan' | 'chebyshev';
  
  /** Enable jittering */
  jitter?: number;
}

export type NoiseType = 'perlin' | 'simplex' | 'value' | 'voronoi' | 'fbm';

// ============================================================================
// Permutation Table
// ============================================================================

class PermutationTable {
  private table: Uint8Array;
  
  constructor(seed: number = Math.random() * 10000) {
    this.table = new Uint8Array(512);
    const perm = new Uint8Array(256);
    
    // Initialize with identity
    for (let i = 0; i < 256; i++) {
      perm[i] = i;
    }
    
    // Shuffle based on seed
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807) % 2147483647;
      const j = s % (i + 1);
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    
    // Duplicate for overflow handling
    for (let i = 0; i < 256; i++) {
      this.table[i] = perm[i];
      this.table[i + 256] = perm[i];
    }
  }
  
  get(i: number): number {
    return this.table[i & 255];
  }
}

// ============================================================================
// Gradient Vectors
// ============================================================================

const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
];

const GRAD4 = [
  [0, 1, 1, 1], [0, 1, 1, -1], [0, 1, -1, 1], [0, 1, -1, -1],
  [0, -1, 1, 1], [0, -1, 1, -1], [0, -1, -1, 1], [0, -1, -1, -1],
  [1, 0, 1, 1], [1, 0, 1, -1], [1, 0, -1, 1], [1, 0, -1, -1],
  [-1, 0, 1, 1], [-1, 0, 1, -1], [-1, 0, -1, 1], [-1, 0, -1, -1],
  [1, 1, 0, 1], [1, 1, 0, -1], [1, -1, 0, 1], [1, -1, 0, -1],
  [-1, 1, 0, 1], [-1, 1, 0, -1], [-1, -1, 0, 1], [-1, -1, 0, -1],
  [1, 1, 1, 0], [1, 1, -1, 0], [1, -1, 1, 0], [1, -1, -1, 0],
  [-1, 1, 1, 0], [-1, 1, -1, 0], [-1, -1, 1, 0], [-1, -1, -1, 0]
];

// ============================================================================
// Utility Functions
// ============================================================================

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function grad(hash: number, x: number, y: number, z?: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z ?? 0;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function dot(g: number[], x: number, y: number, z?: number, w?: number): number {
  let result = g[0] * x + g[1] * y;
  if (z !== undefined) result += g[2] * z;
  if (w !== undefined) result += g[3] * w;
  return result;
}

// ============================================================================
// Perlin Noise (2D)
// ============================================================================

export class PerlinNoise2D {
  private perm: PermutationTable;
  
  constructor(seed?: number) {
    this.perm = new PermutationTable(seed);
  }
  
  noise(x: number, y: number): number {
    // Grid cell coordinates
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    
    // Relative position in cell
    x -= Math.floor(x);
    y -= Math.floor(y);
    
    // Fade curves
    const u = fade(x);
    const v = fade(y);
    
    // Hash corners
    const A = this.perm.get(X) + Y;
    const B = this.perm.get(X + 1) + Y;
    
    const AA = this.perm.get(A);
    const AB = this.perm.get(A + 1);
    const BA = this.perm.get(B);
    const BB = this.perm.get(B + 1);
    
    // Gradient contributions
    const g1 = grad(AA, x, y);
    const g2 = grad(AB, x - 1, y);
    const g3 = grad(BA, x, y - 1);
    const g4 = grad(BB, x - 1, y - 1);
    
    // Interpolate
    const lx1 = lerp(g1, g2, u);
    const lx2 = lerp(g3, g4, u);
    
    return lerp(lx1, lx2, v);
  }
  
  fbm(x: number, y: number, options?: NoiseOptions): number {
    const {
      octaves = 6,
      persistence = 0.5,
      lacunarity = 2.0,
      normalize = true
    } = options ?? {};
    
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;
    
    for (let i = 0; i < octaves; i++) {
      total += this.noise(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    
    if (normalize) {
      total /= maxValue;
    }
    
    return total;
  }
}

// ============================================================================
// Perlin Noise (3D)
// ============================================================================

export class PerlinNoise3D {
  private perm: PermutationTable;
  
  constructor(seed?: number) {
    this.perm = new PermutationTable(seed);
  }
  
  noise(x: number, y: number, z: number): number {
    // Grid cell coordinates
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    
    // Relative position in cell
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    
    // Fade curves
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);
    
    // Hash corners
    const A = this.perm.get(X) + Y;
    const AA = this.perm.get(A) + Z;
    const AB = this.perm.get(A + 1) + Z;
    const B = this.perm.get(X + 1) + Y;
    const BA = this.perm.get(B) + Z;
    const BB = this.perm.get(B + 1) + Z;
    
    // Gradient contributions
    const g1 = grad(this.perm.get(AA), x, y, z);
    const g2 = grad(this.perm.get(AB), x - 1, y, z);
    const g3 = grad(this.perm.get(BA), x, y - 1, z);
    const g4 = grad(this.perm.get(BB), x - 1, y - 1, z);
    const g5 = grad(this.perm.get(AA + 1), x, y, z - 1);
    const g6 = grad(this.perm.get(AB + 1), x - 1, y, z - 1);
    const g7 = grad(this.perm.get(BA + 1), x, y - 1, z - 1);
    const g8 = grad(this.perm.get(BB + 1), x - 1, y - 1, z - 1);
    
    // Interpolate
    const lx1 = lerp(g1, g2, u);
    const lx2 = lerp(g3, g4, u);
    const lx3 = lerp(g5, g6, u);
    const lx4 = lerp(g7, g8, u);
    
    const ly1 = lerp(lx1, lx2, v);
    const ly2 = lerp(lx3, lx4, v);
    
    return lerp(ly1, ly2, w);
  }
  
  fbm(x: number, y: number, z: number, options?: NoiseOptions): number {
    const {
      octaves = 6,
      persistence = 0.5,
      lacunarity = 2.0,
      normalize = true
    } = options ?? {};
    
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;
    
    for (let i = 0; i < octaves; i++) {
      total += this.noise(x * frequency, y * frequency, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    
    if (normalize) {
      total /= maxValue;
    }
    
    return total;
  }
}

// ============================================================================
// Simplex Noise (2D)
// ============================================================================

export class SimplexNoise2D {
  private perm: PermutationTable;
  private readonly F2 = 0.5 * (Math.sqrt(3) - 1);
  private readonly G2 = (3 - Math.sqrt(3)) / 6;
  
  constructor(seed?: number) {
    this.perm = new PermutationTable(seed);
  }
  
  noise(x: number, y: number): number {
    // Skew input space to determine simplex
    const s = (x + y) * this.F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    
    const t = (i + j) * this.G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;
    
    // Determine which simplex we're in
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    
    // Offsets for corners
    const x1 = x0 - i1 + this.G2;
    const y1 = y0 - j1 + this.G2;
    const x2 = x0 - 1 + 2 * this.G2;
    const y2 = y0 - 1 + 2 * this.G2;
    
    // Hash coordinates
    const ii = i & 255;
    const jj = j & 255;
    const gi0 = this.perm.get(ii + this.perm.get(jj)) % 12;
    const gi1 = this.perm.get(ii + i1 + this.perm.get(jj + j1)) % 12;
    const gi2 = this.perm.get(ii + 1 + this.perm.get(jj + 1)) % 12;
    
    // Gradient contributions
    let n0 = 0, n1 = 0, n2 = 0;
    
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      n0 = t0 * t0 * grad(gi0, x0, y0);
    }
    
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      n1 = t1 * t1 * grad(gi1, x1, y1);
    }
    
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      n2 = t2 * t2 * grad(gi2, x2, y2);
    }
    
    // Scale to [-1, 1]
    return 70 * (n0 + n1 + n2);
  }
  
  fbm(x: number, y: number, options?: NoiseOptions): number {
    const {
      octaves = 6,
      persistence = 0.5,
      lacunarity = 2.0,
      normalize = true
    } = options ?? {};
    
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;
    
    for (let i = 0; i < octaves; i++) {
      total += this.noise(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    
    if (normalize) {
      total /= maxValue;
    }
    
    return total;
  }
}

// ============================================================================
// Voronoi/Cellular Noise
// ============================================================================

export class VoronoiNoise {
  private perm: PermutationTable;
  private options: VoronoiOptions;
  
  constructor(seed?: number, options?: VoronoiOptions) {
    this.perm = new PermutationTable(seed);
    this.options = {
      pointsPerCell: 1,
      distanceMetric: 'euclidean',
      jitter: 0.5,
      ...options
    };
  }
  
  private distance(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x1 - x2;
    const dy = y1 - y2;
    
    switch (this.options.distanceMetric) {
      case 'manhattan':
        return Math.abs(dx) + Math.abs(dy);
      case 'chebyshev':
        return Math.max(Math.abs(dx), Math.abs(dy));
      case 'euclidean':
      default:
        return Math.sqrt(dx * dx + dy * dy);
    }
  }
  
  noise(x: number, y: number): { f1: number; f2: number; id1: number; id2: number } {
    const cellX = Math.floor(x);
    const cellY = Math.floor(y);
    const localX = x - cellX;
    const localY = y - cellY;
    
    let f1 = Infinity;
    let f2 = Infinity;
    let id1 = -1;
    let id2 = -1;
    
    // Check neighboring cells
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const neighborX = cellX + dx;
        const neighborY = cellY + dy;
        
        // Hash to get point ID
        const hash = this.perm.get(neighborX & 255) ^ this.perm.get(neighborY & 255);
        const pointId = hash % 1000;
        
        // Generate point position within cell
        const jitterX = ((hash & 255) / 255 - 0.5) * 2 * this.options.jitter!;
        const jitterY = (((hash >> 8) & 255) / 255 - 0.5) * 2 * this.options.jitter!;
        const pointX = dx + jitterX;
        const pointY = dy + jitterY;
        
        const dist = this.distance(localX, localY, pointX, pointY);
        
        if (dist < f1) {
          f2 = f1;
          id2 = id1;
          f1 = dist;
          id1 = pointId;
        } else if (dist < f2) {
          f2 = dist;
          id2 = pointId;
        }
      }
    }
    
    return { f1, f2, id1, id2 };
  }
  
  /** Get only the first feature distance */
  feature(x: number, y: number): number {
    return this.noise(x, y).f1;
  }
  
  /** Get the distance difference (creates ridges) */
  ridge(x: number, y: number): number {
    const { f1, f2 } = this.noise(x, y);
    return f2 - f1;
  }
}

// ============================================================================
// Value Noise
// ============================================================================

export class ValueNoise2D {
  private perm: PermutationTable;
  
  constructor(seed?: number) {
    this.perm = new PermutationTable(seed);
  }
  
  noise(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    
    x -= Math.floor(x);
    y -= Math.floor(y);
    
    const u = x * x * (3 - 2 * x);
    const v = y * y * (3 - 2 * y);
    
    const A = this.perm.get(X) + Y;
    const B = this.perm.get(X + 1) + Y;
    
    const values = [
      (this.perm.get(A) & 255) / 255,
      (this.perm.get(A + 1) & 255) / 255,
      (this.perm.get(B) & 255) / 255,
      (this.perm.get(B + 1) & 255) / 255
    ];
    
    return lerp(
      lerp(values[0], values[1], u),
      lerp(values[2], values[3], u),
      v
    );
  }
  
  fbm(x: number, y: number, options?: NoiseOptions): number {
    const {
      octaves = 6,
      persistence = 0.5,
      lacunarity = 2.0,
      normalize = true
    } = options ?? {};
    
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;
    
    for (let i = 0; i < octaves; i++) {
      total += this.noise(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    
    if (normalize) {
      total /= maxValue;
    }
    
    return total;
  }
}

// ============================================================================
// Domain Warping
// ============================================================================

export class DomainWarper {
  private noise1: SimplexNoise2D;
  private noise2: SimplexNoise2D;
  
  constructor(seed?: number) {
    this.noise1 = new SimplexNoise2D(seed);
    this.noise2 = new SimplexNoise2D(seed ? seed + 1000 : undefined);
  }
  
  warp(x: number, y: number, strength: number = 1.0): [number, number] {
    const dx = this.noise1.fbm(x, y, { octaves: 3 }) * strength;
    const dy = this.noise2.fbm(x, y, { octaves: 3 }) * strength;
    
    return [x + dx, y + dy];
  }
  
  warpedFBM(x: number, y: number, strength: number = 1.0): number {
    const [wx, wy] = this.warp(x, y, strength);
    return this.noise1.fbm(wx, wy);
  }
}

// ============================================================================
// Unified Noise Interface
// ============================================================================

export class NoiseGenerator {
  private perlin2D: PerlinNoise2D;
  private perlin3D: PerlinNoise3D;
  private simplex2D: SimplexNoise2D;
  private voronoi: VoronoiNoise;
  private value2D: ValueNoise2D;
  private warper: DomainWarper;
  
  constructor(seed?: number) {
    this.perlin2D = new PerlinNoise2D(seed);
    this.perlin3D = new PerlinNoise3D(seed);
    this.simplex2D = new SimplexNoise2D(seed);
    this.voronoi = new VoronoiNoise(seed);
    this.value2D = new ValueNoise2D(seed);
    this.warper = new DomainWarper(seed);
  }
  
  generate(
    type: NoiseType,
    x: number,
    y: number,
    z?: number,
    options?: NoiseOptions
  ): number {
    switch (type) {
      case 'perlin':
        return z !== undefined
          ? this.perlin3D.fbm(x, y, z, options)
          : this.perlin2D.fbm(x, y, options);
      
      case 'simplex':
        return this.simplex2D.fbm(x, y, options);
      
      case 'value':
        return this.value2D.fbm(x, y, options);
      
      case 'voronoi':
        return this.voronoi.feature(x, y);
      
      case 'fbm':
        return this.perlin2D.fbm(x, y, options);
      
      default:
        return this.simplex2D.fbm(x, y, options);
    }
  }
  
  // Convenience methods
  perlin(x: number, y: number, z?: number, options?: NoiseOptions): number {
    return this.generate('perlin', x, y, z, options);
  }
  
  simplex(x: number, y: number, options?: NoiseOptions): number {
    return this.generate('simplex', x, y, undefined, options);
  }
  
  voronoi(x: number, y: number): number {
    return this.voronoi.feature(x, y);
  }
  
  ridge(x: number, y: number): number {
    return this.voronoi.ridge(x, y);
  }
  
  warp(x: number, y: number, strength?: number): [number, number] {
    return this.warper.warp(x, y, strength);
  }
  
  warpedNoise(x: number, y: number, strength?: number): number {
    return this.warper.warpedFBM(x, y, strength);
  }
}

// ============================================================================
// Pre-configured Noise Presets
// ============================================================================

export const NoisePresets = {
  clouds: (seed?: number) => new NoiseGenerator(seed),
  terrain: (seed?: number) => new NoiseGenerator(seed),
  marble: (seed?: number) => new DomainWarper(seed),
  wood: (seed?: number) => ({
    generator: new NoiseGenerator(seed),
    grain: (x: number, y: number) => {
      const gen = new NoiseGenerator(seed);
      return gen.simplex(x * 10, y * 0.5, { octaves: 4 });
    }
  }),
  stone: (seed?: number) => ({
    generator: new NoiseGenerator(seed),
    surface: (x: number, y: number) => {
      const gen = new NoiseGenerator(seed);
      return gen.ridge(x * 5, y * 5);
    }
  })
};

export default NoiseGenerator;
