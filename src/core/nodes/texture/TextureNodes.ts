/**
 * Texture Nodes - Procedural texture generation nodes
 * Based on Blender texture nodes and infinigen asset generation
 * 
 * These nodes generate procedural textures for materials and shading
 */

import { NodeTypes } from '../core/node-types';
import type { BufferGeometry } from 'three';
import type { ColorLike } from '../color/ColorNodes';
import { SeededRandom } from '../../util/MathUtils';

// ============================================================================
// Type Definitions
// ============================================================================

export interface TextureNodeBase {
  type: NodeTypes;
  name: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
}

export interface TextureBrickInputs {
  vector?: [number, number, number];
  scale?: number;
  offset?: number;
  frequency?: number;
  brickWidth?: number;
  rowHeight?: number;
  mortarSize?: number;
  mortarSmooth?: number;
  offsetAmount?: number;
  offsetFrequency?: number;
}

export interface TextureBrickOutputs {
  color: ColorLike;
  float: number;
}

export interface TextureCheckerInputs {
  vector?: [number, number, number];
  scale?: number;
}

export interface TextureCheckerOutputs {
  color: ColorLike;
  float: number;
}

export interface TextureGradientInputs {
  vector?: [number, number, number];
  gradientType?: 'linear' | 'quadratic' | 'easing' | 'diagonal' | 'spherical' | 'radial';
  interpolation?: 'constant' | 'linear' | 'cubic' | 'smooth' | 'ease' | 'cardinal';
}

export interface TextureGradientOutputs {
  color: ColorLike;
  float: number;
}

export interface TextureNoiseInputs {
  vector?: [number, number, number];
  scale?: number;
  detail?: number;
  roughness?: number;
  distortion?: number;
  lacunarity?: number;
  offset?: number;
  gain?: number;
}

export interface TextureNoiseOutputs {
  color: ColorLike;
  float: number;
}

export interface TextureVoronoiInputs {
  vector?: [number, number, number];
  scale?: number;
  smoothness?: number;
  exponent?: number;
  intensity?: number;
  distanceMetric?: 'euclidean' | 'manhattan' | 'chebychev' | 'minkowski';
  featureMode?: 'distance' | 'distance_to_edge' | 'n_sphere_radius' | 'f1' | 'f2-f1' | 'smooth_f1' | 'user_int';
  seed?: number;
}

export interface TextureVoronoiOutputs {
  distance: number;
  position: [number, number, number];
  color: ColorLike;
}

export interface TextureWaveInputs {
  vector?: [number, number, number];
  xAmplitude?: number;
  yAmplitude?: number;
  xScale?: number;
  yScale?: number;
  velocity?: number;
  time?: number;
  waveType?: 'sine' | 'saw' | 'triangle' | 'square';
  bandPass?: boolean;
}

export interface TextureWaveOutputs {
  color: ColorLike;
  float: number;
}

export interface TextureWhiteNoiseInputs {
  seed?: number;
  id?: number;
}

export interface TextureWhiteNoiseOutputs {
  value: number;
  color: ColorLike;
}

export interface TextureMusgraveInputs {
  vector?: [number, number, number];
  scale?: number;
  detail?: number;
  dimension?: number;
  lacunarity?: number;
  offset?: number;
  gain?: number;
  musgraveType?: 'fbm' | 'multifractal' | 'ridged_multifractal' | 'hybrid_multifractal' | 'hetero_terrain';
}

export interface TextureMusgraveOutputs {
  float: number;
}

export interface TextureMagicInputs {
  vector?: [number, number, number];
  scale?: number;
  distort?: number;
  depth?: number;
}

export interface TextureMagicOutputs {
  color: ColorLike;
  float: number;
}

export interface TextureGaborInputs {
  vector?: [number, number, number];
  scale?: number;
  orientation?: number;
  anisotropy?: number;
  frequency?: number;
  phase?: number;
}

export interface TextureGaborOutputs {
  float: number;
}

// ============================================================================
// Node Implementations
// ============================================================================

/**
 * Texture Brick Node
 * Generates a brick pattern texture with customizable parameters
 */
export class TextureBrickNode implements TextureNodeBase {
  readonly type = NodeTypes.TextureBrick;
  readonly name = 'Texture Brick';
  
