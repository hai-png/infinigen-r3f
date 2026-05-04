/**
 * FluidSurfaceRenderer
 *
 * Reconstructs a smooth water surface from SPH particle positions using
 * marching-cubes isosurface extraction over a density field computed with
 * the Poly6 kernel.
 *
 * Pipeline per frame:
 *   1. Compute axis-aligned bounding box of particles (with padding)
 *   2. Rasterise particle contributions onto a regular scalar grid using
 *      the SPH Poly6 kernel  →  density field
 *   3. Run marching cubes on the density field at `restDensity` threshold
 *   4. Swap the result into a double-buffered THREE.Mesh
 *
 * Target: 30+ FPS for 500 particles on a 32³ grid.
 */

import * as THREE from 'three';
import { EDGE_TABLE, TRIANGLE_TABLE, EDGE_VERTICES, CORNER_OFFSETS } from '../../terrain/mesher/MarchingCubesLUTs';
import { getDefaultLibrary } from '../../assets/materials/MaterialPresetLibrary';

// ─── Configuration ──────────────────────────────────────────────────────────

export interface FluidSurfaceRendererConfig {
  /** Grid resolution per axis (default 32) */
  gridResolution: number;
  /** Smoothing radius – must match FluidSimulation.h (default 0.1) */
  smoothingRadius: number;
  /** SPH particle mass (default 0.1) */
  particleMass: number;
  /** Rest density – the isosurface threshold (default 1000) */
  restDensity: number;
  /** World-space padding around the particle bounding box (default 0.15) */
  boundsPadding: number;
  /**
   * Material preset id from MaterialPresetLibrary (e.g. 'river_water'),
   * or 'default' for a built-in MeshPhysicalMaterial water look.
   * Ignored if `customMaterial` is provided. (default 'default')
   */
  materialPreset: string;
  /** Optional pre-built material; overrides materialPreset if supplied. */
  customMaterial?: THREE.MeshPhysicalMaterial;
}

const DEFAULT_CONFIG: FluidSurfaceRendererConfig = {
  gridResolution: 32,
  smoothingRadius: 0.1,
  particleMass: 0.1,
  restDensity: 1000,
  boundsPadding: 0.15,
  materialPreset: 'default',
};

// ─── Pre-computed Poly6 constants ───────────────────────────────────────────

/**
 * SPH Poly6 kernel: W(r, h) = (315 / 64πh⁹) · (h² − r²)³   for 0 ≤ r ≤ h
 *
 * We pre-compute the normalisation coefficient once so the inner loop only
 * does multiplies.
 */
function poly6Coefficient(h: number): number {
  return 315 / (64 * Math.PI * Math.pow(h, 9));
}

// ─── Reusable typed arrays for edge-vertex cache ────────────────────────────

/** Per-cell cache: 12 edges × 3 position components */
const EDGE_POS = new Float32Array(12 * 3);
/** Per-cell cache: 12 edges × 3 normal components */
const EDGE_NORM = new Float32Array(12 * 3);
/** Per-cell bitmask: which edges have been computed */
const EDGE_COMPUTED = new Uint8Array(12);

// ─── FluidSurfaceRenderer ───────────────────────────────────────────────────

export class FluidSurfaceRenderer {
  // Configuration
  private config: FluidSurfaceRendererConfig;

  // Poly6 helpers
  private poly6Coeff: number;
  private h2: number; // h²

  // Density field (flat array, indexed [z * res² + y * res + x])
  private densityField: Float32Array;

  // Double-buffered geometry
  private geometryA: THREE.BufferGeometry;
  private geometryB: THREE.BufferGeometry;
  private currentIsA: boolean = true;

  // Output mesh
  private mesh: THREE.Mesh;

  // Reusable bounding box & voxel size
  private bounds: THREE.Box3;
  private voxelSize: THREE.Vector3;

  // ── Constructor ──────────────────────────────────────────────────────────

