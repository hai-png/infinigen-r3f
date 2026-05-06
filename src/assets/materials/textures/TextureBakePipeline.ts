/**
 * TextureBakePipeline - Bake material node graphs into PBR texture sets
 *
 * Generate all PBR channels: albedo (RGB), normal (RGB), roughness (G),
 * metallic (B), AO (R), height (G)
 * Configurable resolution (256, 512, 1024, 2048)
 * Tileable texture generation (seamless wrapping)
 * Export as DataTexture arrays for Three.js materials
 * Integration with MaterialFactory from the node execution layer
 *
 * Category-aware procedural generation:
 * - terrain: musgrave fBm + ridged_multifractal for realistic ground
 * - creature: voronoi cells for scales/plates, musgrave for skin
 * - metal: fine noise + directional brushing patterns
 * - wood: domain-warped noise for grain
 * - fabric: high-frequency noise for weave patterns
 * - ceramic: smooth + subtle noise for glaze
 * - nature/plant: musgrave + voronoi for organic surfaces
 */

import * as THREE from 'three';
import { createCanvas, isDOMAvailable } from '../../utils/CanvasUtils';
import { ProceduralTextureGraph, type TextureChannel, type TextureGraphOutput } from './ProceduralTextureGraph';
import { SeededNoiseGenerator, NoiseType } from '../../../core/util/math/noise';
import { SeededRandom } from '../../../core/util/MathUtils';

// ============================================================================
// Types
// ============================================================================

export type BakeResolution = 256 | 512 | 1024 | 2048;

export interface PBRTextureSet {
  albedo: THREE.DataTexture;
  normal: THREE.DataTexture;
  roughness: THREE.DataTexture;
  metallic: THREE.DataTexture;
  ao: THREE.DataTexture;
  height: THREE.DataTexture;
  emission: THREE.DataTexture | null;
}

/**
 * Canvas-based PBR texture set — uses CanvasTexture instead of DataTexture.
 * Preferred for environments where FloatType DataTextures are not well supported
 * (e.g., some mobile GPUs), or when interoperability with 2D canvas APIs is needed.
 */
export interface CanvasPBRTextureSet {
  albedo: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
  metallic: THREE.CanvasTexture;
  ao: THREE.CanvasTexture;
  height: THREE.CanvasTexture;
  emission: THREE.CanvasTexture | null;
}

/** Options for the named preset bake pipeline */
export interface PresetBakeOptions {
  resolution?: BakeResolution;
  seed?: number;
  /** Override the auto-detected category */
  category?: string;
  /** Whether to use procedural (category-aware) bake vs generic bake (default: true) */
  useProcedural?: boolean;
  /** Output format: 'data' for DataTexture, 'canvas' for CanvasTexture (default: 'data') */
  outputFormat?: 'data' | 'canvas';
}

export interface BakeConfig {
  resolution: BakeResolution;
  tileable: boolean;
  seed: number;
  /** Material category influences the noise graph presets */
  category: string;
}

export interface MaterialPBRParams {
  baseColor: THREE.Color;
  roughness: number;
  metallic: number;
  aoStrength: number;
  heightScale: number;
  normalStrength: number;
  emissionColor: THREE.Color | null;
  emissionStrength: number;
  noiseScale: number;
  noiseDetail: number;
  distortion: number;
  warpStrength: number;
}

// ============================================================================
// Cache
// ============================================================================

const bakeCache = new Map<string, PBRTextureSet>();

function computeBakeKey(config: BakeConfig, params: MaterialPBRParams): string {
  return [
    config.resolution,
    config.tileable,
    config.seed,
    config.category,
    params.baseColor.getHexString(),
    params.roughness,
    params.metallic,
    params.aoStrength,
    params.heightScale,
    params.normalStrength,
    params.noiseScale,
    params.noiseDetail,
    params.distortion,
    params.warpStrength,
    params.emissionStrength,
  ].join('|');
}

// ============================================================================
// TextureBakePipeline
// ============================================================================

export class TextureBakePipeline {
  private resolution: BakeResolution;
  private seed: number;
  private noise: SeededNoiseGenerator;
  private rng: SeededRandom;

  constructor(resolution: BakeResolution = 512, seed: number = 0) {
    this.resolution = resolution;
    this.seed = seed;
    this.noise = new SeededNoiseGenerator(seed);
    this.rng = new SeededRandom(seed);
  }

  /**
   * Bake a full PBR texture set from material parameters
   */
  bakePBRSet(params: MaterialPBRParams, config?: Partial<BakeConfig>): PBRTextureSet {
    const fullConfig: BakeConfig = {
      resolution: this.resolution,
      tileable: true,
      seed: this.seed,
      category: 'generic',
      ...config,
    };

    // Check cache
    const key = computeBakeKey(fullConfig, params);
    const cached = bakeCache.get(key);
    if (cached) return cached;

    const res = fullConfig.resolution;

    // Generate each channel
    const albedoData = this.generateAlbedo(params, res);
    const normalData = this.generateNormal(params, res);
    const roughnessData = this.generateRoughness(params, res);
    const metallicData = this.generateMetallic(params, res);
    const aoData = this.generateAO(params, res);
    const heightData = this.generateHeight(params, res);
    const emissionData = params.emissionStrength > 0
      ? this.generateEmission(params, res)
      : null;

    // Create DataTextures
    const albedo = this.createDataTexture(albedoData, res, 'Albedo');
    const normal = this.createDataTexture(normalData, res, 'Normal');
    const roughness = this.createDataTexture(roughnessData, res, 'Roughness');
    const metallic = this.createDataTexture(metallicData, res, 'Metallic');
    const ao = this.createDataTexture(aoData, res, 'AO');
    const height = this.createDataTexture(heightData, res, 'Height');
    const emission = emissionData ? this.createDataTexture(emissionData, res, 'Emission') : null;

    // Make tileable if requested
    if (fullConfig.tileable) {
      this.makeTileable(albedo, res);
      this.makeTileable(normal, res);
      this.makeTileable(roughness, res);
      this.makeTileable(metallic, res);
      this.makeTileable(ao, res);
      this.makeTileable(height, res);
      if (emission) this.makeTileable(emission, res);
    }

    const result: PBRTextureSet = { albedo, normal, roughness, metallic, ao, height, emission };
    bakeCache.set(key, result);
    return result;
  }

