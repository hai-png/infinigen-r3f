/**
 * ScatterFactory.ts — P4.4: Scatter Factory Pattern
 *
 * A unified scatter factory that supports 10+ scatter types with
 * terrain-aware placement using SDF distance fields. Provides both
 * rasterized mode (InstancedMesh) for real-time rendering and
 * expanded mesh mode for path-traced rendering.
 *
 * The factory pattern decouples scatter type definition from the
 * scattering algorithm, making it easy to add new scatter types
 * without modifying the core placement logic.
 *
 * Ported from: infinigen/core/placement/scatter.py
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import {
  BIOME_SCATTER_ID_MAP,
  SCATTER_ID_TO_SCATTER_TYPE,
  type BiomeScatterProfile,
  type ScatterEntry,
} from '@/terrain/biomes/core/BiomeScatterMapping';
import { BIOME_SCATTER_MAPPING } from '@/terrain/biomes/core/BiomeScatterMapping';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Supported scatter types — 10+ built-in types.
 */
export type ScatterType =
  | 'fern'
  | 'moss'
  | 'ground_leaves'
  | 'pine_needle'
  | 'seashell'
  | 'lichen'
  | 'pebble'
  | 'grass'
  | 'rock'
  | 'mushroom'
  | 'flower'
  | 'twig'
  | 'snow_layer'
  | 'slime_mold'
  | 'mollusk'
  | 'jellyfish';

/**
 * Selector function that determines valid placement surfaces.
 * Returns the signed distance to the nearest surface at (x, z).
 * Negative = below surface, positive = above.
 */
export type SurfaceSDF = (x: number, z: number) => number;

/**
 * Selector function that determines valid placement based on terrain properties.
 * Returns true if the position is valid for placement.
 */
export type SurfaceSelector = (position: THREE.Vector3, normal: THREE.Vector3) => boolean;

/**
 * Configuration for a scatter operation.
 */
export interface ScatterConfig {
  /** Type of scatter object to place */
  type: ScatterType;
  /** Density: objects per square meter (default 1.0) */
  density: number;
  /** Minimum distance between scattered objects (default 0) */
  minDistance?: number;
  /** Surface selector function for terrain-aware placement */
  surfaceSelector: SurfaceSelector;
  /** Optional SDF distance field for terrain awareness (avoids water, steep slopes) */
  terrainSDF?: SurfaceSDF;
  /** Height function: given (x, z), returns terrain height y */
  heightFunction?: (x: number, z: number) => number;
  /** Normal function: given (x, z), returns terrain normal */
  normalFunction?: (x: number, z: number) => THREE.Vector3;
  /** Random seed for deterministic generation (default 42) */
  seed: number;
  /** Minimum scale for instances (default 0.8) */
  minScale: number;
  /** Maximum scale for instances (default 1.2) */
  maxScale: number;
  /** Area bounds for scattering */
  bounds: THREE.Box3;
  /** Maximum slope angle in degrees for placement (default 60) */
  maxSlope: number;
  /** Minimum height for placement (default -Infinity) */
  minHeight: number;
  /** Maximum height for placement (default Infinity) */
  maxHeight: number;
  /** Avoid water: skip placement where SDF < waterLevel (default true) */
  avoidWater: boolean;
  /** Water level height (default 0.0) */
  waterLevel: number;
  /** Rendering mode: 'instanced' for rasterized, 'expanded' for path-traced */
  mode: 'instanced' | 'expanded';
  /** LOD level (0 = highest detail) */
  lodLevel: number;
  /** Season for seasonal variation ('spring' | 'summer' | 'autumn' | 'winter') */
  season: 'spring' | 'summer' | 'autumn' | 'winter';
}

/**
 * Result of a scatter operation.
 */
