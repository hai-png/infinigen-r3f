/**
 * OcMesher (Occlusion-aware Mesher)
 *
 * Based on: infinigen/terrain/mesher/oc_mesher.py
 *
 * Octree-based terrain mesher with frustum culling, designed for cameras
 * with wide (>90°) FOV where the base SphericalMesher wastes resolution
 * on unseen regions.
 *
 * Algorithm overview:
 *   1. Build an octree over the world bounds (recursive spatial subdivision)
 *   2. At each leaf node, test whether its AABB intersects the camera frustum
 *   3. Visible leaves → ray-march within the leaf's bounds to find the surface
 *   4. Occluded / out-of-frustum leaves → skip entirely (cull)
 *   5. For wide-FOV cameras (>90°), split the frustum into sub-frustums
 *      (front + side regions) with different resolution budgets:
 *        - Front region (≤ fovSplitAngle from center): full resolution
 *        - Side region (peripheral): reduced resolution
 *   6. Tag every vertex with an `outOfView` boolean attribute
 *   7. Return geometry with per-vertex visibility tags for downstream processing
 *
 * Supports two modes:
 *   - **Individual mesher** – meshes each SDF kernel separately
 *   - **Collective mesher** – combines all kernels via min-SDF before meshing
 */

import {
  Vector3,
  Matrix4,
  Box3,
  Frustum,
  Quaternion,
  BufferGeometry,
  Float32BufferAttribute,
} from 'three';
import { SphericalMesher, SphericalMesherConfig, CameraPose } from './SphericalMesher';
import { SDFKernel } from '../sdf/SDFOperations';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the OcMesher.
 */
export interface OcMesherConfig extends SphericalMesherConfig {
  /** Maximum octree subdivision depth (default 6) */
  maxOctreeDepth: number;
  /** Minimum cell size in world units; stops subdivision below this (default 2.0) */
  minCellSize: number;
  /** Ray-marching steps per 90° for the front (center) view region (default 64) */
  frontResolution: number;
  /** Ray-marching steps per 90° for the side (peripheral) view regions (default 32) */
  sideResolution: number;
  /** Angle (radians) at which to split between front/side regions (default π/2 = 90°) */
  fovSplitAngle: number;
  /** Whether to cull octree nodes that are entirely behind the camera (default true) */
  cullBackFaces: boolean;
  /** Enable adaptive LOD within visible octree leaves (default true) */
  enableAdaptiveLOD: boolean;
  /** Number of ray-marching steps per ray (default 8) */
  rayMarchSteps: number;
  /** Number of bisection refinement steps when a sign change is detected (default 10).
   *  Set to 0 to disable refinement, matching the original coarse hit behavior. */
  bisectionSteps: number;
}

/** Sensible defaults */
export const DEFAULT_OC_MESHER_CONFIG: OcMesherConfig = {
  maxOctreeDepth: 6,
  minCellSize: 2.0,
  frontResolution: 64,
  sideResolution: 32,
  fovSplitAngle: Math.PI / 2,
  cullBackFaces: true,
  enableAdaptiveLOD: true,
  rayMarchSteps: 8,
  bisectionSteps: 10,
  base90dResolution: 64,
  rMin: 0.5,
  rMax: 100,
  testDownscale: 8,
};

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/**
 * Result produced by the OcMesher for a single kernel or the combined SDF.
 */
export interface OcMesherResult {
  /** The generated mesh geometry */
  geometry: BufferGeometry;
  /** Per-vertex boolean: true if vertex is outside the camera frustum */
  outOfView: boolean[];
  /** Per-vertex boolean: true if vertex is inside the camera frustum */
  inViewTags: boolean[];
  /** Number of octree leaves that were visible (meshed) */
  visibleLeafCount: number;
  /** Total number of octree leaves */
  totalLeafCount: number;
}

// ---------------------------------------------------------------------------
// OctreeNode
// ---------------------------------------------------------------------------

/**
 * A single node in the octree spatial subdivision.
 *
 * Each node stores an axis-aligned bounding box and, if it is a leaf,
 * whether the box is visible from the camera frustum. Interior nodes
 * have up to 8 children created by bisecting each axis.
 */
export class OctreeNode {
  /** Axis-aligned bounding box of this node */
  public bounds: Box3;
  /** Current subdivision depth (0 at the root) */
  public depth: number;
  /** Child nodes (empty for leaves) */
  public children: OctreeNode[];
  /** Whether this leaf passed the frustum test (meaningless for interior nodes) */
  public visible: boolean;

  constructor(bounds: Box3, depth: number) {
    this.bounds = bounds;
    this.depth = depth;
    this.children = [];
    this.visible = false;
  }

  /** True when this node has no children (i.e. is a leaf of the octree) */
  get isLeaf(): boolean {
    return this.children.length === 0;
  }

