/**
 * Missing Terrain SDF Elements
 *
 * Implements the 4 missing terrain elements from the original Princeton Infinigen
 * procedural terrain generator: LandTiles, WarpedRocks, UpsideDownMountain (new version),
 * and Atmosphere.
 *
 * Each element extends the TerrainElement base class with init() and evaluate()
 * methods, following the same patterns as the existing elements in
 * TerrainElementSystem.ts.
 *
 * @module terrain/sdf/MissingElements
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils, SeededNoiseGenerator } from '@/core/util/math/noise';
import { TERRAIN_MATERIALS } from './SDFPrimitives';
import { smoothUnion, smoothSubtraction, sdfSubtraction, sdfIntersection } from './SDFCombinators';
import { TerrainElement, ElementEvalResult } from './TerrainElementBase';

// ============================================================================
// LandTilesElement
// ============================================================================

/**
 * Voronoi-tiled heightmap terrain — the most complex element in original Infinigen.
 *
 * Uses 2D Voronoi decomposition of the XZ plane where each cell maps to a
 * pre-generated heightmap tile. Tiles are blended at boundaries using
 * distance-based weighted blending with `decaying_distance_weight`.
 *
 * Key algorithm:
 * - 2D Voronoi decomposition of the XZ plane
 * - Each cell maps to a pre-generated heightmap tile (Float32Array, tileResolution×tileResolution)
 * - Bilinear interpolation samples height from rotated tile
 * - Weighted blending between neighboring tiles (8 neighbors, distance-based weights)
 * - Multiple lattice layers for variation
 * - Height modification: clamps terrain below threshold with vertical ramp
 * - Beach/erosion/snow masks based on altitude with Perlin distortion
 * - Land process integration: applies erosion mask, snow mask, or lava mask
 *
 * All random state is consumed in init(); evaluate() is fully deterministic.
 *
 * @extends TerrainElement
 */
export class LandTilesElement extends TerrainElement {
  readonly name = 'LandTiles';
  readonly dependencies: string[] = [];

  // Tile parameters
  private tileResolution: number = 128;
  private tileSize: number = 50;
  private latticeFrequency: number = 0.008;
  private latticeJitter: number = 0.5;
  private emptyBelow: number = -5;
  private heightRamp: number = 5;
  private maskEnabled: boolean = true;
  private maskOctaves: number = 3;
  private maskFrequency: number = 0.01;
  private blendWidth: number = 0.8;

  // Number of Voronoi lattice layers
  private latticeLayers: number = 2;

  // Pre-computed Voronoi cell data
  private cellCenters: THREE.Vector2[] = [];
  private tileHeightmaps: Float32Array[] = [];
  private tileSeeds: number[] = [];

  // Pre-computed rotation for each tile (applied during sampling)
  private tileRotations: number[] = [];

  // Noise generators
  private tileNoise!: NoiseUtils;
  private maskNoise!: SeededNoiseGenerator;
  private warpNoise!: SeededNoiseGenerator;

