/**
 * Unified Cave Generation System
 *
 * Integrates the asset-based cave generation with the SDF CaveElement system
 * from TerrainElementSystem.ts. Provides a high-level API that supports both:
 *
 * 1. **L-system caves**: Using the existing LSystemCaveGenerator grammar system
 *    for tunnel generation (matches original Infinigen's PCFG grammar approach)
 * 2. **Mesh-based caves**: Converting arbitrary mesh geometry to SDF via
 *    voxelization (like the original's `mesh_to_sdf`)
 *
 * The unified CaveGenerator uses CaveElement as the primary SDF backend for
 * lattice-based tunnels, and LSystemCaveGenerator for grammar-driven paths.
 * It produces auxiliary outputs including:
 * - Cave occupancy data (boolean per-voxel)
 * - Cave tag data for the terrain tag system
 * - Cave entrance positions (for scatter placement)
 *
 * Original Infinigen cave pipeline:
 *   1. L-system (PCFG) grammar → tunnel paths
 *   2. Paths → Blender mesh via skin modifier
 *   3. Mesh → SDF via mesh_to_sdf (voxel occupancy grid)
 *   4. Cave SDF subtracted from Ground/LandTiles SDF with smooth blending
 *   5. Cave is a "special element" that only exists as an operation on other elements
 *
 * @module terrain/caves/CaveGenerator
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils } from '@/core/util/math/noise';
import {
  CaveElement,
  ElementEvalResult,
} from '../sdf/TerrainElementSystem';
import {
  LSystemCaveGenerator,
  DEFAULT_CAVE_GRAMMAR,
  CaveGrammarConfig,
  CaveTunnelData,
} from '../sdf/LSystemCave';
import { smoothUnion } from '../sdf/SDFCombinators';

// ============================================================================
// Types
// ============================================================================

/**
 * Original Infinigen Caves element parameters.
 * These match the parameters exposed by the original Princeton Infinigen's
 * `Caves` element in its PCFG grammar definition.
 */
export interface InfinigenCaveParams {
  /** Number of lattice cells for tunnel placement */
  n_lattice: number;
  /** Whether caves are primarily horizontal */
  is_horizontal: boolean;
  /** Tunnel density (0–1) */
  frequency: number;
  /** Path variation / randomness (0–1) */
  randomness: number;
  /** Vertical offset from terrain surface */
  height_offset: number;
  /** How deep caves go (negative Y relative to surface) */
  deepest_level: number;
  /** How tunnel radius changes with depth (scale factor per level) */
  scale_increase: number;
  /** Noise octaves for surface roughness */
  noise_octaves: number;
  /** Noise scale for surface roughness */
  noise_scale: number;
  /** Noise frequency for surface roughness */
  noise_freq: number;
  /** Blend factor with surrounding terrain (smooth subtraction k) */
  smoothness: number;
}

/**
 * Configuration for the unified CaveGenerator.
 * Supports both L-system and mesh-based cave generation modes.
 */
export interface UnifiedCaveConfig {
  /** Generation mode */
  mode: 'lsystem' | 'mesh' | 'lattice';

  // --- Infinigen Caves element parameters ---
  /** Original Infinigen parameters (overrides individual fields when set) */
  infinigenParams?: Partial<InfinigenCaveParams>;

  /** Number of lattice cells (default 5) */
  n_lattice: number;
  /** Whether caves are primarily horizontal (default true) */
  is_horizontal: boolean;
  /** Tunnel density 0–1 (default 0.3) */
  frequency: number;
  /** Path variation 0–1 (default 0.5) */
  randomness: number;
  /** Vertical offset from terrain (default -5) */
  height_offset: number;
  /** How deep caves go (default -30) */
  deepest_level: number;
  /** Radius increase with depth (default 1.2) */
  scale_increase: number;
  /** Surface roughness octaves (default 4) */
  noise_octaves: number;
  /** Surface roughness scale (default 1.0) */
  noise_scale: number;
  /** Surface roughness frequency (default 0.1) */
  noise_freq: number;
  /** Blend smoothness with terrain (default 2.0) */
  smoothness: number;

  // --- L-system specific ---
  /** L-system grammar configuration (for lsystem mode) */
  grammarConfig?: Partial<CaveGrammarConfig>;

  // --- Lattice specific ---
  /** Lattice spacing for tunnel waypoints (default 20) */
  latticeSpacing: number;
  /** Jitter for lattice positions (default 5) */
  latticeJitter: number;
  /** Base tunnel radius (default 3.0) */
  tunnelRadius: number;
  /** Radius variation factor (default 0.5) */
  radiusVariation: number;

  // --- Mesh-based specific ---
  /** Input mesh geometry (for mesh mode) */
  meshGeometry?: THREE.BufferGeometry;
  /** Voxelization resolution (default 64) */
  voxelResolution: number;

  // --- General ---
  /** Random seed */
  seed: number;
  /** Terrain bounds */
  bounds: THREE.Box3;

  // --- Decoration parameters ---
  /** Enable stalactites */
  enableStalactites: boolean;
  /** Enable stalagmites */
  enableStalagmites: boolean;
  /** Stalactite density */
  stalactiteDensity: number;
  /** Stalagmite density */
  stalagmiteDensity: number;
  /** Enable cave decorations */
  enableDecorations: boolean;
  /** Decoration density */
  decorationDensity: number;
  /** Enable cave lighting */
  enableLighting: boolean;
  /** Light intensity */
  lightIntensity: number;
  /** Light color */
  lightColor: THREE.Color;
}

/**
 * Cave decoration descriptor.
 */
export interface CaveDecoration {
  type: 'stalactite' | 'stalagmite' | 'crystal' | 'rock' | 'puddle';
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  material?: THREE.Material;
}

/**
 * Output of the unified cave generation.
 * Contains the cave mesh, SDF data, and auxiliary outputs.
 */
