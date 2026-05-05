/**
 * Fluid-Terrain Coupling System + Water Plane Height Propagation (P1 Water)
 *
 * Bridges the WaterbodyElement SDF (P0) with the Three.js rendering pipeline
 * by computing shoreline geometry, underwater masks, foam strips, and material
 * blending — all the information downstream systems (creatures, scatter
 * density, underwater materials) need to react to the presence of water.
 *
 * Six top-level classes:
 * 1. FluidTerrainCoupling       — orchestrates boolean water-terrain intersection
 * 2. ShorelineExtractor         — walks triangle edges to find water-plane contour
 * 3. UnderwaterMaskGenerator    — classifies vertices as above/below water
 * 4. WaterSceneInfo             — propagates water plane height to downstream
 * 5. ShorelineFoamRenderer      — thin foam strip mesh along shoreline
 * 6. TerrainWaterMaterialMixer  — custom ShaderMaterial blending above/below
 *
 * @module water/FluidTerrainCoupling
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Shared Types
// ============================================================================

/**
 * Result of coupling a water mesh with a terrain mesh.
 *
 * Contains all derived geometric data needed for rendering: shoreline
 * polylines, underwater mask, foam strip, and clipping mask.
 */
export interface CoupledWaterTerrainResult {
  /** Shoreline contour polylines as THREE.LineSegments */
  shorelineLines: THREE.LineSegments;
  /** Underwater mask (1 = below water, 0 = above) as a DataTexture */
  underwaterMask: THREE.DataTexture;
  /** Foam strip mesh along the shoreline */
  foamMesh: THREE.Mesh;
  /** Terrain clipping mask — per-vertex float, 1 where terrain is above water */
  terrainClipMask: Float32Array;
  /** Number of disconnected shoreline loops found */
  shorelineLoopCount: number;
  /** Total shoreline length in world units */
  shorelineLength: number;
  /** Bounding box of the underwater region */
  underwaterBounds: THREE.Box3;
}

/**
 * Result of generating an underwater mask for terrain geometry.
 *
 * Provides both a float texture (for shader sampling) and per-vertex
 * color data (for vertex-color based blending).
 */
export interface UnderwaterMaskResult {
  /** Float DataTexture: 0 = above water, 1 = below water */
  maskTexture: THREE.DataTexture;
  /** Per-vertex underwater factor (same values as texture, indexed by vertex) */
  vertexMask: Float32Array;
  /** Width of the mask texture */
  width: number;
  /** Height of the mask texture */
  height: number;
  /** World-space bounds the mask covers */
  bounds: THREE.Box3;
}

/**
 * Scene-level water information propagated to downstream systems.
 *
 * Extracted from WaterbodyElement and terrain geometry; provides accessor
 * methods for creatures, scatter density, and material systems.
 */
export interface WaterSceneInfoData {
  /** Water surface Y coordinate (water_plane_height) */
  waterPlaneHeight: number;
  /** 3D bounds of the submerged terrain region */
  underwaterBounds: THREE.Box3;
  /** Water depth at each sampled terrain point (waterPlaneHeight - terrainHeight) */
  depthMap: Float32Array;
  /** Grid resolution of the depth map along X */
  depthMapWidth: number;
  /** Grid resolution of the depth map along Z */
  depthMapHeight: number;
  /** World-space bounds the depth map covers */
  depthMapBounds: THREE.Box3;
}

/**
 * Configuration for shoreline foam rendering.
 */
export interface FoamConfig {
  /** Width of the foam strip in world units (default 0.5) */
  foamWidth: number;
  /** Distance over which foam fades to zero opacity (default 2.0) */
  fadeOutDistance: number;
  /** Foam base color (default white) */
  color: THREE.Color;
  /** Emission intensity for the foam material (default 0.3) */
  emissionIntensity: number;
  /** Roughness of foam material (default 0.95) */
  roughness: number;
  /** Noise-based opacity animation speed (default 1.0) */
  animationSpeed: number;
  /** Noise scale for opacity variation (default 5.0) */
  noiseScale: number;
}

/** Default foam configuration */
export const DEFAULT_FOAM_CONFIG: FoamConfig = {
  foamWidth: 0.5,
  fadeOutDistance: 2.0,
  color: new THREE.Color(0xffffff),
  emissionIntensity: 0.3,
  roughness: 0.95,
  animationSpeed: 1.0,
  noiseScale: 5.0,
};

/**
 * Configuration for fluid-terrain coupling.
 */
export interface FluidTerrainCouplingConfig {
  /** Water plane height (Y coordinate) for intersection computation */
  waterPlaneHeight: number;
  /** Resolution of the underwater mask texture (default 256) */
  maskResolution: number;
  /** Width of the transition zone at waterline for smooth blending (default 0.5) */
  transitionWidth: number;
  /** Foam strip configuration */
  foamConfig: Partial<FoamConfig>;
  /** Maximum shoreline segments to extract (0 = unlimited, default 0) */
  maxShorelineSegments: number;
}

/** Default coupling configuration */
export const DEFAULT_COUPLING_CONFIG: FluidTerrainCouplingConfig = {
  waterPlaneHeight: 0.5,
  maskResolution: 256,
  transitionWidth: 0.5,
  foamConfig: {},
  maxShorelineSegments: 0,
};

// ============================================================================
// 1. FluidTerrainCoupling
// ============================================================================

/**
 * Orchestrates boolean water-terrain intersection analysis.
 *
 * Takes a water surface mesh (typically from WaterbodyElement or OceanSystem)
 * and a terrain mesh, computes the geometric intersection, and produces all
 * derived data needed for rendering: shoreline contour, underwater mask,
 * foam strip, and terrain clipping mask.
 *
 * Usage:
 * ```typescript
 * const coupling = new FluidTerrainCoupling(config);
 * const result = coupling.coupleFluidToTerrain(waterMesh, terrainMesh, config);
 * scene.add(result.shorelineLines);
 * scene.add(result.foamMesh);
 * ```
 */
export class FluidTerrainCoupling {
  private config: FluidTerrainCouplingConfig;

  constructor(config: Partial<FluidTerrainCouplingConfig> = {}) {
    this.config = { ...DEFAULT_COUPLING_CONFIG, ...config };
    if (config.foamConfig) {
      this.config.foamConfig = { ...DEFAULT_FOAM_CONFIG, ...config.foamConfig };
    } else {
      this.config.foamConfig = { ...DEFAULT_FOAM_CONFIG };
    }
  }

