/**
 * SPH Surface Extractor
 *
 * Converts SPH particle output into a smooth watertight mesh surface using
 * marching cubes isosurface extraction on a density field computed with
 * the Poly6 kernel.
 *
 * Pipeline:
 *   1. Compute bounding box of particles (with padding)
 *   2. Rasterise particle contributions onto a regular scalar grid using
 *      the SPH Poly6 kernel  →  density field
 *   3. Run marching cubes on the density field at a configurable iso-threshold
 *   4. Apply Laplacian smoothing for smooth surface
 *   5. Compute normals from density gradient
 *
 * This module is designed to work with the existing FluidDynamics SPH system
 * as well as the FluidSimulation SPH implementation, using a generic
 * particle position interface.
 *
 * @module SPHSurfaceExtractor
 */

import * as THREE from 'three';
import { EDGE_TABLE, TRIANGLE_TABLE, EDGE_VERTICES, CORNER_OFFSETS } from '../../terrain/mesher/MarchingCubesLUTs';

// ─── Configuration ────────────────────────────────────────────────────────────

export interface SPHSurfaceExtractorConfig {
  /** Grid resolution per axis for the density field (default 32) */
  gridResolution: number;
  /** SPH smoothing radius — must match the simulation (default 0.5) */
  smoothingRadius: number;
  /** SPH particle mass (default 0.1) */
  particleMass: number;
  /** Iso-threshold for marching cubes (density value at the surface) (default 100) */
  isoThreshold: number;
  /** World-space padding around particle bounds (default 0.15) */
  boundsPadding: number;
  /** Number of Laplacian smoothing iterations (default 2) */
  smoothingIterations: number;
  /** Smoothing factor per iteration, 0 = none, 1 = max (default 0.3) */
  smoothingFactor: number;
  /** Target number of SPH particles for surface extraction (default 2000) */
  targetParticleCount: number;
}

const DEFAULT_EXTRACTOR_CONFIG: SPHSurfaceExtractorConfig = {
  gridResolution: 32,
  smoothingRadius: 0.5,
  particleMass: 0.1,
  isoThreshold: 100,
  boundsPadding: 0.15,
  smoothingIterations: 2,
  smoothingFactor: 0.3,
  targetParticleCount: 2000,
};

// ─── Poly6 kernel ─────────────────────────────────────────────────────────────

/**
 * SPH Poly6 kernel coefficient: W(r, h) = (315 / 64πh⁹) · (h² − r²)³
 * Pre-computed once so the inner loop only does multiplies.
 */
function poly6Coefficient(h: number): number {
  return 315 / (64 * Math.PI * Math.pow(h, 9));
}

// ─── Particle position interface ──────────────────────────────────────────────

/**
 * Minimal interface for particles that provide a position.
 * Works with FluidDynamics.FluidParticle, FluidSimulation.FluidParticle,
 * or any custom particle type.
 */
export interface ParticleWithPosition {
  position: THREE.Vector3;
}

// ─── Per-cell edge caches (reused each extraction) ────────────────────────────

/** Per-cell cache: 12 edges × 3 position components */
const EDGE_POS = new Float32Array(12 * 3);
/** Per-cell cache: 12 edges × 3 normal components */
const EDGE_NORM = new Float32Array(12 * 3);
/** Per-cell bitmask: which edges have been computed */
const EDGE_COMPUTED = new Uint8Array(12);

// ─── SPHSurfaceExtractor ──────────────────────────────────────────────────────

export class SPHSurfaceExtractor {
  private config: SPHSurfaceExtractorConfig;

  // Poly6 helpers
  private poly6Coeff: number;
  private h2: number; // smoothing radius squared

  // Density field (flat array, indexed [z * res² + y * res + x])
  private densityField: Float32Array;

  // Reusable bounding box & voxel size
  private bounds: THREE.Box3;
  private voxelSize: THREE.Vector3;

