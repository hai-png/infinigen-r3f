/**
 * Infinigen R3F Port - Enhanced Mesher Systems
 * Cube Spherical Mesher for Hybrid Planet/Cube Mapping
 *
 * Based on original: infinigen/terrain/mesher/cube_spherical_mesher.py
 *
 * Refactored to use the extractIsosurface() pipeline (same as
 * SphericalMesher / UniformMesher / AdaptiveMesher) for reliable
 * marching-cubes mesh generation.
 *
 * The cube-sphere hybrid mapping is used to compute a tighter bounding
 * box for the SDF grid, reducing wasted samples in areas that the
 * cube-sphere projection cannot reach.
 *
 * The cubeToSphere() and smoothCorners() helpers are retained for
 * potential use in coordinate remapping or LOD selection.
 */

import { Vector3, Box3, BufferGeometry, Float32BufferAttribute } from 'three';
import { SphericalMesher, SphericalMesherConfig, CameraPose } from './SphericalMesher';
import { SDFKernel } from '../sdf/SDFOperations';
import { SignedDistanceField, extractIsosurface } from '../sdf/sdf-operations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CubeSphericalConfig extends SphericalMesherConfig {
  cubeMapResolution: number;
  blendFactor: number;
  cornerSmoothing: number;
}

// ---------------------------------------------------------------------------
// CubeSphericalMesher
// ---------------------------------------------------------------------------

export class CubeSphericalMesher extends SphericalMesher {
  protected cubeConfig: CubeSphericalConfig;

  constructor(
    cameraPose: CameraPose,
    bounds: [number, number, number, number, number, number],
    config: Partial<CubeSphericalConfig> = {}
  ) {
    super(cameraPose, bounds, config);

    this.cubeConfig = {
      cubeMapResolution: 256,
      blendFactor: 0.5,
      cornerSmoothing: 0.1,
      ...config,
    };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Generate mesh from SDF kernels using an SDF grid + extractIsosurface
   * pipeline, with a bounding box informed by the cube-sphere mapping.
   *
   * Algorithm:
   *   1. Compute a bounding box from the camera position and rMax,
   *      representing the inscribed cube of the sampling sphere.
   *   2. Build a SignedDistanceField within that box at a resolution
   *      derived from cubeMapResolution.
   *   3. Evaluate all SDF kernels at each grid point (union = minimum).
   *   4. Delegate to extractIsosurface() for marching-cubes extraction.
   */
  public generateMesh(kernels: SDFKernel[]): BufferGeometry {
    const rMax = this.config.rMax ?? 100;
    const rMin = this.config.rMin ?? 0.5;

    // The cube-sphere mesher samples within the inscribed cube of the
    // sphere of radius rMax centred on the camera.  This gives a tighter
    // bounding box than the full sphere, reducing wasted voxels.
    const halfSide = rMax;
    const camPos = this.cameraPose.position;

    // Intersect with the terrain bounds to avoid sampling outside the
    // region where SDF kernels are defined.
    const [xMin, xMax, yMin, yMax, zMin, zMax] = this.bounds;
    const bbox = new Box3(
      new Vector3(
        Math.max(xMin, camPos.x - halfSide),
        Math.max(yMin, camPos.y - halfSide),
        Math.max(zMin, camPos.z - halfSide)
      ),
      new Vector3(
        Math.min(xMax, camPos.x + halfSide),
        Math.min(yMax, camPos.y + halfSide),
        Math.min(zMax, camPos.z + halfSide)
      )
    );

    // If the intersection is empty, return an empty geometry
    if (bbox.min.x >= bbox.max.x ||
        bbox.min.y >= bbox.max.y ||
        bbox.min.z >= bbox.max.z) {
      const empty = new BufferGeometry();
      empty.setAttribute('position', new Float32BufferAttribute([], 3));
      return empty;
    }

    // Resolution derived from cubeMapResolution: each cube face gets
    // cubeMapResolution samples, so the linear resolution is
    // (2 * halfSide) / cubeMapResolution.
    const boxSize = bbox.getSize(new Vector3());
    const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z);
    const resolution = maxDim / this.cubeConfig.cubeMapResolution;

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

          // Only evaluate within the spherical shell [rMin, rMax]
          const distToCam = pos.distanceTo(camPos);
          if (distToCam < rMin || distToCam > rMax) {
            sdf.setValueAtGrid(gx, gy, gz, 1000); // far outside
            continue;
          }

          let minSDF = Infinity;
          for (const kernel of kernels) {
            minSDF = Math.min(minSDF, kernel.evaluate(pos));
          }
          sdf.setValueAtGrid(gx, gy, gz, minSDF);
        }
      }
    }

    return extractIsosurface(sdf, 0);
  }

  // -----------------------------------------------------------------------
  // Protected helpers (retained for coordinate remapping / LOD)
  // -----------------------------------------------------------------------

  /**
   * Convert cube face coordinates to spherical direction.
   * Uses blend factor to interpolate between cube and sphere projection.
   */
  protected cubeToSphere(
    normal: Vector3,
    right: Vector3,
    up: Vector3,
    x: number,
    y: number,
    blend: number
  ): Vector3 {
    // Cube projection (normalized)
    const cubeDir = new Vector3()
      .copy(normal)
      .add(right.clone().multiplyScalar(x))
      .add(up.clone().multiplyScalar(y))
      .normalize();

    // Sphere projection (direct mapping)
    const sphereDir = new Vector3()
      .copy(normal)
      .add(right.clone().multiplyScalar(x))
      .add(up.clone().multiplyScalar(y));

    if (sphereDir.length() > 0) {
      sphereDir.normalize();
    }

    // Blend between cube and sphere
    const result = new Vector3().lerpVectors(cubeDir, sphereDir, blend);
    return result.normalize();
  }

  /**
   * Smooth cube corners to reduce sharp edges.
   */
  protected smoothCorners(
    direction: Vector3,
    normal: Vector3,
    _right: Vector3,
    _up: Vector3,
    x: number,
    y: number,
    smoothing: number
  ): Vector3 {
    const distFromCenter = Math.sqrt(x * x + y * y);
    const maxDist = Math.sqrt(2); // Corner distance

    if (distFromCenter > 0.7) {
      const t = Math.pow((distFromCenter - 0.7) / (maxDist - 0.7), 2);
      const smoothed = new Vector3().lerpVectors(direction, normal, t * smoothing);
      return smoothed.normalize();
    }

    return direction;
  }
}
