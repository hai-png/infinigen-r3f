/**
 * Front View Spherical Mesher
 *
 * Optimized spherical mesher for front-view rendering where
 * the camera faces a specific direction (e.g., for facades).
 *
 * Based on: infinigen/terrain/mesher/front_view_spherical_mesher.py
 *
 * Instead of casting rays over the full sphere like the base SphericalMesher,
 * this subclass limits ray casting to a perspective frustum defined by
 * fovX, fovY, nearPlane, and farPlane.  Within that frustum it uses the
 * same angular density as base90dResolution (steps per 90°), giving
 * significantly higher detail than the base class would for the same
 * config value (since the base class spreads its budget over 360°×180°).
 *
 * Key differences from the base SphericalMesher.generateMesh():
 *   - Only iterates over the elevation/azimuth range within the FOV frustum
 *   - Uses the camera rotation matrix to determine the forward direction
 *   - Converts fovX/fovY to azimuth/elevation ranges relative to forward
 *   - Allocates base90dResolution density within the frustum
 *   - Provides perspective-correct UV mapping (screen-space linear)
 */

import { Vector3, BufferGeometry, Float32BufferAttribute } from 'three';
import { SphericalMesher, SphericalMesherConfig, CameraPose } from './SphericalMesher';
import { SDFKernel } from '../sdf/SDFOperations';

export interface FrontViewConfig extends SphericalMesherConfig {
  fovX: number;
  fovY: number;
  nearPlane: number;
  farPlane: number;
}

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

  /**
   * Generate mesh from SDF kernels by ray marching within a perspective frustum.
   *
   * Algorithm:
   *   1. Compute the angular span of the frustum from fovX / fovY.
   *   2. Determine the number of grid steps within that span at the same
   *      density as base90dResolution (steps per 90°), yielding higher
   *      effective resolution than the full-sphere base class.
   *   3. For each grid point, construct a direction in camera-local space
   *      (forward = -Z, right = +X, up = +Y) using tangent-based projection
   *      for perspective correctness, then transform to world space.
   *   4. Ray march using nearPlane / farPlane as distance bounds.
   *   5. Record hits with positions, normals, and perspective-correct UVs.
   *   6. Connect adjacent hits into triangles.
   */
  public generateMesh(kernels: SDFKernel[]): BufferGeometry {
    const baseResolution = this.config.base90dResolution ?? 64;
    const raySteps = this.config.testDownscale ?? 8;

    const { fovX, fovY, nearPlane, farPlane } = this.frontConfig;

    // ── Frustum angular geometry ──────────────────────────────────────
    // Half-angles of the field of view
    const halfFovX = fovX / 2;
    const halfFovY = fovY / 2;

    // Precompute tangent values for perspective-correct ray directions
    const tanHalfFovX = Math.tan(halfFovX);
    const tanHalfFovY = Math.tan(halfFovY);

    // ── Resolution within the frustum ─────────────────────────────────
    // Same angular density as base90dResolution (steps per π/2 radians)
    // applied to the frustum span instead of the full sphere.
    // For a 90° FOV this equals baseResolution; for narrower FOVs it
    // concentrates more rays, and for wider FOVs it stays proportional.
    const azimuthSteps = Math.max(2, Math.ceil(baseResolution * fovX / (Math.PI / 2)));
    const elevationSteps = Math.max(2, Math.ceil(baseResolution * fovY / (Math.PI / 2)));

    // Per-grid-point vertex index; -1 means the ray missed the surface
    const vertexIndexGrid: number[][] = [];
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    let nextVertex = 0;

    // ── Pass 1: Cast rays within the frustum ──────────────────────────

    for (let ei = 0; ei <= elevationSteps; ei++) {
      vertexIndexGrid[ei] = new Array<number>(azimuthSteps + 1).fill(-1);

      // Elevation offset from the camera's forward direction
      // ranges from -halfFovY to +halfFovY
      const elevationOffset = -halfFovY + (fovY * ei) / elevationSteps;
      const tanElevOffset = Math.tan(elevationOffset);

      for (let ai = 0; ai <= azimuthSteps; ai++) {
        // Azimuth offset from the camera's forward direction
        // ranges from -halfFovX to +halfFovX
        const azimuthOffset = -halfFovX + (fovX * ai) / azimuthSteps;
        const tanAzimOffset = Math.tan(azimuthOffset);

        // Direction in camera-local space (Three.js convention):
        //   forward = -Z, right = +X, up = +Y
        // Using tan-based construction gives perspective-correct ray spacing
        // (rays are uniformly distributed in screen space, not angular space).
        const direction = new Vector3(tanAzimOffset, tanElevOffset, -1).normalize();

        // Transform to world space via the camera rotation matrix
        direction.applyMatrix4(this.cameraPose.rotation);

        // Ray march to find surface intersection, using the frustum's
        // nearPlane / farPlane as distance bounds instead of the base
        // class's rMin / rMax.
        const t = this.rayMarchSurface(kernels, direction, nearPlane, farPlane, raySteps);

        if (t < farPlane) {
          // Hit: compute world position and surface normal
          const position = this.cameraPose.position
            .clone()
            .add(direction.clone().multiplyScalar(t));
          const normal = this.calculateNormal(kernels, position, direction);

          positions.push(position.x, position.y, position.z);
          normals.push(normal.x, normal.y, normal.z);

          // Perspective-correct UV mapping:
          // Map from screen-space coordinates (linear in tan of angle)
          // to [0,1] range.  u=0 at left edge, u=1 at right edge;
          // v=0 at bottom edge, v=1 at top edge.
          const u = 0.5 * (1 + tanAzimOffset / tanHalfFovX);
          const v = 0.5 * (1 + tanElevOffset / tanHalfFovY);
          uvs.push(u, v);

          vertexIndexGrid[ei][ai] = nextVertex++;
        }
        // else: vertexIndexGrid[ei][ai] stays -1 (miss)
      }
    }

    // ── Pass 2: Build triangle indices from adjacent hits ─────────────

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

    // ── Assemble BufferGeometry ───────────────────────────────────────

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    return geometry;
  }
}
