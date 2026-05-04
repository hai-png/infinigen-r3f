/**
 * ChunkedTerrainSystem.ts
 *
 * Splits terrain into a grid of independent chunks, each with its own
 * LOD level.  Distance-based LOD selection reduces polygon count for
 * distant terrain while preserving detail near the camera.
 *
 * Features:
 *  - Configurable grid (default 4×4)
 *  - Three LOD levels: LOD0 (full), LOD1 (half), LOD2 (quarter)
 *  - Distance-based LOD switching from camera position
 *  - Seam stitching between chunks at different LOD levels
 *  - Each chunk generates terrain data from TerrainGenerator independently
 */

import * as THREE from 'three';
import { TerrainGenerator, type TerrainData } from '@/terrain/core/TerrainGenerator';
import { TerrainSurfaceShaderPipeline } from '@/terrain/gpu/TerrainSurfaceShaderPipeline';
import type { SignedDistanceField } from '@/terrain/sdf/sdf-operations';
import { ChunkStitcher } from '@/terrain/mesher/ChunkStitcher';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChunkedTerrainConfig {
  /** Number of chunks along X axis */
  chunksX: number;
  /** Number of chunks along Z axis */
  chunksZ: number;
  /** World-space size of the entire terrain */
  worldSize: number;
  /** Vertical scaling factor */
  heightScale: number;
  /** Base grid resolution per chunk at LOD0 */
  baseResolution: number;
  /** LOD distances: [lod0MaxDist, lod1MaxDist] — beyond lod1MaxDist uses LOD2 */
  lodDistances: [number, number];
  /** TerrainGenerator seed */
  seed: number;
  /** Terrain scale (noise frequency) */
  terrainScale: number;
  /** Terrain octaves */
  octaves: number;
  /** Terrain persistence */
  persistence: number;
  /** Terrain lacunarity */
  lacunarity: number;
  /** Erosion strength */
  erosionStrength: number;
  /** Erosion iterations */
  erosionIterations: number;
  /** Tectonic plates */
  tectonicPlates: number;
  /** Sea level */
  seaLevel: number;
}

const DEFAULT_CHUNKED_CONFIG: ChunkedTerrainConfig = {
  chunksX: 4,
  chunksZ: 4,
  worldSize: 200,
  heightScale: 35,
  baseResolution: 128,
  lodDistances: [60, 150],
  seed: 42,
  terrainScale: 60,
  octaves: 6,
  persistence: 0.5,
  lacunarity: 2.0,
  erosionStrength: 0.3,
  erosionIterations: 10,
  tectonicPlates: 3,
  seaLevel: 0.3,
};

/** LOD level descriptor */
export enum LODLevel {
  LOD0 = 0, // Full resolution
  LOD1 = 1, // Half resolution
  LOD2 = 2, // Quarter resolution
}

/** Resolution multiplier per LOD level */
const LOD_RESOLUTION_SCALE: Record<LODLevel, number> = {
  [LODLevel.LOD0]: 1.0,
  [LODLevel.LOD1]: 0.5,
  [LODLevel.LOD2]: 0.25,
};

/** A single terrain chunk */
export interface TerrainChunk {
  /** Grid position (column, row) */
  col: number;
  row: number;
  /** Current LOD level */
  lod: LODLevel;
  /** THREE.js mesh */
  mesh: THREE.Mesh;
  /** Chunk geometry */
  geometry: THREE.BufferGeometry;
  /** Terrain data for this chunk */
  terrainData: TerrainData;
  /** World-space bounds */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Center of the chunk in world space */
  center: THREE.Vector3;
}

// ---------------------------------------------------------------------------
// ChunkedTerrainSystem
// ---------------------------------------------------------------------------

export class ChunkedTerrainSystem {
  private config: ChunkedTerrainConfig;
  private chunks: TerrainChunk[] = [];
  private group: THREE.Group;
  private stitcher: ChunkStitcher;
  private chunkSize: number;
  private needsStitching: boolean = false;

  // -----------------------------------------------------------------------
  // Surface Shader Pipeline Integration
  // -----------------------------------------------------------------------

  /**
   * Optional surface shader pipeline for SDF-based displacement.
   * Set via `setSurfaceShaderPipeline()`.
   */
  private surfaceShaderPipeline: TerrainSurfaceShaderPipeline | null = null;

