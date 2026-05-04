/**
 * FLIPSurfaceExtractor
 *
 * Converts FLIP particle data into a renderable triangle mesh using
 * marching cubes isosurface extraction on a density field computed from
 * the particle positions.
 *
 * Pipeline:
 *   1. Compute particle density on a regular grid using a smooth kernel
 *   2. Run marching cubes at a configurable iso-threshold
 *   3. Optionally apply Laplacian smoothing to the resulting surface
 *
 * This is specifically designed for the FLIP solver output and reuses
 * the MarchingCubesLUTs from the terrain mesher.
 *
 * @module FLIPSurfaceExtractor
 */

import * as THREE from 'three';
import { EDGE_TABLE, TRIANGLE_TABLE, EDGE_VERTICES, CORNER_OFFSETS } from '../../terrain/mesher/MarchingCubesLUTs';
import type { FLIPParticle } from './FLIPFluidSolver';
import type { FLIPGrid } from './FLIPFluidSolver';

// ─── Configuration ────────────────────────────────────────────────────────────

export interface FLIPSurfaceExtractorConfig {
  /** Grid resolution per axis for the density field (default 32) */
  gridResolution: number;
  /** Smoothing radius for the density kernel (default 0.1) */
  smoothingRadius: number;
  /** Iso-threshold for marching cubes (default 0.5) */
  isoThreshold: number;
  /** World-space padding around particle bounds (default 0.15) */
  boundsPadding: number;
  /** Number of Laplacian smoothing iterations (default 2) */
  smoothingIterations: number;
  /** Smoothing factor per iteration, 0 = none, 1 = max (default 0.3) */
  smoothingFactor: number;
  /** Use grid density field directly instead of computing from particles (default false) */
  useGridDensity: boolean;
}

const DEFAULT_EXTRACTOR_CONFIG: FLIPSurfaceExtractorConfig = {
  gridResolution: 32,
  smoothingRadius: 0.1,
  isoThreshold: 0.5,
  boundsPadding: 0.15,
  smoothingIterations: 2,
  smoothingFactor: 0.3,
  useGridDensity: false,
};

// ─── Poly6 kernel coefficient ─────────────────────────────────────────────────

function poly6Coefficient(h: number): number {
  return 315 / (64 * Math.PI * Math.pow(h, 9));
}

// ─── FLIPSurfaceExtractor ─────────────────────────────────────────────────────

export class FLIPSurfaceExtractor {
  private config: FLIPSurfaceExtractorConfig;
  private poly6Coeff: number;
  private h2: number;
  private densityField: Float32Array;

  // Reusable bounding box & voxel size
  private bounds: THREE.Box3;
  private voxelSize: THREE.Vector3;

  // Per-cell edge caches (reused each extraction)
  private edgePos: Float32Array;
  private edgeNorm: Float32Array;
  private edgeComputed: Uint8Array;

  constructor(config: Partial<FLIPSurfaceExtractorConfig> = {}) {
    this.config = { ...DEFAULT_EXTRACTOR_CONFIG, ...config };
    this.poly6Coeff = poly6Coefficient(this.config.smoothingRadius);
    this.h2 = this.config.smoothingRadius * this.config.smoothingRadius;

    const res = this.config.gridResolution;
    this.densityField = new Float32Array(res * res * res);

    this.bounds = new THREE.Box3();
    this.voxelSize = new THREE.Vector3();

    // Allocate per-cell caches
    this.edgePos = new Float32Array(12 * 3);
    this.edgeNorm = new Float32Array(12 * 3);
    this.edgeComputed = new Uint8Array(12);
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Extract a water surface mesh from FLIP particles and/or grid data.
   *
   * @param particles Current FLIP particle array
   * @param grid      The FLIP grid (used for density if useGridDensity=true)
   * @returns         THREE.BufferGeometry with the extracted surface
   */
  extractSurface(particles: FLIPParticle[], grid?: FLIPGrid): THREE.BufferGeometry {
    if (particles.length === 0) {
      return this.createEmptyGeometry();
    }

    // 1. Compute bounding box with padding
    this.computeBounds(particles);

    // 2. Build density field
    if (this.config.useGridDensity && grid) {
      this.buildDensityFromGrid(grid);
    } else {
      this.buildDensityField(particles);
    }

    // 3. Marching cubes extraction
    const geometry = this.march();

    // 4. Laplacian smoothing
    if (this.config.smoothingIterations > 0) {
      this.applyLaplacianSmoothing(geometry, this.config.smoothingIterations, this.config.smoothingFactor);
    }

    return geometry;
  }

  /**
   * Get the raw density field (for debugging or custom visualization).
   */
  getDensityField(): Float32Array {
    return this.densityField;
  }

  // ── Bounding box ───────────────────────────────────────────────────────

  private computeBounds(particles: FLIPParticle[]): void {
    const pad = this.config.boundsPadding;
    this.bounds.min.set(Infinity, Infinity, Infinity);
    this.bounds.max.set(-Infinity, -Infinity, -Infinity);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i].position;
      if (p.x < this.bounds.min.x) this.bounds.min.x = p.x;
      if (p.y < this.bounds.min.y) this.bounds.min.y = p.y;
      if (p.z < this.bounds.min.z) this.bounds.min.z = p.z;
      if (p.x > this.bounds.max.x) this.bounds.max.x = p.x;
      if (p.y > this.bounds.max.y) this.bounds.max.y = p.y;
      if (p.z > this.bounds.max.z) this.bounds.max.z = p.z;
    }

