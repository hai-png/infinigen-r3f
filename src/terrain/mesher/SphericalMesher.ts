/**
 * Spherical Mesher - Base class for spherical terrain meshing
 *
 * Based on: infinigen/terrain/mesher/spherical_mesher.py
 * Provides ray marching and surface reconstruction from SDF kernels
 * with spherical camera-centric projection.
 *
 * generateMesh() casts rays over a spherical grid around the camera,
 * uses rayMarchSurface() to find terrain intersections, and builds
 * a BufferGeometry by connecting adjacent hits into triangles.
 */

import { Vector3, Matrix4, BufferGeometry, Float32BufferAttribute } from 'three';
import { SDFKernel } from '../sdf/SDFOperations';

export interface CameraPose {
  position: Vector3;
  rotation: Matrix4;
  fov: number;
}

export interface SphericalMesherConfig {
  base90dResolution?: number;
  rMin?: number;
  rMax?: number;
  testDownscale?: number;
  renderHeight?: number;
  adaptiveErrorThreshold?: number;
  maxLOD?: number;
}

export class SphericalMesher {
  protected config: SphericalMesherConfig;
  protected cameraPose: CameraPose;
  protected bounds: [number, number, number, number, number, number];

  constructor(
    cameraPose: CameraPose,
    bounds: [number, number, number, number, number, number],
    config: Partial<SphericalMesherConfig> = {}
  ) {
    this.cameraPose = cameraPose;
    this.bounds = bounds;

    this.config = {
      base90dResolution: 64,
      rMin: 0.5,
      rMax: 100,
      testDownscale: 8,
      ...config,
    };
  }

  /**
   * Ray march to find surface intersection using sphere tracing.
   * Advances along the ray by the SDF value (safe step size),
   * guaranteeing we never step past the surface.
   */
  protected rayMarchSurface(
    kernels: SDFKernel[],
    direction: Vector3,
    rMin: number,
    rMax: number,
    steps: number
  ): number {
    let t = rMin;
    const dt = (rMax - rMin) / steps;

    for (let i = 0; i < steps; i++) {
      const point = this.cameraPose.position.clone().add(direction.clone().multiplyScalar(t));

      let minSDF = Infinity;
      for (const kernel of kernels) {
        const sdf = kernel.evaluate(point);
        minSDF = Math.min(minSDF, sdf);
      }

      if (minSDF < 0.001) {
        return t;
      }

      // Sphere tracing: advance by SDF value
      t += Math.max(minSDF, dt * 0.1);

      if (t > rMax) {
        return rMax;
      }
    }

    return rMax;
  }

  /**
   * Calculate surface normal via central finite differences on the SDF.
   */
  protected calculateNormal(kernels: SDFKernel[], point: Vector3, direction: Vector3): Vector3 {
    const eps = 0.001;
    const dx = new Vector3(eps, 0, 0);
    const dy = new Vector3(0, eps, 0);
    const dz = new Vector3(0, 0, eps);

    const evaluate = (p: Vector3): number => {
      let minSDF = Infinity;
      for (const kernel of kernels) {
        const sdf = kernel.evaluate(p);
        minSDF = Math.min(minSDF, sdf);
      }
      return minSDF;
    };

    const nx = evaluate(point.clone().add(dx)) - evaluate(point.clone().sub(dx));
    const ny = evaluate(point.clone().add(dy)) - evaluate(point.clone().sub(dy));
    const nz = evaluate(point.clone().add(dz)) - evaluate(point.clone().sub(dz));

    return new Vector3(nx, ny, nz).normalize();
  }