  constructor(config: Partial<ChunkedTerrainConfig> = {}) {
    this.config = { ...DEFAULT_CHUNKED_CONFIG, ...config };
    this.group = new THREE.Group();
    this.stitcher = new ChunkStitcher();
    this.chunkSize = this.config.worldSize / this.config.chunksX;
  }

  // -----------------------------------------------------------------------
  // Surface Shader Pipeline — Public API
  // -----------------------------------------------------------------------

  /**
   * Set the surface shader pipeline for displacement.
   *
   * When attached and initialized, `generateWithDisplacement()` will apply
   * SDF-based displacement to each chunk's geometry after generation.
   *
   * Pass `null` to detach the pipeline.
   */
  setSurfaceShaderPipeline(pipeline: TerrainSurfaceShaderPipeline | null): void {
    this.surfaceShaderPipeline = pipeline;
  }

  /**
   * Check whether the surface shader pipeline is attached and initialized.
   */
  isSurfaceShaderReady(): boolean {
    return this.surfaceShaderPipeline !== null && this.surfaceShaderPipeline.isInitialized();
  }

  /**
   * Generate all terrain chunks and optionally apply surface displacement.
   *
   * This is the async counterpart to `generate()`.  If a surface shader
   * pipeline is attached and initialized, each chunk's geometry is refined
   * via SDF-based displacement before being added to the scene.
   *
   * The displaced geometry replaces the original in the TerrainChunk and
   * the corresponding mesh is updated.
   *
   * @param sdf - The signed distance field for displacement.
   *              Required if pipeline is attached; ignored otherwise.
   * @returns   The THREE.Group containing all chunk meshes
   */
  async generateWithDisplacement(sdf?: SignedDistanceField): Promise<THREE.Group> {
    // Generate base chunks synchronously
    const group = this.generate();

    // Apply displacement to each chunk if pipeline is available
    if (this.surfaceShaderPipeline && this.surfaceShaderPipeline.isInitialized() && sdf) {
      for (const chunk of this.chunks) {
        try {
          const displacedGeometry = await this.surfaceShaderPipeline.computeDisplacement(
            chunk.geometry,
            sdf,
          );

          if (displacedGeometry !== chunk.geometry) {
            chunk.geometry.dispose();
            chunk.geometry = displacedGeometry;

            // Update the mesh to use the displaced geometry
            chunk.mesh.geometry = displacedGeometry;

            // Recompute bounding volumes
            displacedGeometry.computeBoundingBox();
            displacedGeometry.computeBoundingSphere();
          }
        } catch (err) {
          console.warn(
            `[ChunkedTerrainSystem] Surface displacement failed for chunk [${chunk.col},${chunk.row}]:`,
            err,
          );
        }
      }

      // Re-stitch seams after displacement
      this.stitchAllSeams();
    }

    return group;
  }

