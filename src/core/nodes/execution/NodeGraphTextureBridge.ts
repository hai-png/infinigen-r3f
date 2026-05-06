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
 *
 * Key methods:
 * - `convert()` — Convert a TextureNodeOutput (direct) to a Three.js Texture
 * - `convertFromEvaluatorOutput()` — Convert NodeEvaluator texture output to a Texture
 * - `convertToScalarMap()` — Generate a grayscale texture for roughnessMap, metalnessMap, etc.
 * - `convertToColorMap()` — Generate an RGB texture for map, emissiveMap, etc.
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

/**
 * Result of converting an evaluator texture output.
 * Contains the texture plus metadata about what kind of output it is.
 */
export interface TextureConversionResult {
  /** The generated Three.js texture */
  texture: THREE.Texture;
  /** Whether this is a color (RGB) or scalar (grayscale) texture */
  isColor: boolean;
  /** Suggested material slot (map, normalMap, roughnessMap, etc.) */
  suggestedSlot: string;
}

/**
 * Output format produced by the NodeEvaluator's texture node executors.
 * E.g., from executeNoiseTexture: { Fac: { type: 'noise_texture', scale, ... }, Color: { type: 'noise_texture', ... } }
 */
export interface EvaluatorTextureOutput {
  /** Fac output — scalar value */
  Fac?: Record<string, any>;
  /** Color output — RGB color */
  Color?: Record<string, any>;
  /** Distance output (Voronoi) — scalar */
  Distance?: Record<string, any>;
  /** Position output (Voronoi) — vector */
  Position?: Record<string, any>;
  /** Any other output keys */
  [key: string]: any;
}

// ============================================================================
// NodeGraphTextureBridge
// ============================================================================

export class NodeGraphTextureBridge {
  private defaultSize = 512;

  /**
   * Convert a texture node output to a Three.js Texture.
   * This is the direct conversion method for TextureNodeOutput objects.
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

  /**
   * Convert a NodeEvaluator texture output to a Three.js Texture.
   *
   * The NodeEvaluator produces outputs like:
   * - `{ Fac: { type: 'noise_texture', scale: 5, detail: 2, ... } }`
   * - `{ Color: { type: 'voronoi_texture', scale: 5, ... }, Distance: { ... } }`
   *
   * This method extracts the appropriate output and converts it.
   *
   * @param evaluatorOutput - The raw output from NodeEvaluator for a texture node
   * @param outputSocket - Which socket to use: 'Color', 'Fac', 'Distance', or 'auto'
   *   - 'auto' (default): prefers Color if available, otherwise Fac, otherwise Distance
   *   - 'Color': use the Color output (RGB)
   *   - 'Fac': use the Fac output (scalar as grayscale)
   *   - 'Distance': use the Distance output (scalar as grayscale)
   * @param width - Texture resolution width (default 512)
   * @param height - Texture resolution height (default 512)
   * @returns A TextureConversionResult with the texture and metadata
   */
  convertFromEvaluatorOutput(
    evaluatorOutput: EvaluatorTextureOutput,
    outputSocket: 'auto' | 'Color' | 'Fac' | 'Distance' = 'auto',
    width: number = 512,
    height: number = 512,
  ): TextureConversionResult {
    // Determine which output to use
    let selectedOutput: Record<string, any> | undefined;
    let isColor = false;
    let suggestedSlot = 'map';

    if (outputSocket === 'auto') {
      // Prefer Color output (RGB), then Fac (scalar), then Distance (scalar)
      if (evaluatorOutput.Color && typeof evaluatorOutput.Color === 'object' && 'type' in evaluatorOutput.Color) {
        selectedOutput = evaluatorOutput.Color;
        isColor = true;
        suggestedSlot = 'map';
      } else if (evaluatorOutput.Fac && typeof evaluatorOutput.Fac === 'object' && 'type' in evaluatorOutput.Fac) {
        selectedOutput = evaluatorOutput.Fac;
        isColor = false;
        suggestedSlot = 'roughnessMap';
      } else if (evaluatorOutput.Distance && typeof evaluatorOutput.Distance === 'object' && 'type' in evaluatorOutput.Distance) {
        selectedOutput = evaluatorOutput.Distance;
        isColor = false;
        suggestedSlot = 'roughnessMap';
      } else {
        // Try to find any object with a type field
        for (const [key, value] of Object.entries(evaluatorOutput)) {
          if (value && typeof value === 'object' && 'type' in value) {
            selectedOutput = value;
            isColor = key === 'Color';
            suggestedSlot = isColor ? 'map' : 'roughnessMap';
            break;
          }
        }
      }
    } else {
      const socketData = evaluatorOutput[outputSocket];
      if (socketData && typeof socketData === 'object' && 'type' in socketData) {
        selectedOutput = socketData;
        isColor = outputSocket === 'Color';
        suggestedSlot = isColor ? 'map' : 'roughnessMap';
      }
    }

    if (!selectedOutput) {
      // Fallback: generate a 1x1 placeholder
      const data = new Float32Array([1, 0, 1, 1]);
      const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat, THREE.FloatType);
      texture.needsUpdate = true;
      texture.name = 'Bridge_EvaluatorFallback';
      console.warn('NodeGraphTextureBridge: Could not extract texture from evaluator output, returning placeholder');
      return { texture, isColor: false, suggestedSlot: 'map' };
    }