  /**
   * Perform full fluid-terrain coupling analysis.
   *
   * Computes shoreline, underwater mask, foam strip, and clipping mask
   * from the intersection of a water surface mesh and a terrain mesh.
   *
   * @param waterMesh - The water surface mesh (position.y defines water level per vertex)
   * @param terrainMesh - The terrain mesh to analyze
   * @param config - Optional per-call configuration overrides
   * @returns CoupledWaterTerrainResult with all derived geometric data
   */
  coupleFluidToTerrain(
    waterMesh: THREE.Mesh,
    terrainMesh: THREE.Mesh,
    config?: Partial<FluidTerrainCouplingConfig>
  ): CoupledWaterTerrainResult {
    const effectiveConfig: FluidTerrainCouplingConfig = {
      ...this.config,
      ...config,
    };

    const waterPlaneHeight = effectiveConfig.waterPlaneHeight;

    // 1. Extract shoreline
    const shorelineExtractor = new ShorelineExtractor();
    const terrainGeo = terrainMesh.geometry;
    const shorelineLines = shorelineExtractor.extractShoreline(
      waterPlaneHeight,
      terrainGeo
    );

    // 2. Generate underwater mask
    const maskGenerator = new UnderwaterMaskGenerator();
    const maskResult = maskGenerator.generateMask(
      terrainMesh,
      waterPlaneHeight,
      effectiveConfig.maskResolution,
      effectiveConfig.transitionWidth
    );

    // 3. Create foam strip along shoreline
    const foamConfig: FoamConfig = {
      ...DEFAULT_FOAM_CONFIG,
      ...effectiveConfig.foamConfig,
    };
    const foamRenderer = new ShorelineFoamRenderer();
    const foamMesh = foamRenderer.createFoamMesh(
      shorelineExtractor.getLastIntersectionPoints(),
      foamConfig
    );

    // 4. Compute terrain clipping mask (1 above water, 0 below)
    const posAttr = terrainGeo.getAttribute('position');
    const vertexCount = posAttr.count;
    const terrainClipMask = new Float32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      const y = posAttr.getY(i);
      terrainClipMask[i] = y >= waterPlaneHeight ? 1.0 : 0.0;
    }

    // 5. Compute underwater bounds
    const underwaterBounds = this.computeUnderwaterBounds(
      terrainMesh,
      waterPlaneHeight
    );

    // 6. Compute shoreline length and loop count
    const shorelineLoopCount = shorelineExtractor.getLastLoopCount();
    const shorelineLength = shorelineExtractor.getLastTotalLength();

    return {
      shorelineLines,
      underwaterMask: maskResult.maskTexture,
      foamMesh,
      terrainClipMask,
      shorelineLoopCount,
      shorelineLength,
      underwaterBounds,
    };
  }

  /**
   * Compute the bounding box of the submerged terrain region.
   *
   * Walks terrain vertices below waterPlaneHeight and expands the box.
   */
  private computeUnderwaterBounds(
    terrainMesh: THREE.Mesh,
    waterPlaneHeight: number
  ): THREE.Box3 {
    const geo = terrainMesh.geometry;
    const posAttr = geo.getAttribute('position');
    const bounds = new THREE.Box3();

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      if (y < waterPlaneHeight) {
        bounds.expandByPoint(new THREE.Vector3(x, y, z));
      }
    }

    // If no points are underwater, return an empty box centered at the water plane
    if (bounds.isEmpty()) {
      const center = new THREE.Vector3();
      geo.computeBoundingBox();
      const terrainBox = geo.boundingBox ?? new THREE.Box3();
      terrainBox.getCenter(center);
      bounds.set(
        new THREE.Vector3(center.x, waterPlaneHeight - 1, center.z),
        new THREE.Vector3(center.x, waterPlaneHeight, center.z)
      );
    }

    return bounds;
  }

  /**
   * Update configuration at runtime.
   */
  updateConfig(partial: Partial<FluidTerrainCouplingConfig>): void {
    Object.assign(this.config, partial);
  }

  /**
   * Get current configuration.
   */
  getConfig(): FluidTerrainCouplingConfig {
    return { ...this.config };
  }
}

// ============================================================================
// 2. ShorelineExtractor
// ============================================================================

/**
 * Extracts shoreline contour lines where a water plane intersects terrain.
 *
 * Walks terrain triangle edges, finds intersection points with the water
 * plane height, and connects them into continuous shoreline polylines.
 * Handles multiple disconnected shoreline loops (islands, lakes).
 *
 * Algorithm:
 * 1. For each triangle, check if any edge crosses the water plane height
 * 2. Compute exact intersection point via linear interpolation
 * 3. Connect intersection points within the same triangle
 * 4. Collect resulting line segments into THREE.LineSegments
 */
export class ShorelineExtractor {
  /** Cached intersection points from the last extraction */
  private lastIntersectionPoints: THREE.Vector3[] = [];
  /** Cached loop count from the last extraction */
  private lastLoopCount: number = 0;
  /** Cached total shoreline length from the last extraction */
  private lastTotalLength: number = 0;