  /**
   * Apply surface displacement to existing chunks in place.
   *
   * Useful when chunks have already been generated (via `generate()`) and
   * you want to apply displacement after the fact.
   *
   * @param sdf - The signed distance field for displacement
   */
  async applyDisplacementToChunks(sdf: SignedDistanceField): Promise<void> {
    if (!this.surfaceShaderPipeline || !this.surfaceShaderPipeline.isInitialized()) {
      return;
    }

    for (const chunk of this.chunks) {
      try {
        const displacedGeometry = await this.surfaceShaderPipeline.computeDisplacement(
          chunk.geometry,
          sdf,
        );

        if (displacedGeometry !== chunk.geometry) {
          chunk.geometry.dispose();
          chunk.geometry = displacedGeometry;
          chunk.mesh.geometry = displacedGeometry;

          displacedGeometry.computeBoundingBox();
          displacedGeometry.computeBoundingSphere();
        }
      } catch (err) {
        console.warn(
          `[ChunkedTerrainSystem] Surface displacement failed for chunk [${chunk.col},${chunk.row}]:`,
          err,
        );
      }
    }

    // Re-stitch seams after displacement
    this.stitchAllSeams();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Generate all terrain chunks.  Must be called in a browser context
   * because TerrainGenerator may use canvas internally.
   */
  generate(): THREE.Group {
    this.dispose(); // Clean up previous state

    const { chunksX, chunksZ } = this.config;

    for (let row = 0; row < chunksZ; row++) {
      for (let col = 0; col < chunksX; col++) {
        const chunk = this.generateChunk(col, row, LODLevel.LOD0);
        this.chunks.push(chunk);
        this.group.add(chunk.mesh);
      }
    }

    // Initial stitch pass
    this.stitchAllSeams();

    return this.group;
  }

  /**
   * Update LOD levels based on camera position.
   * Call from useFrame or similar per-frame hook.
   */
  updateLOD(cameraPosition: THREE.Vector3): void {
    let changed = false;

    for (const chunk of this.chunks) {
      const dist = cameraPosition.distanceTo(chunk.center);
      const newLod = this.selectLOD(dist);

      if (newLod !== chunk.lod) {
        this.rebuildChunkAtLOD(chunk, newLod);
        changed = true;
      }
    }

    if (changed) {
      this.needsStitching = true;
    }

    // Defer stitching to avoid per-frame cost every frame
    if (this.needsStitching) {
      this.stitchAllSeams();
      this.needsStitching = false;
    }
  }

  /**
   * Get the group containing all chunk meshes.
   */
  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Get all terrain chunks.
   */
  getChunks(): TerrainChunk[] {
    return this.chunks;
  }

  /**
   * Get terrain data at a specific chunk.
   */
  getChunkTerrainData(col: number, row: number): TerrainData | null {
    const chunk = this.chunks.find(c => c.col === col && c.row === row);
    return chunk?.terrainData ?? null;
  }

  /**
   * Dispose all GPU resources.
   */
  dispose(): void {
    for (const chunk of this.chunks) {
      chunk.geometry.dispose();
      if (chunk.mesh.material instanceof THREE.Material) {
        chunk.mesh.material.dispose();
      }
    }
    this.chunks = [];
    // Clear group children
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
  }

  // -----------------------------------------------------------------------
  // Chunk Generation
  // -----------------------------------------------------------------------

  private generateChunk(col: number, row: number, lod: LODLevel): TerrainChunk {
    const { worldSize, heightScale, baseResolution, seed } = this.config;
    const resScale = LOD_RESOLUTION_SCALE[lod];
    const resolution = Math.max(8, Math.floor(baseResolution * resScale));

    // Compute world-space bounds for this chunk
    const halfWorld = worldSize / 2;
    const minX = -halfWorld + col * this.chunkSize;
    const maxX = -halfWorld + (col + 1) * this.chunkSize;
    const minZ = -halfWorld + row * this.chunkSize;
    const maxZ = -halfWorld + (row + 1) * this.chunkSize;

    // Generate terrain data for this chunk
    const terrainData = this.generateChunkTerrainData(resolution, col, row);

    // Build geometry
    const geometry = this.buildChunkGeometry(terrainData, resolution, heightScale);

    // Create mesh with vertex colors (materials will be assigned by TerrainMaterialSystem)
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.FrontSide,
      flatShading: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(minX, 0, minZ);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const center = new THREE.Vector3(
      (minX + maxX) / 2,
      0,
      (minZ + maxZ) / 2,
    );

    return {
      col,
      row,
      lod,
      mesh,
      geometry,
      terrainData,
      bounds: { minX, maxX, minZ, maxZ },
      center,
    };
  }

  /**
   * Generate terrain data for a single chunk.
   * Uses a seeded offset so each chunk produces unique but continuous terrain.
   */
  private generateChunkTerrainData(resolution: number, col: number, row: number): TerrainData {
    const { seed, terrainScale, octaves, persistence, lacunarity, erosionStrength, erosionIterations, tectonicPlates, seaLevel } = this.config;

    // Create a per-chunk generator with a deterministic seed offset
    const chunkSeed = seed + col * 1000 + row * 37;

    const generator = new TerrainGenerator({
      seed: chunkSeed,
      width: resolution,
      height: resolution,
      scale: terrainScale,
      octaves,
      persistence,
      lacunarity,
      erosionStrength,
      erosionIterations,
      tectonicPlates,
      seaLevel,
    });

    return generator.generate();
  }

  /**
   * Build a THREE.BufferGeometry from terrain data.
   */
  private buildChunkGeometry(
    terrainData: TerrainData,
    resolution: number,
    heightScale: number,
  ): THREE.BufferGeometry {
    const { data: heightData } = terrainData.heightMap;
    const { biomeMask } = terrainData;

    // Biome colors for vertex coloring
    const BIOME_COLORS: Record<number, [number, number, number]> = {
      0: [0.06, 0.15, 0.40],
      1: [0.12, 0.30, 0.50],
      2: [0.76, 0.72, 0.48],
      3: [0.28, 0.55, 0.18],
      4: [0.38, 0.45, 0.20],
      5: [0.18, 0.44, 0.12],
      6: [0.28, 0.36, 0.14],
      7: [0.48, 0.43, 0.38],
      8: [0.90, 0.92, 0.96],
    };

    const geo = new THREE.PlaneGeometry(
      this.chunkSize,
      this.chunkSize,
      resolution - 1,
      resolution - 1,
    );
    geo.rotateX(-Math.PI / 2);

    const positions = geo.attributes.position as THREE.BufferAttribute;
    const colorArray = new Float32Array(positions.count * 3);

    for (let i = 0; i < positions.count; i++) {
      const h = heightData[i] ?? 0;
      positions.setY(i, h * heightScale);

      const biome = biomeMask[i] ?? 3;
      const [r, g, b] = BIOME_COLORS[biome] ?? BIOME_COLORS[3];
      colorArray[i * 3] = r;
      colorArray[i * 3 + 1] = g;
      colorArray[i * 3 + 2] = b;
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colorArray, 3));
    geo.computeVertexNormals();

    return geo;
  }