export interface ScatterResult {
  /** Whether scattering succeeded */
  success: boolean;
  /** InstancedMesh for rasterized mode, or null for expanded mode */
  instancedMesh: THREE.InstancedMesh | null;
  /** Individual meshes for expanded (path-traced) mode */
  meshes: THREE.Mesh[];
  /** Total number of placed instances */
  instanceCount: number;
  /** Number of rejected placements */
  rejectedCount: number;
  /** Positions of all placed instances */
  positions: THREE.Vector3[];
  /** Computation time in milliseconds */
  computationTime: number;
  /** Statistics about the scatter operation */
  statistics: {
    density: number;
    coverageArea: number;
    boundingBox: THREE.Box3;
    averageScale: number;
  };
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_SURFACE_SELECTOR: SurfaceSelector = () => true;

export const DEFAULT_SCATTER_CONFIG: Partial<ScatterConfig> = {
  density: 1.0,
  surfaceSelector: DEFAULT_SURFACE_SELECTOR,
  seed: 42,
  minScale: 0.8,
  maxScale: 1.2,
  bounds: new THREE.Box3(
    new THREE.Vector3(-20, 0, -20),
    new THREE.Vector3(20, 10, 20)
  ),
  maxSlope: 60,
  minHeight: -Infinity,
  maxHeight: Infinity,
  avoidWater: true,
  waterLevel: 0.0,
  mode: 'instanced',
  lodLevel: 0,
  season: 'summer',
};

// ============================================================================
// Scatter Factory
// ============================================================================

/**
 * ScatterFactory provides a unified interface for scattering objects across
 * terrain surfaces. It supports 10+ scatter types, terrain-aware placement
 * via SDF, and dual rendering modes (InstancedMesh / expanded meshes).
 *
 * Usage:
 *   const factory = new ScatterFactory();
 *   const result = factory.scatter({
 *     type: 'fern',
 *     density: 2.0,
 *     bounds: myBounds,
 *     heightFunction: getTerrainHeight,
 *     seed: 12345,
 *   });
 */
export class ScatterFactory {
  /** Registry of geometry generators for each scatter type */
  private geometryRegistry: Map<ScatterType, (seed: number, lod: number) => THREE.BufferGeometry>;
  /** Registry of material generators for each scatter type */
  private materialRegistry: Map<ScatterType, (seed: number, season: string) => THREE.MeshStandardMaterial>;

  constructor() {
    this.geometryRegistry = new Map();
    this.materialRegistry = new Map();

    // Register built-in scatter types
    this.registerBuiltinTypes();
  }

  // -----------------------------------------------------------------------
  // Biome-driven scatter
  // -----------------------------------------------------------------------

  /**
   * Scatter all biome-appropriate objects for the given biome type.
   *
   * Uses BiomeScatterMapping to resolve which scatter IDs belong to the
   * biome, then maps those to concrete ScatterTypes via the
   * SCATTER_ID_TO_SCATTER_TYPE bridge. Each resolved ScatterType is
   * scattered using the BiomeScatterProfile's density and spacing data.
   *
   * @param biomeType - Biome identifier (e.g. 'desert', 'temperate_forest')
   * @param baseConfig - Base scatter configuration (bounds, heightFunction, etc.)
   * @returns Array of ScatterResults, one per scatter type that was resolved
   */
  scatterFromBiome(
    biomeType: string,
    baseConfig: Partial<ScatterConfig> = {},
  ): ScatterResult[] {
    const results: ScatterResult[] = [];

    // 1. Get the full BiomeScatterProfile (for density/spacing data)
    const profile: BiomeScatterProfile | undefined =
      BIOME_SCATTER_MAPPING.getProfile(biomeType as any);

    // 2. Get the canonical scatter IDs for this biome
    const scatterIds = BIOME_SCATTER_ID_MAP[biomeType] ?? [];

    // 3. For each scatter ID, resolve to a ScatterType and scatter
    for (const scatterId of scatterIds) {
      const scatterType = SCATTER_ID_TO_SCATTER_TYPE[scatterId];
      if (!scatterType) {
        console.warn(
          `[ScatterFactory] No ScatterType mapping for scatter ID '${scatterId}' in biome '${biomeType}'`,
        );
        continue;
      }

      // Check if this ScatterType is registered
      if (!this.geometryRegistry.has(scatterType as ScatterType)) {
        console.warn(
          `[ScatterFactory] ScatterType '${scatterType}' (from '${scatterId}') not registered`,
        );
        continue;
      }

      // Build per-entry ScatterConfig from the profile if available
      let entryConfig = baseConfig;
      if (profile) {
        const allEntries: ScatterEntry[] = [
          ...profile.primaryVegetation,
          ...profile.groundCover,
          ...profile.specialFeatures,
        ];
        // Find a matching entry by trying both the canonical ID and common prefixes
        const entry = allEntries.find(e =>
          e.id === scatterId ||
          scatterId.startsWith(e.id.replace(/_/g, '') + '_') ||
          e.id.includes(scatterId.replace(/_scatter$/, '')),
        );

        if (entry) {
          entryConfig = {
            ...baseConfig,
            type: scatterType as ScatterType,
            density: entry.baseDensity * profile.densityMultipliers.global,
            minDistance: entry.minDistance,
            minScale: entry.scaleRange[0],
            maxScale: entry.scaleRange[1],
          };
        } else {
          entryConfig = {
            ...baseConfig,
            type: scatterType as ScatterType,
          };
        }
      } else {
        entryConfig = {
          ...baseConfig,
          type: scatterType as ScatterType,
        };
      }

      results.push(this.scatter(entryConfig));
    }

    return results;
  }