  constructor(config: Partial<SPHSurfaceExtractorConfig> = {}) {
    this.config = { ...DEFAULT_EXTRACTOR_CONFIG, ...config };
    this.poly6Coeff = poly6Coefficient(this.config.smoothingRadius);
    this.h2 = this.config.smoothingRadius * this.config.smoothingRadius;

    const res = this.config.gridResolution;
    this.densityField = new Float32Array(res * res * res);

    this.bounds = new THREE.Box3();
    this.voxelSize = new THREE.Vector3();
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Extract a smooth surface mesh from SPH particles.
   *
   * @param particles Array of particles with position property
   * @param params Optional override parameters for this extraction call
   * @returns THREE.BufferGeometry with the extracted watertight surface
   */
  extractSurface(
    particles: ParticleWithPosition[],
    params?: Partial<SPHSurfaceExtractorConfig>,
  ): THREE.BufferGeometry {
    // Apply temporary parameter overrides if provided
    const savedConfig = params ? { ...this.config } : null;
    if (params) {
      Object.assign(this.config, params);
      this.poly6Coeff = poly6Coefficient(this.config.smoothingRadius);
      this.h2 = this.config.smoothingRadius * this.config.smoothingRadius;

      // Resize density field if grid resolution changed
      const needed = this.config.gridResolution ** 3;
      if (this.densityField.length < needed) {
        this.densityField = new Float32Array(needed);
      }
    }

    try {
      if (particles.length === 0) {
        return this.createEmptyGeometry();
      }

      // 1. Compute bounding box with padding
      this.computeBounds(particles);

      // 2. Build density field using Poly6 kernel
      this.buildDensityField(particles);

      // 3. Marching cubes extraction
      const geometry = this.march();

      // 4. Laplacian smoothing
      if (this.config.smoothingIterations > 0) {
        this.applyLaplacianSmoothing(
          geometry,
          this.config.smoothingIterations,
          this.config.smoothingFactor,
        );
      }

      // 5. Compute normals from density gradient (already done in march(),
      //    but recompute after smoothing)
      if (this.config.smoothingIterations > 0 && geometry.getAttribute('position')) {
        geometry.computeVertexNormals();
      }

      return geometry;
    } finally {
      // Restore original config if we overrode it
      if (savedConfig) {
        this.config = savedConfig;
        this.poly6Coeff = poly6Coefficient(this.config.smoothingRadius);
        this.h2 = this.config.smoothingRadius * this.config.smoothingRadius;
      }
    }
  }

  /**
   * Get the raw density field for debugging or custom visualization.
   */
  getDensityField(): Float32Array {
    return this.densityField;
  }

  /**
   * Get the computed bounds from the last extraction.
   */
  getBounds(): THREE.Box3 {
    return this.bounds.clone();
  }

  // ── Bounding box ───────────────────────────────────────────────────────

  private computeBounds(particles: ParticleWithPosition[]): void {
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

  // ── Density field ──────────────────────────────────────────────────────

  /**
   * Build the density field by splatting particle contributions onto the
   * grid using the Poly6 kernel. This is the same approach used by
   * FluidSurfaceRenderer but operates as a standalone extraction step.
   */
  private buildDensityField(particles: ParticleWithPosition[]): void {
    const res = this.config.gridResolution;
    const field = this.densityField;
    const mass = this.config.particleMass;
    const h = this.config.smoothingRadius;
    const h2 = this.h2;
    const coeff = this.poly6Coeff;

    // Zero out
    field.fill(0);

    const bMinX = this.bounds.min.x;
    const bMinY = this.bounds.min.y;
    const bMinZ = this.bounds.min.z;
    const dx = this.voxelSize.x;
    const dy = this.voxelSize.y;
    const dz = this.voxelSize.z;

    // For each particle, splat its contribution onto nearby grid nodes.
    // A particle at position p only influences grid nodes within radius h.
    for (let pi = 0; pi < particles.length; pi++) {
      const px = particles[pi].position.x;
      const py = particles[pi].position.y;
      const pz = particles[pi].position.z;

      // Grid index range this particle can affect
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

          // Early-out if already beyond h in the y-z plane
          if (ry2 + rz2 >= h2) continue;

          for (let gx = gxMin; gx <= gxMax; gx++) {
            const gxWorld = bMinX + (gx + 0.5) * dx;
            const rx = px - gxWorld;
            const r2 = rx * rx + ry2 + rz2;

            if (r2 < h2) {
              // Poly6 kernel: W(r, h) = coeff * (h² - r²)³
              const diff = h2 - r2;
              field[gyOffset + gx] += mass * coeff * diff * diff * diff;
            }
          }
        }
      }
    }
  }

  // ── Marching cubes ─────────────────────────────────────────────────────

  /**
   * Run marching cubes on the density field to extract a watertight
   * isosurface at the configured iso-threshold.
   */
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

    // ── Local helpers (closures for speed) ───────────────────────────────

    /** Get density value at grid vertex (gx, gy, gz); 0 outside bounds. */
    const getDensity = (gx: number, gy: number, gz: number): number => {
      if (gx < 0 || gx >= res || gy < 0 || gy >= res || gz < 0 || gz >= res) {
        return 0;
      }
      return field[gz * res * res + gy * res + gx];
    };

    /** World position of grid vertex (integer coords, no +0.5). */
    const worldX = (gx: number) => bMinX + gx * dx;
    const worldY = (gy: number) => bMinY + gy * dy;
    const worldZ = (gz: number) => bMinZ + gz * dz;

    /** Density-gradient normal via central differences. */
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

    // Reusable output for computeNormal (avoids array allocation per vertex)
    const _normalOut = [0, 1, 0];

    // ── Main loop over cells ─────────────────────────────────────────────