  constructor(config: Partial<FluidSurfaceRendererConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.poly6Coeff = poly6Coefficient(this.config.smoothingRadius);
    this.h2 = this.config.smoothingRadius * this.config.smoothingRadius;

    const res = this.config.gridResolution;
    this.densityField = new Float32Array(res * res * res);

    // Default bounds – will be recomputed every frame from particle positions
    this.bounds = new THREE.Box3(
      new THREE.Vector3(-1, -1, -1),
      new THREE.Vector3(1, 1, 1),
    );
    this.voxelSize = new THREE.Vector3();

    // Create two empty geometries for double-buffering
    this.geometryA = this.createEmptyGeometry();
    this.geometryB = this.createEmptyGeometry();

    // Create material
    const material = this.config.customMaterial ?? this.createMaterial();

    // Create the output mesh
    this.mesh = new THREE.Mesh(this.geometryA, material);
    this.mesh.frustumCulled = false; // geometry updates every frame
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /** The THREE.Mesh that renders the fluid surface. Add this to your scene. */
  getMesh(): THREE.Mesh {
    return this.mesh;
  }

  /**
   * Recompute the surface from the current particle positions.
   * Call once per frame after FluidSimulation.step().
   *
   * @param particlePositions Array of Vector3 (one per particle)
   */
  update(particlePositions: THREE.Vector3[]): void {
    if (particlePositions.length === 0) {
      this.clearGeometry(this.getWriteGeometry());
      this.swapGeometry();
      return;
    }

    // 1. Compute bounding box with padding
    this.computeBounds(particlePositions);

    // 2. Build density field
    this.buildDensityField(particlePositions);

    // 3. Marching cubes
    const geometry = this.getWriteGeometry();
    this.march(geometry);

    // 4. Swap double-buffer
    this.swapGeometry();
  }

  /** Clean up GPU resources. */
  dispose(): void {
    this.geometryA.dispose();
    this.geometryB.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }

  // ── Bounding box ─────────────────────────────────────────────────────────

  private computeBounds(positions: THREE.Vector3[]): void {
    const pad = this.config.boundsPadding;
    this.bounds.min.set(Infinity, Infinity, Infinity);
    this.bounds.max.set(-Infinity, -Infinity, -Infinity);

    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
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

    // Voxel size = bounds extent / grid resolution
    const res = this.config.gridResolution;
    this.voxelSize.set(
      (this.bounds.max.x - this.bounds.min.x) / res,
      (this.bounds.max.y - this.bounds.min.y) / res,
      (this.bounds.max.z - this.bounds.min.z) / res,
    );
  }

  // ── Density field ────────────────────────────────────────────────────────

  private buildDensityField(positions: THREE.Vector3[]): void {
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

    // For each particle, splat its contribution onto nearby grid nodes
    // instead of the naive O(grid × particles) approach.
    //
    // A particle at position p only influences grid nodes within radius h,
    // giving us a local 3D stamp of size ≈ (2h/cellSize)³.
    for (let pi = 0; pi < positions.length; pi++) {
      const px = positions[pi].x;
      const py = positions[pi].y;
      const pz = positions[pi].z;

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
              const diff = h2 - r2;
              field[gyOffset + gx] += mass * coeff * diff * diff * diff;
            }
          }
        }
      }
    }
  }

  // ── Marching cubes ───────────────────────────────────────────────────────

  /**
   * Run marching cubes on the density field, writing triangles directly
   * into the given BufferGeometry's draw-range.
   *
   * This mirrors extractIsosurface() from sdf-operations.ts but operates on
   * our flat density field instead of a SignedDistanceField object, avoiding
   * per-voxel object allocations.
   */
  private march(geometry: THREE.BufferGeometry): void {
    const res = this.config.gridResolution;
    const isolevel = this.config.restDensity;
    const field = this.densityField;

    const cellsX = res - 1;
    const cellsY = res - 1;
    const cellsZ = res - 1;

    if (cellsX <= 0 || cellsY <= 0 || cellsZ <= 0) {
      this.clearGeometry(geometry);
      return;
    }

    // Dynamic arrays – only a fraction of cells will produce triangles.
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

    /** World position of grid *vertex* (integer coords, no +0.5). */
    const worldX = (gx: number) => bMinX + gx * dx;
    const worldY = (gy: number) => bMinY + gy * dy;
    const worldZ = (gz: number) => bMinZ + gz * dz;

    /** Density-gradient normal via central differences (1-grid-cell step). */
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
          const c0 = getDensity(cx,     cy,     cz);
          const c1 = getDensity(cx + 1, cy,     cz);
          const c2 = getDensity(cx + 1, cy + 1, cz);
          const c3 = getDensity(cx,     cy + 1, cz);
          const c4 = getDensity(cx,     cy,     cz + 1);
          const c5 = getDensity(cx + 1, cy,     cz + 1);
          const c6 = getDensity(cx + 1, cy + 1, cz + 1);
          const c7 = getDensity(cx,     cy + 1, cz + 1);

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
            EDGE_POS[off]     = ix;
            EDGE_POS[off + 1] = iy;
            EDGE_POS[off + 2] = iz;

            // Normal from density gradient
            computeNormal(ix, iy, iz);
            EDGE_NORM[off]     = _normalOut[0];
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

    // Write into geometry buffers
    this.writeGeometry(geometry, posArr, normArr);
  }

  // ── Geometry helpers ─────────────────────────────────────────────────────

  private createEmptyGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    // Pre-allocate a reasonable initial size; will grow if needed.
    const initialVerts = 8192;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(initialVerts * 3), 3));
    geo.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(initialVerts * 3), 3));
    geo.setDrawRange(0, 0);
    return geo;
  }

  /**
   * Write position and normal arrays into the geometry, growing the
   * underlying buffers if necessary.
   */
  private writeGeometry(
    geometry: THREE.BufferGeometry,
    positions: number[],
    normals: number[],
  ): void {
    const vertCount = positions.length / 3;

    if (vertCount === 0) {
      geometry.setDrawRange(0, 0);
      return;
    }

    let posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    let normAttr = geometry.getAttribute('normal') as THREE.BufferAttribute;

    // Grow buffers if needed
    if (posAttr.count < vertCount) {
      const newSize = Math.max(vertCount, posAttr.count * 2);
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(newSize * 3), 3));
      geometry.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(newSize * 3), 3));
      posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
      normAttr = geometry.getAttribute('normal') as THREE.BufferAttribute;
    }

    const posArray = posAttr.array as Float32Array;
    const normArray = normAttr.array as Float32Array;

    // Copy data – positions/normals are plain number[], so build a typed view
    for (let i = 0, len = vertCount * 3; i < len; i++) {
      posArray[i] = positions[i];
      normArray[i] = normals[i];
    }

    posAttr.needsUpdate = true;
    normAttr.needsUpdate = true;
    geometry.setDrawRange(0, vertCount);
    geometry.computeBoundingSphere();
  }

  private clearGeometry(geometry: THREE.BufferGeometry): void {
    geometry.setDrawRange(0, 0);
  }

  // ── Double-buffer swap ───────────────────────────────────────────────────

  private getWriteGeometry(): THREE.BufferGeometry {
    // Write to the buffer that is NOT currently displayed
    return this.currentIsA ? this.geometryB : this.geometryA;
  }

  private swapGeometry(): void {
    this.currentIsA = !this.currentIsA;
    this.mesh.geometry = this.currentIsA ? this.geometryA : this.geometryB;
  }

  // ── Material ─────────────────────────────────────────────────────────────

  private createMaterial(): THREE.MeshPhysicalMaterial {
    // Try the river_water preset from MaterialPresetLibrary
    if (this.config.materialPreset !== 'default') {
      try {
        const lib = getDefaultLibrary();
        const mat = lib.getSimpleMaterial(this.config.materialPreset);
        if (mat) return mat;
      } catch {
        // Library unavailable – fall through to built-in material
      }
    }

    // Fallback: a water-like MeshPhysicalMaterial
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x0077be),
      roughness: 0.05,
      metalness: 0.0,
      transmission: 0.85,
      thickness: 2.0,
      ior: 1.33,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      envMapIntensity: 1.0,
    });
  }
}

