/**
 * FLIPFluidRenderer
 *
 * Visualization layer for the FLIP fluid solver. Supports two rendering modes:
 *
 *   1. **Surface mesh** – Extracts an isosurface from particle density via
 *      FLIPSurfaceExtractor and renders it with a physically-based water
 *      material featuring refraction, reflection, and animated normals.
 *
 *   2. **Point cloud** – Renders particles directly as a colored point cloud,
 *      useful for debugging or artistic effects.
 *
 * The renderer manages double-buffered geometry for smooth frame updates
 * and automatically syncs with the solver's particle state.
 *
 * @module FLIPFluidRenderer
 */

import * as THREE from 'three';
import { FLIPFluidSolver, FLIPParticle, FLIPGrid } from './FLIPFluidSolver';
import { FLIPSurfaceExtractor, FLIPSurfaceExtractorConfig } from './FLIPSurfaceExtractor';

// ─── Configuration ────────────────────────────────────────────────────────────

export type FLIPRenderMode = 'surface' | 'points' | 'both';

export interface FLIPFluidRendererConfig {
  /** Rendering mode: 'surface', 'points', or 'both' (default 'surface') */
  renderMode: FLIPRenderMode;
  /** Surface extractor configuration */
  surfaceConfig: Partial<FLIPSurfaceExtractorConfig>;
  /** Point size when rendering as points (default 0.04) */
  pointSize: number;
  /** Point color (default 0x44aaff) */
  pointColor: number;
  /** Point opacity (default 0.8) */
  pointOpacity: number;
  /** Water surface color (default 0x0077be) */
  waterColor: number;
  /** Water roughness (default 0.05) */
  waterRoughness: number;
  /** Water transmission (refraction amount, default 0.85) */
  waterTransmission: number;
  /** Water IOR (index of refraction, default 1.33) */
  waterIOR: number;
  /** Water opacity (default 0.92) */
  waterOpacity: number;
  /** Animate normal perturbation for ripples (default true) */
  animateNormals: boolean;
  /** Normal animation speed (default 1.0) */
  normalAnimSpeed: number;
  /** Normal animation amplitude (default 0.02) */
  normalAnimAmplitude: number;
  /** Custom water material (overrides built-in) */
  customMaterial?: THREE.MeshPhysicalMaterial;
}

const DEFAULT_RENDERER_CONFIG: FLIPFluidRendererConfig = {
  renderMode: 'surface',
  surfaceConfig: {},
  pointSize: 0.04,
  pointColor: 0x44aaff,
  pointOpacity: 0.8,
  waterColor: 0x0077be,
  waterRoughness: 0.05,
  waterTransmission: 0.85,
  waterIOR: 1.33,
  waterOpacity: 0.92,
  animateNormals: true,
  normalAnimSpeed: 1.0,
  normalAnimAmplitude: 0.02,
};

// ─── FLIPFluidRenderer ────────────────────────────────────────────────────────

export class FLIPFluidRenderer {
  private config: FLIPFluidRendererConfig;
  private extractor: FLIPSurfaceExtractor;

  // Surface mesh rendering (double-buffered)
  private geometryA: THREE.BufferGeometry;
  private geometryB: THREE.BufferGeometry;
  private currentIsA: boolean = true;
  private surfaceMesh: THREE.Mesh;

  // Point cloud rendering
  private pointsGeometry: THREE.BufferGeometry;
  private pointsMaterial: THREE.PointsMaterial;
  private points: THREE.Points;

  // Normal animation state
  private time: number = 0;

  // Scene objects group
  private group: THREE.Group;