  /**
   * Extract shoreline contour from terrain geometry at a given water plane height.
   *
   * @param waterPlaneHeight - Y coordinate of the water surface
   * @param terrainGeometry - The terrain BufferGeometry to analyze
   * @returns THREE.LineSegments containing all shoreline line segments
   */
  extractShoreline(
    waterPlaneHeight: number,
    terrainGeometry: THREE.BufferGeometry
  ): THREE.LineSegments {
    this.lastIntersectionPoints = [];
    this.lastLoopCount = 0;
    this.lastTotalLength = 0;

    const posAttr = terrainGeometry.getAttribute('position');
    const indexAttr = terrainGeometry.getIndex();

    // Accumulate line segment vertices
    const lineVertices: number[] = [];
    // Track per-triangle intersections for loop detection
    const triangleIntersections: Map<number, THREE.Vector3[]> = new Map();

    const v0 = new THREE.Vector3();
    const v1 = new THREE.Vector3();
    const v2 = new THREE.Vector3();

    /**
     * Process a single triangle defined by three vertex indices.
     * Finds where triangle edges cross the water plane and records
     * intersection segments.
     */
    const processTriangle = (i0: number, i1: number, i2: number, triIdx: number): void => {
      v0.fromBufferAttribute(posAttr, i0);
      v1.fromBufferAttribute(posAttr, i1);
      v2.fromBufferAttribute(posAttr, i2);

      // Find edge intersections with water plane
      const intersections: THREE.Vector3[] = [];

      // Edge v0-v1
      const p01 = this.edgeWaterIntersection(v0, v1, waterPlaneHeight);
      if (p01 !== null) intersections.push(p01);

      // Edge v1-v2
      const p12 = this.edgeWaterIntersection(v1, v2, waterPlaneHeight);
      if (p12 !== null) intersections.push(p12);

      // Edge v2-v0
      const p20 = this.edgeWaterIntersection(v2, v0, waterPlaneHeight);
      if (p20 !== null) intersections.push(p20);

      // A triangle can intersect the water plane at 0 or 2 points
      // (or degenerately at 1 point if a vertex is exactly at water level)
      if (intersections.length >= 2) {
        // Create a line segment between the first two intersection points
        const pA = intersections[0];
        const pB = intersections[1];

        lineVertices.push(pA.x, pA.y, pA.z, pB.x, pB.y, pB.z);

        this.lastIntersectionPoints.push(pA.clone(), pB.clone());
        this.lastTotalLength += pA.distanceTo(pB);

        triangleIntersections.set(triIdx, intersections);
      } else if (intersections.length === 1) {
        // Vertex exactly at water level — record but don't create a segment alone
        this.lastIntersectionPoints.push(intersections[0].clone());
      }
    };

    // Iterate over all triangles
    let triIdx = 0;
    if (indexAttr !== null) {
      // Indexed geometry
      for (let i = 0; i < indexAttr.count; i += 3) {
        processTriangle(
          indexAttr.getX(i),
          indexAttr.getX(i + 1),
          indexAttr.getX(i + 2),
          triIdx++
        );
      }
    } else {
      // Non-indexed geometry
      for (let i = 0; i < posAttr.count; i += 3) {
        processTriangle(i, i + 1, i + 2, triIdx++);
      }
    }

    // Estimate loop count by analyzing connected components
    this.lastLoopCount = this.estimateLoopCount(triangleIntersections);

    // Create LineSegments geometry
    const lineGeometry = new THREE.BufferGeometry();
    const linePositions = new Float32Array(lineVertices);
    lineGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(linePositions, 3)
    );

    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      linewidth: 2,
    });

    return new THREE.LineSegments(lineGeometry, lineMaterial);
  }

  /**
   * Find the intersection of a triangle edge with the water plane.
   *
   * Uses linear interpolation between the two edge endpoints.
   * Returns null if the edge does not cross the water plane.
   *
   * @param a - First vertex of the edge
   * @param b - Second vertex of the edge
   * @param waterY - Water plane Y coordinate
   * @returns Intersection point, or null if no crossing
   */
  private edgeWaterIntersection(
    a: THREE.Vector3,
    b: THREE.Vector3,
    waterY: number
  ): THREE.Vector3 | null {
    // Check if the edge crosses the water plane
    const aBelow = a.y < waterY;
    const bBelow = b.y < waterY;

    if (aBelow === bBelow) {
      // Both on same side — no crossing (unless exactly at water level)
      if (Math.abs(a.y - waterY) < 1e-6) return a.clone();
      if (Math.abs(b.y - waterY) < 1e-6) return b.clone();
      return null;
    }

    // Linear interpolation to find exact intersection
    const t = (waterY - a.y) / (b.y - a.y);
    return new THREE.Vector3(
      a.x + t * (b.x - a.x),
      waterY,
      a.z + t * (b.z - a.z)
    );
  }

  /**
   * Estimate the number of disconnected shoreline loops.
   *
   * Uses a simple heuristic: count connected components of triangles
   * that share intersection points within a small epsilon.
   */
  private estimateLoopCount(
    triangleIntersections: Map<number, THREE.Vector3[]>
  ): number {
    if (triangleIntersections.size === 0) return 0;

    const epsilon = 0.1;
    const visited = new Set<number>();
    let loopCount = 0;

    // Build adjacency: which triangles share intersection points?
    const triIndices = Array.from(triangleIntersections.keys());
    const adjacency = new Map<number, number[]>();

    for (const idx of triIndices) {
      adjacency.set(idx, []);
    }

    for (let i = 0; i < triIndices.length; i++) {
      for (let j = i + 1; j < triIndices.length; j++) {
        const aIdx = triIndices[i];
        const bIdx = triIndices[j];
        const aPoints = triangleIntersections.get(aIdx)!;
        const bPoints = triangleIntersections.get(bIdx)!;

        // Check if any intersection points are close
        let connected = false;
        for (const pa of aPoints) {
          for (const pb of bPoints) {
            if (pa.distanceTo(pb) < epsilon) {
              connected = true;
              break;
            }
          }
          if (connected) break;
        }

        if (connected) {
          adjacency.get(aIdx)!.push(bIdx);
          adjacency.get(bIdx)!.push(aIdx);
        }
      }
    }

    // BFS to count connected components
    for (const startIdx of triIndices) {
      if (visited.has(startIdx)) continue;
      loopCount++;

      const queue: number[] = [startIdx];
      visited.add(startIdx);

      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const neighbor of adjacency.get(current) ?? []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
    }

    return loopCount;
  }

  /**
   * Get the intersection points from the last extraction.
   */
  getLastIntersectionPoints(): THREE.Vector3[] {
    return this.lastIntersectionPoints;
  }

  /**
   * Get the loop count from the last extraction.
   */
  getLastLoopCount(): number {
    return this.lastLoopCount;
  }

  /**
   * Get the total shoreline length from the last extraction.
   */
  getLastTotalLength(): number {
    return this.lastTotalLength;
  }
}

// ============================================================================
// 3. UnderwaterMaskGenerator
// ============================================================================

/**
 * Generates an underwater mask for terrain geometry.
 *
 * Classifies each terrain vertex as above or below the water plane height,
 * produces a float texture (0=above, 1=below water) for shader usage, and
 * computes a smooth transition zone at the waterline for blending.
 *
 * The mask can be sampled in custom ShaderMaterials to apply underwater
 * effects (blue-green tint, caustics, refraction) only where terrain
 * is submerged.
 */
export class UnderwaterMaskGenerator {
  /**
   * Generate an underwater mask for terrain geometry.
   *
   * Creates a 2D float texture mapping the XZ extents of the terrain,
   * where each texel stores 0.0 (above water) or 1.0 (below water)
   * with a smooth transition zone at the waterline.
   *
   * @param terrainMesh - The terrain mesh to analyze
   * @param waterPlaneHeight - Y coordinate of the water surface
   * @param resolution - Resolution of the output mask texture (default 256)
   * @param transitionWidth - Width of the smooth transition zone (default 0.5)
   * @returns UnderwaterMaskResult with mask texture and per-vertex data
   */
  generateMask(
    terrainMesh: THREE.Mesh,
    waterPlaneHeight: number,
    resolution: number = 256,
    transitionWidth: number = 0.5
  ): UnderwaterMaskResult {
    const geo = terrainMesh.geometry;
    const posAttr = geo.getAttribute('position');

    // Compute terrain XZ bounds
    const bounds = new THREE.Box3().setFromBufferAttribute(posAttr as THREE.BufferAttribute);
    const size = bounds.getSize(new THREE.Vector3());

    // Per-vertex classification
    const vertexCount = posAttr.count;
    const vertexMask = new Float32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      const y = posAttr.getY(i);
      const dist = y - waterPlaneHeight;

      if (dist < -transitionWidth) {
        vertexMask[i] = 1.0; // Fully below water
      } else if (dist > transitionWidth) {
        vertexMask[i] = 0.0; // Fully above water
      } else {
        // Smooth transition at waterline
        vertexMask[i] = 1.0 - (dist + transitionWidth) / (2 * transitionWidth);
      }
    }