  inputs: TextureBrickInputs = {
    vector: [0, 0, 0],
    scale: 1.0,
    offset: 0.5,
    frequency: 1.0,
    brickWidth: 0.5,
    rowHeight: 0.25,
    mortarSize: 0.02,
    mortarSmooth: 0.5,
    offsetAmount: 0.5,
    offsetFrequency: 1.0,
  };
  
  outputs: TextureBrickOutputs = {
    color: { r: 0, g: 0, b: 0 },
    float: 0,
  };

  execute(): TextureBrickOutputs {
    const { vector = [0, 0, 0], scale = 1.0 } = this.inputs;
    const x = vector[0] * scale;
    const y = vector[1] * scale;
    
    const brickWidth = this.inputs.brickWidth || 0.5;
    const rowHeight = this.inputs.rowHeight || 0.25;
    const mortarSize = this.inputs.mortarSize || 0.02;
    
    // Calculate brick coordinates
    const brickX = Math.floor(x / brickWidth);
    const brickY = Math.floor(y / rowHeight);
    
    // Offset every other row
    const offset = (brickY % 2) * (this.inputs.offsetAmount || 0.5) * brickWidth;
    const adjustedX = x + offset;
    const adjustedBrickX = Math.floor(adjustedX / brickWidth);
    
    // Local position within brick
    const localX = ((adjustedX % brickWidth) + brickWidth) % brickWidth;
    const localY = ((y % rowHeight) + rowHeight) % rowHeight;
    
    // Check if in mortar
    const inMortarX = localX < mortarSize || localX > brickWidth - mortarSize;
    const inMortarY = localY < mortarSize || localY > rowHeight - mortarSize;
    
    const inMortar = inMortarX || inMortarY;
    const value = inMortar ? 0 : 1;
    
    this.outputs.float = value;
    this.outputs.color = { r: value, g: value, b: value };
    
    return this.outputs;
  }
}

/**
 * Texture Checker Node
 * Generates a checkerboard pattern
 */
export class TextureCheckerNode implements TextureNodeBase {
  readonly type = NodeTypes.TextureChecker;
  readonly name = 'Texture Checker';
  
  inputs: TextureCheckerInputs = {
    vector: [0, 0, 0],
    scale: 1.0,
  };
  
  outputs: TextureCheckerOutputs = {
    color: { r: 0, g: 0, b: 0 },
    float: 0,
  };

  execute(): TextureCheckerOutputs {
    const { vector = [0, 0, 0], scale = 1.0 } = this.inputs;
    const x = Math.floor(vector[0] * scale);
    const y = Math.floor(vector[1] * scale);
    const z = Math.floor(vector[2] * scale);
    
    const value = (x + y + z) % 2 === 0 ? 1 : 0;
    
    this.outputs.float = value;
    this.outputs.color = { r: value, g: value, b: value };
    
    return this.outputs;
  }
}

/**
 * Texture Gradient Node
 * Generates gradient patterns (linear, radial, spherical, etc.)
 */
export class TextureGradientNode implements TextureNodeBase {
  readonly type = NodeTypes.TextureGradient;
  readonly name = 'Texture Gradient';
  
  inputs: TextureGradientInputs = {
    vector: [0, 0, 0],
    gradientType: 'linear',
    interpolation: 'linear',
  };
  
  outputs: TextureGradientOutputs = {
    color: { r: 0, g: 0, b: 0 },
    float: 0,
  };

  execute(): TextureGradientOutputs {
    const { vector = [0, 0, 0], gradientType = 'linear' } = this.inputs;
    let value = 0;
    
    switch (gradientType) {
      case 'linear':
        value = Math.max(0, Math.min(1, vector[0]));
        break;
      case 'quadratic':
        value = vector[0] * vector[0];
        break;
      case 'diagonal':
        value = (vector[0] + vector[1]) / 2;
        break;
      case 'spherical':
        value = Math.sqrt(vector[0]**2 + vector[1]**2 + vector[2]**2);
        break;
      case 'radial':
        value = Math.sqrt(vector[0]**2 + vector[1]**2);
        break;
      default:
        value = vector[0];
    }
    
    // Apply interpolation
    value = this.applyInterpolation(value);
    value = Math.max(0, Math.min(1, value));
    
    this.outputs.float = value;
    this.outputs.color = { r: value, g: value, b: value };
    
    return this.outputs;
  }