  constructor(config: Partial<FLIPFluidRendererConfig> = {}) {
    this.config = { ...DEFAULT_RENDERER_CONFIG, ...config };

    // Create surface extractor
    this.extractor = new FLIPSurfaceExtractor(this.config.surfaceConfig);

    // Create group for all renderable objects
    this.group = new THREE.Group();
    this.group.name = 'FLIPFluidRenderer';

    // ── Surface mesh setup ──
    this.geometryA = this.createEmptyGeometry();
    this.geometryB = this.createEmptyGeometry();

    const waterMaterial = this.config.customMaterial ?? this.createWaterMaterial();
    this.surfaceMesh = new THREE.Mesh(this.geometryA, waterMaterial);
    this.surfaceMesh.frustumCulled = false;
    this.surfaceMesh.name = 'FLIPSurface';
    this.group.add(this.surfaceMesh);

    // ── Point cloud setup ──
    this.pointsGeometry = new THREE.BufferGeometry();
    this.pointsMaterial = new THREE.PointsMaterial({
      size: this.config.pointSize,
      color: this.config.pointColor,
      transparent: true,
      opacity: this.config.pointOpacity,
      vertexColors: false,
      sizeAttenuation: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.pointsGeometry, this.pointsMaterial);
    this.points.name = 'FLIPPoints';
    this.group.add(this.points);

    // Initial visibility
    this.updateVisibility();
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * The THREE.Group containing all renderable objects.
   * Add this to your scene.
   */
  getObject(): THREE.Group {
    return this.group;
  }

  /**
   * The surface mesh (for direct material manipulation).
   */
  getSurfaceMesh(): THREE.Mesh {
    return this.surfaceMesh;
  }

  /**
   * The point cloud object.
   */
  getPoints(): THREE.Points {
    return this.points;
  }

  /**
   * Update the visualization from the solver's current state.
   * Call once per frame after FLIPFluidSolver.step().
   *
   * @param solver The FLIP solver to visualize
   * @param dt     Frame delta time (for normal animation)
   */
  update(solver: FLIPFluidSolver, dt: number = 0.016): void {
    this.time += dt * this.config.normalAnimSpeed;

    const particles = solver.getParticles();
    const grid = solver.getGrid();

    if (this.config.renderMode === 'surface' || this.config.renderMode === 'both') {
      this.updateSurface(particles, grid);
    }

    if (this.config.renderMode === 'points' || this.config.renderMode === 'both') {
      this.updatePoints(particles);
    }
  }

  /**
   * Change the render mode at runtime.
   */
  setRenderMode(mode: FLIPRenderMode): void {
    this.config.renderMode = mode;
    this.updateVisibility();
  }

  /**
   * Get the surface extractor for configuration changes.
   */
  getExtractor(): FLIPSurfaceExtractor {
    return this.extractor;
  }

  /**
   * Dispose all GPU resources.
   */
  dispose(): void {
    this.geometryA.dispose();
    this.geometryB.dispose();
    this.pointsGeometry.dispose();
    this.pointsMaterial.dispose();
    (this.surfaceMesh.material as THREE.Material).dispose();
    this.extractor.dispose();
  }

  // ── Surface update ─────────────────────────────────────────────────────

  private updateSurface(particles: FLIPParticle[], grid: FLIPGrid): void {
    // Extract surface into the write buffer
    const writeGeo = this.getWriteGeometry();

    // Clear old geometry data
    const extracted = this.extractor.extractSurface(particles, grid);

    // Copy extracted geometry into our write buffer
    this.copyGeometry(extracted, writeGeo);
    extracted.dispose();

    // Swap double-buffer
    this.swapGeometry();

    // Animate normals if enabled
    if (this.config.animateNormals) {
      this.animateSurfaceNormals();
    }
  }

  // ── Point cloud update ─────────────────────────────────────────────────

  private updatePoints(particles: FLIPParticle[]): void {
    const count = particles.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const p = particles[i];
      positions[i * 3] = p.position.x;
      positions[i * 3 + 1] = p.position.y;
      positions[i * 3 + 2] = p.position.z;

      // Color by velocity magnitude
      const speed = p.velocity.length();
      const t = Math.min(speed / 5, 1); // normalize to [0,1]

      // Gradient: slow = deep blue, fast = light cyan
      colors[i * 3] = 0.1 + t * 0.5;     // R
      colors[i * 3 + 1] = 0.3 + t * 0.6;  // G
      colors[i * 3 + 2] = 0.8 + t * 0.2;  // B
    }

    this.pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.pointsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.pointsGeometry.computeBoundingSphere();

    // Enable vertex colors since we're setting them
    this.pointsMaterial.vertexColors = true;
  }

  // ── Normal animation ───────────────────────────────────────────────────

  /**
   * Apply subtle animated perturbation to surface normals for a rippling
   * water effect. This modifies the normals in the current display geometry.
   */
  private animateSurfaceNormals(): void {
    const geo = this.surfaceMesh.geometry;
    const normAttr = geo.getAttribute('normal') as THREE.BufferAttribute;
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;

    if (!normAttr || !posAttr) return;

    const count = normAttr.count;
    const amp = this.config.normalAnimAmplitude;
    const t = this.time;

    for (let i = 0; i < count; i++) {
      const px = posAttr.getX(i);
      const py = posAttr.getY(i);
      const pz = posAttr.getZ(i);

      // Simple sine-based perturbation based on world position and time
      const pertX = Math.sin(px * 10 + t * 3) * amp;
      const pertZ = Math.cos(pz * 10 + t * 2.5) * amp;

      let nx = normAttr.getX(i) + pertX;
      let ny = normAttr.getY(i);
      let nz = normAttr.getZ(i) + pertZ;

      // Re-normalize
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 1e-6) {
        nx /= len;
        ny /= len;
        nz /= len;
      }

      normAttr.setXYZ(i, nx, ny, nz);
    }

    normAttr.needsUpdate = true;
  }

  // ── Visibility ─────────────────────────────────────────────────────────

  private updateVisibility(): void {
    const mode = this.config.renderMode;
    this.surfaceMesh.visible = mode === 'surface' || mode === 'both';
    this.points.visible = mode === 'points' || mode === 'both';
  }

  // ── Double-buffer helpers ──────────────────────────────────────────────

  private getWriteGeometry(): THREE.BufferGeometry {
    return this.currentIsA ? this.geometryB : this.geometryA;
  }

  private swapGeometry(): void {
    this.currentIsA = !this.currentIsA;
    this.surfaceMesh.geometry = this.currentIsA ? this.geometryA : this.geometryB;
  }

  // ── Geometry utilities ─────────────────────────────────────────────────

  private createEmptyGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    const initialVerts = 8192;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(initialVerts * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(initialVerts * 3), 3));
    geo.setDrawRange(0, 0);
    return geo;
  }

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
      target.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(newSize * 3), 3));
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

  // ── Material creation ──────────────────────────────────────────────────

  private createWaterMaterial(): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(this.config.waterColor),
      roughness: this.config.waterRoughness,
      metalness: 0.0,
      transmission: this.config.waterTransmission,
      thickness: 2.0,
      ior: this.config.waterIOR,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1,
      transparent: true,
      opacity: this.config.waterOpacity,
      side: THREE.DoubleSide,
      envMapIntensity: 1.0,
    });
  }
}

export default FLIPFluidRenderer;