// ─── Fluid Render Integration ────────────────────────────────────────────────────

/**
 * High-level integration class for fluid rendering.
 *
 * Provides seamless integration between:
 * - FLIP solver output → rendered fluid surface mesh
 * - WhitewaterGenerator → foam/spray/bubble overlay
 * - Depth-based refraction for underwater views
 *
 * Phase 2, Item 8: Fluid Scale and Materials
 */
export class FluidRenderIntegration {
  private surfaceRenderer: FluidSurfaceRenderer;
  private fluidMesh: THREE.Mesh | null = null;
  private whitewaterGroup: THREE.Group | null = null;
  private underwaterMaterial: THREE.ShaderMaterial | null = null;

  // Whitewater instanced meshes
  private foamInstances: THREE.InstancedMesh | null = null;
  private sprayInstances: THREE.InstancedMesh | null = null;
  private bubbleInstances: THREE.InstancedMesh | null = null;

  constructor(config: Partial<FluidSurfaceRendererConfig> = {}) {
    this.surfaceRenderer = new FluidSurfaceRenderer(config);
  }

  /**
   * Create a fluid mesh from FLIP solver output and surface extractor.
   * The mesh is updated each frame with the latest surface geometry.
   */
  createFluidMesh(
    particlePositions: THREE.Vector3[],
  ): THREE.Mesh {
    this.surfaceRenderer.update(particlePositions);
    this.fluidMesh = this.surfaceRenderer.getMesh();
    return this.fluidMesh;
  }