  private applyInterpolation(value: number): number {
    const interpolation = this.inputs.interpolation || 'linear';
    
    switch (interpolation) {
      case 'smooth':
        return value * value * (3 - 2 * value);
      case 'ease':
        return 0.5 * Math.sin((value - 0.5) * Math.PI) + 0.5;
      case 'cubic':
        return value * value * value;
      default:
        return value;
    }
  }
}

/**
 * Texture Noise Node
 * Generates Perlin/Simplex noise patterns
 */
export class TextureNoiseNode implements TextureNodeBase {
  readonly type = NodeTypes.TextureNoise;
  readonly name = 'Texture Noise';
  
  inputs: TextureNoiseInputs = {
    vector: [0, 0, 0],
    scale: 1.0,
    detail: 2.0,
    roughness: 0.5,
    distortion: 0.0,
    lacunarity: 2.0,
    offset: 0.0,
    gain: 1.0,
  };
  
  outputs: TextureNoiseOutputs = {
    color: { r: 0, g: 0, b: 0 },
    float: 0,
  };

  execute(): TextureNoiseOutputs {
    const { vector = [0, 0, 0], scale = 1.0 } = this.inputs;
    const x = vector[0] * scale;
    const y = vector[1] * scale;
    const z = vector[2] * scale || 0;
    
    const value = this.perlinNoise(x, y, z);
    const normalizedValue = (value + 1) / 2; // Normalize to [0, 1]
    
    this.outputs.float = normalizedValue;
    this.outputs.color = { r: normalizedValue, g: normalizedValue, b: normalizedValue };
    
    return this.outputs;
  }

  private perlinNoise(x: number, y: number, z: number): number {
    // Simplified Perlin noise implementation
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    
    const u = this.fade(x);
    const v = this.fade(y);
    const w = this.fade(z);
    
    const A = this.p[X] + Y;
    const AA = this.p[A] + Z;
    const AB = this.p[A + 1] + Z;
    const B = this.p[X + 1] + Y;
    const BA = this.p[B] + Z;
    const BB = this.p[B + 1] + Z;
    
    return this.lerp(w,
      this.lerp(v,
        this.lerp(u, this.grad(this.p[AA], x, y, z), this.grad(this.p[BA], x - 1, y, z)),
        this.lerp(u, this.grad(this.p[AB], x, y - 1, z), this.grad(this.p[BB], x - 1, y - 1, z))
      ),
      this.lerp(v,
        this.lerp(u, this.grad(this.p[AA + 1], x, y, z - 1), this.grad(this.p[BA + 1], x - 1, y, z - 1)),
        this.lerp(u, this.grad(this.p[AB + 1], x, y - 1, z - 1), this.grad(this.p[BB + 1], x - 1, y - 1, z - 1))
      )
    );
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  private p: number[] = [];
  private rng: SeededRandom;
  
  constructor() {
    this.rng = new SeededRandom(42);
    // Initialize permutation table
    const perm = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = this.rng.nextInt(0, i);
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    this.p = [...perm, ...perm];
  }
}

/**
 * Texture Voronoi Node
 * Generates Voronoi/Worley noise patterns
 */
export class TextureVoronoiNode implements TextureNodeBase {
  readonly type = NodeTypes.TextureVoronoi;
  readonly name = 'Texture Voronoi';
  
  inputs: TextureVoronoiInputs = {
    vector: [0, 0, 0],
    scale: 1.0,
    smoothness: 0.0,
    exponent: 1.0,
    intensity: 1.0,
    distanceMetric: 'euclidean',
    featureMode: 'f1',
    seed: 0,
  };
  
  outputs: TextureVoronoiOutputs = {
    distance: 0,
    position: [0, 0, 0],
    color: { r: 0, g: 0, b: 0 },
  };