export interface CaveGenerationResult {
  /** Cave surface mesh (extracted from SDF) */
  mesh: THREE.Mesh;
  /** Cave SDF data (signed distances on a voxel grid) */
  sdfData: Float32Array;
  /** SDF grid dimensions [width, height, depth] */
  sdfDimensions: [number, number, number];
  /** Cave occupancy grid (1 = inside cave, 0 = outside) */
  occupancy: Float32Array;
  /** Cave tag grid (material tags per voxel for terrain tag system) */
  tags: Uint8Array;
  /** Cave entrance positions (world-space, for scatter placement) */
  entrancePositions: THREE.Vector3[];
  /** Cave decorations */
  decorations: CaveDecoration[];
  /** The underlying CaveElement (for SDF composition) */
  caveElement: CaveElement;
  /** L-system tunnel data (if lsystem mode was used) */
  tunnelData?: CaveTunnelData;
  /** Blend factor for smooth subtraction */
  smoothness: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default cave generation configuration.
 */
export const DEFAULT_CAVE_CONFIG: UnifiedCaveConfig = {
  mode: 'lattice',
  n_lattice: 5,
  is_horizontal: true,
  frequency: 0.3,
  randomness: 0.5,
  height_offset: -5,
  deepest_level: -30,
  scale_increase: 1.2,
  noise_octaves: 4,
  noise_scale: 1.0,
  noise_freq: 0.1,
  smoothness: 2.0,
  latticeSpacing: 20,
  latticeJitter: 5,
  tunnelRadius: 3.0,
  radiusVariation: 0.5,
  voxelResolution: 64,
  seed: 42,
  bounds: new THREE.Box3(
    new THREE.Vector3(-50, -50, -50),
    new THREE.Vector3(50, 50, 50)
  ),
  enableStalactites: true,
  enableStalagmites: true,
  stalactiteDensity: 0.2,
  stalagmiteDensity: 0.2,
  enableDecorations: true,
  decorationDensity: 0.1,
  enableLighting: true,
  lightIntensity: 0.5,
  lightColor: new THREE.Color(0xffaa88),
};

// ============================================================================
// UnifiedCaveGenerator
// ============================================================================

/**
 * Unified cave generation system that integrates both L-system and lattice-based
 * cave generation with the SDF CaveElement system.
 *
 * Usage:
 * ```typescript
 * const generator = new UnifiedCaveGenerator();
 * const result = generator.generate(config);
 * // result.mesh — cave surface mesh
 * // result.sdfData — voxel SDF data
 * // result.occupancy — boolean occupancy grid
 * // result.tags — material tag grid
 * // result.entrancePositions — cave entrance locations
 * // result.caveElement — CaveElement for SDF composition
 * ```
 */
export class UnifiedCaveGenerator {
  private config: UnifiedCaveConfig;
  private rng: SeededRandom;
  private noise: NoiseUtils;
  private decorations: CaveDecoration[] = [];

  constructor(config: Partial<UnifiedCaveConfig> = {}) {
    this.config = { ...DEFAULT_CAVE_CONFIG, ...config };

    // Apply Infinigen params if provided
    if (this.config.infinigenParams) {
      this.applyInfinigenParams(this.config.infinigenParams);
    }

    this.rng = new SeededRandom(this.config.seed);
    this.noise = new NoiseUtils(this.config.seed);
  }

  // --------------------------------------------------------------------------
  // Main Generation API
  // --------------------------------------------------------------------------

  /**
   * Generate caves according to the configuration.
   * Returns cave mesh + SDF data + auxiliary outputs.
   */
  generate(config?: Partial<UnifiedCaveConfig>): CaveGenerationResult {
    // Merge any additional config
    if (config) {
      this.config = { ...this.config, ...config };
      if (config.infinigenParams) {
        this.applyInfinigenParams(config.infinigenParams);
      }
      if (config.seed !== undefined && config.seed !== this.rng.seed) {
        this.rng = new SeededRandom(config.seed);
        this.noise = new NoiseUtils(config.seed);
      }
    }

    // Step 1: Create the CaveElement with appropriate backend
    const caveElement = this.createCaveElement();

    // Step 2: Generate SDF grid data
    const { sdfData, dimensions } = this.evaluateCaveSDF(caveElement);

    // Step 3: Generate occupancy grid
    const occupancy = this.computeOccupancy(sdfData);

    // Step 4: Generate tag grid
    const tags = this.computeTags(sdfData, occupancy);

    // Step 5: Detect cave entrances
    const entrancePositions = this.detectEntrances(sdfData, dimensions);

    // Step 6: Extract cave mesh from SDF
    const mesh = this.extractCaveMesh(sdfData, dimensions);

    // Step 7: Generate decorations
    const decorationBounds = this.computeDecorationBounds(entrancePositions);
    this.decorations = this.generateDecorations(decorationBounds);

    // Step 8: Generate L-system tunnel data if applicable
    let tunnelData: CaveTunnelData | undefined;
    if (this.config.mode === 'lsystem') {
      tunnelData = this.generateLSystemTunnels();
    }

    return {
      mesh,
      sdfData,
      sdfDimensions: dimensions,
      occupancy,
      tags,
      entrancePositions,
      decorations: this.decorations,
      caveElement,
      tunnelData,
      smoothness: this.config.smoothness,
    };
  }

  /**
   * Apply cave SDF as a subtraction operation on terrain SDF.
   * This implements the original Infinigen's approach where the cave is a
   * "special element" that only exists as an operation on other elements.
   */
  applyCaveToTerrain(
    terrainSDF: Float32Array,
    caveSDF: Float32Array,
    smoothness: number = this.config.smoothness
  ): Float32Array {
    const result = new Float32Array(terrainSDF.length);
    for (let i = 0; i < terrainSDF.length; i++) {
      // Smooth subtraction: terrain - cave
      // In SDF terms: max(terrain, -cave) with smooth blending
      if (smoothness > 0) {
        result[i] = this.smoothSubtraction(terrainSDF[i], caveSDF[i], smoothness);
      } else {
        // Sharp subtraction
        result[i] = Math.max(terrainSDF[i], -caveSDF[i]);
      }
    }
    return result;
  }

  // --------------------------------------------------------------------------
  // CaveElement Creation
  // --------------------------------------------------------------------------

  /**
   * Create a CaveElement configured according to the current settings.
   * The CaveElement serves as the SDF evaluation backend for the cave system.
   */
  private createCaveElement(): CaveElement {
    const caveElement = new CaveElement();
    const rng = new SeededRandom(this.config.seed);

    const params: Record<string, any> = {
      bounds: this.config.bounds,
      latticeSpacing: this.config.latticeSpacing,
      latticeJitter: this.config.latticeJitter * this.config.randomness,
      tunnelRadius: this.config.tunnelRadius,
      radiusVariation: this.config.radiusVariation,
      tunnelCount: Math.max(1, Math.round(this.config.n_lattice * this.config.frequency * 3)),
      branchMaxCount: Math.round(this.config.randomness * 5),
      branchProbability: this.config.randomness * 0.6,
    };

    caveElement.init(params, rng);
    return caveElement;
  }