    this.bounds.min.x -= pad;
    this.bounds.min.y -= pad;
    this.bounds.min.z -= pad;
    this.bounds.max.x += pad;
    this.bounds.max.y += pad;
    this.bounds.max.z += pad;

    const res = this.config.gridResolution;
    this.voxelSize.set(
      (this.bounds.max.x - this.bounds.min.x) / res,
      (this.bounds.max.y - this.bounds.min.y) / res,
      (this.bounds.max.z - this.bounds.min.z) / res,
    );
  }

  // ── Density field from particles ───────────────────────────────────────

  private buildDensityField(particles: FLIPParticle[]): void {
    const res = this.config.gridResolution;
    const field = this.densityField;
    const h = this.config.smoothingRadius;
    const h2 = this.h2;
    const coeff = this.poly6Coeff;

    field.fill(0);

    const bMinX = this.bounds.min.x;
    const bMinY = this.bounds.min.y;
    const bMinZ = this.bounds.min.z;
    const dx = this.voxelSize.x;
    const dy = this.voxelSize.y;
    const dz = this.voxelSize.z;

    // Splat particle contributions onto nearby grid nodes
    for (let pi = 0; pi < particles.length; pi++) {
      const px = particles[pi].position.x;
      const py = particles[pi].position.y;
      const pz = particles[pi].position.z;

      const gxMin = Math.max(0, Math.floor((px - h - bMinX) / dx));
      const gyMin = Math.max(0, Math.floor((py - h - bMinY) / dy));
      const gzMin = Math.max(0, Math.floor((pz - h - bMinZ) / dz));
      const gxMax = Math.min(res - 1, Math.ceil((px + h - bMinX) / dx));
      const gyMax = Math.min(res - 1, Math.ceil((py + h - bMinY) / dy));
      const gzMax = Math.min(res - 1, Math.ceil((pz + h - bMinZ) / dz));

      for (let gz = gzMin; gz <= gzMax; gz++) {
        const gzOffset = gz * res * res;
        const gzWorld = bMinZ + (gz + 0.5) * dz;
        const rz = pz - gzWorld;
        const rz2 = rz * rz;

        for (let gy = gyMin; gy <= gyMax; gy++) {
          const gyOffset = gzOffset + gy * res;
          const gyWorld = bMinY + (gy + 0.5) * dy;
          const ry = py - gyWorld;
          const ry2 = ry * ry;

          if (ry2 + rz2 >= h2) continue;

          for (let gx = gxMin; gx <= gxMax; gx++) {
            const gxWorld = bMinX + (gx + 0.5) * dx;
            const rx = px - gxWorld;
            const r2 = rx * rx + ry2 + rz2;

            if (r2 < h2) {
              const diff = h2 - r2;
              field[gyOffset + gx] += coeff * diff * diff * diff;
            }
          }
        }
      }
    }
  }

  // ── Density field from grid ────────────────────────────────────────────

  private buildDensityFromGrid(grid: FLIPGrid): void {
    const res = this.config.gridResolution;
    const field = this.densityField;
    field.fill(0);

    const bMinX = this.bounds.min.x;
    const bMinY = this.bounds.min.y;
    const bMinZ = this.bounds.min.z;
    const dx = this.voxelSize.x;
    const dy = this.voxelSize.y;
    const dz = this.voxelSize.z;

    for (let gz = 0; gz < res; gz++) {
      const gzOffset = gz * res * res;
      const worldZ = bMinZ + (gz + 0.5) * dz;
      const gk = Math.floor(worldZ / grid.cellSize);

      for (let gy = 0; gy < res; gy++) {
        const gyOffset = gzOffset + gy * res;
        const worldY = bMinY + (gy + 0.5) * dy;
        const gj = Math.floor(worldY / grid.cellSize);

        for (let gx = 0; gx < res; gx++) {
          const worldX = bMinX + (gx + 0.5) * dx;
          const gi = Math.floor(worldX / grid.cellSize);

          // Sample grid density
          const gridDensity = grid.getGridDensity(gi, gj, gk);
          // Also factor in particle count for a more robust field
          if (grid.inBounds(gi, gj, gk)) {
            const idx = grid.idx(gi, gj, gk);
            field[gyOffset + gx] = grid.particleCount[idx] > 0.01
              ? gridDensity + grid.particleCount[idx]
              : 0;
          }
        }
      }
    }
  }

  // ── Marching cubes ─────────────────────────────────────────────────────

  private march(): THREE.BufferGeometry {
    const res = this.config.gridResolution;
    const isolevel = this.config.isoThreshold;
    const field = this.densityField;

    const cellsX = res - 1;
    const cellsY = res - 1;
    const cellsZ = res - 1;

    if (cellsX <= 0 || cellsY <= 0 || cellsZ <= 0) {
      return this.createEmptyGeometry();
    }

    const posArr: number[] = [];
    const normArr: number[] = [];

    const bMinX = this.bounds.min.x;
    const bMinY = this.bounds.min.y;
    const bMinZ = this.bounds.min.z;
    const dx = this.voxelSize.x;
    const dy = this.voxelSize.y;
    const dz = this.voxelSize.z;

    // Local helper closures
    const getDensity = (gx: number, gy: number, gz: number): number => {
      if (gx < 0 || gx >= res || gy < 0 || gy >= res || gz < 0 || gz >= res) {
        return 0;
      }
      return field[gz * res * res + gy * res + gx];
    };

    const worldX = (gx: number) => bMinX + gx * dx;
    const worldY = (gy: number) => bMinY + gy * dy;
    const worldZ = (gz: number) => bMinZ + gz * dz;

    const _normalOut = [0, 1, 0];

    const computeNormal = (wx: number, wy: number, wz: number): void => {
      const gx0 = Math.round((wx - bMinX) / dx);
      const gy0 = Math.round((wy - bMinY) / dy);
      const gz0 = Math.round((wz - bMinZ) / dz);

      const ndx = getDensity(gx0 + 1, gy0, gz0) - getDensity(gx0 - 1, gy0, gz0);
      const ndy = getDensity(gx0, gy0 + 1, gz0) - getDensity(gx0, gy0 - 1, gz0);
      const ndz = getDensity(gx0, gy0, gz0 + 1) - getDensity(gx0, gy0, gz0 - 1);

      const len = Math.sqrt(ndx * ndx + ndy * ndy + ndz * ndz);
      if (len < 1e-10) {
        _normalOut[0] = 0; _normalOut[1] = 1; _normalOut[2] = 0;
      } else {
        _normalOut[0] = ndx / len;
        _normalOut[1] = ndy / len;
        _normalOut[2] = ndz / len;
      }
    };

    // Main loop over cells
    for (let cz = 0; cz < cellsZ; cz++) {
      for (let cy = 0; cy < cellsY; cy++) {
        for (let cx = 0; cx < cellsX; cx++) {
          // 8 corner density values
          const cornerValues = [
            getDensity(cx, cy, cz),
            getDensity(cx + 1, cy, cz),
            getDensity(cx + 1, cy + 1, cz),
            getDensity(cx, cy + 1, cz),
            getDensity(cx, cy, cz + 1),
            getDensity(cx + 1, cy, cz + 1),
            getDensity(cx + 1, cy + 1, cz + 1),
            getDensity(cx, cy + 1, cz + 1),
          ];

          // Build case index
          let caseIndex = 0;
          for (let c = 0; c < 8; c++) {
            if (cornerValues[c] < isolevel) caseIndex |= (1 << c);
          }

          if (caseIndex === 0 || caseIndex === 255) continue;

          const edgeFlags = EDGE_TABLE[caseIndex];
          if (edgeFlags === 0) continue;

          // Compute edge intersection vertices & normals
          this.edgeComputed.fill(0);

          for (let edge = 0; edge < 12; edge++) {
            if ((edgeFlags & (1 << edge)) === 0) continue;

            const v0 = EDGE_VERTICES[edge * 2];
            const v1 = EDGE_VERTICES[edge * 2 + 1];

            const d0 = cornerValues[v0];
            const d1 = cornerValues[v1];
            const diff = d0 - d1;
            const t = Math.abs(diff) > 1e-10 ? (d0 - isolevel) / diff : 0.5;

            const p0x = worldX(cx + CORNER_OFFSETS[v0][0]);
            const p0y = worldY(cy + CORNER_OFFSETS[v0][1]);
            const p0z = worldZ(cz + CORNER_OFFSETS[v0][2]);
            const p1x = worldX(cx + CORNER_OFFSETS[v1][0]);
            const p1y = worldY(cy + CORNER_OFFSETS[v1][1]);
            const p1z = worldZ(cz + CORNER_OFFSETS[v1][2]);

            const ix = p0x + t * (p1x - p0x);
            const iy = p0y + t * (p1y - p0y);
            const iz = p0z + t * (p1z - p0z);

            const off = edge * 3;
            this.edgePos[off] = ix;
            this.edgePos[off + 1] = iy;
            this.edgePos[off + 2] = iz;

            computeNormal(ix, iy, iz);
            this.edgeNorm[off] = _normalOut[0];
            this.edgeNorm[off + 1] = _normalOut[1];
            this.edgeNorm[off + 2] = _normalOut[2];

            this.edgeComputed[edge] = 1;
          }

          // Generate triangles from lookup table
          const base = caseIndex * 16;
          for (let i = 0; i < 16; i += 3) {
            const e0 = TRIANGLE_TABLE[base + i];
            if (e0 === -1) break;

            const e1 = TRIANGLE_TABLE[base + i + 1];
            const e2 = TRIANGLE_TABLE[base + i + 2];

            for (const e of [e0, e1, e2]) {
              const off = e * 3;
              posArr.push(this.edgePos[off], this.edgePos[off + 1], this.edgePos[off + 2]);
              normArr.push(this.edgeNorm[off], this.edgeNorm[off + 1], this.edgeNorm[off + 2]);
            }
          }
        }
      }
    }

    // Build geometry
    return this.buildGeometry(posArr, normArr);
  }

  // ── Geometry helpers ───────────────────────────────────────────────────

  private createEmptyGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(0), 3));
    return geo;
  }

  private buildGeometry(positions: number[], normals: number[]): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    const vertCount = positions.length / 3;

    if (vertCount === 0) {
      return this.createEmptyGeometry();
    }

    const posArray = new Float32Array(positions);
    const normArray = new Float32Array(normals);

    geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normArray, 3));
    geo.computeBoundingSphere();

    return geo;
  }

  // ── Laplacian smoothing ────────────────────────────────────────────────

  /**
   * Apply Laplacian smoothing to the surface mesh.
   * This reduces high-frequency noise from the marching cubes output
   * while preserving the overall shape.
   *
   * Uses a simple vertex-neighbor averaging approach with boundary
   * vertex detection to avoid shrinking.
   */
  private applyLaplacianSmoothing(
    geometry: THREE.BufferGeometry,
    iterations: number,
    factor: number,
  ): void {
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    if (!posAttr || posAttr.count < 3) return;

    const vertCount = posAttr.count;

    // Build vertex neighbor map from triangle connectivity
    const neighbors: Map<number, number[]> = new Map();
    for (let i = 0; i < vertCount; i++) {
      neighbors.set(i, []);
    }

    // We need the index buffer; if there isn't one, build from the position attribute
    // (non-indexed geometry — each triangle is 3 sequential vertices)
    const triCount = vertCount / 3;
    for (let t = 0; t < triCount; t++) {
      const i0 = t * 3;
      const i1 = t * 3 + 1;
      const i2 = t * 3 + 2;

      neighbors.get(i0)!.push(i1, i2);
      neighbors.get(i1)!.push(i0, i2);
      neighbors.get(i2)!.push(i0, i1);
    }

    // Iterative smoothing
    for (let iter = 0; iter < iterations; iter++) {
      const newPos = new Float32Array(vertCount * 3);

      for (let i = 0; i < vertCount; i++) {
        const nbrs = neighbors.get(i)!;
        if (nbrs.length === 0) {
          newPos[i * 3] = posAttr.getX(i);
          newPos[i * 3 + 1] = posAttr.getY(i);
          newPos[i * 3 + 2] = posAttr.getZ(i);
          continue;
        }

        // Average of neighbors
        let ax = 0, ay = 0, az = 0;
        for (const n of nbrs) {
          ax += posAttr.getX(n);
          ay += posAttr.getY(n);
          az += posAttr.getZ(n);
        }
        const count = nbrs.length;
        ax /= count;
        ay /= count;
        az /= count;

        // Blend between original and average
        const ox = posAttr.getX(i);
        const oy = posAttr.getY(i);
        const oz = posAttr.getZ(i);

        newPos[i * 3] = ox + factor * (ax - ox);
        newPos[i * 3 + 1] = oy + factor * (ay - oy);
        newPos[i * 3 + 2] = oz + factor * (az - oz);
      }

      // Write back
      for (let i = 0; i < vertCount * 3; i++) {
        (posAttr.array as Float32Array)[i] = newPos[i];
      }
      posAttr.needsUpdate = true;
    }

    // Recompute normals after smoothing
    geometry.computeVertexNormals();
  }

  // ── Dispose ────────────────────────────────────────────────────────────

  dispose(): void {
    this.densityField = new Float32Array(0);
  }
}

export default FLIPSurfaceExtractor;