    // Generate 2D texture mask by rasterizing terrain height field
    const maskData = new Float32Array(resolution * resolution);
    const halfTransition = transitionWidth * 0.5;

    // Sample terrain at grid points using nearest-vertex heuristic
    // Build a height field from the vertex data
    const heightField = this.buildHeightField(
      posAttr as THREE.BufferAttribute,
      bounds,
      resolution
    );

    for (let iy = 0; iy < resolution; iy++) {
      for (let ix = 0; ix < resolution; ix++) {
        const terrainHeight = heightField[iy * resolution + ix];
        const dist = terrainHeight - waterPlaneHeight;

        if (dist < -transitionWidth) {
          maskData[iy * resolution + ix] = 1.0;
        } else if (dist > transitionWidth) {
          maskData[iy * resolution + ix] = 0.0;
        } else {
          // Smooth transition: smoothstep-like falloff
          const t = (dist + transitionWidth) / (2 * transitionWidth);
          maskData[iy * resolution + ix] = 1.0 - this.smoothstep(t);
        }
      }
    }

    // Create DataTexture
    const maskTexture = new THREE.DataTexture(
      maskData,
      resolution,
      resolution,
      THREE.RedFormat,
      THREE.FloatType
    );
    maskTexture.needsUpdate = true;
    maskTexture.wrapS = THREE.ClampToEdgeWrapping;
    maskTexture.wrapT = THREE.ClampToEdgeWrapping;
    maskTexture.minFilter = THREE.LinearFilter;
    maskTexture.magFilter = THREE.LinearFilter;

    return {
      maskTexture,
      vertexMask,
      width: resolution,
      height: resolution,
      bounds,
    };
  }

  /**
   * Build a 2D height field from vertex positions.
   *
   * Projects terrain vertices onto an XZ grid and stores the minimum
   * Y at each grid cell (conservative — marks cells as underwater if
   * any vertex is below water).
   */
  private buildHeightField(
    posAttr: THREE.BufferAttribute,
    bounds: THREE.Box3,
    resolution: number
  ): Float32Array {
    const heightField = new Float32Array(resolution * resolution);
    // Initialize to max height (no terrain)
    heightField.fill(bounds.max.y + 100);

    const size = bounds.getSize(new THREE.Vector3());
    const cellSizeX = size.x / resolution;
    const cellSizeZ = size.z / resolution;

    // Use minimum Y at each cell for conservative underwater detection
    const countField = new Uint32Array(resolution * resolution);

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);

      const ix = Math.floor((x - bounds.min.x) / cellSizeX);
      const iz = Math.floor((z - bounds.min.z) / cellSizeZ);

      if (ix >= 0 && ix < resolution && iz >= 0 && iz < resolution) {
        const idx = iz * resolution + ix;
        // Use minimum height for conservative underwater detection
        heightField[idx] = Math.min(heightField[idx], y);
        countField[idx]++;
      }
    }

    // Fill cells with no vertices by bilinear interpolation from neighbors
    for (let iz = 0; iz < resolution; iz++) {
      for (let ix = 0; ix < resolution; ix++) {
        const idx = iz * resolution + ix;
        if (countField[idx] === 0) {
          // Interpolate from nearest filled cells
          heightField[idx] = this.interpolateHeight(
            heightField,
            countField,
            ix,
            iz,
            resolution
          );
        }
      }
    }

    return heightField;
  }

  /**
   * Interpolate height for an empty cell from its neighbors.
   */
  private interpolateHeight(
    heightField: Float32Array,
    countField: Uint32Array,
    ix: number,
    iz: number,
    resolution: number
  ): number {
    let sum = 0;
    let weight = 0;
    const radius = 3; // Search radius in grid cells

    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = ix + dx;
        const nz = iz + dz;
        if (nx >= 0 && nx < resolution && nz >= 0 && nz < resolution) {
          const nIdx = nz * resolution + nx;
          if (countField[nIdx] > 0) {
            const dist = Math.sqrt(dx * dx + dz * dz);
            const w = 1.0 / (1.0 + dist);
            sum += heightField[nIdx] * w;
            weight += w;
          }
        }
      }
    }

    return weight > 0 ? sum / weight : 0;
  }

  /**
   * Smoothstep interpolation function.
   */
  private smoothstep(t: number): number {
    const ct = Math.max(0, Math.min(1, t));
    return ct * ct * (3 - 2 * ct);
  }
}

// ============================================================================
// 4. WaterSceneInfo
// ============================================================================

/**
 * Propagates water scene information to downstream systems.
 *
 * Extracts water_plane_height from WaterbodyElement, computes underwater
 * bounds, generates a depth map (waterPlaneHeight - terrainHeight), and
 * provides accessor methods for downstream consumers like creature
 * placement, scatter density, and underwater material systems.
 *
 * Usage:
 * ```typescript
 * const info = WaterSceneInfo.fromSceneComposition(composer, registry);
 * const depth = info.getDepthAt(10, 5, 20); // depth at world position
 * const isWet = info.isUnderwater(10, 0, 20);
 * ```
 */
export class WaterSceneInfo {
  private data: WaterSceneInfoData;

  constructor(data: WaterSceneInfoData) {
    this.data = data;
  }

  // ------------------------------------------------------------------
  // Accessors
  // ------------------------------------------------------------------

  /**
   * Get the water plane height (Y coordinate of the water surface).
   */
  getWaterPlaneHeight(): number {
    return this.data.waterPlaneHeight;
  }

  /**
   * Get the 3D bounds of the submerged terrain region.
   */
  getUnderwaterBounds(): THREE.Box3 {
    return this.data.underwaterBounds.clone();
  }

  /**
   * Get the raw depth map data.
   */
  getDepthMap(): Float32Array {
    return this.data.depthMap;
  }

  /**
   * Get the depth map grid dimensions.
   */
  getDepthMapSize(): { width: number; height: number } {
    return {
      width: this.data.depthMapWidth,
      height: this.data.depthMapHeight,
    };
  }

  /**
   * Get the depth map world-space bounds.
   */
  getDepthMapBounds(): THREE.Box3 {
    return this.data.depthMapBounds.clone();
  }

  /**
   * Check if a world position is below the water surface.
   *
   * @param x - World X coordinate
   * @param y - World Y coordinate
   * @param z - World Z coordinate
   * @returns True if the position is below water
   */
  isUnderwater(x: number, y: number, z: number): boolean {
    if (y >= this.data.waterPlaneHeight) return false;

    // Check if position is within the depth map bounds
    const bounds = this.data.depthMapBounds;
    if (
      x < bounds.min.x || x > bounds.max.x ||
      z < bounds.min.z || z > bounds.max.z
    ) {
      return false;
    }

    return true;
  }