  init(params: Record<string, any>, rng: SeededRandom): void {
    this.tileResolution = params.tileResolution ?? 128;
    this.tileSize = params.tileSize ?? 50;
    this.latticeFrequency = params.latticeFrequency ?? 0.008;
    this.latticeJitter = params.latticeJitter ?? 0.5;
    this.emptyBelow = params.emptyBelow ?? -5;
    this.heightRamp = params.heightRamp ?? 5;
    this.maskEnabled = params.maskEnabled ?? true;
    this.maskOctaves = params.maskOctaves ?? 3;
    this.maskFrequency = params.maskFrequency ?? 0.01;
    this.blendWidth = params.blendWidth ?? 0.8;
    this.latticeLayers = params.latticeLayers ?? 2;

    // Create noise generators
    const tileNoiseSeed = rng.nextInt(1, 999999);
    const maskSeed = rng.nextInt(1, 999999);
    const warpSeed = rng.nextInt(1, 999999);
    this.tileNoise = new NoiseUtils(tileNoiseSeed);
    this.maskNoise = new SeededNoiseGenerator(maskSeed);
    this.warpNoise = new SeededNoiseGenerator(warpSeed);

    // --- Generate Voronoi cell centers ---
    // We pre-compute enough cells to cover a large area
    // Grid extends from -5 to 5 in both X and Z (in lattice frequency units)
    const gridExtent = 12;
    this.cellCenters = [];
    this.tileHeightmaps = [];
    this.tileSeeds = [];
    this.tileRotations = [];

    for (let gx = -gridExtent; gx <= gridExtent; gx++) {
      for (let gz = -gridExtent; gz <= gridExtent; gz++) {
        // Jittered cell center in lattice space
        const jx = gx + 0.5 + (rng.next() - 0.5) * this.latticeJitter;
        const jz = gz + 0.5 + (rng.next() - 0.5) * this.latticeJitter;

        // Convert to world-space coordinates
        const worldX = jx / this.latticeFrequency;
        const worldZ = jz / this.latticeFrequency;

        this.cellCenters.push(new THREE.Vector2(worldX, worldZ));

        // Generate tile heightmap for this cell
        const tileSeed = rng.nextInt(1, 999999);
        this.tileSeeds.push(tileSeed);

        // Random rotation for the tile
        const rotation = rng.next() * Math.PI * 2;
        this.tileRotations.push(rotation);

        // Generate heightmap using FBM noise
        const tileRng = new SeededRandom(tileSeed);
        const tileNoiseGen = new NoiseUtils(tileRng.nextInt(1, 999999));
        const heightmap = this.generateTileHeightmap(tileNoiseGen, tileRng);
        this.tileHeightmaps.push(heightmap);
      }
    }
  }

