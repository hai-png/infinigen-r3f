/**
 * Spherical Mesher - Base class for spherical terrain meshing
 * 
 * Based on: infinigen/terrain/mesher/spherical_mesher.py
 * Provides ray marching and surface reconstruction from SDF kernels
 * with spherical camera-centric projection.
 */

import { Vector3, Matrix4, BufferGeometry, Float32BufferAttribute, Box3 } from 'three';
import { SDFKernel } from '../sdf/SDFOperations';

export interface CameraPose {
  position: Vector3;
  rotation: Matrix4;
  fov: number;
}

export interface SphericalMesherConfig {
  base90dResolution: number;
  rMin: number;
  rMax: number;
  testDownscale: number;
  renderHeight?: number;
  adaptiveErrorThreshold?: number;
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
   * Ray march to find surface intersection
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
   * Calculate surface normal via finite differences
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
   * Generate mesh from SDF kernels (base implementation)
   */
  public generateMesh(kernels: SDFKernel[]): BufferGeometry {
    // Base implementation returns empty geometry
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([], 3));
    return geometry;
  }
}

/**
 * Opaque spherical mesher for solid terrain surfaces
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
 * Transparent spherical mesher for water/glass surfaces
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