  /**
   * Get the water depth at a world position.
   *
   * Depth = waterPlaneHeight - terrainHeight at (x, z).
   * Returns 0 if the position is above water or outside the depth map.
   *
   * @param x - World X coordinate
   * @param y - World Y coordinate (unused, but kept for API consistency)
   * @param z - World Z coordinate
   * @returns Water depth in world units (0 if not underwater)
   */
  getDepthAt(x: number, y: number, z: number): number {
    const bounds = this.data.depthMapBounds;
    const size = bounds.getSize(new THREE.Vector3());

    // Convert to grid coordinates
    const gx = Math.floor(
      ((x - bounds.min.x) / size.x) * this.data.depthMapWidth
    );
    const gz = Math.floor(
      ((z - bounds.min.z) / size.z) * this.data.depthMapHeight
    );

    if (
      gx < 0 || gx >= this.data.depthMapWidth ||
      gz < 0 || gz >= this.data.depthMapHeight
    ) {
      return 0;
    }

    const terrainHeight = this.data.depthMap[gz * this.data.depthMapWidth + gx];
    const depth = this.data.waterPlaneHeight - terrainHeight;

    return Math.max(0, depth);
  }

  /**
   * Get the water depth at a terrain point (terrainHeight is unknown).
   *
   * Uses the stored depth map to look up terrain height at (x, z)
   * and computes depth = waterPlaneHeight - terrainHeight.
   *
   * @param x - World X coordinate
   * @param z - World Z coordinate
   * @returns Water depth in world units (0 if not underwater)
   */
  getDepthAtXZ(x: number, z: number): number {
    return this.getDepthAt(x, 0, z);
  }

  /**
   * Get a normalized depth factor (0-1) for material blending.
   *
   * 0 = at water surface, 1 = at maximum depth.
   *
   * @param x - World X coordinate
   * @param z - World Z coordinate
   * @param maxDepth - Maximum depth for normalization (default 10)
   * @returns Normalized depth factor in [0, 1]
   */
  getNormalizedDepth(x: number, z: number, maxDepth: number = 10): number {
    const depth = this.getDepthAtXZ(x, z);
    return Math.min(depth / maxDepth, 1.0);
  }

  /**
   * Sample the depth map at arbitrary world coordinates with bilinear filtering.
   *
   * @param x - World X coordinate
   * @param z - World Z coordinate
   * @returns Bilinearly interpolated terrain height
   */
  sampleTerrainHeight(x: number, z: number): number {
    const bounds = this.data.depthMapBounds;
    const size = bounds.getSize(new THREE.Vector3());

    const u = (x - bounds.min.x) / size.x;
    const v = (z - bounds.min.z) / size.z;

    const fx = u * (this.data.depthMapWidth - 1);
    const fz = v * (this.data.depthMapHeight - 1);

    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const dx = fx - ix;
    const dz = fz - iz;

    const ix1 = Math.min(ix + 1, this.data.depthMapWidth - 1);
    const iz1 = Math.min(iz + 1, this.data.depthMapHeight - 1);

    const w = this.data.depthMapWidth;
    const h00 = this.data.depthMap[iz * w + ix];
    const h10 = this.data.depthMap[iz * w + ix1];
    const h01 = this.data.depthMap[iz1 * w + ix];
    const h11 = this.data.depthMap[iz1 * w + ix1];

    return (
      h00 * (1 - dx) * (1 - dz) +
      h10 * dx * (1 - dz) +
      h01 * (1 - dx) * dz +
      h11 * dx * dz
    );
  }

  // ------------------------------------------------------------------
  // Static Factories
  // ------------------------------------------------------------------

  /**
   * Create a WaterSceneInfo from a WaterbodyElement and terrain registry.
   *
   * Extracts water_plane_height from the WaterbodyElement's auxiliary
   * output, then computes depth map and underwater bounds from terrain.
   *
   * @param waterbodyElement - The WaterbodyElement instance (must be initialized)
   * @param terrainRegistry - ElementRegistry containing Ground element for terrain
   * @param bounds - World-space bounds for the depth map
   * @param resolution - Depth map grid resolution (default 64)
   * @returns WaterSceneInfo with computed data
   */
  static fromWaterbodyElement(
    waterbodyElement: {
      evaluate(point: THREE.Vector3): { auxiliary: Record<string, any> };
    },
    terrainRegistry: {
      evaluateComposed(point: THREE.Vector3): { distance: number };
    },
    bounds: THREE.Box3,
    resolution: number = 64
  ): WaterSceneInfo {
    // Extract water plane height by sampling the waterbody at the bounds center
    const center = bounds.getCenter(new THREE.Vector3());
    const waterResult = waterbodyElement.evaluate(center);
    const waterPlaneHeight = waterResult.auxiliary.waterPlaneHeight ?? 0.5;

    // Build depth map by sampling terrain height at grid points
    const size = bounds.getSize(new THREE.Vector3());
    const depthMap = new Float32Array(resolution * resolution);
    const underwaterBounds = new THREE.Box3();
    let hasUnderwater = false;

    for (let iz = 0; iz < resolution; iz++) {
      for (let ix = 0; ix < resolution; ix++) {
        const x = bounds.min.x + (ix / (resolution - 1)) * size.x;
        const z = bounds.min.z + (iz / (resolution - 1)) * size.z;

        // Evaluate terrain SDF to find the surface height
        // Binary search for the terrain surface at this (x, z)
        const terrainHeight = WaterSceneInfo.findTerrainHeight(
          terrainRegistry,
          x,
          z,
          bounds.min.y,
          bounds.max.y
        );

        depthMap[iz * resolution + ix] = terrainHeight;

        if (terrainHeight < waterPlaneHeight) {
          hasUnderwater = true;
          underwaterBounds.expandByPoint(
            new THREE.Vector3(x, terrainHeight, z)
          );
        }
      }
    }

    if (!hasUnderwater) {
      underwaterBounds.set(
        new THREE.Vector3(center.x, waterPlaneHeight - 1, center.z),
        new THREE.Vector3(center.x, waterPlaneHeight, center.z)
      );
    }

    return new WaterSceneInfo({
      waterPlaneHeight,
      underwaterBounds,
      depthMap,
      depthMapWidth: resolution,
      depthMapHeight: resolution,
      depthMapBounds: bounds.clone(),
    });
  }