  /**
   * Register a custom scatter type with its geometry and material generators.
   */
  registerType(
    type: ScatterType | string,
    geometryGenerator: (seed: number, lod: number) => THREE.BufferGeometry,
    materialGenerator: (seed: number, season: string) => THREE.MeshStandardMaterial
  ): void {
    this.geometryRegistry.set(type as ScatterType, geometryGenerator);
    this.materialRegistry.set(type as ScatterType, materialGenerator);
  }

  /**
   * Perform scatter placement according to the given configuration.
   */
  scatter(config: Partial<ScatterConfig>): ScatterResult {
    const startTime = performance.now();
    const cfg: ScatterConfig = { ...DEFAULT_SCATTER_CONFIG, ...config } as ScatterConfig;
    const rng = new SeededRandom(cfg.seed);

    // Get geometry and material generators
    const geoGen = this.geometryRegistry.get(cfg.type);
    const matGen = this.materialRegistry.get(cfg.type);

    if (!geoGen || !matGen) {
      return {
        success: false,
        instancedMesh: null,
        meshes: [],
        instanceCount: 0,
        rejectedCount: 0,
        positions: [],
        computationTime: 0,
        statistics: {
          density: 0,
          coverageArea: 0,
          boundingBox: new THREE.Box3(),
          averageScale: 0,
        },
      };
    }

    // Generate base geometry and material
    const baseGeometry = geoGen(cfg.seed, cfg.lodLevel);
    const baseMaterial = matGen(cfg.seed, cfg.season);

    // Calculate placement area
    const boundsSize = new THREE.Vector3();
    cfg.bounds.getSize(boundsSize);
    const areaXZ = boundsSize.x * boundsSize.z;
    const targetCount = Math.round(areaXZ * cfg.density);

    // Generate candidate positions
    const positions: THREE.Vector3[] = [];
    const rotations: THREE.Quaternion[] = [];
    const scales: THREE.Vector3[] = [];
    let rejectedCount = 0;

    for (let i = 0; i < targetCount * 3; i++) {
      // Random position within bounds
      const x = cfg.bounds.min.x + rng.next() * boundsSize.x;
      const z = cfg.bounds.min.z + rng.next() * boundsSize.z;

      // Get terrain height
      let y: number;
      let normal: THREE.Vector3;

      if (cfg.heightFunction) {
        y = cfg.heightFunction(x, z);
      } else if (cfg.terrainSDF) {
        y = -cfg.terrainSDF(x, z);
      } else {
        y = cfg.bounds.min.y;
      }

      if (cfg.normalFunction) {
        normal = cfg.normalFunction(x, z);
      } else {
        normal = new THREE.Vector3(0, 1, 0);
      }

      const position = new THREE.Vector3(x, y, z);

      // Validate placement: terrain-aware checks
      if (!this.validatePlacement(position, normal, cfg)) {
        rejectedCount++;
        continue;
      }

      // Validate with custom surface selector
      if (!cfg.surfaceSelector(position, normal)) {
        rejectedCount++;
        continue;
      }

      // Random rotation (around Y axis)
      const rotation = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        rng.uniform(0, Math.PI * 2)
      );

      // Random scale
      const scaleValue = rng.uniform(cfg.minScale, cfg.maxScale);
      const scale = new THREE.Vector3(scaleValue, scaleValue, scaleValue);

      positions.push(position);
      rotations.push(rotation);
      scales.push(scale);

      if (positions.length >= targetCount) break;
    }

    // Build result based on rendering mode
    let instancedMesh: THREE.InstancedMesh | null = null;
    const meshes: THREE.Mesh[] = [];

