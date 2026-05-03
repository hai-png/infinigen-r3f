/**
 * Infinigen R3F Port - Uniform Mesher
 * Regular grid-based meshing using proper marching cubes isosurface extraction.
 *
 * Delegates to `extractIsosurface()` from sdf-operations.ts instead of
 * maintaining a broken inline marching-cubes implementation.
 *
 * Based on original: infinigen/terrain/mesher/uniform_mesher.py
 */

import { Vector3, BufferGeometry, Float32BufferAttribute, Box3 } from 'three';
import { SDFKernel } from '../sdf/SDFOperations';
import { SignedDistanceField, extractIsosurface } from '../sdf/sdf-operations';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface UniformMesherConfig {
  /** Grid subdivision counts per axis; -1 means automatic from voxel size */
  subdivisions: [number, number, number];
  /** Multiplier that refines the coarse voxel size for finer sampling */
  upscale: number;
  /** When true, adds boundary skirts and a bottom cap for a watertight volume */
  enclosed: boolean;
  /** Kept for API compatibility; no longer used (extractIsosurface does its own interpolation) */
  bisectionIters: number;
  /** Log grid dimensions and voxel size */
  verbose: boolean;
}

// ---------------------------------------------------------------------------
// UniformMesher
// ---------------------------------------------------------------------------

/** Default depth (world units) below the grid minimum Y for enclosure skirts */
const ENCLOSURE_SKIRT_DEPTH = 5;

export class UniformMesher {
  private config: UniformMesherConfig;
  private bounds: [number, number, number, number, number, number];
  private xN: number;
  private yN: number;
  private zN: number;
  private voxelSize: number;