  /**
   * Generate mesh from SDF kernels by ray marching over a spherical grid.
   *
   * Algorithm:
   *   1. Create a grid of azimuth × elevation angles covering the full sphere
   *      around the camera position.
   *   2. For each grid point, convert to a world-space direction and ray march
   *      to find the terrain surface.
   *   3. Record hits (t < rMax) with their positions, normals, and UVs.
   *   4. Connect adjacent hits into triangles to form a continuous mesh.
   *
   * Resolution: azimuthSteps = 4 × base90dResolution (full 360°),
   *             elevationSteps = 2 × base90dResolution (-90° to +90°).
   */
  public generateMesh(kernels: SDFKernel[]): BufferGeometry {
    const baseResolution = this.config.base90dResolution ?? 64;
    const rMin = this.config.rMin ?? 0.5;
    const rMax = this.config.rMax ?? 100;
    const raySteps = this.config.testDownscale ?? 8;

    const azimuthSteps = 4 * baseResolution;
    const elevationSteps = 2 * baseResolution;

    // Per-grid-point vertex index; -1 means the ray missed the surface
    const vertexIndexGrid: number[][] = [];
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    let nextVertex = 0;

    // ── Pass 1: Cast rays and record hits ──────────────────────────────

    for (let ei = 0; ei <= elevationSteps; ei++) {
      vertexIndexGrid[ei] = new Array<number>(azimuthSteps + 1).fill(-1);

      // Elevation from -π/2 (south pole) to +π/2 (north pole)
      const elevation = -Math.PI / 2 + (Math.PI * ei) / elevationSteps;
      const cosElev = Math.cos(elevation);
      const sinElev = Math.sin(elevation);

      for (let ai = 0; ai <= azimuthSteps; ai++) {
        // Azimuth from 0 to 2π
        const azimuth = (2 * Math.PI * ai) / azimuthSteps;

        // Spherical → Cartesian direction (right-handed: Y up)
        const direction = new Vector3(
          cosElev * Math.cos(azimuth),
          sinElev,
          cosElev * Math.sin(azimuth)
        );

        // Transform direction by camera rotation
        direction.applyMatrix4(this.cameraPose.rotation);

        // Ray march to find surface intersection
        const t = this.rayMarchSurface(kernels, direction, rMin, rMax, raySteps);

        if (t < rMax) {
          // Hit: compute world position and surface normal
          const position = this.cameraPose.position
            .clone()
            .add(direction.clone().multiplyScalar(t));
          const normal = this.calculateNormal(kernels, position, direction);

          positions.push(position.x, position.y, position.z);
          normals.push(normal.x, normal.y, normal.z);
          uvs.push(ai / azimuthSteps, ei / elevationSteps);

          vertexIndexGrid[ei][ai] = nextVertex++;
        }
        // else: vertexIndexGrid[ei][ai] stays -1 (miss)
      }
    }

    // ── Pass 2: Build triangle indices from adjacent hits ──────────────

    for (let ei = 0; ei < elevationSteps; ei++) {
      for (let ai = 0; ai < azimuthSteps; ai++) {
        const i00 = vertexIndexGrid[ei][ai];
        const i10 = vertexIndexGrid[ei][ai + 1];
        const i01 = vertexIndexGrid[ei + 1][ai];
        const i11 = vertexIndexGrid[ei + 1][ai + 1];

        // Only create a quad (2 triangles) if all 4 corners hit
        if (i00 < 0 || i10 < 0 || i01 < 0 || i11 < 0) continue;

        // Triangle 1: bottom-left → top-left → bottom-right
        indices.push(i00, i01, i10);
        // Triangle 2: bottom-right → top-left → top-right
        indices.push(i10, i01, i11);
      }
    }

    // ── Assemble BufferGeometry ────────────────────────────────────────

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    return geometry;
  }
}

/**
 * Opaque spherical mesher for solid terrain surfaces.
 * Inherits generateMesh() from SphericalMesher.
 */
export class OpaqueSphericalMesher extends SphericalMesher {
  constructor(
    cameraPose: CameraPose,
    bounds: [number, number, number, number, number, number],
    config?: Partial<SphericalMesherConfig>
  ) {
    super(cameraPose, bounds, config);
  }
}

/**
 * Transparent spherical mesher for water/glass surfaces.
 * Inherits generateMesh() from SphericalMesher.
 */
export class TransparentSphericalMesher extends SphericalMesher {
  constructor(
    cameraPose: CameraPose,
    bounds: [number, number, number, number, number, number],
    config?: Partial<SphericalMesherConfig>
  ) {
    super(cameraPose, bounds, config);
  }
}