    if (cfg.mode === 'instanced') {
      // Rasterized mode: single InstancedMesh
      instancedMesh = new THREE.InstancedMesh(baseGeometry, baseMaterial, positions.length);
      instancedMesh.castShadow = true;
      instancedMesh.receiveShadow = true;

      const matrix = new THREE.Matrix4();
      for (let i = 0; i < positions.length; i++) {
        matrix.compose(positions[i], rotations[i], scales[i]);
        instancedMesh.setMatrixAt(i, matrix);
      }
      instancedMesh.instanceMatrix.needsUpdate = true;
    } else {
      // Expanded mode: individual meshes for path-traced rendering
      for (let i = 0; i < positions.length; i++) {
        const mesh = new THREE.Mesh(baseGeometry.clone(), baseMaterial.clone());
        mesh.position.copy(positions[i]);
        mesh.quaternion.copy(rotations[i]);
        mesh.scale.copy(scales[i]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.updateMatrix();
        meshes.push(mesh);
      }
    }

    const computationTime = performance.now() - startTime;

    // Compute statistics
    const boundingBox = positions.length > 0
      ? new THREE.Box3().setFromPoints(positions)
      : new THREE.Box3();
    const averageScale = scales.length > 0
      ? scales.reduce((sum, s) => sum + s.x, 0) / scales.length
      : 0;

    return {
      success: positions.length > 0,
      instancedMesh,
      meshes,
      instanceCount: positions.length,
      rejectedCount,
      positions,
      computationTime,
      statistics: {
        density: positions.length / Math.max(areaXZ, 0.001),
        coverageArea: areaXZ,
        boundingBox,
        averageScale,
      },
    };
  }

  /**
   * Validate a placement position against terrain constraints.
   */
  private validatePlacement(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    config: ScatterConfig
  ): boolean {
    // Height check
    if (position.y < config.minHeight || position.y > config.maxHeight) {
      return false;
    }

    // Slope check
    const upVector = new THREE.Vector3(0, 1, 0);
    const slope = Math.acos(Math.abs(normal.dot(upVector))) * (180 / Math.PI);
    if (slope > config.maxSlope) {
      return false;
    }

    // Water avoidance
    if (config.avoidWater && position.y < config.waterLevel) {
      return false;
    }

    // SDF-based terrain check
    if (config.terrainSDF) {
      const sdfValue = config.terrainSDF(position.x, position.z);
      // Negative SDF = inside terrain = invalid
      if (sdfValue < 0) {
        return false;
      }
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // Built-in Scatter Type Registration
  // --------------------------------------------------------------------------

  /**
   * Register geometry and material generators for all built-in scatter types.
   */
  private registerBuiltinTypes(): void {
    // --- Fern ---
    this.geometryRegistry.set('fern', (seed, lod) => {
      const geo = new THREE.BufferGeometry();
      const rng = new SeededRandom(seed);
      const frondCount = Math.max(3, 6 - lod);
      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      for (let f = 0; f < frondCount; f++) {
        const angle = (f / frondCount) * Math.PI * 2;
        const baseIdx = positions.length / 3;
        const frondLen = rng.uniform(0.3, 0.6);

        // Stem base
        positions.push(0, 0, 0);
        normals.push(0, 0, 1);
        uvs.push(0.5, 0);

        // Tip
        const tx = Math.cos(angle) * frondLen * 0.3;
        const ty = frondLen;
        const tz = Math.sin(angle) * frondLen * 0.3;
        positions.push(tx, ty, tz);
        normals.push(0, 0, 1);
        uvs.push(0.5, 1);

        // Left
        positions.push(tx - 0.1, ty * 0.6, tz);
        normals.push(0, 0, 1);
        uvs.push(0, 0.6);

        // Right
        positions.push(tx + 0.1, ty * 0.6, tz);
        normals.push(0, 0, 1);
        uvs.push(1, 0.6);

        indices.push(baseIdx, baseIdx + 2, baseIdx + 1);
        indices.push(baseIdx, baseIdx + 1, baseIdx + 3);
      }

      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    });
    this.materialRegistry.set('fern', (_seed, season) => {
      const colorMap: Record<string, number> = { spring: 0x7cb342, summer: 0x2e7d32, autumn: 0x8d6e63, winter: 0x5d4037 };
      return new THREE.MeshStandardMaterial({ color: colorMap[season] || 0x2e7d32, roughness: 0.7, side: THREE.DoubleSide });
    });

    // --- Moss ---
    this.geometryRegistry.set('moss', (_seed, lod) => {
      const segments = Math.max(4, 8 - lod * 2);
      return new THREE.SphereGeometry(0.05, segments, Math.max(3, segments / 2));
    });
    this.materialRegistry.set('moss', (_seed, season) => {
      const colorMap: Record<string, number> = { spring: 0x4caf50, summer: 0x2e7d32, autumn: 0x558b2f, winter: 0x33691e };
      return new THREE.MeshStandardMaterial({ color: colorMap[season] || 0x2e7d32, roughness: 0.95 });
    });

    // --- Ground Leaves ---
    this.geometryRegistry.set('ground_leaves', (seed, _lod) => {
      const rng = new SeededRandom(seed);
      const positions = new Float32Array([
        0, 0, 0,
        -0.05, 0.01, -0.02,
        0, 0.02, -0.08,
        0.05, 0.01, -0.02,
      ]);
      const normals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
      const uvs = new Float32Array([0.5, 0, 0, 0.5, 0.5, 1, 1, 0.5]);
      const indices = [0, 1, 2, 0, 2, 3];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      return geo;
    });
    this.materialRegistry.set('ground_leaves', (_seed, season) => {
      const colorMap: Record<string, number> = { spring: 0x8bc34a, summer: 0x4caf50, autumn: 0xff8f00, winter: 0x795548 };
      return new THREE.MeshStandardMaterial({ color: colorMap[season] || 0x4caf50, roughness: 0.8, side: THREE.DoubleSide });
    });

    // --- Pine Needle ---
    this.geometryRegistry.set('pine_needle', (_seed, _lod) => {
      const positions = new Float32Array([
        -0.005, 0, 0,
        0.005, 0, 0,
        0, 0.08, 0,
      ]);
      const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
      const uvs = new Float32Array([0, 0, 1, 0, 0.5, 1]);
      const indices = [0, 1, 2];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      return geo;
    });
    this.materialRegistry.set('pine_needle', (_seed, _season) => {
      return new THREE.MeshStandardMaterial({ color: 0x1b5e20, roughness: 0.7, side: THREE.DoubleSide });
    });

    // --- Seashell ---
    this.geometryRegistry.set('seashell', (_seed, lod) => {
      const segments = Math.max(6, 12 - lod * 2);
      // Simplified spiral shell
      return new THREE.SphereGeometry(0.04, segments, Math.max(4, segments / 2));
    });
    this.materialRegistry.set('seashell', (seed, _season) => {
      const rng = new SeededRandom(seed);
      const hue = rng.uniform(0.05, 0.15);
      const color = new THREE.Color().setHSL(hue, 0.3, 0.8);
      return new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1 });
    });

    // --- Lichen ---
    this.geometryRegistry.set('lichen', (_seed, lod) => {
      const segments = Math.max(4, 6 - lod);
      return new THREE.CircleGeometry(0.06, segments);
    });
    this.materialRegistry.set('lichen', (_seed, _season) => {
      return new THREE.MeshStandardMaterial({ color: 0x9e9d24, roughness: 0.95, side: THREE.DoubleSide });
    });

    // --- Pebble ---
    this.geometryRegistry.set('pebble', (seed, lod) => {
      const rng = new SeededRandom(seed);
      const segments = Math.max(6, 10 - lod * 2);
      const geo = new THREE.SphereGeometry(
        rng.uniform(0.02, 0.06),
        segments,
        Math.max(4, segments / 2)
      );
      // Flatten slightly
      geo.scale(1, 0.6, 1);
      return geo;
    });
    this.materialRegistry.set('pebble', (seed, _season) => {
      const rng = new SeededRandom(seed + 100);
      const lightness = rng.uniform(0.3, 0.6);
      const color = new THREE.Color().setHSL(0, 0, lightness);
      return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0 });
    });