  /**
   * Generate a single tile heightmap using multi-octave FBM noise.
   * Applies erosion simulation (simple thermal weathering) to the heightmap.
   */
  private generateTileHeightmap(noise: NoiseUtils, rng: SeededRandom): Float32Array {
    const res = this.tileResolution;
    const heightmap = new Float32Array(res * res);

    // FBM parameters per-tile (some variation)
    const frequency = 0.02 + rng.nextFloat(-0.005, 0.005);
    const amplitude = 8 + rng.nextFloat(-2, 2);
    const octaves = 5 + rng.nextInt(-1, 1);
    const lacunarity = 2.0;
    const persistence = 0.5;

    // Generate height values
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const nx = x / res;
        const nz = y / res;

        let h = 0;
        let amp = amplitude;
        let freq = frequency;

        for (let o = 0; o < octaves; o++) {
          h += noise.fbm(nx * freq * res, nz * freq * res, 0, 1) * amp;
          amp *= persistence;
          freq *= lacunarity;
        }

        heightmap[y * res + x] = h;
      }
    }

    // Apply simple thermal erosion (a few iterations)
    const talusAngle = 0.8;
    const erosionIterations = 3;
    for (let iter = 0; iter < erosionIterations; iter++) {
      const newHeightmap = new Float32Array(heightmap);
      for (let y = 1; y < res - 1; y++) {
        for (let x = 1; x < res - 1; x++) {
          const idx = y * res + x;
          const h = heightmap[idx];

          // Check 4-neighbors
          const neighbors = [
            heightmap[(y - 1) * res + x],
            heightmap[(y + 1) * res + x],
            heightmap[y * res + (x - 1)],
            heightmap[y * res + (x + 1)],
          ];

          let maxDiff = 0;
          let totalDiff = 0;
          for (const nh of neighbors) {
            const diff = h - nh;
            if (diff > talusAngle) {
              maxDiff = Math.max(maxDiff, diff);
              totalDiff += diff;
            }
          }

          if (totalDiff > 0) {
            // Erode: move material downhill
            newHeightmap[idx] = h - maxDiff * 0.5;
          }
        }
      }
      heightmap.set(newHeightmap);
    }

    return heightmap;
  }

  /**
   * Bilinear interpolation of heightmap at (u, v) in [0,1]×[0,1].
   */
  private sampleHeightmap(heightmap: Float32Array, u: number, v: number): number {
    const res = this.tileResolution;
    // Clamp to valid range
    u = Math.max(0, Math.min(0.9999, u));
    v = Math.max(0, Math.min(0.9999, v));

    const fx = u * res;
    const fy = v * res;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, res - 1);
    const y1 = Math.min(y0 + 1, res - 1);
    const dx = fx - x0;
    const dy = fy - y0;

    const h00 = heightmap[y0 * res + x0];
    const h10 = heightmap[y0 * res + x1];
    const h01 = heightmap[y1 * res + x0];
    const h11 = heightmap[y1 * res + x1];

    return h00 * (1 - dx) * (1 - dy) +
           h10 * dx * (1 - dy) +
           h01 * (1 - dx) * dy +
           h11 * dx * dy;
  }

  /**
   * Compute decaying distance weight for Voronoi cell blending.
   * Weight = max(0, 1 - (dist / blendWidth)^2), normalized.
   */
  private decayingDistanceWeight(dist: number): number {
    if (dist >= this.blendWidth) return 0;
    const t = dist / this.blendWidth;
    return (1 - t * t);
  }

  evaluate(point: THREE.Vector3): ElementEvalResult {
    // --- Find the containing Voronoi cell and 8 neighbors ---
    const px = point.x;
    const pz = point.z;

    // Compute distances to all cell centers
    const dists: { index: number; dist: number }[] = [];
    for (let i = 0; i < this.cellCenters.length; i++) {
      const c = this.cellCenters[i];
      const dx = px - c.x;
      const dz = pz - c.y;
      const dist = Math.sqrt(dx * dx + dz * dz);
      dists.push({ index: i, dist });
    }

    // Sort by distance and take the 9 closest (self + 8 neighbors)
    dists.sort((a, b) => a.dist - b.dist);
    const nearestCount = Math.min(9, dists.length);

    // --- Weighted blending of tile heights ---
    let totalWeight = 0;
    let blendedHeight = 0;

    for (let n = 0; n < nearestCount; n++) {
      const { index, dist } = dists[n];
      const weight = this.decayingDistanceWeight(dist);
      if (weight <= 0) continue;

      // Sample the tile heightmap
      const center = this.cellCenters[index];
      const rotation = this.tileRotations[index];

      // Compute local UV coordinates within the tile
      let localX = px - center.x;
      let localZ = pz - center.y;

      // Apply inverse rotation
      const cosR = Math.cos(-rotation);
      const sinR = Math.sin(-rotation);
      const rotX = localX * cosR - localZ * sinR;
      const rotZ = localX * sinR + localZ * cosR;

      // Map to [0,1] UV space within the tile
      const u = (rotX / this.tileSize) + 0.5;
      const v = (rotZ / this.tileSize) + 0.5;

      // Only sample if within tile bounds
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;

      const tileHeight = this.sampleHeightmap(this.tileHeightmaps[index], u, v);

      blendedHeight += tileHeight * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) {
      return {
        distance: Infinity,
        materialId: TERRAIN_MATERIALS.STONE,
        auxiliary: { tileHeight: 0 },
      };
    }

    blendedHeight /= totalWeight;

    // --- Height modification: clamp below emptyBelow with ramp ---
    if (blendedHeight < this.emptyBelow) {
      // Below the threshold: completely empty (no terrain)
      return {
        distance: Infinity,
        materialId: TERRAIN_MATERIALS.STONE,
        auxiliary: { tileHeight: blendedHeight, clamped: true },
      };
    } else if (blendedHeight < this.emptyBelow + this.heightRamp) {
      // In the ramp zone: smoothly transition from empty to terrain
      const rampFactor = (blendedHeight - this.emptyBelow) / this.heightRamp;
      blendedHeight = this.emptyBelow + blendedHeight * rampFactor;
    }

    // --- Compute SDF distance ---
    const surfaceY = blendedHeight;
    const distance = surfaceY - point.y;

    // --- Altitude-based masks ---
    let materialId: number = TERRAIN_MATERIALS.SOIL;
    let beachMask = 0;
    let erosionMask = 0;
    let snowMask = 0;

    if (this.maskEnabled) {
      // Distort the altitude with Perlin noise for natural variation
      const distortedAlt = blendedHeight +
        this.maskNoise.fbm(
          point.x * this.maskFrequency,
          point.y * this.maskFrequency,
          point.z * this.maskFrequency,
          { octaves: this.maskOctaves, gain: 0.5, lacunarity: 2.0 }
        ) * 2.0;

      // Beach mask: near water level
      const beachThreshold = 1.5;
      const beachWidth = 2.0;
      if (distortedAlt >= 0 && distortedAlt < beachThreshold + beachWidth) {
        beachMask = 1.0 - Math.min(1.0, Math.max(0, distortedAlt - beachThreshold) / beachWidth);
      }

      // Erosion mask: moderate altitude
      const erosionMin = 5;
      const erosionMax = 15;
      if (distortedAlt > erosionMin && distortedAlt < erosionMax) {
        erosionMask = 1.0 - Math.abs(distortedAlt - (erosionMin + erosionMax) / 2) / ((erosionMax - erosionMin) / 2);
      }

      // Snow mask: high altitude
      const snowThreshold = 20;
      if (distortedAlt > snowThreshold) {
        snowMask = Math.min(1.0, (distortedAlt - snowThreshold) / 5.0);
      }

      // Material assignment based on masks
      if (snowMask > 0.5) {
        materialId = TERRAIN_MATERIALS.SNOW;
      } else if (beachMask > 0.5) {
        materialId = TERRAIN_MATERIALS.SAND;
      } else if (erosionMask > 0.3) {
        materialId = TERRAIN_MATERIALS.DIRT;
      }
    }

    return {
      distance,
      materialId,
      auxiliary: {
        tileHeight: blendedHeight,
        beachMask,
        erosionMask,
        snowMask,
      },
    };
  }
}