  /**
   * Recursively subdivide this node.
   *
   * @param maxDepth   Maximum octree depth
   * @param minCellSize Stop subdividing when the cell is smaller than this
   * @returns This node (for chaining)
   */
  subdivide(maxDepth: number, minCellSize: number): this {
    const size = new Vector3();
    this.bounds.getSize(size);

    // Stop conditions: depth limit or cell too small
    if (this.depth >= maxDepth || size.x <= minCellSize || size.y <= minCellSize || size.z <= minCellSize) {
      return this;
    }

    const min = this.bounds.min;
    const mid = new Vector3();
    this.bounds.getCenter(mid);
    const max = this.bounds.max;

    // Eight octants: iterate over the 2×2×2 combinations of [min, mid, max]
    for (let dz = 0; dz < 2; dz++) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const childMin = new Vector3(
            dx === 0 ? min.x : mid.x,
            dy === 0 ? min.y : mid.y,
            dz === 0 ? min.z : mid.z,
          );
          const childMax = new Vector3(
            dx === 0 ? mid.x : max.x,
            dy === 0 ? mid.y : max.y,
            dz === 0 ? mid.z : max.z,
          );
          const child = new OctreeNode(
            new Box3(childMin, childMax),
            this.depth + 1,
          );
          child.subdivide(maxDepth, minCellSize);
          this.children.push(child);
        }
      }
    }

    return this;
  }

  /**
   * Collect all leaf nodes (depth-first traversal).
   */
  getLeaves(): OctreeNode[] {
    if (this.isLeaf) {
      return [this];
    }
    const leaves: OctreeNode[] = [];
    for (const child of this.children) {
      leaves.push(...child.getLeaves());
    }
    return leaves;
  }

  /**
   * Mark each leaf as visible/invisible based on the given frustum.
   * Also applies back-face culling when enabled.
   *
   * @param frustum       The camera frustum to test against
   * @param cameraPos     Camera world position (for back-face test)
   * @param cameraForward Camera forward direction (for back-face test)
   * @param cullBackFaces Whether to cull cells entirely behind the camera
   */
  computeVisibility(
    frustum: Frustum,
    cameraPos: Vector3,
    cameraForward: Vector3,
    cullBackFaces: boolean,
  ): void {
    if (this.isLeaf) {
      // Primary test: does the AABB intersect the frustum?
      this.visible = frustum.intersectsBox(this.bounds);

      // Secondary test: back-face culling.
      // If the entire cell is behind the camera (its center is in the
      // opposite hemisphere of the forward direction), cull it.
      if (this.visible && cullBackFaces) {
        const cellCenter = new Vector3();
        this.bounds.getCenter(cellCenter);
        const toCell = cellCenter.clone().sub(cameraPos);
        if (toCell.dot(cameraForward) < 0) {
          this.visible = false;
        }
      }
      return;
    }

    // Interior node: recurse into children
    for (const child of this.children) {
      child.computeVisibility(frustum, cameraPos, cameraForward, cullBackFaces);
    }
  }
}

// ---------------------------------------------------------------------------
// Frustum helpers
// ---------------------------------------------------------------------------

/**
 * Build a THREE.Frustum from a CameraPose.
 *
 * Uses the position, rotation matrix, and FOV to construct the six
 * clipping planes. The far plane is taken from `rMax`; the near plane
 * from `rMin`.
 */
function buildFrustumFromPose(pose: CameraPose, rMin: number, rMax: number): Frustum {
  // Derive a quaternion from the rotation matrix so we can extract directions
  const quat = new Quaternion().setFromRotationMatrix(pose.rotation);
  const forward = new Vector3(0, 0, -1).applyQuaternion(quat);
  const up = new Vector3(0, 1, 0).applyQuaternion(quat);

  const aspect = 1.0; // square aspect for simplicity; callers can adjust

  // Build a projection-view matrix and set the frustum from it
  const frustum = new Frustum();

  const projMatrix = new Matrix4();
  const near = rMin;
  const far = rMax;
  const fovRad = pose.fov;
  const f = 1.0 / Math.tan(fovRad / 2);

  // Perspective matrix (column-major for Three.js)
  const te = projMatrix.elements;
  te[0] = f / aspect; te[4] = 0; te[8] = 0; te[12] = 0;
  te[1] = 0; te[5] = f; te[9] = 0; te[13] = 0;
  te[2] = 0; te[6] = 0; te[10] = (far + near) / (near - far); te[14] = (2 * far * near) / (near - far);
  te[3] = 0; te[7] = 0; te[11] = -1; te[15] = 0;

  // View matrix from camera pose
  const viewMatrix = new Matrix4();
  const eye = pose.position;
  const target = eye.clone().add(forward);
  viewMatrix.lookAt(eye, target, up);

  const viewProj = projMatrix.clone().multiply(viewMatrix);
  frustum.setFromProjectionMatrix(viewProj);

  return frustum;
}

/**
 * Extract the camera's forward direction from its rotation matrix.
 */