    // --- Grass ---
    this.geometryRegistry.set('grass', (_seed, _lod) => {
      const shape = new THREE.Shape();
      shape.moveTo(-0.005, 0);
      shape.quadraticCurveTo(0, 0.1, 0.005, 0);
      shape.lineTo(0, 0.2);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape, 2);
      return geo;
    });
    this.materialRegistry.set('grass', (_seed, season) => {
      const colorMap: Record<string, number> = { spring: 0x7cb342, summer: 0x388e3c, autumn: 0x827717, winter: 0x5d4037 };
      return new THREE.MeshStandardMaterial({ color: colorMap[season] || 0x388e3c, roughness: 0.8, side: THREE.DoubleSide });
    });

    // --- Rock ---
    this.geometryRegistry.set('rock', (seed, lod) => {
      const rng = new SeededRandom(seed);
      const segments = Math.max(5, 8 - lod);
      const radius = rng.uniform(0.05, 0.15);
      const geo = new THREE.DodecahedronGeometry(radius, 1);
      // Randomize vertices for natural rock shape
      const posAttr = geo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i) * rng.uniform(0.8, 1.2);
        const y = posAttr.getY(i) * rng.uniform(0.7, 1.1);
        const z = posAttr.getZ(i) * rng.uniform(0.8, 1.2);
        posAttr.setXYZ(i, x, y, z);
      }
      geo.computeVertexNormals();
      return geo;
    });
    this.materialRegistry.set('rock', (seed, _season) => {
      const rng = new SeededRandom(seed + 200);
      const lightness = rng.uniform(0.25, 0.5);
      const color = new THREE.Color().setHSL(0.08, rng.uniform(0, 0.15), lightness);
      return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.0 });
    });

    // --- Mushroom ---
    this.geometryRegistry.set('mushroom', (seed, lod) => {
      const rng = new SeededRandom(seed);
      const capRadius = rng.uniform(0.03, 0.08);
      const stemHeight = rng.uniform(0.04, 0.1);
      const segments = Math.max(6, 10 - lod * 2);
      // Combine cap (hemisphere) and stem (cylinder)
      const cap = new THREE.SphereGeometry(capRadius, segments, Math.max(4, segments / 2), 0, Math.PI * 2, 0, Math.PI / 2);
      cap.translate(0, stemHeight, 0);
      const stem = new THREE.CylinderGeometry(capRadius * 0.2, capRadius * 0.3, stemHeight, Math.max(4, segments / 2));
      // Simple merge
      return cap; // Simplified — just use cap
    });
    this.materialRegistry.set('mushroom', (seed, _season) => {
      const rng = new SeededRandom(seed + 300);
      const hue = rng.choice([0.05, 0.08, 0.6, 0.0]); // Brown, tan, purple, red
      const color = new THREE.Color().setHSL(hue, rng.uniform(0.3, 0.6), rng.uniform(0.3, 0.5));
      return new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    });

    // --- Flower ---
    this.geometryRegistry.set('flower', (seed, lod) => {
      const rng = new SeededRandom(seed);
      const petalCount = Math.max(4, 6 - lod);
      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      // Center
      positions.push(0, 0.05, 0);
      normals.push(0, 1, 0);
      uvs.push(0.5, 0.5);

      for (let p = 0; p < petalCount; p++) {
        const angle = (p / petalCount) * Math.PI * 2;
        const baseIdx = positions.length / 3;

        // Petal tip
        const px = Math.cos(angle) * 0.04;
        const pz = Math.sin(angle) * 0.04;
        positions.push(px, 0.06, pz);
        normals.push(0, 1, 0);
        uvs.push(0.5 + Math.cos(angle) * 0.4, 0.5 + Math.sin(angle) * 0.4);

        // Petal left
        const la = angle - 0.3;
        positions.push(Math.cos(la) * 0.02, 0.05, Math.sin(la) * 0.02);
        normals.push(0, 1, 0);
        uvs.push(0.5 + Math.cos(la) * 0.2, 0.5 + Math.sin(la) * 0.2);

        // Petal right
        const ra = angle + 0.3;
        positions.push(Math.cos(ra) * 0.02, 0.05, Math.sin(ra) * 0.02);
        normals.push(0, 1, 0);
        uvs.push(0.5 + Math.cos(ra) * 0.2, 0.5 + Math.sin(ra) * 0.2);

        indices.push(0, baseIdx + 1, baseIdx);
        indices.push(0, baseIdx + 2, baseIdx);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      return geo;
    });
    this.materialRegistry.set('flower', (seed, season) => {
      const rng = new SeededRandom(seed + 400);
      const hueMap: Record<string, number> = { spring: 0.9, summer: rng.uniform(0, 1), autumn: 0.1, winter: 0.6 };
      const hue = hueMap[season] ?? rng.uniform(0, 1);
      const color = new THREE.Color().setHSL(hue, 0.7, 0.6);
      return new THREE.MeshStandardMaterial({ color, roughness: 0.5, side: THREE.DoubleSide });
    });

    // --- Twig ---
    this.geometryRegistry.set('twig', (seed, _lod) => {
      const rng = new SeededRandom(seed);
      const length = rng.uniform(0.05, 0.15);
      const geo = new THREE.CylinderGeometry(0.003, 0.005, length, 4);
      // Tilt randomly
      geo.rotateX(rng.uniform(-0.5, 0.5));
      geo.rotateZ(rng.uniform(-0.5, 0.5));
      return geo;
    });
    this.materialRegistry.set('twig', (_seed, _season) => {
      return new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });
    });

    // --- Snow Layer ---
    this.geometryRegistry.set('snow_layer', (seed, lod) => {
      const rng = new SeededRandom(seed);
      const segments = Math.max(4, 8 - lod * 2);
      const radius = rng.uniform(0.08, 0.2);
      const geo = new THREE.SphereGeometry(radius, segments, Math.max(3, segments / 2));
      // Flatten into a snow patch / accumulation shape
      geo.scale(1, 0.15, 1);

      // Add slope-based thickness variation: vertices near edge get thinner
      const posAttr = geo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
        const dist = Math.sqrt(x * x + z * z);
        const edgeFactor = 1.0 - Math.min(dist / radius, 1.0);
        // Thinner at edges (slope effect), thicker at center (flat accumulation)
        const heightMod = y * (0.5 + edgeFactor * 0.5);
        // Wind drift: slight directional displacement
        const windDrift = edgeFactor * rng.uniform(-0.02, 0.02);
        posAttr.setXYZ(i, x + windDrift, heightMod, z + windDrift * 0.5);
      }
      geo.computeVertexNormals();
      return geo;
    });
    this.materialRegistry.set('snow_layer', (_seed, season) => {
      // Snow is white but can have slight blue tint in winter, slight melt-yellow in summer
      const colorMap: Record<string, number> = {
        spring: 0xf0f0f5,
        summer: 0xe8e8ef,
        autumn: 0xf5f5fa,
        winter: 0xffffff,
      };
      return new THREE.MeshStandardMaterial({
        color: colorMap[season] || 0xffffff,
        roughness: 0.85,
        metalness: 0.0,
      });
    });

    // --- Slime Mold ---
    this.geometryRegistry.set('slime_mold', (seed, lod) => {
      const rng = new SeededRandom(seed);
      const segments = Math.max(5, 8 - lod);
      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      // Reaction-diffusion growth: central blob with branching tendrils
      const blobCount = rng.nextInt(3, 6);

      for (let b = 0; b < blobCount; b++) {
        const baseIdx = positions.length / 3;
        const cx = rng.uniform(-0.04, 0.04);
        const cy = 0;
        const cz = rng.uniform(-0.04, 0.04);
        const blobRadius = rng.uniform(0.015, 0.04);

        // Center vertex
        positions.push(cx, cy, cz);
        normals.push(0, 1, 0);
        uvs.push(0.5, 0.5);

        // Ring vertices
        for (let s = 0; s < segments; s++) {
          const angle = (s / segments) * Math.PI * 2;
          // Organic wobble for blob shape
          const wobble = rng.uniform(0.8, 1.2);
          const px = cx + Math.cos(angle) * blobRadius * wobble;
          const py = cy + rng.uniform(0.002, 0.01); // Slight puff upward
          const pz = cz + Math.sin(angle) * blobRadius * wobble;
          positions.push(px, py, pz);
          normals.push(0, 1, 0);
          uvs.push(0.5 + Math.cos(angle) * 0.4, 0.5 + Math.sin(angle) * 0.4);

          const curr = baseIdx + 1 + s;
          const next = baseIdx + 1 + ((s + 1) % segments);
          indices.push(baseIdx, next, curr);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    });
    this.materialRegistry.set('slime_mold', (seed, _season) => {
      const rng = new SeededRandom(seed + 500);
      // Yellow, orange, or white coloration
      const hue = rng.choice([0.12, 0.08, 0.15, 0.0]);
      const saturation = rng.uniform(0.4, 0.8);
      const lightness = rng.uniform(0.5, 0.8);
      const color = new THREE.Color().setHSL(hue, saturation, lightness);
      return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.95,
        side: THREE.DoubleSide,
      });
    });

    // --- Mollusk ---
    this.geometryRegistry.set('mollusk', (seed, lod) => {
      const rng = new SeededRandom(seed);
      const segments = Math.max(6, 10 - lod * 2);
      const spiralTurns = rng.uniform(1.5, 3.0);
      const shellRadius = rng.uniform(0.02, 0.06);
      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      // Parametric spiral shell using tube-like geometry
      const ringCount = Math.max(6, 12 - lod * 2);
      const ringSegments = Math.max(5, 8 - lod);

      for (let r = 0; r < ringCount; r++) {
        const t = r / (ringCount - 1);
        // Spiral path
        const spiralAngle = t * spiralTurns * Math.PI * 2;
        const spiralRadius = t * shellRadius;
        const cx = Math.cos(spiralAngle) * spiralRadius;
        const cy = t * shellRadius * 1.5; // Shell grows upward
        const cz = Math.sin(spiralAngle) * spiralRadius;

        // Cross-section ring
        const crossRadius = shellRadius * (1 - t * 0.5) * 0.4;
        for (let s = 0; s < ringSegments; s++) {
          const angle = (s / ringSegments) * Math.PI * 2;
          positions.push(
            cx + Math.cos(angle) * crossRadius,
            cy + Math.sin(angle) * crossRadius * 0.5,
            cz + Math.sin(angle) * crossRadius
          );
          normals.push(Math.cos(angle), 0, Math.sin(angle));
          uvs.push(r / ringCount, s / ringSegments);
        }
      }

      // Build triangle indices
      for (let r = 0; r < ringCount - 1; r++) {
        for (let s = 0; s < ringSegments; s++) {
          const curr = r * ringSegments + s;
          const next = r * ringSegments + ((s + 1) % ringSegments);
          const currAbove = (r + 1) * ringSegments + s;
          const nextAbove = (r + 1) * ringSegments + ((s + 1) % ringSegments);
          indices.push(curr, next, currAbove);
          indices.push(next, nextAbove, currAbove);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    });
    this.materialRegistry.set('mollusk', (seed, _season) => {
      const rng = new SeededRandom(seed + 600);
      // Mollusk shells: cream, pinkish, or brownish
      const hue = rng.uniform(0.02, 0.12);
      const saturation = rng.uniform(0.1, 0.4);
      const lightness = rng.uniform(0.6, 0.85);
      const color = new THREE.Color().setHSL(hue, saturation, lightness);
      return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.1,
      });
    });

    // --- Jellyfish ---
    this.geometryRegistry.set('jellyfish', (seed, lod) => {
      const rng = new SeededRandom(seed);
      const segments = Math.max(8, 16 - lod * 2);
      const bellRadius = rng.uniform(0.06, 0.15);
      const bellHeight = rng.uniform(0.04, 0.1);
      const tentacleCount = rng.nextInt(4, 8);
      const tentacleSegments = Math.max(4, 8 - lod * 2);

      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      // Bell: hemisphere dome
      const bellRings = Math.max(4, 8 - lod);
      // Apex
      positions.push(0, bellHeight, 0);
      normals.push(0, 1, 0);
      uvs.push(0.5, 0);

      for (let r = 1; r <= bellRings; r++) {
        const t = r / bellRings;
        const ringY = bellHeight * (1 - t * t); // Parabolic dome
        const ringRadius = bellRadius * Math.sin(t * Math.PI * 0.5);

        for (let s = 0; s < segments; s++) {
          const angle = (s / segments) * Math.PI * 2;
          const px = Math.cos(angle) * ringRadius;
          const pz = Math.sin(angle) * ringRadius;
          positions.push(px, ringY, pz);
          normals.push(px, 0.5, pz);
          uvs.push(s / segments, t);

          if (r < bellRings) {
            const curr = 1 + (r - 1) * segments + s;
            const next = 1 + (r - 1) * segments + ((s + 1) % segments);
            const currAbove = 1 + r * segments + s;
            const nextAbove = 1 + r * segments + ((s + 1) % segments);

            if (r === 1) {
              indices.push(0, next, curr);
            }
            indices.push(curr, next, currAbove);
            indices.push(next, nextAbove, currAbove);
          }
        }
      }

      // Tentacles: thin strips hanging from bell edge
      const bellEdgeStart = 1 + (bellRings - 1) * segments;
      for (let t = 0; t < tentacleCount; t++) {
        const tentAngle = (t / tentacleCount) * Math.PI * 2;
        const segIdx = Math.floor((t / tentacleCount) * segments);
        const baseVertex = bellEdgeStart + segIdx;

        // Get base position
        const bx = positions[baseVertex * 3];
        const by = positions[baseVertex * 3 + 1];
        const bz = positions[baseVertex * 3 + 2];

        const tentLength = rng.uniform(0.1, 0.3);
        const tentBaseIdx = positions.length / 3;

        for (let s = 0; s <= tentacleSegments; s++) {
          const st = s / tentacleSegments;
          // Tentacle curves outward and downward
          const sx = bx + Math.cos(tentAngle) * st * 0.02;
          const sy = by - st * tentLength;
          const sz = bz + Math.sin(tentAngle) * st * 0.02;

          // Two vertices per segment for thin strip
          const stripWidth = 0.003 * (1 - st * 0.5);
          positions.push(sx - stripWidth, sy, sz);
          normals.push(0, 0, 1);
          uvs.push(0, st);

          positions.push(sx + stripWidth, sy, sz);
          normals.push(0, 0, 1);
          uvs.push(1, st);

          if (s > 0) {
            const vi = tentBaseIdx + s * 2;
            indices.push(vi - 2, vi - 1, vi);
            indices.push(vi - 1, vi + 1, vi);
          }
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    });
    this.materialRegistry.set('jellyfish', (seed, _season) => {
      const rng = new SeededRandom(seed + 700);
      // Translucent jellyfish colors: pale blue, pink, or white
      const hue = rng.choice([0.55, 0.58, 0.92, 0.0]);
      const saturation = rng.uniform(0.2, 0.6);
      const lightness = rng.uniform(0.7, 0.9);
      const color = new THREE.Color().setHSL(hue, saturation, lightness);
      return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.2,
        metalness: 0.0,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      });
    });
  }
}