    for (let cz = 0; cz < cellsZ; cz++) {
      for (let cy = 0; cy < cellsY; cy++) {
        for (let cx = 0; cx < cellsX; cx++) {

          // 8 corner density values
          const c0 = getDensity(cx, cy, cz);
          const c1 = getDensity(cx + 1, cy, cz);
          const c2 = getDensity(cx + 1, cy + 1, cz);
          const c3 = getDensity(cx, cy + 1, cz);
          const c4 = getDensity(cx, cy, cz + 1);
          const c5 = getDensity(cx + 1, cy, cz + 1);
          const c6 = getDensity(cx + 1, cy + 1, cz + 1);
          const c7 = getDensity(cx, cy + 1, cz + 1);

          const cornerValues = [c0, c1, c2, c3, c4, c5, c6, c7];

          // Build case index: bit i = 1 if corner i is *inside* (density < threshold)
          let caseIndex = 0;
          if (c0 < isolevel) caseIndex |= 1;
          if (c1 < isolevel) caseIndex |= 2;
          if (c2 < isolevel) caseIndex |= 4;
          if (c3 < isolevel) caseIndex |= 8;
          if (c4 < isolevel) caseIndex |= 16;
          if (c5 < isolevel) caseIndex |= 32;
          if (c6 < isolevel) caseIndex |= 64;
          if (c7 < isolevel) caseIndex |= 128;

          // Skip entirely inside / entirely outside cells
          if (caseIndex === 0 || caseIndex === 255) continue;

          const edgeFlags = EDGE_TABLE[caseIndex];
          if (edgeFlags === 0) continue;

          // ── Compute edge intersection vertices & normals ──────────────

          EDGE_COMPUTED.fill(0);

          for (let edge = 0; edge < 12; edge++) {
            if ((edgeFlags & (1 << edge)) === 0) continue;

            const v0 = EDGE_VERTICES[edge * 2];
            const v1 = EDGE_VERTICES[edge * 2 + 1];

            const d0 = cornerValues[v0];
            const d1 = cornerValues[v1];
            const diff = d0 - d1;
            const t = Math.abs(diff) > 1e-10 ? (d0 - isolevel) / diff : 0.5;

            // Corner world positions
            const p0x = worldX(cx + CORNER_OFFSETS[v0][0]);
            const p0y = worldY(cy + CORNER_OFFSETS[v0][1]);
            const p0z = worldZ(cz + CORNER_OFFSETS[v0][2]);
            const p1x = worldX(cx + CORNER_OFFSETS[v1][0]);
            const p1y = worldY(cy + CORNER_OFFSETS[v1][1]);
            const p1z = worldZ(cz + CORNER_OFFSETS[v1][2]);

            // Interpolated position
            const ix = p0x + t * (p1x - p0x);
            const iy = p0y + t * (p1y - p0y);
            const iz = p0z + t * (p1z - p0z);

            const off = edge * 3;
            EDGE_POS[off] = ix;
            EDGE_POS[off + 1] = iy;
            EDGE_POS[off + 2] = iz;

            // Normal from density gradient
            computeNormal(ix, iy, iz);
            EDGE_NORM[off] = _normalOut[0];
            EDGE_NORM[off + 1] = _normalOut[1];
            EDGE_NORM[off + 2] = _normalOut[2];

            EDGE_COMPUTED[edge] = 1;
          }

          // ── Generate triangles from the lookup table ──────────────────

          const base = caseIndex * 16;
          for (let i = 0; i < 16; i += 3) {
            const e0 = TRIANGLE_TABLE[base + i];
            if (e0 === -1) break;

            const e1 = TRIANGLE_TABLE[base + i + 1];
            const e2 = TRIANGLE_TABLE[base + i + 2];

            // Push three vertices for this triangle
            const triEdges = [e0, e1, e2];
            for (let vi = 0; vi < 3; vi++) {
              const e = triEdges[vi];
              const off = e * 3;
              posArr.push(EDGE_POS[off], EDGE_POS[off + 1], EDGE_POS[off + 2]);
              normArr.push(EDGE_NORM[off], EDGE_NORM[off + 1], EDGE_NORM[off + 2]);
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
    const vertCount = positions.length / 3;

    if (vertCount === 0) {
      return this.createEmptyGeometry();
    }

    const geo = new THREE.BufferGeometry();
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
   * Reduces high-frequency noise from marching cubes output while
   * preserving overall shape.
   *
   * Uses vertex-neighbor averaging with boundary detection.
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
    // Non-indexed geometry: each triangle is 3 sequential vertices
    const neighbors: Map<number, number[]> = new Map();
    for (let i = 0; i < vertCount; i++) {
      neighbors.set(i, []);
    }

    const triCount = Math.floor(vertCount / 3);
    for (let t = 0; t < triCount; t++) {
      const i0 = t * 3;
      const i1 = t * 3 + 1;
      const i2 = t * 3 + 2;

      const n0 = neighbors.get(i0)!;
      const n1 = neighbors.get(i1)!;
      const n2 = neighbors.get(i2)!;

      n0.push(i1, i2);
      n1.push(i0, i2);
      n2.push(i0, i1);
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
      const array = posAttr.array as Float32Array;
      for (let i = 0; i < vertCount * 3; i++) {
        array[i] = newPos[i];
      }
      posAttr.needsUpdate = true;
    }
  }

  // ── Dispose ────────────────────────────────────────────────────────────

  dispose(): void {
    this.densityField = new Float32Array(0);
  }
}

export default SPHSurfaceExtractor;