  /**
   * Create a WaterSceneInfo from a SceneComposer result.
   *
   * Convenience factory that extracts water plane height from the
   * SceneComposer's scene info and computes depth map from the registry.
   *
   * @param composer - SceneComposer instance (after compose() has been called)
   * @param registry - ElementRegistry returned by compose()
   * @param bounds - World-space bounds for the depth map
   * @param resolution - Depth map grid resolution (default 64)
   * @returns WaterSceneInfo with computed data
   */
  static fromSceneComposition(
    composer: { getSceneInfo(): Record<string, any> },
    registry: {
      evaluateComposed(point: THREE.Vector3): { distance: number };
      get(name: string): { evaluate(point: THREE.Vector3): { auxiliary: Record<string, any> } } | undefined;
    },
    bounds: THREE.Box3,
    resolution: number = 64
  ): WaterSceneInfo {
    const sceneInfo = composer.getSceneInfo();
    const waterPlaneHeight = sceneInfo.waterPlaneHeight ?? 0.5;

    // Get the waterbody element if available
    const waterbody = registry.get('Waterbody');
    if (waterbody) {
      return WaterSceneInfo.fromWaterbodyElement(
        waterbody,
        registry,
        bounds,
        resolution
      );
    }

    // Fallback: create from scene info alone (no depth map)
    const size = bounds.getSize(new THREE.Vector3());
    const depthMap = new Float32Array(resolution * resolution);
    depthMap.fill(waterPlaneHeight); // Assume flat terrain at water level

    return new WaterSceneInfo({
      waterPlaneHeight,
      underwaterBounds: new THREE.Box3(
        new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
        new THREE.Vector3(bounds.max.x, waterPlaneHeight, bounds.max.z)
      ),
      depthMap,
      depthMapWidth: resolution,
      depthMapHeight: resolution,
      depthMapBounds: bounds.clone(),
    });
  }

  /**
   * Binary search for terrain surface height at a given (x, z).
   *
   * Searches along the Y axis for the zero crossing of the terrain SDF.
   */
  private static findTerrainHeight(
    registry: { evaluateComposed(point: THREE.Vector3): { distance: number } },
    x: number,
    z: number,
    minY: number,
    maxY: number,
    iterations: number = 16
  ): number {
    let lo = minY;
    let hi = maxY;

    for (let i = 0; i < iterations; i++) {
      const mid = (lo + hi) * 0.5;
      const result = registry.evaluateComposed(new THREE.Vector3(x, mid, z));
      // Positive distance = outside solid = above surface
      if (result.distance > 0) {
        hi = mid;
      } else {
        lo = mid;
      }
    }

    return (lo + hi) * 0.5;
  }

  /**
   * Dispose of GPU resources.
   */
  dispose(): void {
    // No GPU resources to dispose in the data itself
    // Depth map is a Float32Array (CPU memory)
  }
}

// ============================================================================
// 5. ShorelineFoamRenderer
// ============================================================================

/**
 * Creates a thin foam strip mesh along shoreline polylines.
 *
 * Generates a ribbon-like mesh that follows shoreline contour lines,
 * using MeshStandardMaterial with high roughness, white color, and
 * emission for a visually distinct foam effect. Supports noise-based
 * opacity animation and configurable width/fade-out.
 */