  execute(): TextureVoronoiOutputs {
    const { vector = [0, 0, 0], scale = 1.0 } = this.inputs;
    const x = vector[0] * scale;
    const y = vector[1] * scale;
    const z = vector[2] * scale || 0;
    
    const { distance, position } = this.voronoi(x, y, z);
    
    this.outputs.distance = distance;
    this.outputs.position = position;
    this.outputs.color = { r: distance, g: distance, b: distance };
    
    return this.outputs;
  }

  private voronoi(x: number, y: number, z: number): { distance: number; position: [number, number, number] } {
    const cellX = Math.floor(x);
    const cellY = Math.floor(y);
    const cellZ = Math.floor(z);
    
    let minDistance = Infinity;
    let closestPoint: [number, number, number] = [0, 0, 0];
    
    // Check neighboring cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const neighborX = cellX + dx;
          const neighborY = cellY + dy;
          const neighborZ = cellZ + dz;
          
          // Generate pseudo-random point in cell
          const rand = this.hash(neighborX, neighborY, neighborZ);
          const pointX = neighborX + rand[0];
          const pointY = neighborY + rand[1];
          const pointZ = neighborZ + rand[2];
          
          // Calculate distance
          const distX = x - pointX;
          const distY = y - pointY;
          const distZ = z - pointZ;
          const distance = Math.sqrt(distX**2 + distY**2 + distZ**2);
          
          if (distance < minDistance) {
            minDistance = distance;
            closestPoint = [pointX, pointY, pointZ];
          }
        }
      }
    }
    
    return { distance: minDistance, position: closestPoint };
  }

  private hash(x: number, y: number, z: number): [number, number, number] {
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 45.543) * 43758.5453;
    const f = n - Math.floor(n);
    return [f, (Math.sin(f * 1000) + 1) / 2, (Math.cos(f * 1000) + 1) / 2];
  }
}

/**
 * Texture Wave Node
 * Generates wave patterns (sine, saw, triangle, square)
 */
export class TextureWaveNode implements TextureNodeBase {
  readonly type = NodeTypes.TextureWave;
  readonly name = 'Texture Wave';
  
  inputs: TextureWaveInputs = {
    vector: [0, 0, 0],
    xAmplitude: 1.0,
    yAmplitude: 1.0,
    xScale: 1.0,
    yScale: 1.0,
    velocity: 0.0,
    time: 0.0,
    waveType: 'sine',
    bandPass: false,
  };
  
  outputs: TextureWaveOutputs = {
    color: { r: 0, g: 0, b: 0 },
    float: 0,
  };

  execute(): TextureWaveOutputs {
    const { vector = [0, 0, 0] } = this.inputs;
    const time = this.inputs.time || 0;
    const velocity = this.inputs.velocity || 0;
    
    const x = vector[0] * (this.inputs.xScale || 1) + time * velocity;
    const y = vector[1] * (this.inputs.yScale || 1) + time * velocity;
    
    const xAmp = this.inputs.xAmplitude || 1;
    const yAmp = this.inputs.yAmplitude || 1;
    
    const waveType = this.inputs.waveType || 'sine';
    let value = 0;
    
    switch (waveType) {
      case 'sine':
        value = Math.sin(x * Math.PI * 2) * xAmp + Math.sin(y * Math.PI * 2) * yAmp;
        break;
      case 'saw':
        value = ((x % 1) + 1) % 1 * xAmp + ((y % 1) + 1) % 1 * yAmp;
        break;
      case 'triangle':
        value = (2 * Math.abs(2 * ((x % 1) + 1) % 1 - 1) - 1) * xAmp +
                (2 * Math.abs(2 * ((y % 1) + 1) % 1 - 1) - 1) * yAmp;
        break;
      case 'square':
        value = (Math.sign(Math.sin(x * Math.PI * 2)) * xAmp +
                 Math.sign(Math.sin(y * Math.PI * 2)) * yAmp) / 2;
        break;
    }
    
    value = (value + 2) / 4; // Normalize to [0, 1]
    
    this.outputs.float = value;
    this.outputs.color = { r: value, g: value, b: value };
    
    return this.outputs;
  }
}

/**
 * Texture White Noise Node
 * Generates random white noise
 */
export class TextureWhiteNoiseNode implements TextureNodeBase {
  readonly type = NodeTypes.TextureWhiteNoise;
  readonly name = 'Texture White Noise';
  
