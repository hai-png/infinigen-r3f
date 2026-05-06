/**
 * Front View Spherical Mesher
 *
 * Optimized spherical mesher for front-view rendering where
 * the camera faces a specific direction (e.g., for facades).
 *
 * Based on: infinigen/terrain/mesher/front_view_spherical_mesher.py
 *
 * Refactored to use the extractIsosurface() pipeline (same as
 * SphericalMesher / UniformMesher / AdaptiveMesher) for reliable
 * marching-cubes mesh generation.
 *
 * Instead of casting individual rays over the full sphere, this mesher
 * builds an SDF grid covering only the frustum volume defined by
 * fovX, fovY, nearPlane, and farPlane.  This concentrates samples
 * within the visible frustum, giving higher effective resolution than
 * the base SphericalMesher for the same grid size.
 */

import { Vector3, BufferGeometry, Float32BufferAttribute, Box3 } from 'three';
import { SphericalMesher, SphericalMesherConfig, CameraPose } from './SphericalMesher';
import { SDFKernel } from '../sdf/SDFOperations';
import { SignedDistanceField, extractIsosurface } from '../sdf/sdf-operations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FrontViewConfig extends SphericalMesherConfig {
  fovX: number;
  fovY: number;
  nearPlane: number;
  farPlane: number;
}

// ---------------------------------------------------------------------------
// FrontViewSphericalMesher
// ---------------------------------------------------------------------------

export class FrontViewSphericalMesher extends SphericalMesher {
  protected frontConfig: FrontViewConfig;

  constructor(
    cameraPose: CameraPose,
    bounds: [number, number, number, number, number, number],
    config: Partial<FrontViewConfig> = {}
  ) {
    super(cameraPose, bounds, config);

    this.frontConfig = {
      fovX: 90,
      fovY: 90,
      nearPlane: 0.1,
      farPlane: 100,
      ...config,
    };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Generate mesh from SDF kernels by building an SDF grid within the
   * camera's view frustum and calling extractIsosurface().
   *
   * Algorithm:
   *   1. Compute the frustum corners in world space from fovX, fovY,
   *      nearPlane, farPlane, and the camera rotation.
   *   2. Derive a tight axis-aligned bounding box from those corners,
   *      intersected with the terrain bounds.
   *   3. Compute a resolution that places approximately
   *      base90dResolution samples per 90° of the FOV at the far plane.
   *   4. Build a SignedDistanceField and evaluate all kernels.
   *   5. Delegate to extractIsosurface() for marching-cubes extraction.
   */
  public generateMesh(kernels: SDFKernel[]): BufferGeometry {
    const baseResolution = this.config.base90dResolution ?? 64;
    const { fovX, fovY, nearPlane, farPlane } = this.frontConfig;

    // ── Compute frustum AABB ─────────────────────────────────────────

    const camPos = this.cameraPose.position;
    const rot = this.cameraPose.rotation;

    // Build the 8 frustum corner directions in camera-local space
    // (Three.js convention: forward = -Z, right = +X, up = +Y)
    const tanHalfX = Math.tan(fovX / 2);
    const tanHalfY = Math.tan(fovY / 2);

    const localCorners: Vector3[] = [
      // Near plane corners
      new Vector3(-tanHalfX * nearPlane, -tanHalfY * nearPlane, -nearPlane),
      new Vector3( tanHalfX * nearPlane, -tanHalfY * nearPlane, -nearPlane),
      new Vector3(-tanHalfX * nearPlane,  tanHalfY * nearPlane, -nearPlane),
      new Vector3( tanHalfX * nearPlane,  tanHalfY * nearPlane, -nearPlane),
      // Far plane corners
      new Vector3(-tanHalfX * farPlane, -tanHalfY * farPlane, -farPlane),
      new Vector3( tanHalfX * farPlane, -tanHalfY * farPlane, -farPlane),
      new Vector3(-tanHalfX * farPlane,  tanHalfY * farPlane, -farPlane),
      new Vector3( tanHalfX * farPlane,  tanHalfY * farPlane, -farPlane),
    ];

    // Transform to world space and compute AABB
    const worldCorners = localCorners.map(c =>
      c.clone().applyMatrix4(rot).add(camPos)
    );

    const frustumBBox = new Box3();
    for (const wc of worldCorners) {
      frustumBBox.expandByPoint(wc);
    }

    // Intersect with terrain bounds
    const [xMin, xMax, yMin, yMax, zMin, zMax] = this.bounds;
    const terrainBBox = new Box3(
      new Vector3(xMin, yMin, zMin),
      new Vector3(xMax, yMax, zMax)
    );

    const bbox = frustumBBox.intersect(terrainBBox);

    // If the intersection is empty, return an empty geometry
    if (bbox.isEmpty()) {
      const empty = new BufferGeometry();
      empty.setAttribute('position', new Float32BufferAttribute([], 3));
      return empty;
    }

    // ── Compute resolution ───────────────────────────────────────────

    // Target: base90dResolution samples per 90° at the far plane.
    // At distance farPlane, 90° of arc covers (π/2)·farPlane world units.
    // We use the larger FOV dimension to set resolution so that both
    // axes meet the density target.
    const maxFov = Math.max(fovX, fovY);
    const resolution = (maxFov / (Math.PI / 2)) * farPlane / baseResolution;

    // ── Build SDF grid ───────────────────────────────────────────────

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

    // ── Extract isosurface ───────────────────────────────────────────

    return extractIsosurface(sdf, 0);
  }
}