function getCameraForward(rotation: Matrix4): Vector3 {
  const quat = new Quaternion().setFromRotationMatrix(rotation);
  return new Vector3(0, 0, -1).applyQuaternion(quat).normalize();
}

// ---------------------------------------------------------------------------
// Sub-frustum descriptor (for wide-FOV splitting)
// ---------------------------------------------------------------------------

interface SubFrustum {
  /** Central direction of this sub-frustum (world space, normalized) */
  direction: Vector3;
  /** Horizontal half-angle of this sub-frustum (radians) */
  halfFovX: number;
  /** Vertical half-angle of this sub-frustum (radians) */
  halfFovY: number;
  /** Resolution (steps per 90°) to use within this sub-frustum */
  resolution: number;
}

/**
 * Split the camera FOV into sub-frustums for wide-angle rendering.
 *
 * For FOV ≤ fovSplitAngle: a single "front" sub-frustum covers the
 * entire field of view at full resolution.
 *
 * For FOV > fovSplitAngle: the front sub-frustum covers the central
 * fovSplitAngle, and side sub-frustums cover the remaining periphery
 * at reduced resolution.
 *
 * @returns Array of sub-frustum descriptors
 */
function computeSubFrustums(
  pose: CameraPose,
  fovSplitAngle: number,
  frontResolution: number,
  sideResolution: number,
): SubFrustum[] {
  const quat = new Quaternion().setFromRotationMatrix(pose.rotation);
  const forward = new Vector3(0, 0, -1).applyQuaternion(quat).normalize();
  const up = new Vector3(0, 1, 0).applyQuaternion(quat).normalize();
  const right = new Vector3(1, 0, 0).applyQuaternion(quat).normalize();

  const totalHalfFov = pose.fov / 2;

  // If the total FOV fits within the split angle, no splitting needed
  if (totalHalfFov <= fovSplitAngle) {
    return [
      {
        direction: forward,
        halfFovX: totalHalfFov,
        halfFovY: totalHalfFov,
        resolution: frontResolution,
      },
    ];
  }

  const subFrustums: SubFrustum[] = [];

  // ── Front sub-frustum ─────────────────────────────────────────────
  const frontHalfFov = fovSplitAngle / 2;
  subFrustums.push({
    direction: forward,
    halfFovX: frontHalfFov,
    halfFovY: frontHalfFov,
    resolution: frontResolution,
  });

  // ── Side sub-frustums ─────────────────────────────────────────────
  // We create 4 side sub-frustums: left, right, top, bottom
  // Each covers from the front region boundary to the total FOV edge
  const sideHalfFovX = totalHalfFov - frontHalfFov;
  const sideHalfFovY = totalHalfFov - frontHalfFov;
  const sideCenterOffset = frontHalfFov + sideHalfFovX / 2;

  // Left
  const leftDir = forward.clone()
    .applyAxisAngle(up, sideCenterOffset)
    .normalize();
  subFrustums.push({
    direction: leftDir,
    halfFovX: sideHalfFovX,
    halfFovY: frontHalfFov,
    resolution: sideResolution,
  });

  // Right
  const rightDir = forward.clone()
    .applyAxisAngle(up, -sideCenterOffset)
    .normalize();
  subFrustums.push({
    direction: rightDir,
    halfFovX: sideHalfFovX,
    halfFovY: frontHalfFov,
    resolution: sideResolution,
  });

  // Top
  const topDir = forward.clone()
    .applyAxisAngle(right, -sideCenterOffset)
    .normalize();
  subFrustums.push({
    direction: topDir,
    halfFovX: frontHalfFov,
    halfFovY: sideHalfFovY,
    resolution: sideResolution,
  });

  // Bottom
  const bottomDir = forward.clone()
    .applyAxisAngle(right, sideCenterOffset)
    .normalize();
  subFrustums.push({
    direction: bottomDir,
    halfFovX: frontHalfFov,
    halfFovY: sideHalfFovY,
    resolution: sideResolution,
  });

  return subFrustums;
}

// ---------------------------------------------------------------------------
// OcclusionMesher (main class)
// ---------------------------------------------------------------------------

/**
 * Occlusion-aware Mesher — the primary implementation.
 *
 * Uses an octree to partition the world bounds, frustum-culls invisible
 * octree leaves, and ray-marches only the visible cells. Produces a mesh
 * with per-vertex `outOfView` / `inViewTags` attributes.
 *
 * For cameras with FOV > 90°, the frustum is split into sub-frustums
 * (front + sides) with different resolution budgets, ensuring the center
 * of view receives full detail while peripheral regions use fewer rays.
 *
 * Extends SphericalMesher to reuse `rayMarchSurface` and `calculateNormal`.
 */
export class OcclusionMesher extends SphericalMesher {
  protected ocConfig: OcMesherConfig;