export class ShorelineFoamRenderer {
  /**
   * Create a foam mesh along shoreline points.
   *
   * Takes an array of shoreline intersection points (pairs of points
   * forming line segments) and generates a thin ribbon mesh with
   * foam material applied.
   *
   * @param shorelinePoints - Array of intersection points (pairs form segments)
   * @param config - Foam rendering configuration
   * @returns THREE.Mesh with foam material
   */
  createFoamMesh(
    shorelinePoints: THREE.Vector3[],
    config: FoamConfig = DEFAULT_FOAM_CONFIG
  ): THREE.Mesh {
    if (shorelinePoints.length < 2) {
      // Return an empty mesh if no shoreline
      const emptyGeo = new THREE.BufferGeometry();
      const emptyMat = new THREE.MeshStandardMaterial({
        color: config.color,
        roughness: config.roughness,
        transparent: true,
        opacity: 0,
      });
      return new THREE.Mesh(emptyGeo, emptyMat);
    }

    // Build ribbon geometry from shoreline segments
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const halfWidth = config.foamWidth * 0.5;
    let vertexOffset = 0;

    // Process shoreline as pairs of points (line segments)
    for (let i = 0; i < shorelinePoints.length - 1; i += 2) {
      const pA = shorelinePoints[i];
      const pB = shorelinePoints[i + 1];

      // Direction along the shoreline segment
      const direction = new THREE.Vector3().subVectors(pB, pA);
      const length = direction.length();
      if (length < 1e-6) continue;
      direction.normalize();

      // Perpendicular direction (horizontal, in XZ plane)
      const perp = new THREE.Vector3(-direction.z, 0, direction.x).normalize();

      // Create a quad (two triangles) for this segment
      // Four corners of the ribbon strip
      const v0 = pA.clone().add(perp.clone().multiplyScalar(halfWidth));
      const v1 = pA.clone().sub(perp.clone().multiplyScalar(halfWidth));
      const v2 = pB.clone().add(perp.clone().multiplyScalar(halfWidth));
      const v3 = pB.clone().sub(perp.clone().multiplyScalar(halfWidth));

      // Slightly above water plane for z-fighting avoidance
      const yOffset = 0.02;
      v0.y += yOffset;
      v1.y += yOffset;
      v2.y += yOffset;
      v3.y += yOffset;

      // Vertices
      vertices.push(
        v0.x, v0.y, v0.z,
        v1.x, v1.y, v1.z,
        v2.x, v2.y, v2.z,
        v3.x, v3.y, v3.z
      );

      // Normals (all pointing up)
      for (let j = 0; j < 4; j++) {
        normals.push(0, 1, 0);
      }

      // UVs — u along segment, v across width
      const u0 = 0;
      const u1 = 1;
      const vLeft = 0;
      const vRight = 1;
      uvs.push(
        u0, vLeft,
        u0, vRight,
        u1, vLeft,
        u1, vRight
      );

      // Indices for two triangles
      const base = vertexOffset;
      indices.push(
        base, base + 1, base + 2,
        base + 1, base + 3, base + 2
      );

      vertexOffset += 4;
    }

    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3)
    );
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(normals, 3)
    );
    geometry.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(uvs, 2)
    );
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();

    // Create foam material with custom shader for animated noise
    const material = this.createFoamMaterial(config);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'ShorelineFoam';
    mesh.renderOrder = 998;
    mesh.frustumCulled = false;

    return mesh;
  }

  /**
   * Create the foam material with animated noise-based opacity.
   */
  private createFoamMaterial(config: FoamConfig): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: config.color },
        uOpacity: { value: 0.85 },
        uFadeOutDistance: { value: config.fadeOutDistance },
        uNoiseScale: { value: config.noiseScale },
        uAnimationSpeed: { value: config.animationSpeed },
        uEmissionIntensity: { value: config.emissionIntensity },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorldPosition;

        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uFadeOutDistance;
        uniform float uNoiseScale;
        uniform float uAnimationSpeed;
        uniform float uEmissionIntensity;

        varying vec2 vUv;
        varying vec3 vWorldPosition;

        // Simple hash-based noise for foam variation
        float hash(vec2 p) {
          float h = dot(p, vec2(127.1, 311.7));
          return fract(sin(h) * 43758.5453123);
        }

        float noise2D(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        void main() {
          // Animated noise for foam breakup
          vec2 noiseCoord = vWorldPosition.xz * uNoiseScale + uTime * uAnimationSpeed * 0.1;
          float foamNoise = noise2D(noiseCoord) * 0.6 + noise2D(noiseCoord * 2.0 + 50.0) * 0.4;

          // Fade out at edges of the foam strip (v direction)
          float edgeFade = 1.0 - pow(abs(vUv.y - 0.5) * 2.0, 2.0);

          // Combine noise with edge fade
          float alpha = uOpacity * edgeFade * smoothstep(0.3, 0.6, foamNoise);

          // Emission for glow effect
          vec3 emission = uColor * uEmissionIntensity * alpha;

          gl_FragColor = vec4(uColor + emission, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
  }

  /**
   * Update foam animation (call each frame).
   *
   * @param foamMesh - The foam mesh to update
   * @param dt - Delta time in seconds
   */
  update(foamMesh: THREE.Mesh, dt: number): void {
    const material = foamMesh.material as THREE.ShaderMaterial;
    if (material.uniforms && material.uniforms.uTime) {
      material.uniforms.uTime.value += dt;
    }
  }

  /**
   * Dispose of foam mesh resources.
   */
  dispose(foamMesh: THREE.Mesh): void {
    foamMesh.geometry.dispose();
    (foamMesh.material as THREE.ShaderMaterial).dispose();
  }
}

// ============================================================================
// 6. TerrainWaterMaterialMixer
// ============================================================================

/**
 * Blends terrain material above water with underwater material below.
 *
 * Creates a custom ShaderMaterial that smoothly transitions between
 * the original terrain appearance (above water) and a blue-green tinted,
 * refractive underwater material with caustics pattern (below water).
 * Uses an underwater mask for smooth transition at the waterline.
 *
 * Above water: original terrain material (color, roughness, normal)
 * Below water: blue-green tinted, refractive, with caustics pattern
 * Transition: smooth interpolation based on underwater mask factor
 */
export class TerrainWaterMaterialMixer {
  /**
   * Create a blended ShaderMaterial for terrain with above/below water regions.
   *
   * @param terrainMaterial - The original terrain material (MeshStandardMaterial)
   * @param underwaterMaterial - Optional underwater material overrides
   * @param mask - Underwater mask result (from UnderwaterMaskGenerator)
   * @returns Custom ShaderMaterial with above/below water blending
   */
  mixMaterials(
    terrainMaterial: THREE.MeshStandardMaterial,
    underwaterMaterial: Partial<{
      /** Underwater tint color (default blue-green) */
      tintColor: THREE.Color;
      /** Underwater refraction amount (default 0.3) */
      refractionAmount: number;
      /** Caustics intensity (default 0.5) */
      causticsIntensity: number;
      /** Caustics animation speed (default 0.5) */
      causticsSpeed: number;
      /** Caustics pattern scale (default 3.0) */
      causticsScale: number;
      /** Depth-based fog density (default 0.15) */
      fogDensity: number;
      /** Underwater roughness multiplier (default 0.3) */
      roughnessMultiplier: number;
    }>,
    mask: UnderwaterMaskResult
  ): THREE.ShaderMaterial {
    const tintColor = underwaterMaterial?.tintColor ?? new THREE.Color(0x0a5c3a);
    const refractionAmount = underwaterMaterial?.refractionAmount ?? 0.3;
    const causticsIntensity = underwaterMaterial?.causticsIntensity ?? 0.5;
    const causticsSpeed = underwaterMaterial?.causticsSpeed ?? 0.5;
    const causticsScale = underwaterMaterial?.causticsScale ?? 3.0;
    const fogDensity = underwaterMaterial?.fogDensity ?? 0.15;
    const roughnessMultiplier = underwaterMaterial?.roughnessMultiplier ?? 0.3;

    // Extract properties from the terrain material
    const terrainColor = terrainMaterial.color ?? new THREE.Color(0x8b7355);
    const terrainRoughness = terrainMaterial.roughness ?? 0.9;
    const terrainMetalness = terrainMaterial.metalness ?? 0.0;

    // Check if terrain has a map (diffuse texture)
    const terrainMap = terrainMaterial.map;

    const uniforms: Record<string, THREE.IUniform> = {
      uTime: { value: 0 },
      uTerrainColor: { value: terrainColor },
      uTerrainRoughness: { value: terrainRoughness },
      uTerrainMetalness: { value: terrainMetalness },
      uTintColor: { value: tintColor },
      uRefractionAmount: { value: refractionAmount },
      uCausticsIntensity: { value: causticsIntensity },
      uCausticsSpeed: { value: causticsSpeed },
      uCausticsScale: { value: causticsScale },
      uFogDensity: { value: fogDensity },
      uRoughnessMultiplier: { value: roughnessMultiplier },
      uWaterPlaneHeight: { value: 0.5 },
      uTransitionWidth: { value: 0.5 },
      uUnderwaterMask: { value: mask.maskTexture },
      uMaskBoundsMin: { value: mask.bounds.min },
      uMaskBoundsMax: { value: mask.bounds.max },
    };

    // Add terrain map if available
    if (terrainMap) {
      uniforms.uTerrainMap = { value: terrainMap };
    }

    // Add normal map if available
    if (terrainMaterial.normalMap) {
      uniforms.uNormalMap = { value: terrainMaterial.normalMap };
    }

    const vertexShader = /* glsl */ `
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying float vUnderwaterFactor;

      uniform float uWaterPlaneHeight;
      uniform float uTransitionWidth;
      uniform sampler2D uUnderwaterMask;
      uniform vec3 uMaskBoundsMin;
      uniform vec3 uMaskBoundsMax;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);

        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;

        // Compute underwater factor from mask texture
        vec3 boundsSize = uMaskBoundsMax - uMaskBoundsMin;
        vec2 maskUv = vec2(
          (worldPos.x - uMaskBoundsMin.x) / max(boundsSize.x, 0.001),
          (worldPos.z - uMaskBoundsMin.z) / max(boundsSize.z, 0.001)
        );
        maskUv = clamp(maskUv, 0.0, 1.0);

        float maskValue = texture2D(uUnderwaterMask, maskUv).r;

        // Also factor in the vertex height for smooth transition
        float heightFactor;
        float dist = worldPos.y - uWaterPlaneHeight;
        if (dist < -uTransitionWidth) {
          heightFactor = 1.0;
        } else if (dist > uTransitionWidth) {
          heightFactor = 0.0;
        } else {
          heightFactor = 1.0 - (dist + uTransitionWidth) / (2.0 * uTransitionWidth);
        }

        // Combine mask and height factor (use maximum for conservative underwater detection)
        vUnderwaterFactor = max(maskValue, heightFactor);

        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = /* glsl */ `
      uniform float uTime;
      uniform vec3 uTerrainColor;
      uniform float uTerrainRoughness;
      uniform float uTerrainMetalness;
      uniform vec3 uTintColor;
      uniform float uRefractionAmount;
      uniform float uCausticsIntensity;
      uniform float uCausticsSpeed;
      uniform float uCausticsScale;
      uniform float uFogDensity;
      uniform float uRoughnessMultiplier;
      uniform sampler2D uTerrainMap;
      uniform sampler2D uNormalMap;

      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying float vUnderwaterFactor;

      // ---- Caustics pattern via noise ----
      float hash(vec2 p) {
        float h = dot(p, vec2(127.1, 311.7));
        return fract(sin(h) * 43758.5453123);
      }

      float noise2D(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float causticPattern(vec2 uv, float time) {
        vec2 scaledUv = uv * uCausticsScale;
        float t = time * uCausticsSpeed;

        // Two overlapping noise fields
        vec2 offset1 = vec2(
          noise2D(scaledUv + vec2(t * 0.3, t * 0.17)),
          noise2D(scaledUv + vec2(t * 0.13, t * 0.27))
        ) * 0.3;

        vec2 offset2 = vec2(
          noise2D(scaledUv + vec2(t * 0.23, -t * 0.19) + 5.0),
          noise2D(scaledUv + vec2(-t * 0.11, t * 0.31) + 7.0)
        ) * 0.3;

        // Gradient-based caustic lines
        float eps = 0.05;
        float n1 = noise2D(scaledUv + offset1);
        float n1x = noise2D(scaledUv + offset1 + vec2(eps, 0.0));
        float n1y = noise2D(scaledUv + offset1 + vec2(0.0, eps));
        float grad1 = length(vec2(n1x - n1, n1y - n1)) / eps;

        float n2 = noise2D(scaledUv + offset2);
        float n2x = noise2D(scaledUv + offset2 + vec2(eps, 0.0));
        float n2y = noise2D(scaledUv + offset2 + vec2(0.0, eps));
        float grad2 = length(vec2(n2x - n2, n2y - n2)) / eps;

        return (grad1 * 0.6 + grad2 * 0.4);
      }

      void main() {
        // Sample terrain color (from map or uniform)
        vec3 terrainColor;
        #ifdef USE_TERRAIN_MAP
          terrainColor = texture2D(uTerrainMap, vUv).rgb;
        #else
          terrainColor = uTerrainColor;
        #endif

        // ---- Above water: original terrain ----
        vec3 aboveColor = terrainColor;
        float aboveRoughness = uTerrainRoughness;
        float aboveMetalness = uTerrainMetalness;

        // ---- Below water: tinted, refractive, caustics ----
        // Apply blue-green tint with depth-based fog
        float depth = vUnderwaterFactor;
        vec3 underwaterColor = mix(terrainColor, uTintColor, 0.6 * depth);

        // Caustics pattern
        float caustics = causticPattern(vWorldPosition.xz, uTime);
        caustics = pow(caustics, 1.5) * uCausticsIntensity;
        caustics *= (1.0 - depth * 0.5); // Caustics fade with depth
        underwaterColor += vec3(0.7, 0.9, 1.0) * caustics * 0.3;

        // Depth fog: deeper = more uniform blue-green
        underwaterColor = mix(underwaterColor, uTintColor * 0.5, depth * uFogDensity);

        // Refraction darkening
        underwaterColor *= (1.0 - uRefractionAmount * depth * 0.3);

        float underwaterRoughness = uTerrainRoughness * uRoughnessMultiplier;
        float underwaterMetalness = uTerrainMetalness * 0.5;

        // ---- Blend above and below water ----
        float f = vUnderwaterFactor;
        vec3 finalColor = mix(aboveColor, underwaterColor, f);
        float finalRoughness = mix(aboveRoughness, underwaterRoughness, f);
        float finalMetalness = mix(aboveMetalness, underwaterMetalness, f);

        // Simple lighting
        vec3 lightDir = normalize(vec3(0.5, 0.8, 0.3));
        vec3 normal = normalize(vNormal);

        // Apply normal map if available
        #ifdef USE_NORMAL_MAP
          vec3 normalMapValue = texture2D(uNormalMap, vUv).rgb;
          normal = normalize(mix(normal, normalMapValue * 2.0 - 1.0, 0.5));
        #endif

        float diffuse = max(dot(normal, lightDir), 0.0) * 0.5 + 0.5;
        finalColor *= diffuse;

        // Specular highlight (simplified)
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 halfDir = normalize(lightDir + viewDir);
        float specAngle = max(dot(normal, halfDir), 0.0);
        float spec = pow(specAngle, mix(32.0, 128.0, finalRoughness));
        finalColor += vec3(1.0) * spec * (1.0 - finalRoughness) * 0.3;

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    // Build defines based on available textures
    const defines: Record<string, string> = {};
    if (terrainMap) {
      defines.USE_TERRAIN_MAP = '';
    }
    if (terrainMaterial.normalMap) {
      defines.USE_NORMAL_MAP = '';
    }

    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      defines,
      side: terrainMaterial.side ?? THREE.FrontSide,
      // flatShading not applicable to ShaderMaterial; handled in vertex shader
    });
  }

  /**
   * Update the mixed material's time uniform for animation.
   *
   * @param material - The ShaderMaterial returned by mixMaterials()
   * @param dt - Delta time in seconds
   */
  updateAnimation(material: THREE.ShaderMaterial, dt: number): void {
    if (material.uniforms.uTime) {
      material.uniforms.uTime.value += dt;
    }
  }

  /**
   * Update the water plane height in the mixed material.
   *
   * @param material - The ShaderMaterial returned by mixMaterials()
   * @param waterPlaneHeight - New water plane Y coordinate
   */
  setWaterPlaneHeight(material: THREE.ShaderMaterial, waterPlaneHeight: number): void {
    if (material.uniforms.uWaterPlaneHeight) {
      material.uniforms.uWaterPlaneHeight.value = waterPlaneHeight;
    }
  }

  /**
   * Dispose of the mixed material.
   */
  dispose(material: THREE.ShaderMaterial): void {
    material.dispose();
  }
}
