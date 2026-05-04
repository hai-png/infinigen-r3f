/**
 * Infinigen R3F Port - Phase 10: Terrain Generation
 * Core Terrain Generator with Multi-Octave Noise, Erosion, and Tectonics
 *
 * Integrated with TerrainSurfaceShaderPipeline for optional GPU/CPU
 * SDF-based surface displacement after terrain mesh generation.
 */

import { Box3, Vector2, Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import { SeededRandom } from '../../core/util/math/index';
import { ErosionSystem } from '../erosion/ErosionSystem';
import { TerrainSurfaceShaderPipeline, DEFAULT_TERRAIN_SURFACE_CONFIG } from '../gpu/TerrainSurfaceShaderPipeline';
import type { TerrainSurfaceConfig } from '../gpu/TerrainSurfaceShaderPipeline';
import { SignedDistanceField } from '../sdf/sdf-operations';
import type { HeightMap, NormalMap } from '../types';
import { heightMapFromFloat32Array } from '../types';

export type MaskMap = Uint8Array;

export interface TerrainConfig {
  seed: number;
  width: number;
  height: number;
  scale: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  elevationOffset: number;
  erosionStrength: number;
  erosionIterations: number;
  tectonicPlates: number;
  seaLevel: number;
  /**
   * Configuration for the GPU surface shader pipeline.
   *
   * When provided (even as an empty object), the TerrainGenerator will create
   * a TerrainSurfaceShaderPipeline instance. Set `enabled: true` inside the
   * config to activate SDF-based surface displacement on generated meshes.
   *
   * If omitted or undefined, the pipeline is not created and terrain
   * generation behaves exactly as before (no breaking changes).
   */
  surfaceShaderConfig?: Partial<TerrainSurfaceConfig>;
}

export interface TerrainData {
  heightMap: HeightMap;
  normalMap: HeightMap;
  slopeMap: HeightMap;
  biomeMask: MaskMap;
  config: TerrainConfig;
  width: number;
  height: number;
}

export class TerrainGenerator {
  private rng: SeededRandom;
  private config: TerrainConfig;
  private width: number;
  private height: number;
  private permutationTable: number[];
  private cachedHeightMap: Float32Array | null = null;

  // -----------------------------------------------------------------------
  // Surface Shader Pipeline Integration
  // -----------------------------------------------------------------------

  /**
   * The GPU/CPU surface shader pipeline for SDF-based displacement.
   *
   * Created only when `surfaceShaderConfig` is provided in the constructor.
   * Call `initializeSurfaceShader()` before using `applySurfaceDisplacement()`.
   */
  private surfaceShaderPipeline: TerrainSurfaceShaderPipeline | null = null;

  /**
   * Whether the surface shader pipeline has been initialized.
   * Set to true after `initializeSurfaceShader()` completes (even if GPU init
   * failed — CPU fallback is still available).
   */
  private surfaceShaderInitialized: boolean = false;

  constructor(config: Partial<TerrainConfig> = {}) {
    this.config = {
      seed: 42,
      width: 512,
      height: 512,
      scale: 100,
      octaves: 6,
      persistence: 0.5,
      lacunarity: 2.0,
      elevationOffset: 0,
      erosionStrength: 0.3,
      erosionIterations: 20,
      tectonicPlates: 4,
      seaLevel: 0.3,
      ...config,
    };

    this.rng = new SeededRandom(this.config.seed);
    this.width = this.config.width;
    this.height = this.config.height;
    this.permutationTable = [];
    this.initPermutationTable();

    // Create the surface shader pipeline if config is provided
    if (this.config.surfaceShaderConfig !== undefined) {
      const mergedConfig: Partial<TerrainSurfaceConfig> = {
        ...DEFAULT_TERRAIN_SURFACE_CONFIG,
        ...this.config.surfaceShaderConfig,
      };
      this.surfaceShaderPipeline = new TerrainSurfaceShaderPipeline(mergedConfig);
    }
  }

  /**
   * Generate complete terrain data
   */
  public generate(): TerrainData {
    console.log(`Generating terrain with seed ${this.config.seed}...`);
    
    // 1. Generate base heightmap with noise
    const heightData = this.generateBaseHeightMap();
    
    // 2. Apply tectonic uplift
    this.applyTectonics(heightData);
    
    // 3. Apply erosion via ErosionSystem (consolidated entry point)
    this.applyErosion(heightData);
    
    // 4. Normalize and offset
    this.normalizeHeightMap(heightData);
    
    // 5. Calculate derived maps
    const normalData = this.calculateNormals(heightData);
    const slopeData = this.calculateSlopes(heightData);
    const biomeMask = this.generateBiomeMask(heightData, slopeData);

    // Cache raw heightmap for getHeightAt() lookups
    this.cachedHeightMap = heightData;

    return {
      heightMap: heightMapFromFloat32Array(heightData, this.width, this.height),
      normalMap: heightMapFromFloat32Array(normalData, this.width, this.height),
      slopeMap: heightMapFromFloat32Array(slopeData, this.width, this.height),
      biomeMask,
      config: { ...this.config },
      width: this.width,
      height: this.height,
    };
  }

  /**
   * Generate base heightmap using Fractal Brownian Motion
   */
  private generateBaseHeightMap(): Float32Array {
    const map = new Float32Array(this.width * this.height);
    const amplitude = 1.0;
    const frequency = 1.0 / this.config.scale;
    let maxVal = -Infinity;
    let minVal = Infinity;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let value = 0;
        let amp = amplitude;
        let freq = frequency;

        // Multi-octave noise
        for (let i = 0; i < this.config.octaves; i++) {
          const nx = x * freq;
          const ny = y * freq;
          value += this.perlinNoise(nx, ny) * amp;
          
          maxVal = Math.max(maxVal, value);
          minVal = Math.min(minVal, value);

          amp *= this.config.persistence;
          freq *= this.config.lacunarity;
        }

        map[y * this.width + x] = value;
      }
    }

    // Normalize to 0-1 range
    const range = maxVal - minVal;
    for (let i = 0; i < map.length; i++) {
      map[i] = (map[i] - minVal) / range;
    }

    return map;
  }

  /**
   * Apply tectonic plate simulation for mountain ranges
   */
  private applyTectonics(heightMap: Float32Array): void {
    if (this.config.tectonicPlates <= 0) return;

    // Generate plate centers
    const plates: { x: number; y: number; height: number; radius: number }[] = [];
    for (let i = 0; i < this.config.tectonicPlates; i++) {
      plates.push({
        x: this.rng.next() * this.width,
        y: this.rng.next() * this.height,
        height: 0.5 + this.rng.next() * 0.5,
        radius: (Math.min(this.width, this.height) / 3) * (0.5 + this.rng.next()),
      });
    }

    // Apply plate influence
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let uplift = 0;
        
        for (const plate of plates) {
          const dx = x - plate.x;
          const dy = y - plate.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < plate.radius) {
            const falloff = 1 - (dist / plate.radius);
            uplift += plate.height * falloff * falloff; // Quadratic falloff
          }
        }

        const idx = y * this.width + x;
        heightMap[idx] = Math.min(1.0, heightMap[idx] + uplift * 0.5);
      }
    }
  }

  /**
   * Apply erosion using the consolidated ErosionSystem
   *
   * Previously this method had inline hydraulic erosion code that duplicated
   * the logic in ErosionEnhanced.ts. Now it delegates to ErosionSystem which
   * is the single entry point for all erosion types.
   */
  private applyErosion(heightMap: Float32Array): void {
    const erosionSystem = new ErosionSystem(
      heightMap,
      this.width,
      this.height,
      {
        hydraulicErosionEnabled: this.config.erosionStrength > 0,
        thermalErosionEnabled: true,
        hydraulicIterations: this.config.erosionIterations,
        erodeSpeed: this.config.erosionStrength,
        depositSpeed: 0.3,
        seed: this.config.seed,
      }
    );

    erosionSystem.simulate();

    // Clamp values
    for (let i = 0; i < heightMap.length; i++) {
      heightMap[i] = Math.max(0, Math.min(1, heightMap[i]));
    }
  }

  /**
   * Normalize heightmap to 0-1 range with optional offset
   */
  private normalizeHeightMap(heightMap: Float32Array): void {
    let max = -Infinity;
    let min = Infinity;

    for (let i = 0; i < heightMap.length; i++) {
      max = Math.max(max, heightMap[i]);
      min = Math.min(min, heightMap[i]);
    }

    const range = max - min;
    for (let i = 0; i < heightMap.length; i++) {
      heightMap[i] = ((heightMap[i] - min) / range) + this.config.elevationOffset;
      heightMap[i] = Math.max(0, Math.min(1, heightMap[i]));
    }
  }

  /**
   * Calculate normal vectors for lighting
   */
  private calculateNormals(heightMap: Float32Array): Float32Array {
    const normals = new Float32Array(this.width * this.height * 3);
    const scale = 1.0 / this.config.scale;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const left = x > 0 ? heightMap[y * this.width + (x - 1)] : heightMap[y * this.width + x];
        const right = x < this.width - 1 ? heightMap[y * this.width + (x + 1)] : heightMap[y * this.width + x];
        const top = y > 0 ? heightMap[(y - 1) * this.width + x] : heightMap[y * this.width + x];
        const bottom = y < this.height - 1 ? heightMap[(y + 1) * this.width + x] : heightMap[y * this.width + x];

        const dx = (right - left) * scale;
        const dy = (bottom - top) * scale;
        const dz = 1.0;

        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        const idx = (y * this.width + x) * 3;
        normals[idx] = -dx / len;     // X
        normals[idx + 1] = -dy / len; // Y
        normals[idx + 2] = dz / len;  // Z
      }
    }

    return normals;
  }

  /**
   * Calculate slope values for biome determination
   */
  private calculateSlopes(heightMap: Float32Array): Float32Array {
    const slopes = new Float32Array(this.width * this.height);

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const center = heightMap[y * this.width + x];
        const right = x < this.width - 1 ? heightMap[y * this.width + (x + 1)] : center;
        const bottom = y < this.height - 1 ? heightMap[(y + 1) * this.width + x] : center;

        const dx = right - center;
        const dy = bottom - center;
        slopes[y * this.width + x] = Math.sqrt(dx * dx + dy * dy);
      }
    }

    // Normalize slopes
    let maxSlope = 0;
    for (let i = 0; i < slopes.length; i++) {
      maxSlope = Math.max(maxSlope, slopes[i]);
    }

    if (maxSlope > 0) {
      for (let i = 0; i < slopes.length; i++) {
        slopes[i] /= maxSlope;
      }
    }

    return slopes;
  }

  /**
   * Generate biome mask based on height and slope
   */
  private generateBiomeMask(heightMap: Float32Array, slopeMap: Float32Array): MaskMap {
    const mask = new Uint8Array(this.width * this.height);

    for (let i = 0; i < heightMap.length; i++) {
      const h = heightMap[i];
      const s = slopeMap[i];

      let biome = 0; // Deep water

      if (h < this.config.seaLevel - 0.1) biome = 0;      // Deep water
      else if (h < this.config.seaLevel) biome = 1;       // Shore
      else if (h < this.config.seaLevel + 0.1 && s < 0.1) biome = 2; // Beach
      else if (h < 0.4 && s < 0.2) biome = 3;             // Plains
      else if (h < 0.4 && s >= 0.2) biome = 4;            // Hills
      else if (h < 0.7 && s < 0.3) biome = 5;             // Forest
      else if (h < 0.7 && s >= 0.3) biome = 6;            // Mountain Forest
      else if (h < 0.85) biome = 7;                       // Mountain
      else biome = 8;                                     // Snow Peak

      mask[i] = biome;
    }

    return mask;
  }

  /**
   * Perlin noise implementation
   */
  private perlinNoise(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);

    const u = this.fade(x);
    const v = this.fade(y);

    const A = this.permutationTable[X] + Y;
    const B = this.permutationTable[X + 1] + Y;

    return this.lerp(
      v,
      this.lerp(u, this.grad(this.permutationTable[A], x, y), this.grad(this.permutationTable[B], x - 1, y)),
      this.lerp(u, this.grad(this.permutationTable[A + 1], x, y - 1), this.grad(this.permutationTable[B + 1], x - 1, y - 1))
    );
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  /**
   * Initialize permutation table for noise
   */
  private initPermutationTable(): void {
    this.permutationTable = new Array(512);
    const perm = new Array(256);
    
    for (let i = 0; i < 256; i++) {
      perm[i] = i;
    }

    // Shuffle based on seed
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }

    for (let i = 0; i < 512; i++) {
      this.permutationTable[i] = perm[i & 255];
    }
  }

  /**
   * Reseed the generator
   */
  public reseed(seed: number): void {
    this.rng = new SeededRandom(seed);
    this.config.seed = seed;
    this.initPermutationTable();
  }

  // =====================================================================
  // Surface Shader Pipeline — Public API
  // =====================================================================

  /**
   * Initialize the surface shader pipeline.
   *
   * Must be called before `applySurfaceDisplacement()`.  If no pipeline
   * was configured (i.e. `surfaceShaderConfig` was not provided), this
   * is a no-op that returns `false`.
   *
   * If WebGPU is unavailable the pipeline automatically falls back to
   * CPU-based displacement, which still works correctly.
   *
   * @param device - Optional pre-existing GPUDevice to share
   * @returns `true` if the GPU pipeline was created, `false` otherwise
   *          (CPU fallback or no pipeline configured)
   */
  async initializeSurfaceShader(device?: GPUDevice): Promise<boolean> {
    if (!this.surfaceShaderPipeline) {
      return false;
    }

    const gpuReady = await this.surfaceShaderPipeline.initialize(device);
    this.surfaceShaderInitialized = true;
    return gpuReady;
  }

  /**
   * Check whether the surface shader pipeline is enabled and initialized.
   *
   * Returns `true` only when a pipeline was configured AND
   * `initializeSurfaceShader()` has been called.
   */
  isSurfaceShaderReady(): boolean {
    return this.surfaceShaderPipeline !== null && this.surfaceShaderInitialized;
  }

  /**
   * Check whether the surface shader pipeline is enabled (config provided).
   *
   * Unlike `isSurfaceShaderReady()`, this returns `true` as soon as the
   * config is provided, even before `initializeSurfaceShader()` is called.
   */
  isSurfaceShaderEnabled(): boolean {
    return this.surfaceShaderPipeline !== null;
  }

  /**
   * Get the underlying TerrainSurfaceShaderPipeline instance.
   *
   * Returns `null` if no pipeline was configured.
   */
  getSurfaceShaderPipeline(): TerrainSurfaceShaderPipeline | null {
    return this.surfaceShaderPipeline;
  }

  /**
   * Apply SDF-based surface displacement to a terrain mesh geometry.
   *
   * This is the main integration point: after generating terrain data and
   * building a mesh, pass the geometry here to refine it.  The pipeline
   * will:
   *   1. Project vertices onto the true SDF isosurface (Newton step)
   *   2. Optionally add noise-based displacement for surface detail
   *   3. Recompute normals from the SDF gradient
   *
   * If the pipeline is disabled or not initialized, the original geometry
   * is returned unchanged (no breaking changes).
   *
   * @param geometry - The terrain mesh geometry to displace
   * @param sdf      - The signed distance field for the terrain
   * @returns        Displaced geometry, or the original if pipeline is off
   */
  async applySurfaceDisplacement(
    geometry: BufferGeometry,
    sdf: SignedDistanceField,
  ): Promise<BufferGeometry> {
    if (!this.surfaceShaderPipeline || !this.surfaceShaderInitialized) {
      return geometry;
    }

    try {
      return await this.surfaceShaderPipeline.computeDisplacement(geometry, sdf);
    } catch (err) {
      console.warn(
        '[TerrainGenerator] Surface displacement failed, returning original geometry:',
        err,
      );
      return geometry;
    }
  }

  /**
   * Build a SignedDistanceField from the cached heightmap data.
   *
   * Must be called after `generate()`.  The SDF represents the terrain
   * surface as a 3D field where:
   *   - Negative values = inside / below the surface
   *   - Positive values = outside / above the surface
   *   - Zero = on the surface
   *
   * The SDF uses a vertical-distance approximation which is efficient
   * and works well for heightmap terrain.  The displacement pipeline
   * will project vertices onto the zero-level isosurface.
   *
   * @param heightScale - Vertical scaling factor (matches the value used
   *                      when building the mesh, e.g. 100 or 35)
   * @param worldSize   - Horizontal world-space extent of the terrain
   * @param sdfResolution - Voxel resolution for the SDF grid (default 16)
   * @returns           A SignedDistanceField instance
   * @throws            Error if `generate()` has not been called yet
   */
  buildTerrainSDF(
    heightScale: number = 100,
    worldSize: number = 200,
    sdfResolution: number = 16,
  ): SignedDistanceField {
    if (!this.cachedHeightMap) {
      throw new Error(
        '[TerrainGenerator] Must call generate() before buildTerrainSDF()',
      );
    }

    const halfWorld = worldSize / 2;

    // 3D bounds: terrain spans [-halfWorld, halfWorld] in X and Z,
    // and [0, heightScale] in Y (with some padding)
    const padding = heightScale * 0.2;
    const bounds = new Box3(
      new Vector3(-halfWorld, -padding, -halfWorld),
      new Vector3(halfWorld, heightScale + padding, halfWorld),
    );

    const sdf = new SignedDistanceField({
      resolution: sdfResolution,
      bounds,
      maxDistance: heightScale + padding,
    });

    // Fill in SDF values from the heightmap
    for (let gz = 0; gz < sdf.gridSize[2]; gz++) {
      for (let gy = 0; gy < sdf.gridSize[1]; gy++) {
        for (let gx = 0; gx < sdf.gridSize[0]; gx++) {
          const worldPos = sdf.getPosition(gx, gy, gz);

          // Map world XZ to heightmap UV coordinates
          const hx = ((worldPos.x + halfWorld) / worldSize) * (this.width - 1);
          const hz = ((worldPos.z + halfWorld) / worldSize) * (this.height - 1);

          // Sample height at this position via bilinear interpolation
          const surfaceY = this.getHeightAt(
            Math.max(0, Math.min(this.width - 1.001, hx)),
            Math.max(0, Math.min(this.height - 1.001, hz)),
          ) * heightScale;

          // SDF value: positive above surface, negative below
          const sdfValue = worldPos.y - surfaceY;

          sdf.setValueAtGrid(gx, gy, gz, sdfValue);
        }
      }
    }

    return sdf;
  }

  /**
   * Update the surface shader configuration at runtime.
   *
   * Changes take effect on the next `applySurfaceDisplacement()` call.
   * Has no effect if no pipeline was configured.
   */
  setSurfaceShaderConfig(config: Partial<TerrainSurfaceConfig>): void {
    if (this.surfaceShaderPipeline) {
      this.surfaceShaderPipeline.setConfig(config);
    }
  }

  /**
   * Get the current surface shader configuration.
   *
   * Returns `null` if no pipeline was configured.
   */
  getSurfaceShaderConfig(): TerrainSurfaceConfig | null {
    if (!this.surfaceShaderPipeline) return null;
    return this.surfaceShaderPipeline.getConfig();
  }

  /**
   * Release all resources held by the surface shader pipeline.
   *
   * Call this when the TerrainGenerator is no longer needed.
   */
  dispose(): void {
    if (this.surfaceShaderPipeline) {
      this.surfaceShaderPipeline.dispose();
      this.surfaceShaderPipeline = null;
      this.surfaceShaderInitialized = false;
    }
  }

  // =====================================================================
  // Height Sampling
  // =====================================================================

  /**
   * Get height at specific coordinates
   */
  public getHeightAt(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    
    if (xi < 0 || xi >= this.width - 1 || yi < 0 || yi >= this.height - 1) {
      return 0;
    }

    if (!this.cachedHeightMap) {
      return 0;
    }

    const xf = x - xi;
    const yf = y - yi;

    const idx00 = yi * this.width + xi;
    const idx10 = yi * this.width + (xi + 1);
    const idx01 = (yi + 1) * this.width + xi;
    const idx11 = (yi + 1) * this.width + (xi + 1);

    // Bilinear interpolation
    const h00 = this.cachedHeightMap[idx00];
    const h10 = this.cachedHeightMap[idx10];
    const h01 = this.cachedHeightMap[idx01];
    const h11 = this.cachedHeightMap[idx11];

    return h00 * (1 - xf) * (1 - yf) +
           h10 * xf * (1 - yf) +
           h01 * (1 - xf) * yf +
           h11 * xf * yf;
  }
}