// ============================================================================
// WarpedRocksElement
// ============================================================================

/**
 * Domain-warped Perlin noise with slope modulation.
 *
 * Produces rock-like formations using domain warping and slope-dependent
 * suppression, matching the original Infinigen's warped rocks algorithm.
 *
 * Key algorithm:
 * - Slope computation: terrain gradient → slope value
 * - SDF: (altitude - slope) * supressing_param + Perlin(warped_position) * content_scale
 * - Domain warp: 3-axis Perlin noise displacement of input coordinates
 * - Multiple lattice layers for variation
 * - Mask noise controlling coverage
 *
 * @extends TerrainElement
 */
export class WarpedRocksElement extends TerrainElement {
  readonly name = 'WarpedRocks';
  readonly dependencies: string[] = [];

  // Core parameters
  private frequency: number = 0.02;
  private amplitude: number = 5;
  private octaves: number = 5;

  // Domain warp
  private warpStrength: number = 0.5;
  private warpFrequency: number = 0.3;

  // Slope suppression
  private slopeSuppression: number = 0.8;
  private contentScale: number = 1.0;

  // Lattice
  private latticeFrequency: number = 0.01;

  // Mask
  private maskThreshold: number = 0.3;

  // Pre-computed lattice data
  private latticeCenters: THREE.Vector3[] = [];
  private latticeRadii: number[] = [];

  // Noise generators
  private noise!: SeededNoiseGenerator;
  private warpNoiseGen!: SeededNoiseGenerator;
  private maskNoise!: SeededNoiseGenerator;
  private slopeNoise!: SeededNoiseGenerator;

  init(params: Record<string, any>, rng: SeededRandom): void {
    this.frequency = params.frequency ?? 0.02;
    this.amplitude = params.amplitude ?? 5;
    this.octaves = params.octaves ?? 5;
    this.warpStrength = params.warpStrength ?? 0.5;
    this.warpFrequency = params.warpFrequency ?? 0.3;
    this.slopeSuppression = params.slopeSuppression ?? 0.8;
    this.contentScale = params.contentScale ?? 1.0;
    this.latticeFrequency = params.latticeFrequency ?? 0.01;
    this.maskThreshold = params.maskThreshold ?? 0.3;

    // Create noise generators with distinct seeds
    const noiseSeed = rng.nextInt(1, 999999);
    const warpSeed = rng.nextInt(1, 999999);
    const maskSeed = rng.nextInt(1, 999999);
    const slopeSeed = rng.nextInt(1, 999999);
    this.noise = new SeededNoiseGenerator(noiseSeed);
    this.warpNoiseGen = new SeededNoiseGenerator(warpSeed);
    this.maskNoise = new SeededNoiseGenerator(maskSeed);
    this.slopeNoise = new SeededNoiseGenerator(slopeSeed);

    // Pre-compute lattice centers for coverage
    this.latticeCenters = [];
    this.latticeRadii = [];
    const latticeCount = 8;
    for (let i = 0; i < latticeCount; i++) {
      const cx = rng.nextFloat(-100, 100);
      const cy = rng.nextFloat(-5, 15);
      const cz = rng.nextFloat(-100, 100);
      this.latticeCenters.push(new THREE.Vector3(cx, cy, cz));
      this.latticeRadii.push(rng.nextFloat(20, 60));
    }
  }