  // --------------------------------------------------------------------------
  // SDF Evaluation
  // --------------------------------------------------------------------------

  /**
   * Evaluate the CaveElement over a voxel grid to produce SDF data.
   */
  private evaluateCaveSDF(
    caveElement: CaveElement
  ): { sdfData: Float32Array; dimensions: [number, number, number] } {
    const bounds = this.config.bounds;
    const size = bounds.getSize(new THREE.Vector3());
    const min = bounds.min;

    // Determine voxel resolution based on mode
    let resolution = this.config.voxelResolution;
    if (this.config.mode === 'lsystem') {
      resolution = 48; // L-system typically needs moderate resolution
    } else if (this.config.mode === 'mesh') {
      resolution = this.config.voxelResolution;
    }

    const voxelSize = Math.max(size.x, size.y, size.z) / resolution;
    const dimX = Math.ceil(size.x / voxelSize);
    const dimY = Math.ceil(size.y / voxelSize);
    const dimZ = Math.ceil(size.z / voxelSize);
    const dimensions: [number, number, number] = [dimX, dimY, dimZ];

    const sdfData = new Float32Array(dimX * dimY * dimZ);

    for (let z = 0; z < dimZ; z++) {
      for (let y = 0; y < dimY; y++) {
        for (let x = 0; x < dimX; x++) {
          const worldPos = new THREE.Vector3(
            min.x + (x + 0.5) * voxelSize,
            min.y + (y + 0.5) * voxelSize,
            min.z + (z + 0.5) * voxelSize
          );

          const result = caveElement.evaluate(worldPos);
          const idx = z * dimX * dimY + y * dimX + x;
          sdfData[idx] = result.distance;
        }
      }
    }

    // If L-system mode, blend in the L-system tunnel SDF
    if (this.config.mode === 'lsystem') {
      const lsystemSDF = this.evaluateLSystemSDF(dimensions, voxelSize, min);
      for (let i = 0; i < sdfData.length; i++) {
        sdfData[i] = smoothUnion(sdfData[i], lsystemSDF[i], this.config.smoothness);
      }
    }

    // If mesh mode, blend in the mesh-derived SDF
    if (this.config.mode === 'mesh' && this.config.meshGeometry) {
      const meshSDF = this.voxelizeMeshToSDF(
        this.config.meshGeometry,
        dimensions,
        voxelSize,
        min
      );
      for (let i = 0; i < sdfData.length; i++) {
        sdfData[i] = smoothUnion(sdfData[i], meshSDF[i], this.config.smoothness);
      }
    }

    // Apply surface roughness noise to the SDF
    this.applySurfaceNoise(sdfData, dimensions, voxelSize, min);

    return { sdfData, dimensions };
  }

  /**
   * Evaluate L-system tunnels as an SDF volume.
   */
  private evaluateLSystemSDF(
    dimensions: [number, number, number],
    voxelSize: number,
    origin: THREE.Vector3
  ): Float32Array {
    const [dimX, dimY, dimZ] = dimensions;
    const sdfData = new Float32Array(dimX * dimY * dimZ).fill(1e6);

    const lsystemGen = new LSystemCaveGenerator();
    const tunnelData = lsystemGen.generate(
      this.config.seed + 1000,
      this.config.grammarConfig ?? DEFAULT_CAVE_GRAMMAR
    );

    // Evaluate each tunnel segment as a capped cylinder SDF
    for (let i = 0; i < tunnelData.points.length - 1; i++) {
      const p0 = tunnelData.points[i];
      const p1 = tunnelData.points[i + 1];
      const r0 = tunnelData.radii[i];
      const r1 = tunnelData.radii[i + 1];

      // Compute bounding box of this segment
      const segMin = new THREE.Vector3(
        Math.min(p0.x, p1.x) - Math.max(r0, r1) - 1,
        Math.min(p0.y, p1.y) - Math.max(r0, r1) - 1,
        Math.min(p0.z, p1.z) - Math.max(r0, r1) - 1
      );
      const segMax = new THREE.Vector3(
        Math.max(p0.x, p1.x) + Math.max(r0, r1) + 1,
        Math.max(p0.y, p1.y) + Math.max(r0, r1) + 1,
        Math.max(p0.z, p1.z) + Math.max(r0, r1) + 1
      );

      // Convert to grid indices
      const gxMin = Math.max(0, Math.floor((segMin.x - origin.x) / voxelSize));
      const gyMin = Math.max(0, Math.floor((segMin.y - origin.y) / voxelSize));
      const gzMin = Math.max(0, Math.floor((segMin.z - origin.z) / voxelSize));
      const gxMax = Math.min(dimX - 1, Math.ceil((segMax.x - origin.x) / voxelSize));
      const gyMax = Math.min(dimY - 1, Math.ceil((segMax.y - origin.y) / voxelSize));
      const gzMax = Math.min(dimZ - 1, Math.ceil((segMax.z - origin.z) / voxelSize));

      const segment = new THREE.Vector3().subVectors(p1, p0);
      const segLenSq = segment.lengthSq();

      for (let gz = gzMin; gz <= gzMax; gz++) {
        for (let gy = gyMin; gy <= gyMax; gy++) {
          for (let gx = gxMin; gx <= gxMax; gx++) {
            const idx = gz * dimX * dimY + gy * dimX + gx;
            const worldPos = new THREE.Vector3(
              origin.x + (gx + 0.5) * voxelSize,
              origin.y + (gy + 0.5) * voxelSize,
              origin.z + (gz + 0.5) * voxelSize
            );

            // Distance to line segment
            let t = 0;
            if (segLenSq > 0) {
              t = Math.max(0, Math.min(1,
                worldPos.clone().sub(p0).dot(segment) / segLenSq
              ));
            }
            const closestPoint = p0.clone().add(segment.clone().multiplyScalar(t));
            const distToAxis = worldPos.distanceTo(closestPoint);
            const radius = r0 + (r1 - r0) * t;

            // SDF of capsule-like segment
            const dist = distToAxis - radius;
            sdfData[idx] = Math.min(sdfData[idx], dist);
          }
        }
      }
    }

    return sdfData;
  }