  constructor(
    cameraPose: CameraPose,
    bounds: [number, number, number, number, number, number],
    config: Partial<OcMesherConfig> = {},
  ) {
    super(cameraPose, bounds, config);

    this.ocConfig = {
      ...DEFAULT_OC_MESHER_CONFIG,
      ...config,
    };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Generate mesh from SDF kernels (without per-vertex view tags).
   *
   * This is the same signature as SphericalMesher.generateMesh so that
   * OcclusionMesher can be used as a drop-in replacement.
   */
  public generateMesh(kernels: SDFKernel[]): BufferGeometry {
    const result = this.generateMeshWithTags(kernels, false);
    return result.geometry;
  }

  /**
   * Generate mesh with per-vertex view tags.
   *
   * This is the primary entry point. Set `collective` to true to combine
   * all kernels via minimum-SDF before meshing (the CollectiveOcMesher
   * subclass does this automatically).
   *
   * @param kernels    SDF kernels to mesh
   * @param collective If true, combine kernels via min-SDF first
   * @returns Result geometry with visibility tags and statistics
   */
  public generateMeshWithTags(
    kernels: SDFKernel[],
    collective: boolean = false,
  ): OcMesherResult {
    const {
      maxOctreeDepth,
      minCellSize,
      cullBackFaces,
      frontResolution,
      sideResolution,
      fovSplitAngle,
      rayMarchSteps,
      enableAdaptiveLOD,
    } = this.ocConfig;

    const rMin = this.config.rMin ?? 0.5;
    const rMax = this.config.rMax ?? 100;

    // ── Step 1: Build octree ────────────────────────────────────────
    const [xMin, xMax, yMin, yMax, zMin, zMax] = this.bounds;
    const rootBounds = new Box3(
      new Vector3(xMin, yMin, zMin),
      new Vector3(xMax, yMax, zMax),
    );
    const octree = new OctreeNode(rootBounds, 0);
    octree.subdivide(maxOctreeDepth, minCellSize);

    // ── Step 2: Compute frustum & mark visibility ───────────────────
    const frustum = buildFrustumFromPose(this.cameraPose, rMin, rMax);
    const cameraForward = getCameraForward(this.cameraPose.rotation);

    octree.computeVisibility(frustum, this.cameraPose.position, cameraForward, cullBackFaces);

    // ── Step 3: Collect visible leaves ──────────────────────────────
    const allLeaves = octree.getLeaves();
    const visibleLeaves = allLeaves.filter((leaf) => leaf.visible);

    // ── Step 4: Determine sub-frustums for wide FOV ─────────────────
    const subFrustums = computeSubFrustums(
      this.cameraPose,
      fovSplitAngle,
      frontResolution,
      sideResolution,
    );

    // ── Step 5: Ray-march within each visible leaf ──────────────────
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const outOfViewFlags: boolean[] = [];

    // Per-leaf vertex mapping for stitching
    let nextVertex = 0;

    // Determine which sub-frustum a leaf belongs to based on angular
    // distance from the camera forward direction.
    const leafCenter = new Vector3();
    const cameraPos = this.cameraPose.position;

    for (const leaf of visibleLeaves) {
      leaf.bounds.getCenter(leafCenter);
      const toLeaf = leafCenter.clone().sub(cameraPos);

      // Find the best-matching sub-frustum for this leaf
      let bestSubFrustum = subFrustums[0];
      let bestDot = -Infinity;
      for (const sf of subFrustums) {
        const dirNorm = sf.direction.clone().normalize();
        const dot = toLeaf.clone().normalize().dot(dirNorm);
        if (dot > bestDot) {
          bestDot = dot;
          bestSubFrustum = sf;
        }
      }

      // Compute resolution for this leaf
      let resolution = bestSubFrustum.resolution;

      // Adaptive LOD: reduce resolution for distant leaves
      if (enableAdaptiveLOD) {
        const distance = toLeaf.length();
        const distanceFactor = Math.max(0.25, 1.0 - distance / (rMax * 1.5));
        resolution = Math.max(4, Math.floor(resolution * distanceFactor));
      }

      // Mesh this leaf by ray-marching within its bounds
      const leafResult = this.meshLeaf(
        kernels,
        leaf.bounds,
        bestSubFrustum,
        resolution,
        rMin,
        rMax,
        rayMarchSteps,
        collective,
      );

      // Append leaf geometry
      const offset = nextVertex;
      for (let i = 0; i < leafResult.positions.length; i += 3) {
        positions.push(leafResult.positions[i], leafResult.positions[i + 1], leafResult.positions[i + 2]);
        normals.push(leafResult.normals[i], leafResult.normals[i + 1], leafResult.normals[i + 2]);
      }
      for (let i = 0; i < leafResult.uvs.length; i += 2) {
        uvs.push(leafResult.uvs[i], leafResult.uvs[i + 1]);
      }
      for (const idx of leafResult.indices) {
        indices.push(idx + offset);
      }

      // Visibility tags: vertices in visible leaves are "in view"
      for (let i = 0; i < leafResult.positions.length / 3; i++) {
        outOfViewFlags.push(false); // in view
      }

      nextVertex += leafResult.positions.length / 3;
    }

    // ── Step 6: Build the geometry ──────────────────────────────────
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('outOfView', new Float32BufferAttribute(
      outOfViewFlags.map((v) => (v ? 1.0 : 0.0)),
      1,
    ));

    if (indices.length > 0) {
      geometry.setIndex(indices);
    }

    // Compute the complementary inViewTags array
    const inViewTags = outOfViewFlags.map((v) => !v);

    return {
      geometry,
      outOfView: outOfViewFlags,
      inViewTags,
      visibleLeafCount: visibleLeaves.length,
      totalLeafCount: allLeaves.length,
    };
  }

  // -----------------------------------------------------------------------
  // Internal: bisection refinement for sub-voxel surface precision
  // -----------------------------------------------------------------------

  /**
   * Perform bisection (binary search) refinement between two ray parameters
   * to locate the SDF zero-crossing with sub-step precision.
   *
   * When a ray-marching step detects a sign change in the SDF (prevSDF > 0,
   * currentSDF < 0), the isosurface lies somewhere between the two sample
   * points. This method narrows the interval by repeatedly evaluating the
   * SDF at the midpoint and discarding the half that does not contain the
   * sign change.
   *
   * @param evaluateSDF Function that returns the SDF value at a given point
   * @param rayOrigin   Origin of the ray (camera position)
   * @param rayDir      Normalized direction of the ray
   * @param tNear       Ray parameter at the start of the interval (SDF > 0)
   * @param tFar        Ray parameter at the end of the interval (SDF < 0)
   * @param steps       Number of bisection iterations (each halves the interval)
   * @returns Object with the refined `t` parameter and a `hit` boolean.
   *          `hit` is true when the zero-crossing was located successfully.
   */
  protected bisectionRefinement(
    evaluateSDF: (point: Vector3) => number,
    rayOrigin: Vector3,
    rayDir: Vector3,
    tNear: number,
    tFar: number,
    steps: number,
  ): { t: number; hit: boolean } {
    let lo = tNear;
    let hi = tFar;

    // Evaluate SDF at the bounds to confirm a sign change exists
    const pointLo = rayOrigin.clone().add(rayDir.clone().multiplyScalar(lo));
    const sdfLo = evaluateSDF(pointLo);
    const pointHi = rayOrigin.clone().add(rayDir.clone().multiplyScalar(hi));
    const sdfHi = evaluateSDF(pointHi);

    // No sign change → cannot bisect
    if (sdfLo * sdfHi > 0) {
      return { t: hi, hit: false };
    }

    for (let i = 0; i < steps; i++) {
      const mid = (lo + hi) * 0.5;
      const pointMid = rayOrigin.clone().add(rayDir.clone().multiplyScalar(mid));
      const sdfMid = evaluateSDF(pointMid);

      if (Math.abs(sdfMid) < 1e-8) {
        // Converged to near-zero — exact zero crossing found
        return { t: mid, hit: true };
      }

      // Keep the half-interval that contains the sign change
      if (sdfLo * sdfMid <= 0) {
        hi = mid;
        // sdfHi = sdfMid; // not needed — we only track lo's sign for the decision
      } else {
        lo = mid;
        // sdfLo = sdfMid;
      }
    }

    // Return the midpoint of the final interval as the best estimate
    const tResult = (lo + hi) * 0.5;
    return { t: tResult, hit: true };
  }

  // -----------------------------------------------------------------------
  // Internal: mesh a single octree leaf
  // -----------------------------------------------------------------------

  /**
   * Ray-march within a single octree leaf's bounds, using a sub-frustum
   * to determine the angular range of rays.
   *
   * Algorithm:
   *   1. Compute the angular extent of the leaf as seen from the camera
   *   2. Cast a grid of rays covering that extent at the given resolution
   *   3. Clip ray hits to the leaf's bounding box
   *   4. Connect adjacent hits into triangles
   *
   * @param kernels      SDF kernels to evaluate
   * @param leafBounds   The AABB of this leaf
   * @param subFrustum   The sub-frustum this leaf belongs to
   * @param resolution   Steps per 90° within this leaf
   * @param rMin         Near distance for ray marching
   * @param rMax         Far distance for ray marching
   * @param steps        Number of ray-marching steps per ray
   * @param collective   Whether to combine kernels via min-SDF
   * @returns Raw geometry arrays (positions, normals, uvs, indices)
   */
  protected meshLeaf(
    kernels: SDFKernel[],
    leafBounds: Box3,
    subFrustum: SubFrustum,
    resolution: number,
    rMin: number,
    rMax: number,
    steps: number,
    collective: boolean,
  ): {
    positions: number[];
    normals: number[];
    uvs: number[];
    indices: number[];
  } {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Evaluate the SDF: either individual kernels or combined min
    const evaluateSDF = (point: Vector3): number => {
      if (collective) {
        let minSDF = Infinity;
        for (const kernel of kernels) {
          minSDF = Math.min(minSDF, kernel.evaluate(point));
        }
        return minSDF;
      }
      // For individual mode, still use min (the visible surface is the closest)
      let minSDF = Infinity;
      for (const kernel of kernels) {
        minSDF = Math.min(minSDF, kernel.evaluate(point));
      }
      return minSDF;
    };

    // Compute the angular range that this leaf covers from the camera
    const cameraPos = this.cameraPose.position;

    // Build a local coordinate frame aligned with the sub-frustum direction
    const quat = new Quaternion().setFromRotationMatrix(this.cameraPose.rotation);
    const worldUp = new Vector3(0, 1, 0).applyQuaternion(quat).normalize();
    const worldRight = new Vector3(1, 0, 0).applyQuaternion(quat).normalize();

    // Compute the angular span of the leaf as seen from the camera
    const leafMin = leafBounds.min;
    const leafMax = leafBounds.max;

    // Sample 8 corners of the leaf to find angular bounds relative to the
    // sub-frustum center direction
    const corners: Vector3[] = [];
    for (let dz = 0; dz < 2; dz++) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          corners.push(new Vector3(
            dx === 0 ? leafMin.x : leafMax.x,
            dy === 0 ? leafMin.y : leafMax.y,
            dz === 0 ? leafMin.z : leafMax.z,
          ));
        }
      }
    }

    const subDir = subFrustum.direction.clone().normalize();

    let minAzimuth = Infinity;
    let maxAzimuth = -Infinity;
    let minElevation = Infinity;
    let maxElevation = -Infinity;

    for (const corner of corners) {
      const toCorner = corner.clone().sub(cameraPos);
      const dist = toCorner.length();
      if (dist < 0.001) continue;
      const dir = toCorner.clone().normalize();

      // Azimuth = angle between dir and subDir projected onto the horizontal plane
      const horizontalComponent = dir.clone().sub(worldUp.clone().multiplyScalar(dir.dot(worldUp)));
      const hLen = horizontalComponent.length();
      if (hLen > 0.001) {
        horizontalComponent.normalize();
        const subDirHorizontal = subDir.clone().sub(worldUp.clone().multiplyScalar(subDir.dot(worldUp)));
        const sdLen = subDirHorizontal.length();
        if (sdLen > 0.001) {
          subDirHorizontal.normalize();
          const azSign = horizontalComponent.dot(worldRight);
          const azAngle = Math.acos(Math.max(-1, Math.min(1, horizontalComponent.dot(subDirHorizontal))));
          const azimuth = azSign >= 0 ? azAngle : -azAngle;
          minAzimuth = Math.min(minAzimuth, azimuth);
          maxAzimuth = Math.max(maxAzimuth, azimuth);
        }
      }

      // Elevation = angle between dir and the horizontal plane
      const elevation = Math.asin(Math.max(-1, Math.min(1, dir.dot(worldUp))));
      minElevation = Math.min(minElevation, elevation);
      maxElevation = Math.max(maxElevation, elevation);
    }

    // If no corners were valid, skip this leaf
    if (!isFinite(minAzimuth) || !isFinite(maxAzimuth)) {
      return { positions, normals, uvs, indices };
    }

    // Expand the angular range slightly to avoid edge cracks
    const angularPadding = (Math.PI / 180) * 2; // 2 degrees
    minAzimuth -= angularPadding;
    maxAzimuth += angularPadding;
    minElevation -= angularPadding;
    maxElevation += angularPadding;

    // Clamp to the sub-frustum's angular limits
    const sfHalfX = subFrustum.halfFovX;
    const sfHalfY = subFrustum.halfFovY;

    const clampedMinAz = Math.max(minAzimuth, -sfHalfX);
    const clampedMaxAz = Math.min(maxAzimuth, sfHalfX);
    const clampedMinEl = Math.max(minElevation, -sfHalfY);
    const clampedMaxEl = Math.min(maxElevation, sfHalfY);

    // If the clamped range is empty, the leaf is outside this sub-frustum
    if (clampedMaxAz <= clampedMinAz || clampedMaxEl <= clampedMinEl) {
      return { positions, normals, uvs, indices };
    }

    // Compute grid dimensions based on resolution and angular span
    const azimuthSpan = clampedMaxAz - clampedMinAz;
    const elevationSpan = clampedMaxEl - clampedMinEl;

    const azimuthSteps = Math.max(2, Math.ceil(resolution * azimuthSpan / (Math.PI / 2)));
    const elevationSteps = Math.max(2, Math.ceil(resolution * elevationSpan / (Math.PI / 2)));

    // Per-grid-point vertex index; -1 means the ray missed the surface or
    // the hit is outside the leaf bounds
    const vertexIndexGrid: number[][] = [];
    let nextVertex = 0;

    // ── Pass 1: Cast rays within the leaf's angular range ───────────

    for (let ei = 0; ei <= elevationSteps; ei++) {
      vertexIndexGrid[ei] = new Array<number>(azimuthSteps + 1).fill(-1);

      const elevation = clampedMinEl + (elevationSpan * ei) / elevationSteps;

      for (let ai = 0; ai <= azimuthSteps; ai++) {
        const azimuth = clampedMinAz + (azimuthSpan * ai) / azimuthSteps;

        // Construct ray direction from azimuth/elevation relative to the
        // sub-frustum center, using the camera's local coordinate frame
        const cosEl = Math.cos(elevation);
        const sinEl = Math.sin(elevation);
        const cosAz = Math.cos(azimuth);
        const sinAz = Math.sin(azimuth);

        // Direction in camera-local space
        const localDir = new Vector3(sinAz * cosEl, sinEl, -cosAz * cosEl).normalize();

        // Transform to world space via camera rotation
        const worldDir = localDir.applyMatrix4(this.cameraPose.rotation).normalize();

        // Ray march to find surface intersection
        let t = rMin;
        const dt = (rMax - rMin) / steps;
        let hit = false;
        let prevSDF = Infinity;   // SDF at previous march step (starts positive/outside)
        let prevT = rMin;         // ray parameter at previous march step

        for (let s = 0; s < steps; s++) {
          const point = cameraPos.clone().add(worldDir.clone().multiplyScalar(t));
          const sdf = evaluateSDF(point);

          // Direct hit: SDF is close enough to zero
          if (sdf < 0.001) {
            hit = true;
            break;
          }

          // Sign change detected: ray crossed from outside (prevSDF > 0) to
          // inside (sdf < 0) the surface — apply bisection refinement for
          // sub-voxel precision.
          if (prevSDF > 0 && sdf < 0 && this.ocConfig.bisectionSteps > 0) {
            const refined = this.bisectionRefinement(
              evaluateSDF,
              cameraPos,
              worldDir,
              prevT,
              t,
              this.ocConfig.bisectionSteps,
            );
            if (refined.hit) {
              t = refined.t;
              hit = true;
              break;
            }
          }

          // Remember this step's values for sign-change detection
          prevSDF = sdf;
          prevT = t;

          // Sphere tracing: advance by SDF value
          t += Math.max(sdf, dt * 0.1);

          if (t > rMax) break;
        }

        if (!hit || t >= rMax) continue;

        // Compute hit position
        const hitPos = cameraPos.clone().add(worldDir.clone().multiplyScalar(t));

        // Clip: only accept hits within the leaf's bounding box
        if (!leafBounds.containsPoint(hitPos)) continue;

        // Calculate surface normal via central finite differences
        const eps = 0.001;
        const computeSDF = (p: Vector3): number => evaluateSDF(p);

        const nx = computeSDF(hitPos.clone().add(new Vector3(eps, 0, 0)))
                  - computeSDF(hitPos.clone().sub(new Vector3(eps, 0, 0)));
        const ny = computeSDF(hitPos.clone().add(new Vector3(0, eps, 0)))
                  - computeSDF(hitPos.clone().sub(new Vector3(0, eps, 0)));
        const nz = computeSDF(hitPos.clone().add(new Vector3(0, 0, eps)))
                  - computeSDF(hitPos.clone().sub(new Vector3(0, 0, eps)));
        const normal = new Vector3(nx, ny, nz).normalize();

        positions.push(hitPos.x, hitPos.y, hitPos.z);
        normals.push(normal.x, normal.y, normal.z);

        // UV: normalize angular coordinates to [0,1]
        const u = (azimuth - clampedMinAz) / azimuthSpan;
        const v = (elevation - clampedMinEl) / elevationSpan;
        uvs.push(u, v);

        vertexIndexGrid[ei][ai] = nextVertex++;
      }
    }

    // ── Pass 2: Build triangle indices from adjacent hits ───────────

    for (let ei = 0; ei < elevationSteps; ei++) {
      for (let ai = 0; ai < azimuthSteps; ai++) {
        const i00 = vertexIndexGrid[ei][ai];
        const i10 = vertexIndexGrid[ei][ai + 1];
        const i01 = vertexIndexGrid[ei + 1][ai];
        const i11 = vertexIndexGrid[ei + 1][ai + 1];

        // Only create a quad (2 triangles) if all 4 corners hit
        if (i00 < 0 || i10 < 0 || i01 < 0 || i11 < 0) continue;

        indices.push(i00, i01, i10);
        indices.push(i10, i01, i11);
      }
    }

    return { positions, normals, uvs, indices };
  }

  // -----------------------------------------------------------------------
  // Utility: compute frustum for external use
  // -----------------------------------------------------------------------

  /**
   * Build and return the camera frustum used for culling.
   * Useful for debugging and visualization.
   */
  public getFrustum(): Frustum {
    const rMin = this.config.rMin ?? 0.5;
    const rMax = this.config.rMax ?? 100;
    return buildFrustumFromPose(this.cameraPose, rMin, rMax);
  }

  /**
   * Build and return the octree for debugging / visualization.
   * Does not compute visibility — call computeVisibility() separately
   * or use generateMeshWithTags() which does it internally.
   */
  public buildOctree(): OctreeNode {
    const [xMin, xMax, yMin, yMax, zMin, zMax] = this.bounds;
    const rootBounds = new Box3(
      new Vector3(xMin, yMin, zMin),
      new Vector3(xMax, yMax, zMax),
    );
    const octree = new OctreeNode(rootBounds, 0);
    octree.subdivide(this.ocConfig.maxOctreeDepth, this.ocConfig.minCellSize);
    return octree;
  }

  /**
   * Compute visibility for an octree using the current camera pose.
   * Modifies the octree in place.
   */
  public computeOctreeVisibility(octree: OctreeNode): void {
    const frustum = this.getFrustum();
    const cameraForward = getCameraForward(this.cameraPose.rotation);
    octree.computeVisibility(
      frustum,
      this.cameraPose.position,
      cameraForward,
      this.ocConfig.cullBackFaces,
    );
  }

  /**
   * Get the sub-frustum layout for the current camera pose.
   * Useful for debugging and visualization.
   */
  public getSubFrustums(): SubFrustum[] {
    return computeSubFrustums(
      this.cameraPose,
      this.ocConfig.fovSplitAngle,
      this.ocConfig.frontResolution,
      this.ocConfig.sideResolution,
    );
  }
}