  // -----------------------------------------------------------------------
  // LOD Selection
  // -----------------------------------------------------------------------

  private selectLOD(distance: number): LODLevel {
    const [lod0Dist, lod1Dist] = this.config.lodDistances;
    if (distance < lod0Dist) return LODLevel.LOD0;
    if (distance < lod1Dist) return LODLevel.LOD1;
    return LODLevel.LOD2;
  }

  /**
   * Rebuild a single chunk at a different LOD level.
   */
  private rebuildChunkAtLOD(chunk: TerrainChunk, newLod: LODLevel): void {
    // Dispose old geometry
    chunk.geometry.dispose();

    // Generate new chunk at requested LOD
    const newChunk = this.generateChunk(chunk.col, chunk.row, newLod);

    // Update existing chunk data
    chunk.lod = newLod;
    chunk.geometry = newChunk.geometry;
    chunk.terrainData = newChunk.terrainData;

    // Update mesh
    chunk.mesh.geometry = newChunk.geometry;
  }

  // -----------------------------------------------------------------------
  // Seam Stitching
  // -----------------------------------------------------------------------

  private stitchAllSeams(): void {
    const { chunksX, chunksZ } = this.config;

    for (const chunk of this.chunks) {
      const { col, row } = chunk;

      // Stitch with right neighbour
      if (col < chunksX - 1) {
        const neighbor = this.findChunk(col + 1, row);
        if (neighbor && chunk.lod !== neighbor.lod) {
          this.stitchPair(chunk, neighbor, 'right');
        }
      }

      // Stitch with bottom neighbour
      if (row < chunksZ - 1) {
        const neighbor = this.findChunk(col, row + 1);
        if (neighbor && chunk.lod !== neighbor.lod) {
          this.stitchPair(chunk, neighbor, 'bottom');
        }
      }
    }
  }

  private findChunk(col: number, row: number): TerrainChunk | undefined {
    return this.chunks.find(c => c.col === col && c.row === row);
  }

  private stitchPair(
    primary: TerrainChunk,
    neighbor: TerrainChunk,
    direction: 'right' | 'bottom',
  ): void {
    const dirKey = direction === 'right' ? 'right' : 'bottom';
    const stitched = this.stitcher.stitchChunks(
      primary.geometry,
      neighbor.geometry,
      dirKey as 'right' | 'left' | 'top' | 'bottom',
    );

    // Replace primary geometry with stitched version
    primary.mesh.geometry = stitched;
    primary.geometry = stitched;
  }
}

export default ChunkedTerrainSystem;
