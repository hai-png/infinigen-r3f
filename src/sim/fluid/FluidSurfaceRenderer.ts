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
 *   3. Convert density field to a SignedDistanceField where
 *      SDF = threshold - density (negative inside fluid)
 *   4. Run extractIsosurface() from sdf-operations.ts (marching cubes at SDF = 0)
 *   5. Swap the result into a double-buffered THREE.Mesh
 *
 * Target: 30+ FPS for 500 particles on a 32³ grid.
 */

import * as THREE from 'three';
import { SignedDistanceField, extractIsosurface } from '../../terrain/sdf/sdf-operations';
import { getDefaultLibrary } from '../../assets/materials/MaterialPresetLibrary';

// ─── Configuration ──────────────────────────────────────────────────────────

export interface FluidSurfaceRendererConfig {
  /** Grid resolution per axis (default 32, max 64 for quality) */
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
   * Ignored if `customMaterial` is provided. (default 'river_water')
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
  materialPreset: 'river_water',
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

    // Clamp grid resolution to [8, 64]
    this.config.gridResolution = Math.max(8, Math.min(64, this.config.gridResolution));

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

    // 2. Build density field using Poly6 kernel
    this.buildDensityField(particlePositions);

    // 3. Build SDF and extract isosurface via extractIsosurface()
    const geometry = this.extractSurfaceViaSDF();

    // 4. Copy into double-buffered geometry
    const writeGeo = this.getWriteGeometry();
    this.copyGeometry(geometry, writeGeo);
    geometry.dispose();