    // Convert the evaluator output format to TextureNodeOutput
    const textureNodeOutput = this.evaluatorOutputToTextureNodeOutput(selectedOutput, width, height);
    const texture = this.convert(textureNodeOutput);

    return { texture, isColor, suggestedSlot };
  }

  /**
   * Generate a scalar (grayscale) texture from an evaluator output.
   * Useful for roughnessMap, metalnessMap, aoMap, etc.
   */
  convertToScalarMap(
    evaluatorOutput: EvaluatorTextureOutput,
    outputSocket: 'Fac' | 'Distance' = 'Fac',
    width: number = 512,
    height: number = 512,
  ): THREE.Texture {
    const result = this.convertFromEvaluatorOutput(evaluatorOutput, outputSocket, width, height);
    return result.texture;
  }

  /**
   * Generate a color (RGB) texture from an evaluator output.
   * Useful for map, emissiveMap, etc.
   */
  convertToColorMap(
    evaluatorOutput: EvaluatorTextureOutput,
    width: number = 512,
    height: number = 512,
  ): THREE.Texture {
    const result = this.convertFromEvaluatorOutput(evaluatorOutput, 'Color', width, height);
    return result.texture;
  }

  /**
   * Generate a normal map from a bump/displacement evaluator output.
   * Uses Sobel filter on the scalar height field.
   */
  convertToNormalMap(
    evaluatorOutput: EvaluatorTextureOutput,
    outputSocket: 'Fac' | 'Distance' = 'Fac',
    strength: number = 1.0,
    width: number = 512,
    height: number = 512,
  ): THREE.DataTexture {
    // First generate the height field
    const heightTexture = this.convertToScalarMap(evaluatorOutput, outputSocket, width, height);

    // Read the height data back — since we just created it, read from the internal data
    // We need to re-generate the height values for Sobel filter
    const heightData = this.generateHeightField(evaluatorOutput, outputSocket, width, height);
    const normalData = new Float32Array(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const left = heightData[y * width + Math.max(0, x - 1)];
        const right = heightData[y * width + Math.min(width - 1, x + 1)];
        const top = heightData[Math.max(0, y - 1) * width + x];
        const bottom = heightData[Math.min(height - 1, y + 1) * width + x];

        const dx = (right - left) * strength;
        const dy = (bottom - top) * strength;

        // Normal map format: [dx, dy, 1] normalized, remapped to [0,1]
        const len = Math.sqrt(dx * dx + dy * dy + 1);
        normalData[idx] = (dx / len) * 0.5 + 0.5;
        normalData[idx + 1] = (dy / len) * 0.5 + 0.5;
        normalData[idx + 2] = (1.0 / len) * 0.5 + 0.5;
        normalData[idx + 3] = 1.0;
      }
    }

    const texture = new THREE.DataTexture(normalData, width, height, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.name = 'Bridge_NormalMap';
    return texture;
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
  // Evaluator Output Conversion
  // ==========================================================================

  /**
   * Convert a NodeEvaluator texture output descriptor to TextureNodeOutput format.
   *
   * The NodeEvaluator produces objects like:
   *   { type: 'noise_texture', scale: 5, detail: 2, roughness: 0.5, distortion: 0, vector: {x,y,z} }
   *
   * The TextureNodeOutput format is:
   *   { type: 'noise', width: 512, height: 512, parameters: { scale: 5, detail: 2, ... } }
   */
  private evaluatorOutputToTextureNodeOutput(
    evaluatorTexDesc: Record<string, any>,
    width: number,
    height: number,
  ): TextureNodeOutput {
    const rawType = evaluatorTexDesc.type ?? 'noise_texture';
    const normalizedType = this.normalizeType(rawType);

    // Extract known parameters and put the rest in `parameters`
    const { type, vector, ...restParams } = evaluatorTexDesc;

    return {
      type: normalizedType,
      width,
      height,
      parameters: restParams,
    };
  }

  /**
   * Generate a height field array from an evaluator output.
   * Returns a Float32Array of [0,1] values, size width*height.
   */
  private generateHeightField(
    evaluatorOutput: EvaluatorTextureOutput,
    outputSocket: 'Fac' | 'Distance',
    width: number,
    height: number,
  ): Float32Array {
    const socketData = evaluatorOutput[outputSocket];
    if (!socketData || typeof socketData !== 'object' || !('type' in socketData)) {
      // Return flat height field
      return new Float32Array(width * height).fill(0.5);
    }

    const textureNodeOutput = this.evaluatorOutputToTextureNodeOutput(socketData, width, height);
    const params = textureNodeOutput.parameters;
    const type = this.normalizeType(textureNodeOutput.type);
    const size = width * height;
    const heightData = new Float32Array(size);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const nx = x / width;
        const ny = y / height;
        let value = 0.5;

        switch (type) {
          case 'noise': {
            const scale = params.scale ?? 5.0;
            const detail = params.detail ?? 4;
            const roughness = params.roughness ?? 0.5;
            const distortion = params.distortion ?? 0.0;
            const seed = params.seed ?? 0;
            value = (seededFbm(nx * scale, ny * scale, 0, detail, 2.0, roughness, seed) + 1) / 2;
            if (distortion > 0) {
              value += seededNoise3D(nx * scale * 2, ny * scale * 2, 0, 1.0, seed + 1) * distortion * 0.3;
            }
            break;
          }
          case 'voronoi': {
            const scale = params.scale ?? 5.0;
            const seed = params.seed ?? 0;
            value = Math.min(1, seededVoronoi2D(nx, ny, scale, seed));
            break;
          }
          case 'musgrave': {
            const scale = params.scale ?? 5.0;
            const detail = params.detail ?? 4;
            const dimension = params.dimension ?? 2.0;
            const lacunarity = params.lacunarity ?? 2.0;
            const musgraveType = params.musgraveType ?? 'fbm';
            const seed = params.seed ?? 0;
            const gain = Math.pow(0.5, 2 - dimension);
            if (musgraveType === 'ridged_multifractal') {
              value = seededRidgedMultifractal(nx * scale, ny * scale, 0, detail, lacunarity, gain, 0.5, seed);
            } else {
              value = (seededFbm(nx * scale, ny * scale, 0, detail, lacunarity, gain, seed) + 1) / 2;
            }
            break;
          }
          case 'gradient': {
            const gradientType = params.gradientType ?? 'linear';
            switch (gradientType) {
              case 'quadratic': value = nx * nx; break;
              case 'diagonal': value = (nx + ny) / 2; break;
              case 'spherical':
              case 'radial': {
                const dx = nx - 0.5;
                const dy = ny - 0.5;
                value = 1.0 - Math.min(1, 2 * Math.sqrt(dx * dx + dy * dy));
                break;
              }
              case 'easing': value = nx * nx * (3 - 2 * nx); break;
              default: value = nx;
            }
            break;
          }
          case 'brick': {
            const scale = params.scale ?? 5.0;
            const mortarSize = params.mortarSize ?? 0.05;
            const brickWidth = params.brickWidth ?? 1.0;
            const brickHeight = params.brickHeight ?? 0.5;
            const nnx = nx * scale;
            const nny = ny * scale;
            const row = Math.floor(nny / brickHeight);
            const offset = (row % 2) * 0.5 * brickWidth;
            const adjX = nnx + offset;
            const localX = ((adjX % brickWidth) + brickWidth) % brickWidth;
            const localY = ((nny % brickHeight) + brickHeight) % brickHeight;
            const inMortar = localX < mortarSize || localX > brickWidth - mortarSize || localY < mortarSize || localY > brickHeight - mortarSize;
            value = inMortar ? 0.0 : 1.0;
            break;
          }
          case 'checker': {
            const scale = params.scale ?? 5.0;
            const cx = Math.floor(nx * scale);
            const cy = Math.floor(ny * scale);
            value = (cx + cy) % 2 === 0 ? 1.0 : 0.0;
            break;
          }
          default:
            value = 0.5;
        }

        heightData[y * width + x] = Math.max(0, Math.min(1, value));
      }
    }

    return heightData;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Normalize texture type strings (support both Blender-style and short names)
   */
  private normalizeType(type: string): TextureNodeType {
    // Direct match
    if (['noise', 'voronoi', 'musgrave', 'gradient', 'brick', 'checker', 'image'].includes(type)) {
      return type as TextureNodeType;
    }

    // Map Blender-style and underscore-style names to short names
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
