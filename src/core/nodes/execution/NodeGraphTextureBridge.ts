/**
 * NodeGraphTextureBridge - Converts texture node outputs to Three.js Textures
 *
 * Takes texture node outputs from the NodeEvaluator (Noise, Voronoi, Musgrave,
 * Gradient, Brick, Checker) and generates CanvasTexture or DataTexture instances.
 *
 * Uses the same seeded noise functions as TextureNodeExecutor but provides
 * a simpler API focused on bridging node graph outputs to Three.js textures.
 *
 * For complex texture generation (full PBR bake pipeline), use TextureBakePipeline.
 * This bridge is for individual texture channel generation from node graph parameters.
 */

import * as THREE from 'three';
import {
  seededNoise3D,
  seededNoise2D,
  seededVoronoi2D,
  seededFbm,
  seededRidgedMultifractal,
  SeededRandom,
} from '../../util/MathUtils';

// ============================================================================
// Types
// ============================================================================

export type TextureNodeType = 'noise' | 'voronoi' | 'musgrave' | 'gradient' | 'brick' | 'checker' | 'image';

export interface TextureNodeOutput {
  /** Type of texture to generate */
  type: TextureNodeType | string; // Also supports 'noise_texture', 'voronoi_texture', etc.
  /** Output width in pixels (default 512) */
  width?: number;
  /** Output height in pixels (default 512) */
  height?: number;
  /** All texture-specific parameters */
  parameters: Record<string, any>;
}

// ============================================================================
// NodeGraphTextureBridge
// ============================================================================

export class NodeGraphTextureBridge {
  private defaultSize = 512;

  /**
   * Convert a texture node output to a Three.js Texture
   */
  convert(textureOutput: TextureNodeOutput): THREE.Texture {
    const type = this.normalizeType(textureOutput.type);

    switch (type) {
      case 'noise':
        return this.generateNoiseTexture(textureOutput);
      case 'voronoi':
        return this.generateVoronoiTexture(textureOutput);
      case 'musgrave':
        return this.generateMusgraveTexture(textureOutput);
      case 'gradient':
        return this.generateGradientTexture(textureOutput);
      case 'brick':
        return this.generateBrickTexture(textureOutput);
      case 'checker':
        return this.generateCheckerTexture(textureOutput);
      case 'image':
        return this.generateImageTexture(textureOutput);
      default:
        console.warn(`NodeGraphTextureBridge: Unknown texture type "${textureOutput.type}", generating fallback noise`);
        return this.generateNoiseTexture(textureOutput);
    }
  }

  // ==========================================================================
  // Texture Generators
  // ==========================================================================