  /**
   * Voxelize a mesh to SDF data (like the original Infinigen's mesh_to_sdf).
   * Converts arbitrary mesh geometry to a voxel occupancy/SDF grid.
   */
  private voxelizeMeshToSDF(
    geometry: THREE.BufferGeometry,
    dimensions: [number, number, number],
    voxelSize: number,
    origin: THREE.Vector3
  ): Float32Array {
    const [dimX, dimY, dimZ] = dimensions;
    const sdfData = new Float32Array(dimX * dimY * dimZ).fill(1e6);

    // Get mesh vertices and indices
    const posAttr = geometry.getAttribute('position');
    const indexAttr = geometry.getIndex();

    if (!posAttr) return sdfData;

    // Build a list of triangles
    const triangles: THREE.Vector3[][] = [];

    if (indexAttr) {
      for (let i = 0; i < indexAttr.count; i += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(posAttr, indexAttr.getX(i));
        const b = new THREE.Vector3().fromBufferAttribute(posAttr, indexAttr.getX(i + 1));
        const c = new THREE.Vector3().fromBufferAttribute(posAttr, indexAttr.getX(i + 2));
        triangles.push([a, b, c]);
      }
    } else {
      for (let i = 0; i < posAttr.count; i += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(posAttr, i);
        const b = new THREE.Vector3().fromBufferAttribute(posAttr, i + 1);
        const c = new THREE.Vector3().fromBufferAttribute(posAttr, i + 2);
        triangles.push([a, b, c]);
      }
    }

    // For each voxel, compute approximate SDF using point-to-triangle distance
    // This is a simplified approach; a full mesh_to_sdf would use winding numbers
    for (let z = 0; z < dimZ; z++) {
      for (let y = 0; y < dimY; y++) {
        for (let x = 0; x < dimX; x++) {
          const worldPos = new THREE.Vector3(
            origin.x + (x + 0.5) * voxelSize,
            origin.y + (y + 0.5) * voxelSize,
            origin.z + (z + 0.5) * voxelSize
          );

          let minDist = Infinity;

          for (const tri of triangles) {
            const dist = this.pointToTriangleDistance(worldPos, tri[0], tri[1], tri[2]);
            minDist = Math.min(minDist, dist);
          }

          const idx = z * dimX * dimY + y * dimX + x;
          sdfData[idx] = minDist;
        }
      }
    }

    // Determine inside/outside using ray casting (winding number approximation)
    // For each voxel, cast a ray in +X direction and count intersections
    for (let z = 0; z < dimZ; z++) {
      for (let y = 0; y < dimY; y++) {
        for (let x = 0; x < dimX; x++) {
          const idx = z * dimX * dimY + y * dimX + x;
          const worldPos = new THREE.Vector3(
            origin.x + (x + 0.5) * voxelSize,
            origin.y + (y + 0.5) * voxelSize,
            origin.z + (z + 0.5) * voxelSize
          );

          // Count intersections with mesh triangles along +X ray
          let intersections = 0;
          const rayOrigin = worldPos;
          const rayDir = new THREE.Vector3(1, 0, 0);

          for (const tri of triangles) {
            if (this.rayTriangleIntersection(rayOrigin, rayDir, tri[0], tri[1], tri[2])) {
              intersections++;
            }
          }

          // Odd number of intersections = inside the mesh
          if (intersections % 2 === 1) {
            sdfData[idx] = -Math.abs(sdfData[idx]);
          }
        }
      }
    }

    return sdfData;
  }