  inputs: TextureWhiteNoiseInputs = {
    seed: 0,
    id: 0,
  };
  
  outputs: TextureWhiteNoiseOutputs = {
    value: 0,
    color: { r: 0, g: 0, b: 0 },
  };

  execute(): TextureWhiteNoiseOutputs {
    const seed = this.inputs.seed || 0;
    const id = this.inputs.id || 0;
    
    const value = this.hash(seed + id);
    
    this.outputs.value = value;
    this.outputs.color = { r: value, g: value, b: value };
    
    return this.outputs;
  }

  private hash(n: number): number {
    const x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }
}

/**
 * Texture Musgrave Node
 * Generates fractal noise patterns (FBM, multifractal, ridged, hybrid, hetero_terrain)
 * 
 * Implements proper multi-octave gradient noise (Perlin-based) with correct
 * fBm semantics matching Blender's Musgrave texture node.
 * 
 * The previous implementation used Math.sin(x)*Math.cos(y)*Math.sin(z) which
 * was NOT Perlin noise and produced completely incorrect results for any
 * material or terrain feature using Musgrave noise.
 * 
 * This implementation uses a proper gradient noise with fade function and
 * permutation table, matching the behavior of Blender's Musgrave texture.
 */
export class TextureMusgraveNode implements TextureNodeBase {
  readonly type = NodeTypes.TextureMusgrave;
  readonly name = 'Texture Musgrave';
  
  inputs: TextureMusgraveInputs = {
    vector: [0, 0, 0],
    scale: 1.0,
    detail: 2.0,
    dimension: 2.0,
    lacunarity: 2.0,
    offset: 0.0,
    gain: 1.0,
    musgraveType: 'fbm',
  };
  
  outputs: TextureMusgraveOutputs = {
    float: 0,
  };

  /** Permutation table for gradient noise (doubled for overflow-free indexing) */
  private perm: Uint8Array;

  constructor(seed: number = 42) {
    // Build permutation table with Fisher-Yates shuffle from seed
    const p = new Uint8Array(512);
    const base = new Uint8Array(256);
    for (let i = 0; i < 256; i++) base[i] = i;
    
    // Seeded PRNG (LCG)
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
    this.perm = p;
  }

  execute(): TextureMusgraveOutputs {
    const { vector = [0, 0, 0], scale = 1.0 } = this.inputs;
    const x = vector[0] * scale;
    const y = vector[1] * scale;
    const z = vector[2] * scale || 0;
    
    const detail = Math.min(Math.floor(this.inputs.detail || 2), 16);
    const lacunarity = this.inputs.lacunarity || 2;
    const dimension = this.inputs.dimension || 2;
    const offset = this.inputs.offset || 0;
    const gain = this.inputs.gain || 1;
    const musgraveType = this.inputs.musgraveType || 'fbm';

    // H = 1 - dimension/2 (Hurst exponent), controls roughness
    const H = 1 - dimension / 2;
    
    let value: number;

    switch (musgraveType) {
      case 'multifractal':
        value = this.multifractal(x, y, z, H, lacunarity, detail, offset);
        break;
      case 'ridged_multifractal':
        value = this.ridgedMultifractal(x, y, z, H, lacunarity, detail, offset, gain);
        break;
      case 'hybrid_multifractal':
        value = this.hybridMultifractal(x, y, z, H, lacunarity, detail, offset, gain);
        break;
      case 'hetero_terrain':
        value = this.heteroTerrain(x, y, z, H, lacunarity, detail, offset);
        break;
      case 'fbm':
      default:
        value = this.fbm(x, y, z, H, lacunarity, detail);
        break;
    }
    
    this.outputs.float = value;
    return this.outputs;
  }

  /**
   * fBm (Fractal Brownian Motion) - standard multi-octave Perlin noise
   * Amplitude decays as lacunarity^(-H*octave)
   */
  private fbm(x: number, y: number, z: number, H: number, lacunarity: number, octaves: number): number {
    let value = 0;
    let amplitude = 1; // lacunarity^0 = 1
    let frequency = 1;
    let totalAmplitude = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.gradientNoise(x * frequency, y * frequency, z * frequency);
      totalAmplitude += amplitude;
      amplitude *= Math.pow(lacunarity, -H);
      frequency *= lacunarity;
    }