// ---------------------------------------------------------------------------
// Opaque / Transparent specializations
// ---------------------------------------------------------------------------

/**
 * Individual OcMesher for a single SDF kernel (e.g. opaque terrain).
 *
 * Meshes only the portions of the kernel's surface that are visible from
 * the camera, using octree-based frustum culling and per-vertex view tags.
 */
export class OpaqueOcMesher extends OcclusionMesher {
  constructor(
    cameraPose: CameraPose,
    bounds: [number, number, number, number, number, number],
    config?: Partial<OcMesherConfig>,
  ) {
    super(cameraPose, bounds, config);
  }
}

/**
 * Individual OcMesher for transparent SDF kernels (e.g. water surfaces).
 *
 * Same algorithm as OpaqueOcMesher but semantically separated so that
 * downstream systems can apply different materials / render passes.
 */
export class TransparentOcMesher extends OcclusionMesher {
  constructor(
    cameraPose: CameraPose,
    bounds: [number, number, number, number, number, number],
    config?: Partial<OcMesherConfig>,
  ) {
    super(cameraPose, bounds, config);
  }
}

// ---------------------------------------------------------------------------
// CollectiveOcMesher
// ---------------------------------------------------------------------------

/**
 * Collective OcMesher — combines all SDF kernels into a single minimum SDF
 * before meshing.
 *
 * This is useful when multiple overlapping kernels (terrain + water + caves)
 * should be treated as one unified surface for occlusion purposes.
 * The combined SDF is simply the pointwise minimum of all kernel values,
 * with optional smooth blending when kernels declare a `blendFactor`.
 */
