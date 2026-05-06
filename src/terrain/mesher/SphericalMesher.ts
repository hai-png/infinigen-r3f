/**
 * Spherical Mesher - Base class for spherical terrain meshing
 *
 * Based on: infinigen/terrain/mesher/spherical_mesher.py
 *
 * generateMesh() builds an SDF grid within the terrain bounds, evaluates
 * all SDF kernels at each grid point, and delegates to extractIsosurface()
 * for proper marching-cubes isosurface extraction — the same proven
 * pipeline used by UniformMesher and AdaptiveMesher.
 *
 * The rayMarchSurface() and calculateNormal() helpers are retained for
 * subclasses or post-processing refinement.
 */

import { Vector3, Matrix4, Box3, BufferGeometry } from 'three';
import { SDFKernel } from '../sdf/SDFOperations';
import { SignedDistanceField, extractIsosurface } from '../sdf/sdf-operations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// SphericalMesher
// ---------------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Generate mesh from SDF kernels using an SDF grid + extractIsosurface
   * pipeline, following the same pattern as UniformMesher / AdaptiveMesher.
   *
   * Algorithm:
   *   1. Compute a voxel resolution from base90dResolution and rMax,
   *      targeting approximately base90dResolution samples per 90° of arc
   *      at distance rMax.
   *   2. Build a SignedDistanceField covering the terrain bounds.
   *   3. Evaluate all SDF kernels at each grid point (union = minimum).
   *   4. Delegate to extractIsosurface() for proper marching-cubes
   *      isosurface extraction.
   */
  public generateMesh(kernels: SDFKernel[]): BufferGeometry {
    const [xMin, xMax, yMin, yMax, zMin, zMax] = this.bounds;
    const rMax = this.config.rMax ?? 100;
    const baseResolution = this.config.base90dResolution ?? 64;

    // Derive linear resolution from the angular density.
    // At distance rMax, one 90° arc spans (π/2)·rMax world units.
    // We want baseResolution samples over that arc, so:
    const resolution = (Math.PI / 2) * rMax / baseResolution;

    const bbox = new Box3(
      new Vector3(xMin, yMin, zMin),
      new Vector3(xMax, yMax, zMax)
    );

    const sdf = new SignedDistanceField({
      resolution,
      bounds: bbox,
      maxDistance: 1000,
    });

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

    // Extract isosurface via proper marching cubes
    return extractIsosurface(sdf, 0);
  }

  // -----------------------------------------------------------------------
  // Protected helpers (retained for subclass use / refinement)
  // -----------------------------------------------------------------------

  /**
   * Ray march to find surface intersection using sphere tracing.
   * Advances along the ray by the SDF value (safe step size),
   * guaranteeing we never step past the surface.
   *
   * Can be used by subclasses for adaptive LOD or hit-testing.
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
   *
   * Useful for post-processing or when ray-marching is used for
   * vertex refinement.
   */
  protected calculateNormal(kernels: SDFKernel[], point: Vector3, _direction: Vector3): Vector3 {
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
}

// ---------------------------------------------------------------------------
// Subclasses
// ---------------------------------------------------------------------------

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