  constructor(
    bounds: [number, number, number, number, number, number],
    config: Partial<UniformMesherConfig> = {}
  ) {
    this.bounds = bounds;

    this.config = {
      subdivisions: [64, -1, -1],
      upscale: 3,
      enclosed: false,
      bisectionIters: 10,
      verbose: false,
      ...config,
    };

    // Calculate grid dimensions (same logic as before)
    const [xMin, xMax, yMin, yMax, zMin, zMax] = bounds;
    const xSize = xMax - xMin;
    const ySize = yMax - yMin;
    const zSize = zMax - zMin;

    let coarseVoxelSize: number;
    if (this.config.subdivisions[0] !== -1) {
      coarseVoxelSize = xSize / this.config.subdivisions[0];
    } else if (this.config.subdivisions[1] !== -1) {
      coarseVoxelSize = ySize / this.config.subdivisions[1];
    } else {
      coarseVoxelSize = zSize / this.config.subdivisions[2];
    }

    this.xN =
      this.config.subdivisions[0] !== -1
        ? this.config.subdivisions[0]
        : Math.floor(xSize / coarseVoxelSize);
    this.yN =
      this.config.subdivisions[1] !== -1
        ? this.config.subdivisions[1]
        : Math.floor(ySize / coarseVoxelSize);
    this.zN =
      this.config.subdivisions[2] !== -1
        ? this.config.subdivisions[2]
        : Math.floor(zSize / coarseVoxelSize);

    this.voxelSize = coarseVoxelSize / this.config.upscale;

    if (this.config.verbose) {
      console.log(`UniformMesher: Grid ${this.xN}x${this.yN}x${this.zN}`);
      console.log(`UniformMesher: Voxel size ${this.voxelSize.toFixed(4)}`);
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Generate mesh from SDF kernels using uniform grid sampling and
   * proper marching-cubes isosurface extraction.
   */
  public generateMesh(kernels: SDFKernel[]): BufferGeometry {
    const [xMin, xMax, yMin, yMax, zMin, zMax] = this.bounds;

    const bbox = new Box3(
      new Vector3(xMin, yMin, zMin),
      new Vector3(xMax, yMax, zMax)
    );

    // Create the SDF with our voxel size as resolution.
    // SignedDistanceField computes gridSize = floor(size / resolution),
    // producing approximately (xN+1, yN+1, zN+1) grid points.
    const sdf = new SignedDistanceField({
      resolution: this.voxelSize,
      bounds: bbox,
      maxDistance: 1000,
    });

    if (this.config.verbose) {
      console.log(
        `Sampling SDF on ${sdf.gridSize[0]}x${sdf.gridSize[1]}x${sdf.gridSize[2]} grid ` +
        `(voxelSize=${this.voxelSize.toFixed(4)})`
      );
    }

    // Evaluate all SDF kernels at each grid point (union = minimum)
    for (let gz = 0; gz < sdf.gridSize[2]; gz++) {
      for (let gy = 0; gy < sdf.gridSize[1]; gy++) {
        for (let gx = 0; gx < sdf.gridSize[0]; gx++) {
          const pos = sdf.getPosition(gx, gy, gz);
          let minSDF = Infinity;
          for (const kernel of kernels) {
            minSDF = Math.min(minSDF, kernel.evaluate(pos));
          }
          sdf.setValueAtGrid(gx, gy, gz, minSDF);
        }
      }
    }

    // Extract isosurface at threshold 0 using proper marching cubes
    const geometry = extractIsosurface(sdf, 0);

    if (this.config.enclosed) {
      this.encloseMesh(geometry);
    }

    return geometry;
  }

  // -----------------------------------------------------------------------
  // Enclosure
  // -----------------------------------------------------------------------

  /**
   * Add boundary skirts and a bottom cap to make the mesh watertight.
   *
   * Algorithm:
   * 1. Find all triangle edges that lie on a grid boundary plane
   *    (xMin, xMax, zMin, zMax) where both endpoints are on the same plane.
   * 2. For each such boundary edge, extrude a skirt quad straight down
   *    to a fixed depth below the grid minimum Y.
   * 3. Add a flat rectangular bottom cap at that depth.
   * 4. Recompute vertex normals so skirt normals are correct.
   */
  private encloseMesh(geometry: BufferGeometry): void {
    const posAttr = geometry.getAttribute('position');
    if (!posAttr || posAttr.count === 0) return;

    const [xMin, xMax, yMin, , zMin, zMax] = this.bounds;
    const eps = this.voxelSize * 0.5;
    const bottomY = yMin - ENCLOSURE_SKIRT_DEPTH;

    // ---------- helpers ----------
    /** Check whether a position is on a grid boundary plane. */
    const isOnBoundaryPlane = (x: number, z: number): boolean =>
      Math.abs(x - xMin) < eps ||
      Math.abs(x - xMax) < eps ||
      Math.abs(z - zMin) < eps ||
      Math.abs(z - zMax) < eps;

    /** Check whether two vertices lie on the *same* boundary plane. */
    const onSameBoundaryPlane = (
      ax: number, az: number,
      bx: number, bz: number
    ): boolean =>
      (Math.abs(ax - xMin) < eps && Math.abs(bx - xMin) < eps) ||
      (Math.abs(ax - xMax) < eps && Math.abs(bx - xMax) < eps) ||
      (Math.abs(az - zMin) < eps && Math.abs(bz - zMin) < eps) ||
      (Math.abs(az - zMax) < eps && Math.abs(bz - zMax) < eps);

    /** Position-based deduplication key for an edge (order-independent). */
    const edgeKey = (
      ax: number, ay: number, az: number,
      bx: number, by: number, bz: number
    ): string => {
      const a = `${ax.toFixed(3)},${ay.toFixed(3)},${az.toFixed(3)}`;
      const b = `${bx.toFixed(3)},${by.toFixed(3)},${bz.toFixed(3)}`;
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    };

    // ---------- gather boundary edges ----------
    const skirtPositions: number[] = [];
    const skirtNormals: number[] = [];
    const skirtUVs: number[] = [];
    const skirtIndices: number[] = [];
    const processedEdges = new Set<string>();

    // extractIsosurface returns non-indexed geometry, so triangles are
    // every 3 consecutive vertices.  We also handle indexed geometry.
    const indexBuf = geometry.index;
    const triCount = indexBuf
      ? indexBuf.count / 3
      : posAttr.count / 3;

    for (let t = 0; t < triCount; t++) {
      const i0 = indexBuf ? indexBuf.getX(t * 3) : t * 3;
      const i1 = indexBuf ? indexBuf.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = indexBuf ? indexBuf.getX(t * 3 + 2) : t * 3 + 2;

      const edgePairs: [number, number][] = [
        [i0, i1],
        [i1, i2],
        [i2, i0],
      ];

      for (const [idxA, idxB] of edgePairs) {
        const ax = posAttr.getX(idxA);
        const ay = posAttr.getY(idxA);
        const az = posAttr.getZ(idxA);
        const bx = posAttr.getX(idxB);
        const by = posAttr.getY(idxB);
        const bz = posAttr.getZ(idxB);

        // Both endpoints must be on the same boundary plane
        if (!onSameBoundaryPlane(ax, az, bx, bz)) continue;

        // At least one must truly be on the boundary (redundant safety check)
        if (!isOnBoundaryPlane(ax, az) && !isOnBoundaryPlane(bx, bz)) continue;

        // Deduplicate by position
        const key = edgeKey(ax, ay, az, bx, by, bz);
        if (processedEdges.has(key)) continue;
        processedEdges.add(key);

        // Create two bottom vertices
        const base = posAttr.count + skirtPositions.length / 3;

        skirtPositions.push(ax, bottomY, az);
        skirtNormals.push(0, -1, 0);
        skirtUVs.push(
          (ax - xMin) / (xMax - xMin),
          (az - zMin) / (zMax - zMin)
        );

        skirtPositions.push(bx, bottomY, bz);
        skirtNormals.push(0, -1, 0);
        skirtUVs.push(
          (bx - xMin) / (xMax - xMin),
          (bz - zMin) / (zMax - zMin)
        );

        // Two triangles forming the skirt quad.
        // Winding order chosen so that, when viewed from outside the volume,
        // the face is counter-clockwise (outward-facing).
        //   topA  -> topB  -> bottomB
        //   topA  -> bottomB -> bottomA
        skirtIndices.push(idxA, idxB, base + 1);
        skirtIndices.push(idxA, base + 1, base);
      }
    }

    // ---------- bottom cap ----------
    const capBase = posAttr.count + skirtPositions.length / 3;
    skirtPositions.push(xMin, bottomY, zMin);
    skirtPositions.push(xMax, bottomY, zMin);
    skirtPositions.push(xMax, bottomY, zMax);
    skirtPositions.push(xMin, bottomY, zMax);
    for (let i = 0; i < 4; i++) {
      skirtNormals.push(0, -1, 0);
    }
    skirtUVs.push(0, 0, 1, 0, 1, 1, 0, 1);
    // CCW from below (looking up at the cap from underneath)
    skirtIndices.push(capBase, capBase + 2, capBase + 1);
    skirtIndices.push(capBase, capBase + 3, capBase + 2);

    // ---------- merge into geometry ----------
    this.mergeGeometryData(geometry, skirtPositions, skirtNormals, skirtUVs, skirtIndices);

    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
  }

  // -----------------------------------------------------------------------
  // Geometry merge helper
  // -----------------------------------------------------------------------

  /**
   * Append additional vertex/index data to an existing BufferGeometry.
   * Handles both indexed and non-indexed source geometries.
   */
  private mergeGeometryData(
    geometry: BufferGeometry,
    newPositions: number[],
    newNormals: number[],
    newUVs: number[],
    newIndices: number[]
  ): void {
    if (newPositions.length === 0) return;

    const posAttr = geometry.getAttribute('position');
    const normAttr = geometry.getAttribute('normal');
    const uvAttr = geometry.getAttribute('uv');

    const existingVertCount = posAttr.count;

    // ---------- merge positions ----------
    const oldPos = Array.from(posAttr.array as Float32Array);
    const mergedPos = new Float32Array(oldPos.length + newPositions.length);
    mergedPos.set(oldPos);
    mergedPos.set(newPositions, oldPos.length);
    geometry.setAttribute('position', new Float32BufferAttribute(mergedPos, 3));

    // ---------- merge normals ----------
    if (normAttr && newNormals.length > 0) {
      const oldNorm = Array.from(normAttr.array as Float32Array);
      const mergedNorm = new Float32Array(oldNorm.length + newNormals.length);
      mergedNorm.set(oldNorm);
      mergedNorm.set(newNormals, oldNorm.length);
      geometry.setAttribute('normal', new Float32BufferAttribute(mergedNorm, 3));
    }

    // ---------- merge UVs ----------
    if (uvAttr && newUVs.length > 0) {
      const oldUV = Array.from(uvAttr.array as Float32Array);
      const mergedUV = new Float32Array(oldUV.length + newUVs.length);
      mergedUV.set(oldUV);
      mergedUV.set(newUVs, oldUV.length);
      geometry.setAttribute('uv', new Float32BufferAttribute(mergedUV, 2));
    }

    // ---------- merge indices ----------
    if (newIndices.length > 0) {
      const oldIndex: number[] = geometry.index
        ? Array.from(geometry.index.array as ArrayLike<number>)
        : // Non-indexed geometry: build implicit sequential index buffer
          Array.from({ length: existingVertCount }, (_, i) => i);

      geometry.setIndex(oldIndex.concat(newIndices));
    }
  }
}