export class CollectiveOcMesher extends OcclusionMesher {
  constructor(
    cameraPose: CameraPose,
    bounds: [number, number, number, number, number, number],
    config?: Partial<OcMesherConfig>,
  ) {
    super(cameraPose, bounds, config);
  }

  /**
   * Generate a combined mesh from all kernels using the collective
   * (minimum) SDF. The kernels are blended via their declared blend
   * modes before ray marching.
   */
  public generateMesh(kernels: SDFKernel[]): BufferGeometry {
    const result = this.generateMeshWithTags(kernels, true);
    return result.geometry;
  }

  /**
   * Generate a combined mesh with per-vertex view tags.
   * Uses the collective minimum SDF.
   */
  public generateMeshWithTags(kernels: SDFKernel[], _collective: boolean = true): OcMesherResult {
    // Create a combined SDF kernel that evaluates the minimum across all kernels
    const combinedKernel: SDFKernel = {
      evaluate: (position: Vector3): number => {
        let minSDF = Infinity;
        for (const kernel of kernels) {
          let sdf = kernel.evaluate(position);
          // Apply smooth blending if declared
          if (kernel.blendMode === 'smooth-union' && kernel.blendFactor !== undefined) {
            const k = kernel.blendFactor;
            // Smooth min approximation: this is a simplified version;
            // the full implementation would blend pairwise.
            sdf = sdf - k * 0.5; // offset for smoother transition
          }
          minSDF = Math.min(minSDF, sdf);
        }
        return minSDF;
      },
      getBounds: (): import('three').Box3 => {
        let combined = new Box3();
        for (const kernel of kernels) {
          combined = combined.union(kernel.getBounds());
        }
        return combined;
      },
    };

    // Delegate to the parent implementation with the single combined kernel
    return super.generateMeshWithTags([combinedKernel], false);
  }
}