  evaluate(point: THREE.Vector3): ElementEvalResult {
    // --- Mask noise: controls where warped rocks appear ---
    const maskValue = this.maskNoise.fbm(
      point.x * this.latticeFrequency,
      point.y * this.latticeFrequency,
      point.z * this.latticeFrequency,
      { octaves: 3, gain: 0.5, lacunarity: 2.0 }
    );
    const maskNormalized = (maskValue + 1.0) * 0.5;

    if (maskNormalized < this.maskThreshold) {
      return {
        distance: Infinity,
        materialId: TERRAIN_MATERIALS.STONE,
        auxiliary: { maskValue: maskNormalized },
      };
    }

    // --- Domain warp: 3-axis Perlin noise displacement ---
    const warpX = this.warpNoiseGen.fbm(
      point.x * this.warpFrequency,
      point.y * this.warpFrequency,
      point.z * this.warpFrequency,
      { octaves: 3, gain: 0.5, lacunarity: 2.0 }
    ) * this.warpStrength;

    const warpY = this.warpNoiseGen.fbm(
      point.x * this.warpFrequency + 50,
      point.y * this.warpFrequency + 50,
      point.z * this.warpFrequency + 50,
      { octaves: 3, gain: 0.5, lacunarity: 2.0 }
    ) * this.warpStrength;

    const warpZ = this.warpNoiseGen.fbm(
      point.x * this.warpFrequency + 100,
      point.y * this.warpFrequency + 100,
      point.z * this.warpFrequency + 100,
      { octaves: 3, gain: 0.5, lacunarity: 2.0 }
    ) * this.warpStrength;

    const warpedPoint = new THREE.Vector3(
      point.x + warpX,
      point.y + warpY,
      point.z + warpZ,
    );

    // --- Compute slope: terrain gradient → slope value ---
    // Estimate gradient via finite differences on the noise field
    const eps = 0.5;
    const nx0 = this.noise.fbm(
      (point.x - eps) * this.frequency,
      point.y * this.frequency,
      point.z * this.frequency,
      { octaves: this.octaves, gain: 0.5, lacunarity: 2.0 }
    );
    const nx1 = this.noise.fbm(
      (point.x + eps) * this.frequency,
      point.y * this.frequency,
      point.z * this.frequency,
      { octaves: this.octaves, gain: 0.5, lacunarity: 2.0 }
    );
    const nz0 = this.noise.fbm(
      point.x * this.frequency,
      point.y * this.frequency,
      (point.z - eps) * this.frequency,
      { octaves: this.octaves, gain: 0.5, lacunarity: 2.0 }
    );
    const nz1 = this.noise.fbm(
      point.x * this.frequency,
      point.y * this.frequency,
      (point.z + eps) * this.frequency,
      { octaves: this.octaves, gain: 0.5, lacunarity: 2.0 }
    );

    const gradX = (nx1 - nx0) / (2 * eps);
    const gradZ = (nz1 - nz0) / (2 * eps);
    const slope = Math.sqrt(gradX * gradX + gradZ * gradZ);

    // --- Compute base altitude from noise ---
    const altitude = this.noise.fbm(
      point.x * this.frequency,
      point.y * this.frequency,
      point.z * this.frequency,
      { octaves: this.octaves, gain: 0.5, lacunarity: 2.0 }
    ) * this.amplitude;

    // --- SDF: (altitude - slope) * suppression + Perlin(warped) * contentScale ---
    const contentNoise = this.noise.fbm(
      warpedPoint.x * this.frequency,
      warpedPoint.y * this.frequency,
      warpedPoint.z * this.frequency,
      { octaves: this.octaves, gain: 0.5, lacunarity: 2.0 }
    );

    const sdf = (altitude - slope * this.amplitude) * this.slopeSuppression +
                contentNoise * this.contentScale * this.amplitude;

    // Convert to SDF convention: negative inside solid
    const distance = -sdf;

    // --- Lattice-based falloff ---
    let latticeFalloff = 0;
    let totalLatticeWeight = 0;
    for (let i = 0; i < this.latticeCenters.length; i++) {
      const dist2D = Math.sqrt(
        (point.x - this.latticeCenters[i].x) ** 2 +
        (point.z - this.latticeCenters[i].z) ** 2
      );
      const falloff = Math.max(0, 1.0 - dist2D / this.latticeRadii[i]);
      const smooth = falloff * falloff * (3 - 2 * falloff);
      latticeFalloff += smooth;
      totalLatticeWeight += 1;
    }

    if (totalLatticeWeight > 0 && latticeFalloff / totalLatticeWeight < 0.1) {
      return {
        distance: Infinity,
        materialId: TERRAIN_MATERIALS.STONE,
        auxiliary: { slope, altitude },
      };
    }

    // Material assignment
    let materialId: number = TERRAIN_MATERIALS.STONE;
    if (slope > 1.0) {
      materialId = TERRAIN_MATERIALS.COBBLESTONE;
    }

    return {
      distance,
      materialId,
      auxiliary: {
        slope,
        altitude,
        warpedPoint: warpedPoint.toArray(),
      },
    };
  }
}