  /**
   * Add whitewater overlay (foam, spray, bubbles) to the scene.
   * Creates instanced meshes for each whitewater type.
   */
  addWhitewaterLayer(
    renderData: import('./WhitewaterGenerator').WhitewaterRenderData,
  ): THREE.Group {
    if (!this.whitewaterGroup) {
      this.whitewaterGroup = new THREE.Group();
      this.whitewaterGroup.name = 'whitewater_group';
    }

    // Remove existing instances
    if (this.foamInstances) {
      this.whitewaterGroup.remove(this.foamInstances);
      this.foamInstances.geometry.dispose();
      (this.foamInstances.material as THREE.Material).dispose();
    }
    if (this.sprayInstances) {
      this.whitewaterGroup.remove(this.sprayInstances);
      this.sprayInstances.geometry.dispose();
      (this.sprayInstances.material as THREE.Material).dispose();
    }
    if (this.bubbleInstances) {
      this.whitewaterGroup.remove(this.bubbleInstances);
      this.bubbleInstances.geometry.dispose();
      (this.bubbleInstances.material as THREE.Material).dispose();
    }

    // Foam: flat white discs on surface
    if (renderData.foamMatrices.length > 0) {
      const foamGeo = new THREE.CircleGeometry(0.05, 8);
      const foamMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.15,
        metalness: 0.0,
        transmission: 0.5,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.foamInstances = new THREE.InstancedMesh(
        foamGeo,
        foamMat,
        renderData.foamMatrices.length,
      );
      for (let i = 0; i < renderData.foamMatrices.length; i++) {
        this.foamInstances.setMatrixAt(i, renderData.foamMatrices[i]);
        this.foamInstances.setColorAt(i, new THREE.Color(1, 1, 1));
      }
      this.foamInstances.instanceMatrix.needsUpdate = true;
      this.whitewaterGroup.add(this.foamInstances);
    }

    // Spray: small white spheres above surface
    if (renderData.sprayMatrices.length > 0) {
      const sprayGeo = new THREE.SphereGeometry(0.01, 6, 4);
      const sprayMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.1,
        metalness: 0.3,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      });
      this.sprayInstances = new THREE.InstancedMesh(
        sprayGeo,
        sprayMat,
        renderData.sprayMatrices.length,
      );
      for (let i = 0; i < renderData.sprayMatrices.length; i++) {
        this.sprayInstances.setMatrixAt(i, renderData.sprayMatrices[i]);
      }
      this.sprayInstances.instanceMatrix.needsUpdate = true;
      this.whitewaterGroup.add(this.sprayInstances);
    }

    // Bubbles: subsurface bluish spheres
    if (renderData.bubbleMatrices.length > 0) {
      const bubbleGeo = new THREE.SphereGeometry(0.02, 8, 6);
      const bubbleMat = new THREE.MeshPhysicalMaterial({
        color: 0xaaddff,
        roughness: 0.0,
        metalness: 0.0,
        transmission: 0.7,
        ior: 1.0,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      });
      this.bubbleInstances = new THREE.InstancedMesh(
        bubbleGeo,
        bubbleMat,
        renderData.bubbleMatrices.length,
      );
      for (let i = 0; i < renderData.bubbleMatrices.length; i++) {
        this.bubbleInstances.setMatrixAt(i, renderData.bubbleMatrices[i]);
      }
      this.bubbleInstances.instanceMatrix.needsUpdate = true;
      this.whitewaterGroup.add(this.bubbleInstances);
    }

    return this.whitewaterGroup;
  }

  /**
   * Create an underwater post-processing effect.
   * Applies depth-based color shift and distortion.
   */
  createUnderwaterEffect(): THREE.ShaderMaterial {
    if (this.underwaterMaterial) return this.underwaterMaterial;

    this.underwaterMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        uCameraPos: { value: new THREE.Vector3() },
        uWaterLevel: { value: 0.0 },
        uFogColor: { value: new THREE.Color(0x004466) },
        uFogDensity: { value: 0.15 },
        uAbsorption: { value: new THREE.Vector3(0.4, 0.15, 0.05) },
        uTime: { value: 0 },
      },

      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorldPos;

        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,

      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform vec3 uCameraPos;
        uniform float uWaterLevel;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform vec3 uAbsorption;
        uniform float uTime;

        varying vec2 vUv;
        varying vec3 vWorldPos;

        void main() {
          vec4 color = texture2D(tDiffuse, vUv);

          // Depth from depth buffer
          float depth = texture2D(tDepth, vUv).r;

          // Underwater check
          float underwaterFactor = smoothstep(uWaterLevel + 0.1, uWaterLevel - 0.5, vWorldPos.y);

          if (underwaterFactor > 0.0) {
            // Caustics-like pattern
            float caustic = sin(vWorldPos.x * 5.0 + uTime * 2.0) *
                           sin(vWorldPos.z * 5.0 + uTime * 1.5) * 0.5 + 0.5;
            caustic = pow(caustic, 3.0);

            // Depth-based absorption (more red absorbed at depth)
            float depthBelow = max(0.0, uWaterLevel - vWorldPos.y);
            vec3 absorption = exp(-uAbsorption * depthBelow);

            // Fog
            float fogFactor = 1.0 - exp(-uFogDensity * depthBelow);

            // Apply
            color.rgb *= absorption;
            color.rgb = mix(color.rgb, uFogColor, fogFactor * 0.7);
            color.rgb += caustic * absorption * 0.1;

            // Slight blue tint
            color.rgb = mix(color.rgb, vec3(0.0, 0.3, 0.5), underwaterFactor * 0.3);
          }

          gl_FragColor = color;
        }
      `,

      transparent: true,
      depthWrite: false,
    });

    return this.underwaterMaterial;
  }

  /**
   * Get the surface renderer.
   */
  getSurfaceRenderer(): FluidSurfaceRenderer {
    return this.surfaceRenderer;
  }

  /**
   * Update the fluid mesh with new particle positions.
   */
  update(particlePositions: THREE.Vector3[]): void {
    this.surfaceRenderer.update(particlePositions);
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.surfaceRenderer.dispose();

    if (this.foamInstances) {
      this.foamInstances.geometry.dispose();
      (this.foamInstances.material as THREE.Material).dispose();
    }
    if (this.sprayInstances) {
      this.sprayInstances.geometry.dispose();
      (this.sprayInstances.material as THREE.Material).dispose();
    }
    if (this.bubbleInstances) {
      this.bubbleInstances.geometry.dispose();
      (this.bubbleInstances.material as THREE.Material).dispose();
    }
    if (this.underwaterMaterial) {
      this.underwaterMaterial.dispose();
    }
  }
}

export default FluidSurfaceRenderer;