    return value / totalAmplitude;
  }

  /**
   * Multifractal - multiplies successive octaves instead of adding
   * Produces more varied detail in areas of high base value
   */
  private multifractal(x: number, y: number, z: number, H: number, lacunarity: number, octaves: number, offset: number): number {
    let value = 1;
    let frequency = 1;

    for (let i = 0; i < octaves; i++) {
      value *= (offset + Math.pow(lacunarity, -H * i) * this.gradientNoise(x * frequency, y * frequency, z * frequency));
      frequency *= lacunarity;
    }

    return value - 1; // Shift so baseline is near 0
  }

  /**
   * Ridged Multifractal - uses absolute value and weight feedback
   * Creates sharp ridges and valleys, good for terrain features
   */
  private ridgedMultifractal(x: number, y: number, z: number, H: number, lacunarity: number, octaves: number, offset: number, gain: number): number {
    let value = 0;
    let frequency = 1;
    let weight = 1;
    let signal: number;

    for (let i = 0; i < octaves; i++) {
      signal = this.gradientNoise(x * frequency, y * frequency, z * frequency);
      
      // Take absolute value to create ridges
      signal = Math.abs(signal);
      // Invert and offset: ridge is at 0 (originally the zero-crossing)
      signal = offset - signal;
      // Square the signal to increase sharpness of ridges
      signal *= signal;
      // Weight contribution by previous signal (weight feedback)
      signal *= weight;
      weight = Math.min(Math.max(signal * gain, 0), 1);
      
      value += signal * Math.pow(lacunarity, -H * i);
      frequency *= lacunarity;
    }

    return value;
  }

  /**
   * Hybrid Multifractal - combines additive fBm with multiplicative weighting
   * First octave uses additive, subsequent use multiplicative correction
   */
  private hybridMultifractal(x: number, y: number, z: number, H: number, lacunarity: number, octaves: number, offset: number, gain: number): number {
    let value = 0;
    let frequency = 1;
    let weight = 1;
    let signal: number;

    for (let i = 0; i < octaves; i++) {
      signal = this.gradientNoise(x * frequency, y * frequency, z * frequency);
      
      if (i === 0) {
        // First octave: additive with offset
        value = (offset + signal) * Math.pow(lacunarity, -H * i);
        weight = signal;
      } else {
        // Subsequent: weight by previous signal
        weight = Math.min(Math.max((offset + signal) * weight, 0), 1);
        value += weight * signal * Math.pow(lacunarity, -H * i);
      }
      
      frequency *= lacunarity;
    }

    return value;
  }

  /**
   * Hetero Terrain - like fBm but offsets each octave
   * Produces terrain with heterogeneous features at different scales
   */
  private heteroTerrain(x: number, y: number, z: number, H: number, lacunarity: number, octaves: number, offset: number): number {
    let value = 0;
    let frequency = 1;
    let increment: number;

    // First octave
    value = offset + this.gradientNoise(x, y, z);
    value *= Math.pow(lacunarity, -H);
    frequency = lacunarity;

    for (let i = 1; i < octaves; i++) {
      increment = (offset + this.gradientNoise(x * frequency, y * frequency, z * frequency));
      increment *= Math.pow(lacunarity, -H * i);
      value += increment * value; // Multiplicative accumulation
      frequency *= lacunarity;
    }

    return value;
  }

  /**
   * Proper Perlin gradient noise implementation
   * Uses the fade function (6t^5 - 15t^4 + 10t^3) for smooth interpolation,
   * gradient dot products for directional noise, and a permutation table
   * for consistent pseudo-random hash lookups.
   */
  private gradientNoise(x: number, y: number, z: number): number {
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

  /** Quintic fade curve: 6t^5 - 15t^4 + 10t^3 (Ken Perlin's improved interpolation) */
  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  /** Linear interpolation */
  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  /** Gradient function: maps hash value to directional gradient dot product */
  private grad(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
}

/**
 * Texture Magic Node
 * Generates magical/swirly patterns
 */
export class TextureMagicNode implements TextureNodeBase {
  readonly type = NodeTypes.TextureMagic;
  readonly name = 'Texture Magic';
  
  inputs: TextureMagicInputs = {
    vector: [0, 0, 0],
    scale: 1.0,
    distort: 1.0,
    depth: 3,
  };
  
  outputs: TextureMagicOutputs = {
    color: { r: 0, g: 0, b: 0 },
    float: 0,
  };

  execute(): TextureMagicOutputs {
    const { vector = [0, 0, 0], scale = 1.0 } = this.inputs;
    const x = vector[0] * scale;
    const y = vector[1] * scale;
    const z = vector[2] * scale || 0;
    
    const distort = this.inputs.distort || 1;
    const depth = this.inputs.depth || 3;
    
    let value = 0;
    let px = x;
    let py = y;
    let pz = z;
    
    for (let i = 0; i < depth; i++) {
      value += Math.sin(px * Math.PI) * Math.sin(py * Math.PI) * Math.sin(pz * Math.PI);
      const nx = py + Math.sin(pz + value);
      const ny = pz + Math.sin(px + value);
      const nz = px + Math.sin(py + value);
      px = nx * distort;
      py = ny * distort;
      pz = nz * distort;
    }
    
    value = (value + 1) / 2; // Normalize to [0, 1]
    
    this.outputs.float = value;
    this.outputs.color = { r: value, g: value, b: value };
    
    return this.outputs;
  }
}

/**
 * Texture Gabor Node
 * Generates Gabor noise patterns (oriented noise)
 */
export class TextureGaborNode implements TextureNodeBase {
  readonly type = NodeTypes.TextureGabor;
  readonly name = 'Texture Gabor';
  
  inputs: TextureGaborInputs = {
    vector: [0, 0, 0],
    scale: 1.0,
    orientation: 0,
    anisotropy: 1.0,
    frequency: 1.0,
    phase: 0,
  };
  
  outputs: TextureGaborOutputs = {
    float: 0,
  };

  execute(): TextureGaborOutputs {
    const { vector = [0, 0, 0], scale = 1.0 } = this.inputs;
    const x = vector[0] * scale;
    const y = vector[1] * scale;
    
    const orientation = this.inputs.orientation || 0;
    const anisotropy = this.inputs.anisotropy || 1;
    const frequency = this.inputs.frequency || 1;
    const phase = this.inputs.phase || 0;
    
    // Rotate coordinates
    const cos = Math.cos(orientation);
    const sin = Math.sin(orientation);
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;
    
    // Gabor function
    const envelope = Math.exp(-(rx * rx + ry * ry * anisotropy) / 2);
    const carrier = Math.cos(rx * frequency * Math.PI * 2 + phase);
    
    const value = (envelope * carrier + 1) / 2; // Normalize to [0, 1]
    
    this.outputs.float = value;
    
    return this.outputs;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createTextureBrickNode(inputs?: Partial<TextureBrickInputs>): TextureBrickNode {
  const node = new TextureBrickNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createTextureCheckerNode(inputs?: Partial<TextureCheckerInputs>): TextureCheckerNode {
  const node = new TextureCheckerNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createTextureGradientNode(inputs?: Partial<TextureGradientInputs>): TextureGradientNode {
  const node = new TextureGradientNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createTextureNoiseNode(inputs?: Partial<TextureNoiseInputs>): TextureNoiseNode {
  const node = new TextureNoiseNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createTextureVoronoiNode(inputs?: Partial<TextureVoronoiInputs>): TextureVoronoiNode {
  const node = new TextureVoronoiNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createTextureWaveNode(inputs?: Partial<TextureWaveInputs>): TextureWaveNode {
  const node = new TextureWaveNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createTextureWhiteNoiseNode(inputs?: Partial<TextureWhiteNoiseInputs>): TextureWhiteNoiseNode {
  const node = new TextureWhiteNoiseNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createTextureMusgraveNode(inputs?: Partial<TextureMusgraveInputs>): TextureMusgraveNode {
  const node = new TextureMusgraveNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createTextureMagicNode(inputs?: Partial<TextureMagicInputs>): TextureMagicNode {
  const node = new TextureMagicNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createTextureGaborNode(inputs?: Partial<TextureGaborInputs>): TextureGaborNode {
  const node = new TextureGaborNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}