// ============================================================================
// UpsideDownMountainElement (new version for the 9-element system)
// ============================================================================

/**
 * Floating mountain formations from original Infinigen.
 *
 * Creates pre-generated upside-down mountain shapes that float at a configurable
 * height. Mountains are placed via Voronoi-based random positioning with Perlin
 * perturbation for variation. Uses smooth_subtraction with prior SDF for
 * natural blending.
 *
 * Note: This is a separate element class from the UpsideDownMountainElement
 * already in TerrainElementSystem.ts, which uses a reflection-based approach.
 * This version uses pre-generated cone-like mountain meshes stored as
 * up/down/peak data, as in the original Infinigen.
 *
 * @extends TerrainElement
 */
export class UpsideDownMountainNewElement extends TerrainElement {
  readonly name = 'UpsideDownMountains';
  readonly dependencies = ['Ground', 'Mountains'];

  // Parameters
  private count: number = 3;
  private baseRadius: number = 8;
  private height: number = 10;
  private floatingHeight: number = 15;
  private perturbStrength: number = 0.3;
  private perturbFrequency: number = 0.1;

  // Pre-computed mountain data
  private mountains: {
    center: THREE.Vector3;
    radius: number;
    height: number;
    peakOffset: THREE.Vector3;
    noiseSeed: number;
  }[] = [];

  // Noise generators
  private perturbNoise!: SeededNoiseGenerator;

  init(params: Record<string, any>, rng: SeededRandom): void {
    this.count = params.count ?? 3;
    this.baseRadius = params.baseRadius ?? 8;
    this.height = params.height ?? 10;
    this.floatingHeight = params.floatingHeight ?? 15;
    this.perturbStrength = params.perturbStrength ?? 0.3;
    this.perturbFrequency = params.perturbFrequency ?? 0.1;

    // Create perturbation noise
    const perturbSeed = rng.nextInt(1, 999999);
    this.perturbNoise = new SeededNoiseGenerator(perturbSeed);

    // Pre-compute mountain placements via Voronoi-like random positioning
    this.mountains = [];
    for (let i = 0; i < this.count; i++) {
      // Random position in XZ plane, elevated at floatingHeight
      const cx = rng.nextFloat(-60, 60);
      const cz = rng.nextFloat(-60, 60);
      const cy = this.floatingHeight + rng.nextFloat(-3, 3);

      const radius = this.baseRadius * rng.nextFloat(0.6, 1.4);
      const height = this.height * rng.nextFloat(0.5, 1.5);

      // Peak offset for asymmetric mountain shapes
      const peakOffX = rng.nextFloat(-0.2, 0.2) * radius;
      const peakOffZ = rng.nextFloat(-0.2, 0.2) * radius;

      const noiseSeed = rng.nextInt(1, 999999);

      this.mountains.push({
        center: new THREE.Vector3(cx, cy, cz),
        radius,
        height,
        peakOffset: new THREE.Vector3(peakOffX, 0, peakOffZ),
        noiseSeed,
      });
    }
  }