    // 5. Swap double-buffer
    this.swapGeometry();
  }

  /** Get the current configuration. */
  getConfig(): FluidSurfaceRendererConfig {
    return { ...this.config };
  }

  /**
   * Update grid resolution at runtime.
   * Valid range: 8–64. Higher = better quality, lower FPS.
   */
  setGridResolution(res: number): void {
    res = Math.max(8, Math.min(64, res));
    if (res === this.config.gridResolution) return;
    this.config.gridResolution = res;
    this.densityField = new Float32Array(res * res * res);
  }

  /**
   * Update the smoothing radius. Must match the simulation's smoothing radius.
   */
  setSmoothingRadius(h: number): void {
    this.config.smoothingRadius = h;
    this.poly6Coeff = poly6Coefficient(h);
    this.h2 = h * h;
  }

  /**
   * Update the rest density threshold for the isosurface.
   */
  setRestDensity(density: number): void {
    this.config.restDensity = density;
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

  // ── SDF construction and isosurface extraction ────────────────────────────

  /**
   * Build a SignedDistanceField from the density field and extract the
   * isosurface using the shared extractIsosurface() from sdf-operations.ts.
   *
   * The density field has high values where fluid exists. To convert it
   * to a proper SDF where negative = inside, we use:
   *   SDF_value = threshold - density
   *
   * This means:
   *   - Where density > threshold → SDF < 0 (inside the fluid)
   *   - Where density = threshold → SDF = 0 (surface)
   *   - Where density < threshold → SDF > 0 (outside the fluid)
   *
   * extractIsosurface() then extracts the surface at SDF = 0, which
   * corresponds to where density equals the rest density threshold.
   */
  private extractSurfaceViaSDF(): THREE.BufferGeometry {
    const res = this.config.gridResolution;
    const threshold = this.config.restDensity;
    const field = this.densityField;

    // Build a SignedDistanceField with the same grid dimensions
    const sdf = new SignedDistanceField({
      resolution: Math.min(this.voxelSize.x, this.voxelSize.y, this.voxelSize.z),
      bounds: this.bounds.clone(),
    });

    // Fill SDF data: SDF = threshold - density
    // Where density > threshold → SDF < 0 → inside fluid
    // Where density < threshold → SDF > 0 → outside fluid
    const gridSize = sdf.gridSize;
    const totalCells = gridSize[0] * gridSize[1] * gridSize[2];

    // If the SDF grid doesn't match our density field resolution,
    // we sample from the density field with interpolation.
    // In practice, they should match closely since we derive both
    // from the same bounds and resolution.
    if (gridSize[0] === res && gridSize[1] === res && gridSize[2] === res) {
      // Fast path: direct copy with threshold inversion
      for (let i = 0; i < totalCells; i++) {
        sdf.data[i] = threshold - field[i];
      }
    } else {
      // Slow path: sample density field at SDF grid positions
      for (let gz = 0; gz < gridSize[2]; gz++) {
        for (let gy = 0; gy < gridSize[1]; gy++) {
          for (let gx = 0; gx < gridSize[0]; gx++) {
            const pos = sdf.getPosition(gx, gy, gz);

            // Map to density field coordinates
            const dfx = (pos.x - this.bounds.min.x) / this.voxelSize.x - 0.5;
            const dfy = (pos.y - this.bounds.min.y) / this.voxelSize.y - 0.5;
            const dfz = (pos.z - this.bounds.min.z) / this.voxelSize.z - 0.5;

            // Trilinear interpolation of density
            const density = this.sampleDensityField(dfx, dfy, dfz);
            sdf.setValueAtGrid(gx, gy, gz, threshold - density);
          }
        }
      }
    }

    // Extract isosurface at SDF = 0 (where density = threshold)
    const geometry = extractIsosurface(sdf, 0);

    return geometry;
  }

  /**
   * Sample the density field at continuous grid coordinates
   * using trilinear interpolation.
   */
  private sampleDensityField(gx: number, gy: number, gz: number): number {
    const res = this.config.gridResolution;
    const field = this.densityField;

    const getDensity = (ix: number, iy: number, iz: number): number => {
      if (ix < 0 || ix >= res || iy < 0 || iy >= res || iz < 0 || iz >= res) {
        return 0;
      }
      return field[iz * res * res + iy * res + ix];
    };

    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const z0 = Math.floor(gz);
    const fx = gx - x0;
    const fy = gy - y0;
    const fz = gz - z0;

    // Trilinear interpolation
    const c000 = getDensity(x0, y0, z0);
    const c100 = getDensity(x0 + 1, y0, z0);
    const c010 = getDensity(x0, y0 + 1, z0);
    const c110 = getDensity(x0 + 1, y0 + 1, z0);
    const c001 = getDensity(x0, y0, z0 + 1);
    const c101 = getDensity(x0 + 1, y0, z0 + 1);
    const c011 = getDensity(x0, y0 + 1, z0 + 1);
    const c111 = getDensity(x0 + 1, y0 + 1, z0 + 1);

    const c00 = c000 * (1 - fx) + c100 * fx;
    const c01 = c001 * (1 - fx) + c101 * fx;
    const c10 = c010 * (1 - fx) + c110 * fx;
    const c11 = c011 * (1 - fx) + c111 * fx;

    const c0 = c00 * (1 - fy) + c10 * fy;
    const c1 = c01 * (1 - fy) + c11 * fy;

    return c0 * (1 - fz) + c1 * fz;
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
   * Copy geometry from source into target, growing the target buffers
   * if necessary.
   */
  private copyGeometry(source: THREE.BufferGeometry, target: THREE.BufferGeometry): void {
    const srcPos = source.getAttribute('position') as THREE.BufferAttribute;
    const srcNorm = source.getAttribute('normal') as THREE.BufferAttribute;

    if (!srcPos || srcPos.count === 0) {
      target.setDrawRange(0, 0);
      return;
    }

    const vertCount = srcPos.count;

    // Grow target buffers if needed
    let tgtPos = target.getAttribute('position') as THREE.BufferAttribute;
    let tgtNorm = target.getAttribute('normal') as THREE.BufferAttribute;

    if (tgtPos.count < vertCount) {
      const newSize = Math.max(vertCount, tgtPos.count * 2);
      target.setAttribute('position', new THREE.BufferAttribute(new Float32Array(newSize * 3), 3));
      target.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(newSize * 3), 3));
      tgtPos = target.getAttribute('position') as THREE.BufferAttribute;
      tgtNorm = target.getAttribute('normal') as THREE.BufferAttribute;
    }

    const srcPosArr = srcPos.array as Float32Array;
    const srcNormArr = srcNorm.array as Float32Array;
    const tgtPosArr = tgtPos.array as Float32Array;
    const tgtNormArr = tgtNorm.array as Float32Array;

    const len = vertCount * 3;
    for (let i = 0; i < len; i++) {
      tgtPosArr[i] = srcPosArr[i];
      tgtNormArr[i] = srcNormArr[i];
    }

    tgtPos.needsUpdate = true;
    tgtNorm.needsUpdate = true;
    target.setDrawRange(0, vertCount);
    target.computeBoundingSphere();
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
        if (mat) {
          // Ensure the material has water-like properties
          mat.envMapIntensity = 1.0;
          return mat;
        }
      } catch (err) {
        // Library unavailable – fall through to built-in material
        if (process.env.NODE_ENV === 'development') console.debug('[FluidSurfaceRenderer] MaterialPresetLibrary fallback:', err);
      }
    }

    // Fallback: a water-like MeshPhysicalMaterial matching river_water preset
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0.03, 0.27, 0.67),  // river_water baseColor
      roughness: 0.0,
      metalness: 0.0,
      transmission: 0.85,
      thickness: 2.0,
      ior: 1.33,
      clearcoat: 0.8,
      clearcoatRoughness: 0.05,
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
 * - SPH/FLIP solver output → rendered fluid surface mesh
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
   * Create a fluid mesh from particle positions and surface extractor.
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
