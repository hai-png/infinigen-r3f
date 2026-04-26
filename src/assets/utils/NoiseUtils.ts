/**
 * Noise Utilities Module
 * Provides Perlin noise and related utility functions for procedural generation
 */

export class NoiseUtils {
  private permutationTable: number[];
  private seed: number = 12345;

  constructor(seed?: number) {
    this.seed = seed ?? 12345;
    this.permutationTable = this.initPermutationTable(this.seed);
  }

  /**
   * Set seed for reproducible noise generation
   * @param seed - Seed value for permutation table
   */
  public setSeed(seed: number): void {
    this.seed = seed;
    this.permutationTable = this.initPermutationTable(seed);
  }

  /**
   * Generate 2D Perlin noise value at given coordinates
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns Noise value in range [-1, 1]
   */
  public perlin2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    
    x -= Math.floor(x);
    y -= Math.floor(y);
    
    const u = this.fade(x);
    const v = this.fade(y);
    
    const A = (X + Y) % 256;
    const B = (X + Y + 1) % 256;
    
    return this.lerp(
      v,
      this.lerp(u, this.grad(A, x, y), this.grad(B, x, y - 1)),
      this.lerp(u, this.grad(A + 1, x - 1, y), this.grad(B + 1, x - 1, y - 1))
    );
  }

  /**
   * Generate multi-octave noise for more natural patterns
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param octaves - Number of noise layers
   * @param persistence - Amplitude decrease per octave (0-1)
   * @param lacunarity - Frequency increase per octave
   * @returns Combined noise value
   */
  public octaveNoise(
    x: number,
    y: number,
    octaves: number = 4,
    persistence: number = 0.5,
    lacunarity: number = 2.0
  ): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.perlin2D(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return total / maxValue;
  }

  /**
   * Fade function for smooth interpolation (Perlin's 6t^5 - 15t^4 + 10t^3)
   */
  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  /**
   * Linear interpolation between two values
   */
  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  /**
   * Gradient function for noise calculation
   */
  private grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  /**
   * Initialize permutation table for noise generation
   * @param seed - Seed value for shuffling
   */
  private initPermutationTable(seed: number): number[] {
    const perm = new Array(256);
    
    // Initialize with identity
    for (let i = 0; i < 256; i++) {
      perm[i] = i;
    }
    
    // Seeded shuffle using simple LCG
    let random = seed;
    const lcg = () => {
      random = (random * 1664525 + 1013904223) % 4294967296;
      return random / 4294967296;
    };
    
    // Shuffle using Fisher-Yates algorithm with seeded random
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(lcg() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    
    // Create doubled permutation table for overflow handling
    const table = new Array(512);
    for (let i = 0; i < 512; i++) {
      table[i] = perm[i & 255];
    }
    
    return table;
  }

  /**
   * Generate random value seeded by coordinates
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns Random value in range [0, 1]
   */
  public seededRandom(x: number, y: number): number {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }

  /**
   * Clamp value between min and max
   */
  public clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Remap value from one range to another
   */
  public remap(
    value: number,
    inMin: number,
    inMax: number,
    outMin: number,
    outMax: number
  ): number {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
  }

  /**
   * Static method to generate 2D Perlin noise without instantiation
   */
  public static perlin2D(x: number, y: number): number {
    return globalNoiseInstance.perlin2D(x, y);
  }
}

// Static utility instance for convenience
const globalNoiseInstance = new NoiseUtils();

/**
 * Static method to generate 2D Perlin noise without instantiation
 */
export function perlin2D(x: number, y: number): number {
  return globalNoiseInstance.perlin2D(x, y);
}

/**
 * Static method to generate octave noise without instantiation
 */
export function octaveNoise(
  x: number,
  y: number,
  octaves?: number,
  persistence?: number,
  lacunarity?: number
): number {
  return globalNoiseInstance.octaveNoise(x, y, octaves, persistence, lacunarity);
}

/**
 * Static method to get seeded random value without instantiation
 */
export function seededRandom(x: number, y: number): number {
  return globalNoiseInstance.seededRandom(x, y);
}