  /**
   * Evaluate the SDF for an upside-down cone mountain.
   * The cone points downward: tip at the bottom, base at the top.
   */
  private evaluateMountainSDF(
    point: THREE.Vector3,
    mountain: {
      center: THREE.Vector3;
      radius: number;
      height: number;
      peakOffset: THREE.Vector3;
      noiseSeed: number;
    },
  ): number {
    // Transform to mountain-local coordinates
    const localPoint = point.clone().sub(mountain.center);
    localPoint.sub(mountain.peakOffset);

    // The mountain is an upside-down cone:
    // Base is at y=0 (local), tip points downward at y=-height
    // At y=0, the radius is `radius`; at y=-height, radius is 0

    // Compute the radius at this height
    const normalizedY = -localPoint.y / mountain.height; // 0 at base, 1 at tip
    const clampedY = Math.max(0, Math.min(1, normalizedY));
    const radiusAtHeight = mountain.radius * (1.0 - clampedY);

    // Distance in XZ plane from the axis
    const dist2D = Math.sqrt(localPoint.x * localPoint.x + localPoint.z * localPoint.z);

    // SDF of the cone: distance to the slanted surface
    // Inside the cone if dist2D < radiusAtHeight AND -height < localPoint.y < 0
    const radialDist = dist2D - radiusAtHeight;

    // Vertical distance (outside the cone vertically)
    const verticalDist = Math.max(
      localPoint.y,                    // above the base
      -(localPoint.y + mountain.height), // below the tip
    );

    // Combined SDF
    if (radialDist < 0 && verticalDist < 0) {
      // Inside the cone
      return Math.max(radialDist, -verticalDist);
    } else {
      // Outside: closest point on the surface
      const outsideRadial = Math.max(0, radialDist);
      const outsideVertical = Math.max(0, verticalDist);
      return Math.sqrt(outsideRadial * outsideRadial + outsideVertical * outsideVertical);
    }
  }

  evaluate(point: THREE.Vector3): ElementEvalResult {
    let combinedDist = Infinity;
    let combinedMaterial: number = TERRAIN_MATERIALS.STONE;

    for (const mountain of this.mountains) {
      // Compute Perlin perturbation for this point
      const perturbX = this.perturbNoise.fbm(
        point.x * this.perturbFrequency,
        point.y * this.perturbFrequency,
        point.z * this.perturbFrequency,
        { octaves: 3, gain: 0.5, lacunarity: 2.0 }
      ) * this.perturbStrength;

      const perturbY = this.perturbNoise.fbm(
        point.x * this.perturbFrequency + 50,
        point.y * this.perturbFrequency + 50,
        point.z * this.perturbFrequency + 50,
        { octaves: 3, gain: 0.5, lacunarity: 2.0 }
      ) * this.perturbStrength;

      const perturbZ = this.perturbNoise.fbm(
        point.x * this.perturbFrequency + 100,
        point.y * this.perturbFrequency + 100,
        point.z * this.perturbFrequency + 100,
        { octaves: 3, gain: 0.5, lacunarity: 2.0 }
      ) * this.perturbStrength;

      const perturbedPoint = new THREE.Vector3(
        point.x + perturbX,
        point.y + perturbY,
        point.z + perturbZ,
      );

      // Evaluate this mountain's SDF
      let dist = this.evaluateMountainSDF(perturbedPoint, mountain);

      // Apply additional noise for surface detail
      const detailNoise = new SeededNoiseGenerator(mountain.noiseSeed);
      const surfaceDetail = detailNoise.fbm(
        point.x * 0.05,
        point.y * 0.05,
        point.z * 0.05,
        { octaves: 4, gain: 0.5, lacunarity: 2.0 }
      ) * 0.5;
      dist += surfaceDetail;

      // Combine with other mountains via smooth union
      if (combinedDist === Infinity) {
        combinedDist = dist;
      } else {
        combinedDist = smoothUnion(combinedDist, dist, 2.0);
      }
    }

    // If no mountains are near, return Infinity
    if (combinedDist === Infinity) {
      return {
        distance: Infinity,
        materialId: TERRAIN_MATERIALS.STONE,
        auxiliary: { mountainCount: 0 },
      };
    }

    // Use smooth_subtraction with prior SDF for natural blending
    // Check if we have a ground/mountain dependency to blend with
    const groundElement = this.dependencyRefs.get('Ground');
    if (groundElement && groundElement.enabled) {
      const groundResult = groundElement.evaluate(point);
      // Smooth subtraction: carve the floating mountain out of the air,
      // but blend naturally where it meets the ground
      combinedDist = smoothSubtraction(groundResult.distance, combinedDist, 3.0);
    }

    // Material: stone for the body, snow at the peaks (which are the lowest parts)
    let materialId: number = TERRAIN_MATERIALS.STONE;
    // Check if near the tip (bottom) of any mountain for snow
    for (const mountain of this.mountains) {
      const localY = point.y - mountain.center.y;
      if (localY < -(mountain.height * 0.7)) {
        materialId = TERRAIN_MATERIALS.SNOW;
        break;
      }
    }

    return {
      distance: combinedDist,
      materialId,
      auxiliary: {
        mountainCount: this.mountains.length,
        inverted: combinedDist < 0,
      },
    };
  }
}