  /**
   * Apply surface roughness noise to the cave SDF.
   * Uses the noise_octaves, noise_scale, and noise_freq parameters.
   */
  private applySurfaceNoise(
    sdfData: Float32Array,
    dimensions: [number, number, number],
    voxelSize: number,
    origin: THREE.Vector3
  ): void {
    const [dimX, dimY, dimZ] = dimensions;

    for (let z = 0; z < dimZ; z++) {
      for (let y = 0; y < dimY; y++) {
        for (let x = 0; x < dimX; x++) {
          const idx = z * dimX * dimY + y * dimX + x;
          const dist = sdfData[idx];

          // Only apply noise near the surface (within ~3 voxels)
          if (Math.abs(dist) < voxelSize * 3) {
            const worldPos = new THREE.Vector3(
              origin.x + (x + 0.5) * voxelSize,
              origin.y + (y + 0.5) * voxelSize,
              origin.z + (z + 0.5) * voxelSize
            );

            const noiseVal = this.noise.fbm(
              worldPos.x * this.config.noise_freq * this.config.noise_scale,
              worldPos.y * this.config.noise_freq * this.config.noise_scale,
              worldPos.z * this.config.noise_freq * this.config.noise_scale,
              this.config.noise_octaves
            );

            // Displacement proportional to distance from surface
            const displacement = noiseVal * voxelSize * 0.5;
            sdfData[idx] += displacement;
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Occupancy & Tags
  // --------------------------------------------------------------------------

  /**
   * Compute boolean occupancy grid from SDF data.
   * Inside the cave (SDF < 0) → 1.0, outside → 0.0.
   */
  private computeOccupancy(sdfData: Float32Array): Float32Array {
    const occupancy = new Float32Array(sdfData.length);
    for (let i = 0; i < sdfData.length; i++) {
      occupancy[i] = sdfData[i] < 0 ? 1.0 : 0.0;
    }
    return occupancy;
  }

  /**
   * Compute material tag grid from SDF and occupancy data.
   * Tags indicate surface type for the terrain tag system:
   *   0 = outside cave
   *   1 = cave interior (air)
   *   2 = cave wall (near surface, inside)
   *   3 = cave entrance (near surface, near terrain surface)
   */
  private computeTags(sdfData: Float32Array, occupancy: Float32Array): Uint8Array {
    const tags = new Uint8Array(sdfData.length);
    for (let i = 0; i < sdfData.length; i++) {
      if (occupancy[i] > 0) {
        const dist = sdfData[i];
        if (dist > -0.5) {
          // Near cave surface → wall tag
          tags[i] = 2;
        } else {
          // Deep inside → air tag
          tags[i] = 1;
        }
      } else {
        tags[i] = 0;
      }
    }
    return tags;
  }

  // --------------------------------------------------------------------------
  // Entrance Detection
  // --------------------------------------------------------------------------

  /**
   * Detect cave entrance positions.
   * Entrances are points where the cave SDF surface is close to the terrain
   * surface (i.e., the cave reaches ground level).
   */
  private detectEntrances(
    sdfData: Float32Array,
    dimensions: [number, number, number]
  ): THREE.Vector3[] {
    const [dimX, dimY, dimZ] = dimensions;
    const bounds = this.config.bounds;
    const size = bounds.getSize(new THREE.Vector3());
    const voxelSize = Math.max(size.x, size.y, size.z) / dimX;
    const entrances: THREE.Vector3[] = [];

    // Look for surface transitions near the terrain surface height
    const surfaceY = this.config.height_offset + 2; // slightly below offset = near terrain surface

    for (let z = 1; z < dimZ - 1; z++) {
      for (let x = 1; x < dimX - 1; x++) {
        for (let y = Math.max(0, Math.floor((surfaceY - bounds.min.y) / voxelSize) - 3);
             y < Math.min(dimY, Math.ceil((surfaceY - bounds.min.y) / voxelSize) + 3);
             y++) {
          const idx = z * dimX * dimY + y * dimX + x;
          const dist = sdfData[idx];

          // Check if this is a surface point (SDF near 0) at approximately terrain level
          if (Math.abs(dist) < voxelSize * 1.5) {
            // Check if there's a transition from inside to outside in neighbors
            const idxBelow = z * dimX * dimY + Math.min(dimY - 1, y + 1) * dimX + x;
            const idxAbove = z * dimX * dimY + Math.max(0, y - 1) * dimX + x;

            if (sdfData[idxBelow] < 0 && sdfData[idxAbove] >= 0) {
              // This is a cave surface at approximately terrain level = entrance
              const worldPos = new THREE.Vector3(
                bounds.min.x + (x + 0.5) * voxelSize,
                bounds.min.y + (y + 0.5) * voxelSize,
                bounds.min.z + (z + 0.5) * voxelSize
              );

              // Don't add duplicates too close together
              const tooClose = entrances.some(e => e.distanceTo(worldPos) < voxelSize * 4);
              if (!tooClose) {
                entrances.push(worldPos);
              }
            }
          }
        }
      }
    }

    // If no entrances found via SDF analysis, generate from config
    if (entrances.length === 0) {
      const rng = new SeededRandom(this.config.seed + 500);
      const count = Math.max(1, Math.round(this.config.frequency * 5));
      for (let i = 0; i < count; i++) {
        const x = rng.nextFloat(bounds.min.x, bounds.max.x);
        const z = rng.nextFloat(bounds.min.z, bounds.max.z);
        const y = this.config.height_offset + rng.nextFloat(-2, 2);
        entrances.push(new THREE.Vector3(x, y, z));
      }
    }

    return entrances;
  }

  // --------------------------------------------------------------------------
  // Mesh Extraction
  // --------------------------------------------------------------------------

  /**
   * Extract a triangulated cave mesh from the SDF data using a simplified
   * marching cubes algorithm.
   */
  private extractCaveMesh(
    sdfData: Float32Array,
    dimensions: [number, number, number]
  ): THREE.Mesh {
    const [dimX, dimY, dimZ] = dimensions;
    const bounds = this.config.bounds;
    const size = bounds.getSize(new THREE.Vector3());
    const voxelSize = Math.max(size.x, size.y, size.z) / dimX;

    const vertices: number[] = [];
    const indices: number[] = [];

    // Simplified marching cubes: for each voxel edge that crosses the isosurface,
    // generate a vertex at the crossing point
    const isoLevel = 0;

    for (let z = 0; z < dimZ - 1; z++) {
      for (let y = 0; y < dimY - 1; y++) {
        for (let x = 0; x < dimX - 1; x++) {
          // Sample 8 corners of the cube
          const corners: number[] = [];
          for (let dz = 0; dz <= 1; dz++) {
            for (let dy = 0; dy <= 1; dy++) {
              for (let dx = 0; dx <= 1; dx++) {
                const idx = (z + dz) * dimX * dimY + (y + dy) * dimX + (x + dx);
                corners.push(sdfData[idx]);
              }
            }
          }

          // Simple case: check if the cube straddles the isosurface
          const allInside = corners.every(v => v <= isoLevel);
          const allOutside = corners.every(v => v > isoLevel);

          if (!allInside && !allOutside) {
            // Generate a simple quad for each crossing face
            const cx = bounds.min.x + (x + 0.5) * voxelSize;
            const cy = bounds.min.y + (y + 0.5) * voxelSize;
            const cz = bounds.min.z + (z + 0.5) * voxelSize;

            // Check each face of the cube for crossings
            // +X face
            if ((corners[1] <= isoLevel) !== (corners[5] <= isoLevel) ||
                (corners[3] <= isoLevel) !== (corners[7] <= isoLevel)) {
              this.addFace(vertices, indices,
                cx + voxelSize * 0.5, cy - voxelSize * 0.5, cz,
                cx + voxelSize * 0.5, cy + voxelSize * 0.5, cz - voxelSize * 0.5,
                cx + voxelSize * 0.5, cy + voxelSize * 0.5, cz + voxelSize * 0.5
              );
            }
            // -X face
            if ((corners[0] <= isoLevel) !== (corners[4] <= isoLevel) ||
                (corners[2] <= isoLevel) !== (corners[6] <= isoLevel)) {
              this.addFace(vertices, indices,
                cx - voxelSize * 0.5, cy - voxelSize * 0.5, cz,
                cx - voxelSize * 0.5, cy + voxelSize * 0.5, cz + voxelSize * 0.5,
                cx - voxelSize * 0.5, cy + voxelSize * 0.5, cz - voxelSize * 0.5
              );
            }
            // +Y face (ceiling)
            if ((corners[2] <= isoLevel) !== (corners[3] <= isoLevel) ||
                (corners[6] <= isoLevel) !== (corners[7] <= isoLevel)) {
              this.addFace(vertices, indices,
                cx, cy + voxelSize * 0.5, cz - voxelSize * 0.5,
                cx - voxelSize * 0.5, cy + voxelSize * 0.5, cz,
                cx + voxelSize * 0.5, cy + voxelSize * 0.5, cz
              );
            }
            // -Y face (floor)
            if ((corners[0] <= isoLevel) !== (corners[1] <= isoLevel) ||
                (corners[4] <= isoLevel) !== (corners[5] <= isoLevel)) {
              this.addFace(vertices, indices,
                cx, cy - voxelSize * 0.5, cz + voxelSize * 0.5,
                cx - voxelSize * 0.5, cy - voxelSize * 0.5, cz,
                cx + voxelSize * 0.5, cy - voxelSize * 0.5, cz
              );
            }
            // +Z face
            if ((corners[4] <= isoLevel) !== (corners[5] <= isoLevel) ||
                (corners[6] <= isoLevel) !== (corners[7] <= isoLevel)) {
              this.addFace(vertices, indices,
                cx - voxelSize * 0.5, cy - voxelSize * 0.5, cz + voxelSize * 0.5,
                cx, cy + voxelSize * 0.5, cz + voxelSize * 0.5,
                cx + voxelSize * 0.5, cy - voxelSize * 0.5, cz + voxelSize * 0.5
              );
            }
            // -Z face
            if ((corners[0] <= isoLevel) !== (corners[1] <= isoLevel) ||
                (corners[2] <= isoLevel) !== (corners[3] <= isoLevel)) {
              this.addFace(vertices, indices,
                cx + voxelSize * 0.5, cy - voxelSize * 0.5, cz - voxelSize * 0.5,
                cx, cy + voxelSize * 0.5, cz - voxelSize * 0.5,
                cx - voxelSize * 0.5, cy - voxelSize * 0.5, cz - voxelSize * 0.5
              );
            }
          }
        }
      }
    }

    // Create Three.js mesh
    const geometry = new THREE.BufferGeometry();
    if (vertices.length > 0) {
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
    }

    const material = new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.9,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });

    return new THREE.Mesh(geometry, material);
  }

  /**
   * Add a triangular face to the vertex/index arrays.
   */
  private addFace(
    vertices: number[],
    indices: number[],
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number
  ): void {
    const baseIdx = vertices.length / 3;
    vertices.push(x0, y0, z0, x1, y1, z1, x2, y2, z2);
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
  }

  // --------------------------------------------------------------------------
  // L-System Tunnel Generation
  // --------------------------------------------------------------------------

  /**
   * Generate L-system tunnel data for auxiliary output.
   */
  private generateLSystemTunnels(): CaveTunnelData {
    const generator = new LSystemCaveGenerator();
    return generator.generate(
      this.config.seed + 1000,
      {
        ...DEFAULT_CAVE_GRAMMAR,
        ...this.config.grammarConfig,
        baseRadius: this.config.tunnelRadius,
      }
    );
  }

  // --------------------------------------------------------------------------
  // Decorations
  // --------------------------------------------------------------------------

  /**
   * Compute decoration placement bounds from entrance positions.
   */
  private computeDecorationBounds(entrances: THREE.Vector3[]): { min: THREE.Vector3; max: THREE.Vector3 } {
    const bounds = this.config.bounds;
    // Use the full bounds but shifted to the cave region
    return {
      min: new THREE.Vector3(
        bounds.min.x,
        this.config.deepest_level,
        bounds.min.z
      ),
      max: new THREE.Vector3(
        bounds.max.x,
        this.config.height_offset + 5,
        bounds.max.z
      ),
    };
  }

  /**
   * Generate cave decorations (stalactites, stalagmites, crystals, rocks, puddles).
   */
  private generateDecorations(bounds: { min: THREE.Vector3; max: THREE.Vector3 }): CaveDecoration[] {
    this.decorations = [];

    if (this.config.enableStalactites) {
      this.generateStalactites(bounds);
    }

    if (this.config.enableStalagmites) {
      this.generateStalagmites(bounds);
    }

    if (this.config.enableDecorations) {
      this.generateAdditionalDecorations(bounds);
    }

    return this.decorations;
  }

  private generateStalactites(bounds: { min: THREE.Vector3; max: THREE.Vector3 }): void {
    const count = Math.floor(
      this.config.stalactiteDensity *
      (bounds.max.x - bounds.min.x) *
      (bounds.max.z - bounds.min.z)
    );

    for (let i = 0; i < count; i++) {
      const x = bounds.min.x + this.rng.next() * (bounds.max.x - bounds.min.x);
      const z = bounds.min.z + this.rng.next() * (bounds.max.z - bounds.min.z);
      const y = bounds.max.y - 0.1; // Near ceiling

      const height = 0.5 + this.rng.next() * 2.0;
      const radius = 0.1 + this.rng.next() * 0.3;

      this.decorations.push({
        type: 'stalactite',
        position: new THREE.Vector3(x, y, z),
        rotation: new THREE.Euler(Math.PI, 0, 0), // Point downward
        scale: new THREE.Vector3(radius, height, radius),
      });
    }
  }

  private generateStalagmites(bounds: { min: THREE.Vector3; max: THREE.Vector3 }): void {
    const count = Math.floor(
      this.config.stalagmiteDensity *
      (bounds.max.x - bounds.min.x) *
      (bounds.max.z - bounds.min.z)
    );

    for (let i = 0; i < count; i++) {
      const x = bounds.min.x + this.rng.next() * (bounds.max.x - bounds.min.x);
      const z = bounds.min.z + this.rng.next() * (bounds.max.z - bounds.min.z);
      const y = bounds.min.y + 0.1; // Near floor

      const height = 0.3 + this.rng.next() * 1.5;
      const radius = 0.1 + this.rng.next() * 0.4;

      this.decorations.push({
        type: 'stalagmite',
        position: new THREE.Vector3(x, y, z),
        rotation: new THREE.Euler(0, 0, 0),
        scale: new THREE.Vector3(radius, height, radius),
      });
    }
  }

  private generateAdditionalDecorations(bounds: { min: THREE.Vector3; max: THREE.Vector3 }): void {
    const decorationTypes: Array<'crystal' | 'rock' | 'puddle'> = ['crystal', 'rock', 'puddle'];
    const totalArea = (bounds.max.x - bounds.min.x) * (bounds.max.z - bounds.min.z);
    const count = Math.floor(this.config.decorationDensity * totalArea);

    for (let i = 0; i < count; i++) {
      const type = decorationTypes[Math.floor(this.rng.next() * decorationTypes.length)];
      const x = bounds.min.x + this.rng.next() * (bounds.max.x - bounds.min.x);
      const z = bounds.min.z + this.rng.next() * (bounds.max.z - bounds.min.z);
      const y = bounds.min.y + 0.05 + this.rng.next() * (bounds.max.y - bounds.min.y - 0.1);

      const scale = 0.2 + this.rng.next() * 0.8;

      this.decorations.push({
        type,
        position: new THREE.Vector3(x, y, z),
        rotation: new THREE.Euler(
          this.rng.next() * Math.PI,
          this.rng.next() * Math.PI,
          this.rng.next() * Math.PI
        ),
        scale: new THREE.Vector3(scale, scale, scale),
      });
    }
  }

  /**
   * Create geometry for a decoration.
   */
  createDecorationGeometry(decoration: CaveDecoration): THREE.BufferGeometry {
    switch (decoration.type) {
      case 'stalactite':
      case 'stalagmite':
        return new THREE.ConeGeometry(1, 1, 8, 1);
      case 'crystal':
        return new THREE.OctahedronGeometry(1, 0);
      case 'rock':
        return new THREE.DodecahedronGeometry(1, 0);
      case 'puddle':
        return new THREE.CircleGeometry(1, 16);
      default:
        return new THREE.SphereGeometry(1, 8, 8);
    }
  }

  /**
   * Create instanced meshes for all decorations, grouped by type.
   */
  createInstancedMesh(scene: THREE.Scene): THREE.Group {
    const group = new THREE.Group();
    if (this.decorations.length === 0) {
      return group;
    }

    const byType = new Map<string, CaveDecoration[]>();
    for (const dec of this.decorations) {
      if (!byType.has(dec.type)) {
        byType.set(dec.type, []);
      }
      byType.get(dec.type)!.push(dec);
    }

    const typeColors: Record<string, number> = {
      stalactite: 0x8b7355,
      stalagmite: 0x9b8b6b,
      crystal: 0x88ccee,
      rock: 0x777777,
      puddle: 0x4488aa,
    };

    for (const [type, decs] of byType) {
      const geometry = this.createDecorationGeometry(decs[0]);
      const material = new THREE.MeshStandardMaterial({
        color: typeColors[type] ?? 0x888888,
        roughness: type === 'crystal' ? 0.1 : 0.9,
        metalness: type === 'crystal' ? 0.3 : 0.1,
        transparent: type === 'puddle',
        opacity: type === 'puddle' ? 0.7 : 1.0,
      });

      const mesh = new THREE.InstancedMesh(geometry, material, decs.length);
      for (let i = 0; i < decs.length; i++) {
        const dec = decs[i];
        const matrix = new THREE.Matrix4();
        matrix.compose(dec.position, new THREE.Quaternion().setFromEuler(dec.rotation), dec.scale);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    }

    scene.add(group);
    return group;
  }

  /**
   * Create cave lighting.
   */
  createLighting(scene: THREE.Scene, bounds: { min: THREE.Vector3; max: THREE.Vector3 }): void {
    if (!this.config.enableLighting) return;

    const lightCount = Math.max(3, Math.floor(
      (bounds.max.x - bounds.min.x) * (bounds.max.z - bounds.min.z) / 50
    ));

    for (let i = 0; i < lightCount; i++) {
      const x = bounds.min.x + this.rng.next() * (bounds.max.x - bounds.min.x);
      const z = bounds.min.z + this.rng.next() * (bounds.max.z - bounds.min.z);
      const y = bounds.min.y + (bounds.max.y - bounds.min.y) * 0.7;

      const light = new THREE.PointLight(
        this.config.lightColor,
        this.config.lightIntensity,
        15
      );
      light.position.set(x, y, z);
      scene.add(light);
    }
  }

  // --------------------------------------------------------------------------
  // Utility: Smooth Subtraction
  // --------------------------------------------------------------------------

  /**
   * Polynomial smooth subtraction: max(d1, -d2) with smooth blending.
   * Uses the polynomial smooth min approach from Inigo Quilez.
   *
   * smooth_subtraction(a, b, k) = smooth_intersection(a, -b, k)
   *                              = -smooth_union(-a, b, k) + a + b ... etc.
   */
  private smoothSubtraction(d1: number, d2: number, k: number): number {
    // Smooth subtraction: we want to subtract d2 from d1
    // In SDF terms: terrain SDF minus cave SDF
    // Cave SDF is negative inside, so -caveSDF is positive inside
    // Result: max(terrain, -cave) with smooth blending
    const a = d1;
    const b = -d2; // Negate cave SDF for subtraction

    if (k <= 0) {
      return Math.max(a, b);
    }

    const h = Math.max(0, Math.min(1, (b - a + k) / (2 * k)));
    return b + (a - b) * h + k * h * (1 - h);
  }

  // --------------------------------------------------------------------------
  // Utility: Geometry Helpers
  // --------------------------------------------------------------------------

  /**
   * Compute distance from a point to a triangle.
   */
  private pointToTriangleDistance(
    p: THREE.Vector3,
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3
  ): number {
    const ab = new THREE.Vector3().subVectors(b, a);
    const ac = new THREE.Vector3().subVectors(c, a);
    const ap = new THREE.Vector3().subVectors(p, a);

    const d1 = ab.dot(ap);
    const d2 = ac.dot(ap);
    if (d1 <= 0 && d2 <= 0) return ap.length();

    const bp = new THREE.Vector3().subVectors(p, b);
    const d3 = ab.dot(bp);
    const d4 = ac.dot(bp);
    if (d3 >= 0 && d4 <= d3) return bp.length();

    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      const v = d1 / (d1 - d3);
      return new THREE.Vector3().addVectors(a, ab.clone().multiplyScalar(v)).distanceTo(p);
    }

    const cp = new THREE.Vector3().subVectors(p, c);
    const d5 = ab.dot(cp);
    const d6 = ac.dot(cp);
    if (d6 >= 0 && d5 <= d6) return cp.length();

    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      const w = d2 / (d2 - d6);
      return new THREE.Vector3().addVectors(a, ac.clone().multiplyScalar(w)).distanceTo(p);
    }

    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
      const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
      const bc = new THREE.Vector3().subVectors(c, b);
      return new THREE.Vector3().addVectors(b, bc.clone().multiplyScalar(w)).distanceTo(p);
    }

    const denom = 1 / (va + vb + vc);
    const v2 = vb * denom;
    const w2 = vc * denom;
    const closest = new THREE.Vector3()
      .add(a.clone().multiplyScalar(1 - v2 - w2))
      .add(b.clone().multiplyScalar(v2))
      .add(c.clone().multiplyScalar(w2));

    return closest.distanceTo(p);
  }

  /**
   * Test ray-triangle intersection (Möller–Trumbore algorithm).
   */
  private rayTriangleIntersection(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3
  ): boolean {
    const edge1 = new THREE.Vector3().subVectors(b, a);
    const edge2 = new THREE.Vector3().subVectors(c, a);
    const h = new THREE.Vector3().crossVectors(direction, edge2);
    const det = edge1.dot(h);

    if (Math.abs(det) < 1e-10) return false;

    const invDet = 1 / det;
    const s = new THREE.Vector3().subVectors(origin, a);
    const u = invDet * s.dot(h);

    if (u < 0 || u > 1) return false;

    const q = new THREE.Vector3().crossVectors(s, edge1);
    const v = invDet * direction.dot(q);

    if (v < 0 || u + v > 1) return false;

    const t = invDet * edge2.dot(q);
    return t > 1e-10;
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  /**
   * Apply Infinigen Caves element parameters to the config.
   */
  private applyInfinigenParams(params: Partial<InfinigenCaveParams>): void {
    if (params.n_lattice !== undefined) this.config.n_lattice = params.n_lattice;
    if (params.is_horizontal !== undefined) this.config.is_horizontal = params.is_horizontal;
    if (params.frequency !== undefined) this.config.frequency = params.frequency;
    if (params.randomness !== undefined) this.config.randomness = params.randomness;
    if (params.height_offset !== undefined) this.config.height_offset = params.height_offset;
    if (params.deepest_level !== undefined) this.config.deepest_level = params.deepest_level;
    if (params.scale_increase !== undefined) this.config.scale_increase = params.scale_increase;
    if (params.noise_octaves !== undefined) this.config.noise_octaves = params.noise_octaves;
    if (params.noise_scale !== undefined) this.config.noise_scale = params.noise_scale;
    if (params.noise_freq !== undefined) this.config.noise_freq = params.noise_freq;
    if (params.smoothness !== undefined) this.config.smoothness = params.smoothness;
  }

  /**
   * Update parameters.
   */
  setParams(params: Partial<UnifiedCaveConfig>): void {
    this.config = { ...this.config, ...params };
    if (params.seed !== undefined) {
      this.rng = new SeededRandom(params.seed);
      this.noise = new NoiseUtils(params.seed);
    }
  }

  /**
   * Get current decorations.
   */
  getDecorations(): CaveDecoration[] {
    return this.decorations;
  }

  /**
   * Get current configuration.
   */
  getConfig(): Readonly<UnifiedCaveConfig> {
    return this.config;
  }
}

// ============================================================================
// Backward Compatibility: CaveGenerator alias
// ============================================================================

/**
 * Cave generation parameters (backward compatibility).
 * @deprecated Use UnifiedCaveConfig instead.
 */
export interface CaveParams {
  density: number;
  caveSize: number;
  complexity: number;
  enableStalactites: boolean;
  enableStalagmites: boolean;
  stalactiteDensity: number;
  stalagmiteDensity: number;
  enableDecorations: boolean;
  decorationDensity: number;
  enableLighting: boolean;
  lightIntensity: number;
  lightColor: THREE.Color;
  seed: number;
}

/**
 * CaveGenerator class (backward compatibility wrapper).
 * Delegates to the unified UnifiedCaveGenerator.
 *
 * @deprecated Use UnifiedCaveGenerator instead.
 */
export class CaveGenerator {
  private generator: UnifiedCaveGenerator;
  private legacyParams: CaveParams;

  constructor(params: Partial<CaveParams> = {}) {
    this.legacyParams = {
      density: 0.3,
      caveSize: 3.0,
      complexity: 0.5,
      enableStalactites: true,
      enableStalagmites: true,
      stalactiteDensity: 0.2,
      stalagmiteDensity: 0.2,
      enableDecorations: true,
      decorationDensity: 0.1,
      enableLighting: true,
      lightIntensity: 0.5,
      lightColor: new THREE.Color(0xffaa88),
      seed: 42,
      ...params,
    };

    this.generator = new UnifiedCaveGenerator({
      mode: 'lattice',
      frequency: this.legacyParams.density,
      tunnelRadius: this.legacyParams.caveSize,
      randomness: this.legacyParams.complexity,
      seed: this.legacyParams.seed,
      enableStalactites: this.legacyParams.enableStalactites,
      enableStalagmites: this.legacyParams.enableStalagmites,
      stalactiteDensity: this.legacyParams.stalactiteDensity,
      stalagmiteDensity: this.legacyParams.stalagmiteDensity,
      enableDecorations: this.legacyParams.enableDecorations,
      decorationDensity: this.legacyParams.decorationDensity,
      enableLighting: this.legacyParams.enableLighting,
      lightIntensity: this.legacyParams.lightIntensity,
      lightColor: this.legacyParams.lightColor,
    });
  }

  /**
   * Generate cave SDF by subtracting from terrain SDF.
   */
  generateCaves(terrainSDF: Float32Array, width: number, height: number, depth: number): Float32Array {
    const result = this.generator.generate();
    const caveSDF = result.sdfData;

    // Combine with terrain SDF (subtractive operation with smooth blending)
    const output = new Float32Array(terrainSDF.length);
    const minLen = Math.min(terrainSDF.length, caveSDF.length);

    for (let i = 0; i < terrainSDF.length; i++) {
      if (i < minLen) {
        // Smooth subtraction
        const terrain = terrainSDF[i];
        const cave = caveSDF[i];
        const negatedCave = -cave; // Negative inside cave → positive after negate
        output[i] = Math.max(terrain, negatedCave);
      } else {
        output[i] = terrainSDF[i];
      }
    }

    return output;
  }

  /**
   * Generate cave decorations.
   */
  generateDecorations(
    _caveMesh: THREE.Mesh,
    bounds: { min: THREE.Vector3; max: THREE.Vector3 }
  ): CaveDecoration[] {
    return this.generator.generate().decorations;
  }

  /**
   * Create decoration geometry.
   */
  createDecorationGeometry(decoration: CaveDecoration): THREE.BufferGeometry {
    return this.generator.createDecorationGeometry(decoration);
  }

  /**
   * Create instanced meshes.
   */
  createInstancedMesh(scene: THREE.Scene): THREE.Group {
    return this.generator.createInstancedMesh(scene);
  }

  /**
   * Create cave lighting.
   */
  createLighting(scene: THREE.Scene, bounds: { min: THREE.Vector3; max: THREE.Vector3 }): void {
    this.generator.createLighting(scene, bounds);
  }

  /**
   * Update parameters.
   */
  setParams(params: Partial<CaveParams>): void {
    this.legacyParams = { ...this.legacyParams, ...params };
    this.generator.setParams({
      frequency: this.legacyParams.density,
      tunnelRadius: this.legacyParams.caveSize,
      randomness: this.legacyParams.complexity,
      seed: this.legacyParams.seed,
    });
  }

  /**
   * Get decorations.
   */
  getDecorations(): CaveDecoration[] {
    return this.generator.getDecorations();
  }
}

export default CaveGenerator;