  /**
   * Generate a Perlin/Simplex noise texture using seeded noise
   */
  private generateNoiseTexture(output: TextureNodeOutput): THREE.DataTexture {
    const params = output.parameters;
    const width = output.width ?? this.defaultSize;
    const height = output.height ?? this.defaultSize;
    const scale = params.scale ?? 5.0;
    const detail = params.detail ?? 4;
    const distortion = params.distortion ?? 0.0;
    const seed = params.seed ?? 0;
    const roughness = params.roughness ?? 0.5;

    const size = width * height;
    const data = new Float32Array(size * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const nx = x / width;
        const ny = y / height;

        let value = seededFbm(
          nx * scale, ny * scale, 0,
          detail,
          2.0,
          roughness,
          seed
        );
        // Normalize from [-1,1] to [0,1]
        value = (value + 1) / 2;

        // Apply distortion
        if (distortion > 0) {
          const distNoise = seededNoise3D(nx * scale * 2, ny * scale * 2, 0, 1.0, seed + 1);
          value += distNoise * distortion * 0.3;
        }

        value = Math.max(0, Math.min(1, value));

        // Color output (grayscale with full RGB)
        const colorA = params.colorA ?? null;
        const colorB = params.colorB ?? null;
        if (colorA && colorB) {
          const cA = this.resolveColorParam(colorA, new THREE.Color(1, 1, 1));
          const cB = this.resolveColorParam(colorB, new THREE.Color(0, 0, 0));
          const color = new THREE.Color().lerpColors(cB, cA, value);
          data[idx] = color.r;
          data[idx + 1] = color.g;
          data[idx + 2] = color.b;
        } else {
          data[idx] = value;
          data[idx + 1] = value;
          data[idx + 2] = value;
        }
        data[idx + 3] = 1.0;
      }
    }

    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.name = `Bridge_Noise_${seed}`;
    return texture;
  }

  /**
   * Generate a Voronoi texture using seeded voronoi
   */
  private generateVoronoiTexture(output: TextureNodeOutput): THREE.DataTexture {
    const params = output.parameters;
    const width = output.width ?? this.defaultSize;
    const height = output.height ?? this.defaultSize;
    const scale = params.scale ?? 5.0;
    const seed = params.seed ?? 0;
    const distanceMetric = params.distanceMetric ?? 'euclidean';
    const feature = params.feature ?? 'f1';

    const size = width * height;
    const data = new Float32Array(size * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const nx = x / width;
        const ny = y / height;

        let value: number;

        if (feature === 'f2') {
          // F2: distance to second nearest point
          value = this.voronoiF2(nx, ny, scale, seed);
        } else {
          // F1: distance to nearest point
          value = seededVoronoi2D(nx, ny, scale, seed);
        }

        // For Manhattan/Chebyshev metrics, adjust distances
        if (distanceMetric === 'manhattan') {
          value = Math.sqrt(value) * 0.7; // Approximate adjustment
        } else if (distanceMetric === 'chebyshev') {
          value = Math.sqrt(value) * 0.5; // Approximate adjustment
        }

        value = Math.max(0, Math.min(1, value));

        // Color output
        const colorA = params.colorA ?? null;
        const colorB = params.colorB ?? null;
        if (colorA && colorB) {
          const cA = this.resolveColorParam(colorA, new THREE.Color(1, 1, 1));
          const cB = this.resolveColorParam(colorB, new THREE.Color(0, 0, 0));
          const color = new THREE.Color().lerpColors(cB, cA, value);
          data[idx] = color.r;
          data[idx + 1] = color.g;
          data[idx + 2] = color.b;
        } else {
          data[idx] = value;
          data[idx + 1] = value;
          data[idx + 2] = value;
        }
        data[idx + 3] = 1.0;
      }
    }

    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.name = `Bridge_Voronoi_${seed}`;
    return texture;
  }

  /**
   * Generate a Musgrave texture (multifractal noise variants)
   */
  private generateMusgraveTexture(output: TextureNodeOutput): THREE.DataTexture {
    const params = output.parameters;
    const width = output.width ?? this.defaultSize;
    const height = output.height ?? this.defaultSize;
    const scale = params.scale ?? 5.0;
    const detail = params.detail ?? 4;
    const dimension = params.dimension ?? 2.0;
    const lacunarity = params.lacunarity ?? 2.0;
    const musgraveType = params.musgraveType ?? 'fbm';
    const seed = params.seed ?? 0;

    // Compute gain from dimension: gain = 0.5^(2-dimension) * lacunarity^(dimension-2)
    const gain = Math.pow(0.5, 2 - dimension);

    const size = width * height;
    const data = new Float32Array(size * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const nx = x / width;
        const ny = y / height;

        let value: number;

        switch (musgraveType) {
          case 'ridged_multifractal':
            value = seededRidgedMultifractal(
              nx * scale, ny * scale, 0,
              detail, lacunarity, gain, 0.5, seed
            );
            break;
          case 'hetero_terrain': {
            // Hetero terrain: FBM with displacement
            const base = seededFbm(nx * scale, ny * scale, 0, detail, lacunarity, gain, seed);
            value = (base + 1) / 2;
            // Add detail at higher frequencies
            const detailNoise = seededFbm(nx * scale * 2, ny * scale * 2, 0, Math.max(1, detail - 1), lacunarity, gain, seed + 1);
            value += ((detailNoise + 1) / 2) * 0.3 * Math.abs(base);
            break;
          }
          case 'hybrid_multifractal': {
            // Hybrid: like FBM but with ridged contribution at low frequencies
            let result = 0;
            let amp = 1;
            let freq = 1;
            let maxVal = 0;
            let weight = 1.0;
            for (let i = 0; i < detail; i++) {
              let n = seededNoise3D(nx * scale * freq, ny * scale * freq, 0, 1.0, seed + i);
              n = 1.0 - Math.abs(n); // Ridged
              n *= weight;
              weight = Math.min(Math.max(n * gain, 0), 1);
              result += n * amp;
              maxVal += amp;
              amp *= gain;
              freq *= lacunarity;
            }
            value = result / maxVal;
            break;
          }
          case 'multifractal': {
            // Multifractal: multiply octaves instead of adding
            let mfValue = 1.0;
            let mfFreq = 1.0;
            let mfAmp = 1.0;
            for (let i = 0; i < detail; i++) {
              mfValue *= mfAmp * seededNoise3D(nx * scale * mfFreq, ny * scale * mfFreq, 0, 1.0, seed + i) + 1.0;
              mfAmp *= gain;
              mfFreq *= lacunarity;
            }
            // Normalize approximately
            value = (Math.log(mfValue) / Math.log(2)) * 0.5 + 0.5;
            break;
          }
          case 'fbm':
          default:
            value = (seededFbm(nx * scale, ny * scale, 0, detail, lacunarity, gain, seed) + 1) / 2;
            break;
        }

        value = Math.max(0, Math.min(1, value));

        data[idx] = value;
        data[idx + 1] = value;
        data[idx + 2] = value;
        data[idx + 3] = 1.0;
      }
    }

    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.name = `Bridge_Musgrave_${musgraveType}_${seed}`;
    return texture;
  }

  /**
   * Generate a gradient texture (linear, radial, spherical, etc.)
   */
  private generateGradientTexture(output: TextureNodeOutput): THREE.DataTexture {
    const params = output.parameters;
    const width = output.width ?? this.defaultSize;
    const height = output.height ?? this.defaultSize;
    const gradientType = params.gradientType ?? 'linear';

    const size = width * height;
    const data = new Float32Array(size * 4);

    const colorA = this.resolveColorParam(params.colorA, new THREE.Color(1, 1, 1));
    const colorB = this.resolveColorParam(params.colorB, new THREE.Color(0, 0, 0));

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const nx = x / width;
        const ny = y / height;

        let t: number;

        switch (gradientType) {
          case 'quadratic':
            t = nx * nx;
            break;
          case 'diagonal':
            t = (nx + ny) / 2;
            break;
          case 'spherical': {
            const dx = nx - 0.5;
            const dy = ny - 0.5;
            t = 1.0 - Math.min(1, 2 * Math.sqrt(dx * dx + dy * dy));
            break;
          }
          case 'radial': {
            const ddx = nx - 0.5;
            const ddy = ny - 0.5;
            t = 1.0 - Math.min(1, 2 * Math.sqrt(ddx * ddx + ddy * ddy));
            break;
          }
          case 'easing':
            t = nx * nx * (3 - 2 * nx); // smoothstep
            break;
          case 'linear':
          default:
            t = nx;
            break;
        }

        t = Math.max(0, Math.min(1, t));
        const color = new THREE.Color().lerpColors(colorB, colorA, t);

        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;
        data[idx + 3] = 1.0;
      }
    }

    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.name = `Bridge_Gradient_${gradientType}`;
    return texture;
  }

  /**
   * Generate a brick pattern texture
   */
  private generateBrickTexture(output: TextureNodeOutput): THREE.DataTexture {
    const params = output.parameters;
    const width = output.width ?? this.defaultSize;
    const height = output.height ?? this.defaultSize;
    const scale = params.scale ?? 5.0;
    const seed = params.seed ?? 0;

    const brickWidth = params.brickWidth ?? 1.0;
    const brickHeight = params.brickHeight ?? 0.5;
    const mortarSize = params.mortarSize ?? 0.05;

    const colorA = this.resolveColorParam(params.colorA ?? params.brickColor, new THREE.Color(0.65, 0.3, 0.2));
    const colorB = this.resolveColorParam(params.colorB ?? params.mortarColor, new THREE.Color(0.6, 0.58, 0.55));

    const size = width * height;
    const data = new Float32Array(size * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const nx = x / width * scale;
        const ny = y / height * scale;

        // Calculate brick coordinates with row offset
        const row = Math.floor(ny / brickHeight);
        const offset = (row % 2) * 0.5 * brickWidth;
        const adjX = nx + offset;

        // Local position within brick
        const localX = ((adjX % brickWidth) + brickWidth) % brickWidth;
        const localY = ((ny % brickHeight) + brickHeight) % brickHeight;

        // Check if in mortar
        const inMortarX = localX < mortarSize || localX > brickWidth - mortarSize;
        const inMortarY = localY < mortarSize || localY > brickHeight - mortarSize;
        const inMortar = inMortarX || inMortarY;

        // Add slight color variation per brick
        const brickId = Math.floor(adjX / brickWidth) + row * 137;
        const variation = (Math.sin(brickId * 12.9898 + seed) * 43758.5453) % 1;
        const colorVar = 0.9 + Math.abs(variation) * 0.2;

        const color = inMortar
          ? colorB.clone()
          : colorA.clone().multiplyScalar(colorVar);

        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;
        data[idx + 3] = 1.0;
      }
    }

    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.name = `Bridge_Brick_${seed}`;
    return texture;
  }

  /**
   * Generate a checker pattern texture
   */
  private generateCheckerTexture(output: TextureNodeOutput): THREE.DataTexture {
    const params = output.parameters;
    const width = output.width ?? this.defaultSize;
    const height = output.height ?? this.defaultSize;
    const scale = params.scale ?? 5.0;

    const colorA = this.resolveColorParam(params.colorA, new THREE.Color(1, 1, 1));
    const colorB = this.resolveColorParam(params.colorB, new THREE.Color(0, 0, 0));

    const size = width * height;
    const data = new Float32Array(size * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const nx = Math.floor(x / width * scale);
        const ny = Math.floor(y / height * scale);

        const isColorA = (nx + ny) % 2 === 0;
        const color = isColorA ? colorA : colorB;

        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;
        data[idx + 3] = 1.0;
      }
    }

    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.name = 'Bridge_Checker';
    return texture;
  }

  /**
   * Generate a placeholder image texture
   * For actual image textures, the user should load them with TextureLoader
   */
  private generateImageTexture(output: TextureNodeOutput): THREE.DataTexture {
    const params = output.parameters;
    const width = output.width ?? this.defaultSize;
    const height = output.height ?? this.defaultSize;

    // If a source texture is provided, return it directly
    if (params.source instanceof THREE.Texture) {
      return params.source as THREE.DataTexture;
    }

    // Generate a 1x1 magenta pixel as placeholder
    const data = new Float32Array([1, 0, 1, 1]);
    const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    texture.name = 'Bridge_Image_Placeholder';
    console.warn('NodeGraphTextureBridge: Image texture without source, returning placeholder');
    return texture;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Normalize texture type strings (support both Blender-style and short names)
   */
  private normalizeType(type: string): TextureNodeType {
    if (type.startsWith('ShaderNodeTex') || type.endsWith('_texture')) {
      // ShaderNodeTexNoise → noise, noise_texture → noise
      const map: Record<string, TextureNodeType> = {
        'ShaderNodeTexNoise': 'noise',
        'ShaderNodeTexVoronoi': 'voronoi',
        'ShaderNodeTexMusgrave': 'musgrave',
        'ShaderNodeTexGradient': 'gradient',
        'ShaderNodeTexBrick': 'brick',
        'ShaderNodeTexChecker': 'checker',
        'ShaderNodeTexImage': 'image',
        'noise_texture': 'noise',
        'voronoi_texture': 'voronoi',
        'musgrave_texture': 'musgrave',
        'gradient_texture': 'gradient',
        'brick_texture': 'brick',
        'checker_texture': 'checker',
        'image_texture': 'image',
      };
      return map[type] ?? 'noise';
    }
    return type as TextureNodeType;
  }

  /**
   * Resolve a color parameter that may be a Color, object, string, or null
   */
  private resolveColorParam(value: any, defaultColor: THREE.Color): THREE.Color {
    if (!value) return defaultColor.clone();
    if (value instanceof THREE.Color) return value.clone();
    if (typeof value === 'string') return new THREE.Color(value);
    if (typeof value === 'object' && 'r' in value && 'g' in value && 'b' in value) {
      return new THREE.Color(value.r, value.g, value.b);
    }
    return defaultColor.clone();
  }

  /**
   * Compute F2 distance (second nearest) for Voronoi
   */
  private voronoiF2(x: number, y: number, scale: number, seed: number): number {
    const cellX = Math.floor(x * scale);
    const cellY = Math.floor(y * scale);

    let minDist1 = Infinity;
    let minDist2 = Infinity;

    // Check 5x5 neighborhood for better F2 coverage
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const neighborX = cellX + dx;
        const neighborY = cellY + dy;

        // Deterministic feature point from hash
        const rng = new SeededRandom(neighborX * 73856093 ^ neighborY * 19349663 ^ seed);
        const featureX = neighborX + rng.next();
        const featureY = neighborY + rng.next();

        const distX = (x * scale) - featureX;
        const distY = (y * scale) - featureY;
        const dist = Math.sqrt(distX * distX + distY * distY);

        if (dist < minDist1) {
          minDist2 = minDist1;
          minDist1 = dist;
        } else if (dist < minDist2) {
          minDist2 = dist;
        }
      }
    }

    return minDist2 === Infinity ? minDist1 : minDist2;
  }
}