// ============================================================================
// AtmosphereElement
// ============================================================================

/**
 * Atmosphere boundary sphere — simple sphere SDF for atmosphere boundary.
 *
 * Creates a spherical boundary at a fixed height that represents the
 * atmosphere edge. Waterbody-aware: can adjust its boundary based on
 * waterbody parameters.
 *
 * This element is primarily used for volumetric rendering effects
 * (fog, haze) and to define the outer boundary of the scene.
 *
 * @extends TerrainElement
 */
export class AtmosphereElement extends TerrainElement {
  readonly name = 'Atmosphere';
  readonly dependencies: string[] = [];

  // Parameters
  private height: number = 100;
  private radius: number = 200;
  private waterAware: boolean = true;

  // Water-aware defaults
  private waterPlaneHeight: number = 0.5;

  // Noise for atmosphere variation
  private noise!: NoiseUtils;

  init(params: Record<string, any>, rng: SeededRandom): void {
    this.height = params.height ?? 100;
    this.radius = params.radius ?? 200;
    this.waterAware = params.waterAware ?? true;
    this.waterPlaneHeight = params.waterPlaneHeight ?? 0.5;

    const noiseSeed = rng.nextInt(1, 999999);
    this.noise = new NoiseUtils(noiseSeed);
  }

  evaluate(point: THREE.Vector3): ElementEvalResult {
    // --- Compute atmosphere sphere SDF ---
    // The atmosphere is a hemisphere centered at (0, height, 0) with given radius
    const center = new THREE.Vector3(0, this.height, 0);
    const localPoint = point.clone().sub(center);

    // Add subtle noise variation to the atmosphere boundary
    const noiseDisp = this.noise.fbm(
      point.x * 0.005,
      point.y * 0.005,
      point.z * 0.005,
      3
    ) * 5.0;

    const distance = localPoint.length() - (this.radius + noiseDisp);

    // --- Water-aware adjustment ---
    // If waterAware, the atmosphere boundary dips toward the water surface
    // near the water plane height, creating a thinner atmosphere layer there
    let adjustedDistance = distance;
    if (this.waterAware && point.y < this.waterPlaneHeight + 10) {
      // Below the water plane + buffer, the atmosphere is thinner
      const waterInfluence = Math.max(0, 1.0 - (point.y - this.waterPlaneHeight) / 10.0);
      adjustedDistance += waterInfluence * 20.0;
    }

    // Material: atmosphere doesn't have a traditional material, but we use ICE
    // to distinguish it from terrain
    const materialId: number = TERRAIN_MATERIALS.ICE;

    return {
      distance: adjustedDistance,
      materialId,
      auxiliary: {
        atmosphereBoundary: -adjustedDistance,
        waterAware: this.waterAware,
        nominalHeight: this.height,
        nominalRadius: this.radius,
      },
    };
  }
}