  /**
   * Generate albedo map (RGB color with noise variation)
   */
  private generateAlbedo(params: MaterialPBRParams, res: number): Float32Array {
    const data = new Float32Array(res * res * 4);
    const scale = params.noiseScale;
    const detail = params.noiseDetail;

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;
        const nx = x / res;
        const ny = y / res;

        // Base color with noise variation
        const noiseVal = (this.noise.fbm(nx * scale, ny * scale, 0, { octaves: detail, gain: 0.5 }) + 1) / 2;
        const variation = 0.9 + noiseVal * 0.2; // +/- 10% variation

        data[idx] = Math.max(0, Math.min(1, params.baseColor.r * variation));
        data[idx + 1] = Math.max(0, Math.min(1, params.baseColor.g * variation));
        data[idx + 2] = Math.max(0, Math.min(1, params.baseColor.b * variation));
        data[idx + 3] = 1.0;
      }
    }

    return data;
  }

  /**
   * Generate normal map from height differences
   */
  private generateNormal(params: MaterialPBRParams, res: number): Float32Array {
    const data = new Float32Array(res * res * 4);
    const scale = params.noiseScale;
    const detail = params.noiseDetail;
    const strength = params.normalStrength;

    // First, generate height field
    const heightField = new Float32Array(res * res);
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const nx = x / res;
        const ny = y / res;
        heightField[y * res + x] = (this.noise.fbm(nx * scale, ny * scale, 0, { octaves: detail }) + 1) / 2;
      }
    }

    // Compute normals from height differences (Sobel filter)
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;

        const left = heightField[y * res + ((x - 1 + res) % res)];
        const right = heightField[y * res + ((x + 1) % res)];
        const up = heightField[((y - 1 + res) % res) * res + x];
        const down = heightField[((y + 1) % res) * res + x];

        // Normal from finite differences
        const dx = (right - left) * strength;
        const dy = (down - up) * strength;
        const dz = 1.0;

        // Normalize
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const nx2 = dx / len;
        const ny2 = dy / len;
        const nz = dz / len;

        // Encode as [0,1] range
        data[idx] = nx2 * 0.5 + 0.5;
        data[idx + 1] = ny2 * 0.5 + 0.5;
        data[idx + 2] = nz * 0.5 + 0.5;
        data[idx + 3] = 1.0;
      }
    }

    return data;
  }

  /**
   * Generate roughness map
   */
  private generateRoughness(params: MaterialPBRParams, res: number): Float32Array {
    const data = new Float32Array(res * res * 4);
    const scale = params.noiseScale * 2; // Higher frequency for roughness detail
    const baseRoughness = params.roughness;

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;
        const nx = x / res;
        const ny = y / res;

        const noiseVal = (this.noise.fbm(nx * scale, ny * scale, 0, { octaves: 3, gain: 0.5 }) + 1) / 2;
        const roughness = Math.max(0, Math.min(1, baseRoughness + (noiseVal - 0.5) * 0.3));

        data[idx] = roughness;
        data[idx + 1] = roughness;
        data[idx + 2] = roughness;
        data[idx + 3] = 1.0;
      }
    }

    return data;
  }

  /**
   * Generate metallic map
   */
  private generateMetallic(params: MaterialPBRParams, res: number): Float32Array {
    const data = new Float32Array(res * res * 4);
    const baseMetallic = params.metallic;

    // Metallic is usually uniform with slight noise
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;
        const nx = x / res;
        const ny = y / res;

        const noiseVal = (this.noise.perlin2D(nx * 10, ny * 10) + 1) / 2;
        const metallic = Math.max(0, Math.min(1, baseMetallic + (noiseVal - 0.5) * 0.1));

        data[idx] = metallic;
        data[idx + 1] = metallic;
        data[idx + 2] = metallic;
        data[idx + 3] = 1.0;
      }
    }

    return data;
  }

  /**
   * Generate ambient occlusion map
   */
  private generateAO(params: MaterialPBRParams, res: number): Float32Array {
    const data = new Float32Array(res * res * 4);
    const scale = params.noiseScale * 0.5;
    const aoStrength = params.aoStrength;

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;
        const nx = x / res;
        const ny = y / res;

        // AO based on low-frequency noise simulating crevices
        const noiseVal = (this.noise.fbm(nx * scale, ny * scale, 0, { octaves: 3, gain: 0.7 }) + 1) / 2;

        // Darken crevices (high noise = more occlusion)
        const ao = 1.0 - noiseVal * aoStrength * 0.5;

        data[idx] = Math.max(0, ao);
        data[idx + 1] = Math.max(0, ao);
        data[idx + 2] = Math.max(0, ao);
        data[idx + 3] = 1.0;
      }
    }

    return data;
  }

  /**
   * Generate height map
   */
  private generateHeight(params: MaterialPBRParams, res: number): Float32Array {
    const data = new Float32Array(res * res * 4);
    const scale = params.noiseScale;
    const detail = params.noiseDetail;
    const heightScale = params.heightScale;

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;
        const nx = x / res;
        const ny = y / res;

        const noiseVal = (this.noise.fbm(nx * scale, ny * scale, 0, { octaves: detail, gain: 0.5 }) + 1) / 2;
        const height = noiseVal * heightScale;

        data[idx] = height;
        data[idx + 1] = height;
        data[idx + 2] = height;
        data[idx + 3] = 1.0;
      }
    }

    return data;
  }

  /**
   * Generate emission map
   */
  private generateEmission(params: MaterialPBRParams, res: number): Float32Array {
    const data = new Float32Array(res * res * 4);
    const scale = params.noiseScale;
    const strength = params.emissionStrength;
    const color = params.emissionColor ?? new THREE.Color(1, 1, 1);

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;
        const nx = x / res;
        const ny = y / res;

        const noiseVal = (this.noise.fbm(nx * scale, ny * scale, 0, { octaves: 3 }) + 1) / 2;

        data[idx] = color.r * noiseVal * strength;
        data[idx + 1] = color.g * noiseVal * strength;
        data[idx + 2] = color.b * noiseVal * strength;
        data[idx + 3] = 1.0;
      }
    }

    return data;
  }

  /**
   * Create a DataTexture from float data
   */
  private createDataTexture(data: Float32Array, res: number, name: string): THREE.DataTexture {
    const texture = new THREE.DataTexture(data, res, res, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.name = `Bake_${name}_${this.seed}`;
    return texture;
  }

  /**
   * Make a texture tileable by blending edges
   */
  private makeTileable(texture: THREE.DataTexture, res: number): void {
    const data = texture.image.data as Float32Array;
    const blendWidth = Math.max(1, Math.floor(res * 0.05)); // 5% edge blend

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;

        // Blend left edge with right edge
        if (x < blendWidth) {
          const t = x / blendWidth;
          const mirrorIdx = (y * res + (res - blendWidth + x)) * 4;
          for (let c = 0; c < 4; c++) {
            data[idx + c] = data[idx + c] * t + data[mirrorIdx + c] * (1 - t);
          }
        }

        // Blend top edge with bottom edge
        if (y < blendWidth) {
          const t = y / blendWidth;
          const mirrorIdx = ((res - blendWidth + y) * res + x) * 4;
          for (let c = 0; c < 4; c++) {
            data[idx + c] = data[idx + c] * t + data[mirrorIdx + c] * (1 - t);
          }
        }
      }
    }

    texture.needsUpdate = true;
  }

  /**
   * Create a MeshPhysicalMaterial from a baked PBR texture set
   */
  createMaterial(textures: PBRTextureSet, params: Partial<MaterialPBRParams> = {}): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      map: textures.albedo,
      normalMap: textures.normal,
      roughnessMap: textures.roughness,
      metalnessMap: textures.metallic,
      aoMap: textures.ao,
      bumpMap: textures.height,
      color: params.baseColor ?? new THREE.Color(1, 1, 1),
      roughness: params.roughness ?? 0.5,
      metalness: params.metallic ?? 0.0,
      bumpScale: params.heightScale ?? 0.02,
      normalScale: new THREE.Vector2(params.normalStrength ?? 1.0, params.normalStrength ?? 1.0),
      aoMapIntensity: params.aoStrength ?? 1.0,
    });

    if (textures.emission && params.emissionStrength && params.emissionStrength > 0) {
      material.emissiveMap = textures.emission;
      material.emissive = params.emissionColor ?? new THREE.Color(1, 1, 1);
      material.emissiveIntensity = params.emissionStrength;
    }

    material.name = 'BakedPBRMaterial';
    return material;
  }

  // ==========================================================================
  // Category-Aware Procedural Texture Generation
  // ==========================================================================

  /**
   * Bake a PBR texture set using category-specific procedural patterns.
   * Different categories use different noise types (voronoi, musgrave, domain warp)
   * to produce more realistic textures than the generic bakePBRSet.
   */
  bakeProceduralSet(presetName: string, params: MaterialPBRParams, config?: Partial<BakeConfig>): PBRTextureSet {
    const fullConfig: BakeConfig = {
      resolution: this.resolution,
      tileable: true,
      seed: this.seed,
      category: 'generic',
      ...config,
    };

    // Derive category from preset name prefix if not provided
    const category = fullConfig.category || this.inferCategory(presetName);

    // Check cache
    const key = `proc_${computeBakeKey(fullConfig, params)}_${presetName}`;
    const cached = bakeCache.get(key);
    if (cached) return cached;

    const res = fullConfig.resolution;

    // Use category-specific generators
    const albedoData = this.generateProceduralAlbedo(params, res, category);
    const heightField = this.generateProceduralHeightField(params, res, category);
    const normalData = this.generateNormalFromHeightField(heightField, res, params.normalStrength);
    const roughnessData = this.generateProceduralRoughness(params, res, category);
    const metallicData = this.generateProceduralMetallic(params, res, category);
    const aoData = this.generateProceduralAO(params, res, category);
    const emissionData = params.emissionStrength > 0
      ? this.generateProceduralEmission(params, res, category)
      : null;

    // Create DataTextures
    const albedo = this.createDataTexture(albedoData, res, 'Albedo');
    const normal = this.createDataTexture(normalData, res, 'Normal');
    const roughness = this.createDataTexture(roughnessData, res, 'Roughness');
    const metallic = this.createDataTexture(metallicData, res, 'Metallic');
    const ao = this.createDataTexture(aoData, res, 'AO');
    const height = this.createDataTexture(this.heightFieldToData(heightField, res, params.heightScale), res, 'Height');
    const emission = emissionData ? this.createDataTexture(emissionData, res, 'Emission') : null;

    // Make tileable if requested
    if (fullConfig.tileable) {
      this.makeTileable(albedo, res);
      this.makeTileable(normal, res);
      this.makeTileable(roughness, res);
      this.makeTileable(metallic, res);
      this.makeTileable(ao, res);
      this.makeTileable(height, res);
      if (emission) this.makeTileable(emission, res);
    }

    const result: PBRTextureSet = { albedo, normal, roughness, metallic, ao, height, emission };
    bakeCache.set(key, result);
    return result;
  }

  /**
   * Infer material category from a preset name
   */
  private inferCategory(name: string): string {
    // Try matching by known prefix patterns
    const categoryMap: Record<string, string[]> = {
      terrain: ['mud', 'cracked_ground', 'sandstone', 'cobblestone', 'dirt', 'mountain_rock', 'soil', 'ice', 'sand', 'chunky_rock', 'lava', 'mossy_stone', 'river_water', 'ocean_water', 'pool_water'],
      wood: ['oak', 'pine', 'birch', 'mahogany', 'plywood', 'hardwood_floor', 'old_wood', 'bark', 'wood_tile', 'composite_wood_tile', 'crossed_wood_tile', 'shelf_shaders', 'square_wood_tile', 'staggered_wood_tile', 'table_wood'],
      metal: ['steel', 'aluminum', 'copper', 'brass', 'chrome', 'rusted_iron', 'brushed_metal'],
      ceramic: ['porcelain', 'terracotta', 'marble', 'glazed_tile', 'pottery'],
      fabric: ['cotton', 'silk', 'velvet', 'leather', 'denim', 'canvas'],
      plastic: ['glossy_plastic', 'matte_plastic', 'rubber', 'translucent_plastic'],
      glass: ['clear_glass', 'frosted_glass', 'stained_glass'],
      nature: ['grass', 'leaves', 'bark_birch', 'moss', 'lichen', 'snow', 'ice_crystal', 'coral'],
      plant: ['simple_greenery', 'simple_whitish', 'simple_brownish', 'succulent', 'spider_plant', 'snake_plant', 'grass_blade', 'plant_bark_birch'],
      creature: ['snake_scale', 'fish_scale', 'feathers', 'fur', 'chitin', 'tiger', 'fish_body', 'fish_eye', 'reptile', 'eyeball', 'horn', 'bone', 'tongue', 'giraffe', 'zebra', 'dalmatian', 'cow', 'amphibian', 'insect_shell'],
      fluid: ['river_water', 'ocean_water', 'pool_water'],
      tile: ['wood_tile', 'glazed_tile', 'composite_wood_tile', 'crossed_wood_tile', 'square_wood_tile', 'staggered_wood_tile'],
    };

    for (const [cat, presets] of Object.entries(categoryMap)) {
      if (presets.includes(name)) return cat;
    }

    // Fallback: check name substrings
    const nameLower = name.toLowerCase();
    if (nameLower.includes('rock') || nameLower.includes('stone') || nameLower.includes('ground') || nameLower.includes('dirt') || nameLower.includes('sand') || nameLower.includes('mud')) return 'terrain';
    if (nameLower.includes('wood') || nameLower.includes('bark') || nameLower.includes('oak') || nameLower.includes('pine')) return 'wood';
    if (nameLower.includes('metal') || nameLower.includes('steel') || nameLower.includes('iron') || nameLower.includes('chrome')) return 'metal';
    if (nameLower.includes('scale') || nameLower.includes('fur') || nameLower.includes('skin') || nameLower.includes('shell') || nameLower.includes('feather')) return 'creature';
    if (nameLower.includes('water') || nameLower.includes('fluid')) return 'fluid';
    if (nameLower.includes('glass') || nameLower.includes('crystal')) return 'glass';
    if (nameLower.includes('leaf') || nameLower.includes('moss') || nameLower.includes('plant') || nameLower.includes('grass')) return 'nature';
    if (nameLower.includes('fabric') || nameLower.includes('cotton') || nameLower.includes('leather') || nameLower.includes('silk')) return 'fabric';

    return 'generic';
  }

  /**
   * Generate procedural albedo with category-specific noise
   */
  private generateProceduralAlbedo(params: MaterialPBRParams, res: number, category: string): Float32Array {
    const data = new Float32Array(res * res * 4);
    const scale = params.noiseScale;
    const detail = params.noiseDetail;
    const distortion = params.distortion;
    const warpStrength = params.warpStrength;

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;
        const nx = x / res;
        const ny = y / res;

        let noiseVal: number;

        switch (category) {
          case 'terrain':
            // Musgrave-style fBm + domain warp for realistic terrain color
            noiseVal = (this.noise.domainWarp(nx * scale, ny * scale, 0, {
              warpStrength, warpScale: scale * 0.5, octaves: detail, gain: 0.5,
            }) + 1) / 2;
            // Add ridged multifractal for crack-like variation
            const ridged = this.noise.ridgedMultifractal(nx * scale * 2, ny * scale * 2, 0, {
              octaves: Math.min(detail, 4), gain: 0.5,
            });
            noiseVal = noiseVal * 0.7 + ridged * 0.3;
            break;

          case 'creature':
            // Voronoi for cell/scale patterns + musgrave for skin
            const voronoi = this.noise.voronoi2D(nx, ny, scale);
            const cellPattern = Math.max(0, 1.0 - voronoi * scale * 2); // Cell edges
            const skinNoise = (this.noise.fbm(nx * scale, ny * scale, 0, {
              octaves: detail, gain: 0.5, noiseType: NoiseType.Simplex,
            }) + 1) / 2;
            noiseVal = skinNoise * 0.6 + cellPattern * 0.4;
            break;

          case 'wood':
            // Domain-warped noise for wood grain
            noiseVal = (this.noise.domainWarp(nx * scale, ny * scale, 0, {
              warpStrength: warpStrength * 1.5, warpScale: scale * 0.3,
              octaves: detail, gain: 0.6,
            }) + 1) / 2;
            // Anisotropic stretching along one axis (grain direction)
            const grainVal = (this.noise.perlin2D(nx * scale * 0.5, ny * scale * 3) + 1) / 2;
            noiseVal = noiseVal * 0.6 + grainVal * 0.4;
            break;

          case 'metal':
            // Fine high-frequency noise + brushed direction
            const fineNoise = (this.noise.fbm(nx * scale * 2, ny * scale * 2, 0, {
              octaves: 3, gain: 0.5, noiseType: NoiseType.Simplex,
            }) + 1) / 2;
            // Subtle directional brushing (stretched along one axis)
            const brushed = (this.noise.perlin2D(nx * 0.5, ny * scale * 15) + 1) / 2;
            noiseVal = fineNoise * 0.8 + brushed * 0.2;
            break;

          case 'fabric':
            // High-frequency noise for weave pattern
            const weave = (this.noise.fbm(nx * scale, ny * scale, 0, {
              octaves: 2, gain: 0.3, noiseType: NoiseType.Simplex,
            }) + 1) / 2;
            // Subtle grid pattern for weave
            const gridX = Math.abs(Math.sin(nx * Math.PI * scale * 2));
            const gridY = Math.abs(Math.sin(ny * Math.PI * scale * 2));
            const grid = (gridX + gridY) * 0.25;
            noiseVal = weave * 0.7 + grid * 0.3;
            break;

          case 'ceramic':
            // Very smooth with subtle noise for glaze
            noiseVal = (this.noise.perlin2D(nx * scale, ny * scale) + 1) / 2;
            noiseVal = 0.85 + noiseVal * 0.15; // Very subtle variation
            break;

          case 'glass':
            // Minimal noise for glass
            noiseVal = (this.noise.perlin2D(nx * scale, ny * scale) + 1) / 2;
            noiseVal = 0.9 + noiseVal * 0.1; // Almost flat
            break;

          case 'nature':
          case 'plant':
            // Musgrave + voronoi for organic surfaces
            const organicNoise = (this.noise.fbm(nx * scale, ny * scale, 0, {
              octaves: detail, gain: 0.5, noiseType: NoiseType.Simplex,
            }) + 1) / 2;
            const veinPattern = this.noise.voronoi2D(nx, ny, scale * 0.5);
            const veins = Math.max(0, 1.0 - veinPattern * scale * 3);
            noiseVal = organicNoise * 0.75 + veins * 0.25;
            break;

          default:
            // Generic: simple fBm
            noiseVal = (this.noise.fbm(nx * scale, ny * scale, 0, { octaves: detail, gain: 0.5 }) + 1) / 2;
            break;
        }

        // Apply distortion if specified (for all categories)
        if (distortion > 0 && category !== 'glass' && category !== 'ceramic') {
          const distortX = this.noise.perlin2D(nx * scale * 2 + 5.2, ny * scale * 2 + 1.3) * distortion;
          const distortY = this.noise.perlin2D(nx * scale * 2 + 9.1, ny * scale * 2 + 3.7) * distortion;
          const dnx = Math.max(0, Math.min(1, nx + distortX * 0.1));
          const dny = Math.max(0, Math.min(1, ny + distortY * 0.1));
          const distorted = (this.noise.perlin2D(dnx * scale, dny * scale) + 1) / 2;
          noiseVal = noiseVal * 0.7 + distorted * 0.3;
        }

        const variation = 0.85 + noiseVal * 0.3; // +/- 15% variation
        data[idx] = Math.max(0, Math.min(1, params.baseColor.r * variation));
        data[idx + 1] = Math.max(0, Math.min(1, params.baseColor.g * variation));
        data[idx + 2] = Math.max(0, Math.min(1, params.baseColor.b * variation));
        data[idx + 3] = 1.0;
      }
    }

    return data;
  }

  /**
   * Generate a procedural height field with category-specific noise
   */
  private generateProceduralHeightField(params: MaterialPBRParams, res: number, category: string): Float32Array {
    const heightField = new Float32Array(res * res);
    const scale = params.noiseScale;
    const detail = params.noiseDetail;
    const warpStrength = params.warpStrength;

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const nx = x / res;
        const ny = y / res;

        switch (category) {
          case 'terrain':
            // Ridged multifractal for dramatic height variation
            heightField[y * res + x] = this.noise.ridgedMultifractal(nx * scale, ny * scale, 0, {
              octaves: detail, gain: 0.5, roughness: 0.7,
            });
            break;

          case 'creature':
            // Voronoi for scale/plate bumps
            const voronoiH = this.noise.voronoi2D(nx, ny, scale);
            heightField[y * res + x] = Math.max(0, 1.0 - voronoiH * scale * 1.5);
            break;

          case 'wood':
            // Stretched noise for grain direction
            heightField[y * res + x] = (this.noise.perlin2D(nx * scale * 0.5, ny * scale * 3) + 1) / 2;
            break;

          case 'metal':
            // Very fine, subtle height
            heightField[y * res + x] = (this.noise.fbm(nx * scale * 3, ny * scale * 3, 0, {
              octaves: 3, gain: 0.3, noiseType: NoiseType.Simplex,
            }) + 1) / 2 * 0.3;
            break;

          case 'nature':
          case 'plant':
            // Musgrave for organic bumpiness
            heightField[y * res + x] = (this.noise.domainWarp(nx * scale, ny * scale, 0, {
              warpStrength: warpStrength * 0.5, warpScale: scale * 0.3, octaves: detail,
            }) + 1) / 2;
            break;

          default:
            heightField[y * res + x] = (this.noise.fbm(nx * scale, ny * scale, 0, { octaves: detail, gain: 0.5 }) + 1) / 2;
            break;
        }
      }
    }

    return heightField;
  }

  /**
   * Generate normal map from a pre-computed height field (Sobel filter)
   */
  private generateNormalFromHeightField(heightField: Float32Array, res: number, strength: number): Float32Array {
    const data = new Float32Array(res * res * 4);

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;

        const left = heightField[y * res + ((x - 1 + res) % res)];
        const right = heightField[y * res + ((x + 1) % res)];
        const up = heightField[((y - 1 + res) % res) * res + x];
        const down = heightField[((y + 1) % res) * res + x];

        const dx = (right - left) * strength;
        const dy = (down - up) * strength;
        const dz = 1.0;

        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        data[idx] = (dx / len) * 0.5 + 0.5;
        data[idx + 1] = (dy / len) * 0.5 + 0.5;
        data[idx + 2] = (dz / len) * 0.5 + 0.5;
        data[idx + 3] = 1.0;
      }
    }

    return data;
  }

  /**
   * Convert a height field Float32Array to RGBA data
   */
  private heightFieldToData(heightField: Float32Array, res: number, heightScale: number): Float32Array {
    const data = new Float32Array(res * res * 4);
    for (let i = 0; i < res * res; i++) {
      const h = heightField[i] * heightScale;
      data[i * 4] = h;
      data[i * 4 + 1] = h;
      data[i * 4 + 2] = h;
      data[i * 4 + 3] = 1.0;
    }
    return data;
  }

  /**
   * Generate procedural roughness map with category-specific patterns
   */
  private generateProceduralRoughness(params: MaterialPBRParams, res: number, category: string): Float32Array {
    const data = new Float32Array(res * res * 4);
    const scale = params.noiseScale * 2;
    const baseRoughness = params.roughness;

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;
        const nx = x / res;
        const ny = y / res;

        let noiseVal: number;
        switch (category) {
          case 'terrain':
            noiseVal = (this.noise.ridgedMultifractal(nx * scale, ny * scale, 0, { octaves: 3, gain: 0.5 }) + 0.5) * 0.5;
            break;
          case 'creature':
            const v = this.noise.voronoi2D(nx, ny, scale * 0.5);
            noiseVal = v < 0.1 ? 0.3 : 0.7; // Scales are smoother than gaps
            break;
          case 'metal':
            noiseVal = (this.noise.fbm(nx * scale * 2, ny * scale * 2, 0, {
              octaves: 2, gain: 0.3, noiseType: NoiseType.Simplex,
            }) + 1) / 2 * 0.2; // Very subtle roughness variation
            break;
          default:
            noiseVal = (this.noise.fbm(nx * scale, ny * scale, 0, { octaves: 3, gain: 0.5 }) + 1) / 2;
            break;
        }

        const roughness = Math.max(0, Math.min(1, baseRoughness + (noiseVal - 0.5) * 0.3));
        data[idx] = roughness;
        data[idx + 1] = roughness;
        data[idx + 2] = roughness;
        data[idx + 3] = 1.0;
      }
    }

    return data;
  }

  /**
   * Generate procedural metallic map with category-specific patterns
   */
  private generateProceduralMetallic(params: MaterialPBRParams, res: number, category: string): Float32Array {
    const data = new Float32Array(res * res * 4);
    const baseMetallic = params.metallic;

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;
        const nx = x / res;
        const ny = y / res;

        let noiseVal: number;
        if (category === 'metal' && baseMetallic > 0.5) {
          // Rust/oxidation patches: lower metallic in some areas
          const rustNoise = (this.noise.fbm(nx * 4, ny * 4, 0, { octaves: 3, gain: 0.6 }) + 1) / 2;
          noiseVal = rustNoise > 0.7 ? -0.3 : 0.05; // Rust patches reduce metallic
        } else {
          noiseVal = (this.noise.perlin2D(nx * 10, ny * 10) + 1) / 2 * 0.1;
        }

        const metallic = Math.max(0, Math.min(1, baseMetallic + (noiseVal - 0.05) * 0.5));
        data[idx] = metallic;
        data[idx + 1] = metallic;
        data[idx + 2] = metallic;
        data[idx + 3] = 1.0;
      }
    }

    return data;
  }

  /**
   * Generate procedural AO map with category-specific patterns
   */
  private generateProceduralAO(params: MaterialPBRParams, res: number, category: string): Float32Array {
    const data = new Float32Array(res * res * 4);
    const scale = params.noiseScale * 0.5;
    const aoStrength = params.aoStrength;

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;
        const nx = x / res;
        const ny = y / res;

        let noiseVal: number;
        switch (category) {
          case 'terrain':
            // Deep crevices from ridged noise
            noiseVal = this.noise.ridgedMultifractal(nx * scale, ny * scale, 0, { octaves: 3, gain: 0.7, roughness: 0.6 });
            break;
          case 'creature':
            // AO between scale cells
            const v = this.noise.voronoi2D(nx, ny, scale * 2);
            noiseVal = v * 2; // Edges get more occlusion
            break;
          default:
            noiseVal = (this.noise.fbm(nx * scale, ny * scale, 0, { octaves: 3, gain: 0.7 }) + 1) / 2;
            break;
        }

        const ao = 1.0 - Math.min(1, noiseVal) * aoStrength * 0.5;
        data[idx] = Math.max(0, ao);
        data[idx + 1] = Math.max(0, ao);
        data[idx + 2] = Math.max(0, ao);
        data[idx + 3] = 1.0;
      }
    }

    return data;
  }

  /**
   * Generate procedural emission map with category-specific patterns
   */
  private generateProceduralEmission(params: MaterialPBRParams, res: number, category: string): Float32Array {
    const data = new Float32Array(res * res * 4);
    const scale = params.noiseScale;
    const strength = params.emissionStrength;
    const color = params.emissionColor ?? new THREE.Color(1, 1, 1);

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;
        const nx = x / res;
        const ny = y / res;

        let noiseVal: number;
        if (category === 'terrain' && strength > 1.0) {
          // Lava: emission through cracks (use ridged noise for crack pattern)
          const crackNoise = this.noise.ridgedMultifractal(nx * scale, ny * scale, 0, { octaves: 4, gain: 0.5 });
          noiseVal = crackNoise > 0.3 ? (crackNoise - 0.3) / 0.7 : 0;
        } else {
          noiseVal = (this.noise.fbm(nx * scale, ny * scale, 0, { octaves: 3 }) + 1) / 2;
        }

        data[idx] = color.r * noiseVal * strength;
        data[idx + 1] = color.g * noiseVal * strength;
        data[idx + 2] = color.b * noiseVal * strength;
        data[idx + 3] = 1.0;
      }
    }

    return data;
  }

  // ==========================================================================
  // Named Preset Pipeline: preset name → procedural textures → bake → output
  // ==========================================================================

  /**
   * Bake a full PBR texture set from a material preset name.
   *
   * Pipeline: material preset name → look up category → generate procedural
   * textures (noise, voronoi, musgrave) → bake to canvas/DataTexture → return
   *
   * This is the primary entry point for the named pipeline. It auto-detects the
   * material category from the preset name, selects appropriate procedural noise
   * patterns (voronoi for scales, musgrave fBm for terrain, domain warp for wood,
   * etc.), and produces a complete PBR texture set.
   *
   * @param presetName - Material preset name (e.g., 'steel', 'oak', 'snake_scale')
   * @param params - PBR parameters for the material
   * @param options - Bake options (resolution, seed, category, output format)
   * @returns PBRTextureSet (DataTexture) or CanvasPBRTextureSet (CanvasTexture)
   *
   * @example
   * ```ts
   * const pipeline = new TextureBakePipeline();
   *
   * // DataTexture output (default, higher precision)
   * const set1 = pipeline.bakeFromPresetName('steel', steelParams);
   *
   * // CanvasTexture output (better compatibility)
   * const set2 = pipeline.bakeFromPresetName('oak', oakParams, { outputFormat: 'canvas' });
   * ```
   */
  bakeFromPresetName(
    presetName: string,
    params: MaterialPBRParams,
    options?: PresetBakeOptions,
  ): PBRTextureSet | CanvasPBRTextureSet {
    const useProcedural = options?.useProcedural ?? true;
    const outputFormat = options?.outputFormat ?? 'data';

    // Step 1: Generate the PBR texture set (procedural or generic)
    const textureSet = useProcedural
      ? this.bakeProceduralSet(presetName, params, {
          resolution: options?.resolution ?? this.resolution,
          seed: options?.seed ?? this.seed,
          category: options?.category,
        })
      : this.bakePBRSet(params, {
          resolution: options?.resolution ?? this.resolution,
          seed: options?.seed ?? this.seed,
          category: options?.category ?? 'generic',
        });

    // Step 2: Convert to canvas format if requested
    if (outputFormat === 'canvas') {
      return this.toCanvasTextureSet(textureSet);
    }

    return textureSet;
  }

  /**
   * Convert a DataTexture PBRTextureSet to a CanvasPBRTextureSet.
   *
   * This renders each Float32Array DataTexture onto an HTML canvas and returns
   * CanvasTexture instances. Useful when:
   * - Target GPU doesn't support FloatType DataTextures
   * - Need to interop with 2D canvas APIs (compositing, drawing)
   * - Need texture data that survives context loss better
   *
   * Falls back to DataTexture if the DOM is not available.
   */
  toCanvasTextureSet(dataSet: PBRTextureSet): CanvasPBRTextureSet | PBRTextureSet {
    if (!isDOMAvailable()) {
      console.warn('TextureBakePipeline: DOM not available, returning DataTexture set instead of CanvasTexture');
      return dataSet;
    }

    return {
      albedo: this.dataTextureToCanvasTexture(dataSet.albedo),
      normal: this.dataTextureToCanvasTexture(dataSet.normal),
      roughness: this.dataTextureToCanvasTexture(dataSet.roughness),
      metallic: this.dataTextureToCanvasTexture(dataSet.metallic),
      ao: this.dataTextureToCanvasTexture(dataSet.ao),
      height: this.dataTextureToCanvasTexture(dataSet.height),
      emission: dataSet.emission ? this.dataTextureToCanvasTexture(dataSet.emission) : null,
    };
  }

  /**
   * Convert a single DataTexture (FloatType) to a CanvasTexture.
   * Reads the Float32 pixel data, quantizes to 8-bit, draws on a canvas.
   */
  private dataTextureToCanvasTexture(dataTexture: THREE.DataTexture): THREE.CanvasTexture {
    const res = dataTexture.image.width;
    const floatData = dataTexture.image.data as Float32Array;

    const canvas = createCanvas();
    canvas.width = res;
    canvas.height = res;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(res, res);
    const pixels = imageData.data;

    // Float32 [0,1] → Uint8 [0,255]
    for (let i = 0; i < res * res; i++) {
      pixels[i * 4]     = Math.max(0, Math.min(255, Math.round(floatData[i * 4]     * 255)));
      pixels[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(floatData[i * 4 + 1] * 255)));
      pixels[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(floatData[i * 4 + 2] * 255)));
      pixels[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(floatData[i * 4 + 3] * 255)));
    }

    ctx.putImageData(imageData, 0, 0);

    const canvasTexture = new THREE.CanvasTexture(canvas);
    canvasTexture.wrapS = dataTexture.wrapS;
    canvasTexture.wrapT = dataTexture.wrapT;
    canvasTexture.magFilter = dataTexture.magFilter;
    canvasTexture.minFilter = dataTexture.minFilter;
    canvasTexture.name = dataTexture.name ?? 'Bake_Canvas';
    return canvasTexture;
  }

  /**
   * Generate a single procedural texture canvas for a specific channel.
   * Useful for generating individual maps without baking a full set.
   *
   * @param presetName - Material preset name for category detection
   * @param channel - Which PBR channel to generate
   * @param params - Material PBR parameters
   * @param resolution - Texture resolution
   * @returns CanvasTexture for the requested channel
   */
  bakeSingleChannel(
    presetName: string,
    channel: 'albedo' | 'normal' | 'roughness' | 'metallic' | 'ao' | 'height' | 'emission',
    params: MaterialPBRParams,
    resolution?: BakeResolution,
  ): THREE.CanvasTexture | THREE.DataTexture {
    const res = resolution ?? this.resolution;
    const category = this.inferCategory(presetName);

    // Generate the full set to get the one channel we need
    const fullSet = this.bakeProceduralSet(presetName, params, {
      resolution: res,
      category,
    });

    const dataTexture = fullSet[channel];
    if (!dataTexture) {
      // Emission might be null
      return this.createDataTexture(new Float32Array(res * res * 4), res, channel);
    }

    if (isDOMAvailable()) {
      return this.dataTextureToCanvasTexture(dataTexture);
    }
    return dataTexture;
  }

  /**
   * Quick bake: generate a full PBR set with defaults for a material category
   */
  quickBake(category: string, seed: number = 0): PBRTextureSet {
    const categoryDefaults = this.getCategoryDefaults(category);
    return this.bakePBRSet(categoryDefaults, { category, seed });
  }

  /**
   * Get default PBR parameters for a material category
   */
  private getCategoryDefaults(category: string): MaterialPBRParams {
    switch (category) {
      case 'metal':
        return {
          baseColor: new THREE.Color(0.75, 0.75, 0.78),
          roughness: 0.2,
          metallic: 1.0,
          aoStrength: 0.3,
          heightScale: 0.005,
          normalStrength: 0.5,
          emissionColor: null,
          emissionStrength: 0,
          noiseScale: 20.0,
          noiseDetail: 5,
          distortion: 0.1,
          warpStrength: 0.2,
        };
      case 'wood':
        return {
          baseColor: new THREE.Color(0.4, 0.25, 0.12),
          roughness: 0.7,
          metallic: 0.0,
          aoStrength: 0.5,
          heightScale: 0.02,
          normalStrength: 1.0,
          emissionColor: null,
          emissionStrength: 0,
          noiseScale: 3.0,
          noiseDetail: 6,
          distortion: 0.3,
          warpStrength: 0.5,
        };
      case 'stone':
        return {
          baseColor: new THREE.Color(0.5, 0.48, 0.44),
          roughness: 0.85,
          metallic: 0.0,
          aoStrength: 0.7,
          heightScale: 0.03,
          normalStrength: 1.5,
          emissionColor: null,
          emissionStrength: 0,
          noiseScale: 4.0,
          noiseDetail: 5,
          distortion: 0.2,
          warpStrength: 0.3,
        };
      case 'fabric':
        return {
          baseColor: new THREE.Color(0.4, 0.2, 0.15),
          roughness: 0.9,
          metallic: 0.0,
          aoStrength: 0.4,
          heightScale: 0.005,
          normalStrength: 0.5,
          emissionColor: null,
          emissionStrength: 0,
          noiseScale: 30.0,
          noiseDetail: 3,
          distortion: 0.0,
          warpStrength: 0.0,
        };
      case 'ceramic':
        return {
          baseColor: new THREE.Color(0.95, 0.93, 0.88),
          roughness: 0.15,
          metallic: 0.0,
          aoStrength: 0.2,
          heightScale: 0.002,
          normalStrength: 0.3,
          emissionColor: null,
          emissionStrength: 0,
          noiseScale: 8.0,
          noiseDetail: 3,
          distortion: 0.05,
          warpStrength: 0.1,
        };
      case 'glass':
        return {
          baseColor: new THREE.Color(0.95, 0.97, 1.0),
          roughness: 0.02,
          metallic: 0.0,
          aoStrength: 0.1,
          heightScale: 0.001,
          normalStrength: 0.2,
          emissionColor: null,
          emissionStrength: 0,
          noiseScale: 10.0,
          noiseDetail: 2,
          distortion: 0.0,
          warpStrength: 0.0,
        };
      case 'terrain':
        return {
          baseColor: new THREE.Color(0.35, 0.28, 0.18),
          roughness: 0.9,
          metallic: 0.0,
          aoStrength: 0.8,
          heightScale: 0.05,
          normalStrength: 2.0,
          emissionColor: null,
          emissionStrength: 0,
          noiseScale: 3.0,
          noiseDetail: 7,
          distortion: 0.4,
          warpStrength: 0.5,
        };
      case 'nature':
        return {
          baseColor: new THREE.Color(0.15, 0.4, 0.1),
          roughness: 0.65,
          metallic: 0.0,
          aoStrength: 0.5,
          heightScale: 0.02,
          normalStrength: 1.0,
          emissionColor: null,
          emissionStrength: 0,
          noiseScale: 5.0,
          noiseDetail: 5,
          distortion: 0.3,
          warpStrength: 0.4,
        };
      case 'creature':
        return {
          baseColor: new THREE.Color(0.55, 0.42, 0.35),
          roughness: 0.55,
          metallic: 0.0,
          aoStrength: 0.4,
          heightScale: 0.01,
          normalStrength: 0.8,
          emissionColor: null,
          emissionStrength: 0,
          noiseScale: 8.0,
          noiseDetail: 4,
          distortion: 0.2,
          warpStrength: 0.3,
        };
      default:
        return {
          baseColor: new THREE.Color(0.5, 0.5, 0.5),
          roughness: 0.5,
          metallic: 0.0,
          aoStrength: 0.5,
          heightScale: 0.02,
          normalStrength: 1.0,
          emissionColor: null,
          emissionStrength: 0,
          noiseScale: 5.0,
          noiseDetail: 4,
          distortion: 0.1,
          warpStrength: 0.2,
        };
    }
  }

  /**
   * Clear the bake cache
   */
  static clearCache(): void {
    for (const [, entry] of bakeCache) {
      entry.albedo.dispose();
      entry.normal.dispose();
      entry.roughness.dispose();
      entry.metallic.dispose();
      entry.ao.dispose();
      entry.height.dispose();
      entry.emission?.dispose();
    }
    bakeCache.clear();
  }

  /**
   * Check if baking is possible (requires DOM)
   */
  static canBake(): boolean {
    return isDOMAvailable();
  }
}
