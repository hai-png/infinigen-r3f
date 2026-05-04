/**
 * Geometry Evaluation Costs
 *
 * Ports: infinigen/core/constraints/constraint_language/geometry.py
 *
 * Provides geometric cost functions used by the constraint evaluator
 * to compute violation penalties. These are pure mathematical functions
 * (not AST nodes) that operate on THREE.Vector3 positions and simple
 * geometric descriptors.
 *
 * These complement the existing GeometryPredicate classes in
 * ./geometry.ts (which are ScalarExpression AST nodes for the
 * constraint language) by providing lower-level cost computations
 * that can be called directly by the evaluator and solver.
 *
 * Cost functions:
 *  - distance: Euclidean distance between two points
 *  - accessibility_cost: How accessible a position is (blocked by obstacles)
 *  - center_stable_surface_dist: Distance to center of nearest stable surface
 *  - freespace_2d: Free space around a 2D position
 *  - coplanarity_cost: How non-coplanar a set of points is
 *  - volume: AABB volume
 *  - min_dist_2d: Minimum 2D distance to a set of points
 *  - rotational_asymmetry: Asymmetry around an axis
 *  - reflectional_asymmetry: Asymmetry about a plane
 *  - clearance_cost: Insufficient clearance along a direction
 *  - path_obstruction_cost: Obstacles blocking a path
 *
 * BVH-enhanced cost functions:
 *  - accessibility_cost_bvh: BVH-raycasting based accessibility cost
 *  - clearance_cost_bvh: BVH-raycasting based clearance cost
 *  - path_obstruction_cost_bvh: BVH-raycasting based path obstruction cost
 */

import * as THREE from 'three';
import { BVHQueryEngine, getDefaultBVHEngine, type RaycastResult } from './bvh-queries';

// ============================================================================
// Basic Distance & Geometry
// ============================================================================

/**
 * Euclidean distance between two 3D positions.
 *
 * @param posA - First position
 * @param posB - Second position
 * @returns Euclidean distance
 */
export function distance(posA: THREE.Vector3, posB: THREE.Vector3): number {
  return posA.distanceTo(posB);
}

/**
 * AABB volume computation.
 *
 * @param boundingBox - Axis-aligned bounding box with min/max corners
 * @returns Volume of the bounding box
 */
export function volume(boundingBox: { min: THREE.Vector3; max: THREE.Vector3 }): number {
  const dx = boundingBox.max.x - boundingBox.min.x;
  const dy = boundingBox.max.y - boundingBox.min.y;
  const dz = boundingBox.max.z - boundingBox.min.z;
  return Math.max(0, dx) * Math.max(0, dy) * Math.max(0, dz);
}

// ============================================================================
// Accessibility & Free Space
// ============================================================================

/**
 * Accessibility cost: penalizes positions that are blocked by other objects.
 *
 * A position is "accessible" if there is a clear line of sight from
 * multiple directions to the position. The cost increases when objects
 * block access paths.
 *
 * Algorithm:
 *  1. Cast rays from sample directions on a sphere around the position
 *  2. For each ray, check if any obstacle blocks it before reaching
 *     a minimum clearance distance
 *  3. Cost = fraction of blocked rays × penalty factor
 *
 * @param position - The position to evaluate
 * @param state - Scene state containing obstacles
 * @returns Cost in [0, ∞). 0 = fully accessible, higher = more blocked
 */
export function accessibility_cost(position: THREE.Vector3, state: any): number {
  if (!state || !state.obstacles) return 0;

  const obstacles: THREE.Vector3[] = state.obstacles;
  const obstacleRadius: number = state.obstacleRadius ?? 0.5;
  const clearanceDistance: number = state.clearanceDistance ?? 1.5;

  // Sample directions on a sphere (using Fibonacci sphere for uniform coverage)
  const numDirections = 16;
  let blockedCount = 0;

  const goldenRatio = (1 + Math.sqrt(5)) / 2;

  for (let i = 0; i < numDirections; i++) {
    const theta = 2 * Math.PI * i / goldenRatio;
    const phi = Math.acos(1 - 2 * (i + 0.5) / numDirections);

    const dir = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi)
    ).normalize();

    // Check if any obstacle blocks this direction within clearance distance
    let blocked = false;
    for (const obs of obstacles) {
      const toObs = obs.clone().sub(position);
      const projection = toObs.dot(dir);

      if (projection > 0 && projection < clearanceDistance) {
        // Obstacle is in front of us and within clearance
        const perpendicular = toObs.clone().sub(dir.clone().multiplyScalar(projection));
        if (perpendicular.length() < obstacleRadius) {
          blocked = true;
          break;
        }
      }
    }

    if (blocked) blockedCount++;
  }

  // Cost is proportional to fraction of blocked directions
  return (blockedCount / numDirections) * 10; // Scale factor for penalty
}

/**
 * Distance from a position to the center of the nearest stable surface.
 *
 * Stable surfaces are horizontal planes (normals pointing up) that
 * can support objects. The cost penalizes positions far from any
 * support surface center.
 *
 * @param position - The position to evaluate
 * @param planes - Array of surface descriptors with position and normal
 * @returns Distance to the center of the nearest stable surface
 */
export function center_stable_surface_dist(
  position: THREE.Vector3,
  planes: Array<{ position: THREE.Vector3; normal: THREE.Vector3; halfExtents?: THREE.Vector2 }>
): number {
  if (planes.length === 0) return Infinity;

  let minDist = Infinity;
  const upVector = new THREE.Vector3(0, 1, 0);

  for (const plane of planes) {
    // Only consider horizontal (stable) surfaces
    const normalDir = plane.normal.clone().normalize();
    const isStable = Math.abs(normalDir.dot(upVector)) > 0.7;

    if (!isStable) continue;

    // Compute 3D distance to plane center
    const dist = position.distanceTo(plane.position);

    // If plane has half-extents, also consider distance to nearest edge
    if (plane.halfExtents) {
      const dx = Math.max(0, Math.abs(position.x - plane.position.x) - plane.halfExtents.x);
      const dz = Math.max(0, Math.abs(position.z - plane.position.z) - plane.halfExtents.y);
      const edgeDist = Math.sqrt(dx * dx + dz * dz);
      // Use the better of center distance or edge distance
      minDist = Math.min(minDist, dist, edgeDist);
    } else {
      minDist = Math.min(minDist, dist);
    }
  }

  return minDist;
}

/**
 * Free space around a 2D position.
 *
 * Measures how much open space exists around a point by computing
 * the sum of distances to the nearest obstacles. More free space
 * means the position is less constrained.
 *
 * @param position - 2D position [x, z]
 * @param obstacles - Array of obstacles with position and radius
 * @returns Total free space metric (sum of distances to nearest obstacles).
 *   Higher values mean more space. 0 means position is inside an obstacle.
 */
export function freespace_2d(
  position: [number, number],
  obstacles: Array<{ position: [number, number]; radius: number }>
): number {
  if (obstacles.length === 0) return Infinity;

  let totalFreeSpace = 0;
  const numDirections = 8; // Check 8 cardinal/ordinal directions

  for (let d = 0; d < numDirections; d++) {
    const angle = (2 * Math.PI * d) / numDirections;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);

    // Ray march to find nearest obstacle in this direction
    let rayDist = Infinity;

    for (const obs of obstacles) {
      const dx = obs.position[0] - position[0];
      const dz = obs.position[1] - position[1];

      // Project obstacle onto ray direction
      const projection = dx * dirX + dz * dirZ;

      if (projection > 0) {
        // Obstacle is in front of the ray
        const perpX = dx - projection * dirX;
        const perpZ = dz - projection * dirZ;
        const perpDist = Math.sqrt(perpX * perpX + perpZ * perpZ);

        if (perpDist < obs.radius) {
          // Ray passes through obstacle
          const halfChord = Math.sqrt(Math.max(0, obs.radius * obs.radius - perpDist * perpDist));
          const entryDist = projection - halfChord;
          rayDist = Math.min(rayDist, Math.max(0, entryDist));
        }
      }
    }

    totalFreeSpace += (rayDist === Infinity ? 10 : rayDist); // Cap at 10m
  }

  // Check if position is inside any obstacle
  for (const obs of obstacles) {
    const dx = obs.position[0] - position[0];
    const dz = obs.position[1] - position[1];
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < obs.radius) return 0;
  }

  return totalFreeSpace;
}

/**
 * Minimum 2D distance from a position to a set of other points.
 *
 * @param position - 2D position [x, z]
 * @param others - Array of other 2D positions
 * @returns Minimum distance to the nearest other point, or Infinity if empty
 */
export function min_dist_2d(position: [number, number], others: [number, number][]): number {
  if (others.length === 0) return Infinity;

  let minDist = Infinity;
  for (const other of others) {
    const dx = position[0] - other[0];
    const dz = position[1] - other[1];
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

// ============================================================================
// Coplanarity & Symmetry
// ============================================================================

/**
 * Coplanarity cost: measures how non-coplanar a set of points is.
 *
 * Algorithm:
 *  1. Fit a plane to the points using SVD (least squares)
 *  2. Compute the sum of squared distances from each point to the plane
 *  3. Normalize by the number of points
 *
 * A cost of 0 means all points are perfectly coplanar.
 *
 * @param positions - Array of 3D positions
 * @returns Non-coplanarity cost (sum of squared distances to best-fit plane)
 */
export function coplanarity_cost(positions: THREE.Vector3[]): number {
  if (positions.length < 3) return 0; // Fewer than 3 points are trivially coplanar

  // Compute centroid
  const centroid = new THREE.Vector3();
  for (const p of positions) {
    centroid.add(p);
  }
  centroid.divideScalar(positions.length);

  // Build covariance matrix (3×3)
  let xx = 0, xy = 0, xz = 0;
  let yy = 0, yz = 0;
  let zz = 0;

  for (const p of positions) {
    const dx = p.x - centroid.x;
    const dy = p.y - centroid.y;
    const dz = p.z - centroid.z;

    xx += dx * dx;
    xy += dx * dy;
    xz += dx * dz;
    yy += dy * dy;
    yz += dy * dz;
    zz += dz * dz;
  }

  // Find the smallest eigenvalue of the covariance matrix using
  // the characteristic equation for a 3×3 symmetric matrix.
  // The smallest eigenvalue corresponds to the normal of the best-fit plane.
  //
  // For a 3×3 symmetric matrix, we use Cardano's method.

  const a = 1;
  const b = -(xx + yy + zz);
  const c = xx * yy + xx * zz + yy * zz - xy * xy - xz * xz - yz * yz;
  const d = xx * (yz * yz - yy * zz) + yy * (xz * xz - xx * zz) + zz * (xy * xy - xx * yy)
            + 2 * xy * xz * yz;

  // Solve λ³ + bλ² + cλ + d = 0
  const p = (3 * c - b * b) / 3;
  const q = (2 * b * b * b - 9 * b * c + 27 * d) / 27;

  // Discriminant
  const discriminant = -4 * p * p * p - 27 * q * q;

  let minEigenvalue: number;

  if (discriminant >= 0) {
    // Three real roots — use trigonometric solution
    const r = Math.sqrt(Math.max(0, -p * p * p / 27));
    const theta = Math.atan2(
      Math.sqrt(Math.max(0, -discriminant / 108)),
      -q / 2
    );

    const root1 = 2 * Math.cbrt(r) * Math.cos(theta / 3) - b / 3;
    const root2 = 2 * Math.cbrt(r) * Math.cos((theta + 2 * Math.PI) / 3) - b / 3;
    const root3 = 2 * Math.cbrt(r) * Math.cos((theta + 4 * Math.PI) / 3) - b / 3;

    minEigenvalue = Math.min(root1, root2, root3);
  } else {
    // One real root, two complex — use direct solution
    // Fallback: use the trace approximation
    minEigenvalue = Math.max(0, -b / 3 - 2 * Math.sqrt(Math.max(0, -p / 3)));
  }

  // The coplanarity cost is the smallest eigenvalue
  // (sum of squared distances to the best-fit plane)
  return Math.max(0, minEigenvalue / positions.length);
}

/**
 * Rotational asymmetry: measures how asymmetric a set of points is
 * around a given axis.
 *
 * Algorithm:
 *  1. For each point, compute its rotated counterpart (180° around axis)
 *  2. Find the nearest original point to the rotated counterpart
 *  3. Sum the distances (perfect rotational symmetry = 0)
 *
 * @param positions - Array of 3D positions
 * @param center - Center of rotation
 * @param axis - Axis of rotation (must be normalized)
 * @returns Asymmetry cost. 0 = perfectly symmetric.
 */
export function rotational_asymmetry(
  positions: THREE.Vector3[],
  center: THREE.Vector3,
  axis: THREE.Vector3
): number {
  if (positions.length < 2) return 0;

  const normalizedAxis = axis.clone().normalize();
  let totalAsymmetry = 0;

  // 180-degree rotation matrix around the axis
  // R = 2 * (n ⊗ n) - I (for 180° rotation)
  // But for general N-fold symmetry, we rotate by 2π/N
  const angle = Math.PI; // 180° for 2-fold symmetry
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const nx = normalizedAxis.x;
  const ny = normalizedAxis.y;
  const nz = normalizedAxis.z;

  // Rodrigues' rotation formula as a matrix
  const rotationMatrix = new THREE.Matrix4().set(
    cosA + nx * nx * (1 - cosA),     nx * ny * (1 - cosA) - nz * sinA, nx * nz * (1 - cosA) + ny * sinA, 0,
    ny * nx * (1 - cosA) + nz * sinA, cosA + ny * ny * (1 - cosA),     ny * nz * (1 - cosA) - nx * sinA, 0,
    nz * nx * (1 - cosA) - ny * sinA, nz * ny * (1 - cosA) + nx * sinA, cosA + nz * nz * (1 - cosA),     0,
    0,                                 0,                                 0,                                 1
  );

  // Translate to origin, rotate, translate back
  const translateToOrigin = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);
  const translateBack = new THREE.Matrix4().makeTranslation(center.x, center.y, center.z);
  const transform = translateBack.multiply(rotationMatrix).multiply(translateToOrigin);

  for (const point of positions) {
    // Compute the rotated counterpart
    const rotated = point.clone().applyMatrix4(transform);

    // Find the nearest original point to the rotated position
    let nearestDist = Infinity;
    for (const other of positions) {
      const d = rotated.distanceTo(other);
      if (d < nearestDist) nearestDist = d;
    }

    totalAsymmetry += nearestDist;
  }

  return totalAsymmetry / positions.length;
}

/**
 * Reflectional asymmetry: measures how asymmetric a set of points is
 * about a given plane.
 *
 * Algorithm:
 *  1. For each point, compute its reflection across the plane
 *  2. Find the nearest original point to the reflected counterpart
 *  3. Sum the distances (perfect reflection symmetry = 0)
 *
 * @param positions - Array of 3D positions
 * @param plane - Plane defined by a point and normal
 * @returns Asymmetry cost. 0 = perfectly symmetric.
 */
export function reflectional_asymmetry(
  positions: THREE.Vector3[],
  plane: { point: THREE.Vector3; normal: THREE.Vector3 }
): number {
  if (positions.length < 2) return 0;

  const normal = plane.normal.clone().normalize();
  const planePoint = plane.point;
  let totalAsymmetry = 0;

  for (const point of positions) {
    // Reflect point across the plane
    // reflected = point - 2 * ((point - planePoint) · normal) * normal
    const toPoint = point.clone().sub(planePoint);
    const distToPlane = toPoint.dot(normal);
    const reflected = point.clone().sub(normal.clone().multiplyScalar(2 * distToPlane));

    // Find the nearest original point to the reflected position
    let nearestDist = Infinity;
    for (const other of positions) {
      const d = reflected.distanceTo(other);
      if (d < nearestDist) nearestDist = d;
    }

    totalAsymmetry += nearestDist;
  }

  return totalAsymmetry / positions.length;
}

// ============================================================================
// Clearance & Path Costs
// ============================================================================

/**
 * Clearance cost: penalizes insufficient clearance along a direction.
 *
 * Measures whether there is enough free space in a given direction
 * from a position. Used for accessibility constraints (e.g., ensuring
 * a chair has enough space to pull out from a table).
 *
 * @param position - The position to evaluate
 * @param direction - Direction to check clearance (must be normalized)
 * @param obstacles - Array of obstacle positions
 * @param minClearance - Minimum required clearance distance
 * @returns Cost for insufficient clearance. 0 = enough clearance.
 */
export function clearance_cost(
  position: THREE.Vector3,
  direction: THREE.Vector3,
  obstacles: THREE.Vector3[],
  minClearance: number
): number {
  if (obstacles.length === 0) return 0;

  const dir = direction.clone().normalize();
  let nearestBlockage = Infinity;

  for (const obs of obstacles) {
    const toObs = obs.clone().sub(position);

    // Project obstacle onto direction
    const projection = toObs.dot(dir);

    if (projection > 0) {
      // Obstacle is in the direction we're checking
      const perpendicular = toObs.clone().sub(dir.clone().multiplyScalar(projection));
      const perpDist = perpendicular.length();

      // Use a reasonable obstacle radius (0.5m default)
      const obstacleRadius = 0.5;

      if (perpDist < obstacleRadius) {
        // Ray is blocked by this obstacle at distance = projection
        nearestBlockage = Math.min(nearestBlockage, Math.max(0, projection - obstacleRadius));
      }
    }
  }

  // Cost is the deficit: how much less clearance we have than required
  if (nearestBlockage < minClearance) {
    return (minClearance - nearestBlockage) * (minClearance - nearestBlockage);
  }
  return 0;
}

/**
 * Path obstruction cost: measures how much obstacles block a path
 * between two points.
 *
 * Algorithm:
 *  1. Sample points along the straight-line path from `from` to `to`
 *  2. At each sample point, check if any obstacle is within radius
 *  3. Cost = sum of obstruction penalties at each sample
 *
 * @param from - Start position
 * @param to - End position
 * @param obstacles - Array of obstacle positions
 * @param obstacleRadius - Effective radius of each obstacle
 * @returns Obstruction cost. 0 = clear path.
 */
export function path_obstruction_cost(
  from: THREE.Vector3,
  to: THREE.Vector3,
  obstacles: THREE.Vector3[],
  obstacleRadius: number
): number {
  if (obstacles.length === 0) return 0;

  const pathLength = from.distanceTo(to);
  if (pathLength < 1e-6) return 0;

  const direction = to.clone().sub(from).normalize();
  const numSamples = Math.max(4, Math.ceil(pathLength / 0.5)); // Sample every 0.5m

  let totalCost = 0;

  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const samplePoint = from.clone().lerp(to, t);

    // Check distance to each obstacle at this sample point
    for (const obs of obstacles) {
      const dist = samplePoint.distanceTo(obs);
      if (dist < obstacleRadius) {
        // Obstacle overlaps the path at this point
        const penetration = obstacleRadius - dist;
        totalCost += penetration * penetration;
      }
    }
  }

  // Normalize by number of samples for consistent scaling
  return totalCost / (numSamples + 1);
}

// ============================================================================
// BVH-Enhanced Cost Functions
// ============================================================================

/**
 * BVH-raycasting based accessibility cost.
 *
 * Uses actual BVH raycasting against mesh obstacles instead of
 * point-based approximations. Casts rays from sample directions on a sphere
 * around the position and checks for actual mesh intersections within
 * the clearance distance.
 *
 * This provides significantly more accurate accessibility measurements
 * than the point-based `accessibility_cost`, especially for objects with
 * non-convex or irregular shapes.
 *
 * @param position - The position to evaluate
 * @param obstacleObjects - Array of THREE.Object3D obstacles with mesh geometry
 * @param engine - BVHQueryEngine instance (uses default if not provided)
 * @param clearanceDistance - Minimum clearance distance (default 1.5)
 * @returns Cost in [0, ∞). 0 = fully accessible, higher = more blocked
 */
export function accessibility_cost_bvh(
  position: THREE.Vector3,
  obstacleObjects: THREE.Object3D[],
  engine?: BVHQueryEngine,
  clearanceDistance: number = 1.5
): number {
  if (obstacleObjects.length === 0) return 0;

  const bvhEngine = engine ?? getDefaultBVHEngine();

  // Sample directions on a sphere (using Fibonacci sphere for uniform coverage)
  const numDirections = 16;
  let blockedCount = 0;

  const goldenRatio = (1 + Math.sqrt(5)) / 2;

  for (let i = 0; i < numDirections; i++) {
    const theta = 2 * Math.PI * i / goldenRatio;
    const phi = Math.acos(1 - 2 * (i + 0.5) / numDirections);

    const dir = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi)
    ).normalize();

    // Use BVH raycasting to check for obstacles in this direction
    const hits = bvhEngine.raycast(position, dir, clearanceDistance, obstacleObjects);

    if (hits.length > 0 && hits[0].distance < clearanceDistance) {
      blockedCount++;
    }
  }

  // Cost is proportional to fraction of blocked directions
  return (blockedCount / numDirections) * 10; // Scale factor for penalty
}

/**
 * BVH-raycasting based clearance cost.
 *
 * Uses actual BVH raycasting to measure how much clearance exists in a
 * given direction from a position. More accurate than the point-based
 * `clearance_cost` because it uses actual mesh geometry for intersection
 * tests instead of approximating obstacles as spheres.
 *
 * @param position - The position to evaluate
 * @param direction - Direction to check clearance (must be normalized)
 * @param obstacleObjects - Array of THREE.Object3D obstacles with mesh geometry
 * @param minClearance - Minimum required clearance distance
 * @param engine - BVHQueryEngine instance (uses default if not provided)
 * @returns Cost for insufficient clearance. 0 = enough clearance.
 */
export function clearance_cost_bvh(
  position: THREE.Vector3,
  direction: THREE.Vector3,
  obstacleObjects: THREE.Object3D[],
  minClearance: number,
  engine?: BVHQueryEngine
): number {
  if (obstacleObjects.length === 0) return 0;

  const bvhEngine = engine ?? getDefaultBVHEngine();
  const dir = direction.clone().normalize();

  // Cast a ray in the given direction
  const hits = bvhEngine.raycast(position, dir, minClearance * 2, obstacleObjects);

  if (hits.length === 0) return 0; // No obstacles found — full clearance

  // Find the nearest hit
  const nearestHit = hits[0];
  const clearanceDist = nearestHit.distance;

  // Cost is the deficit: how much less clearance we have than required
  if (clearanceDist < minClearance) {
    const deficit = minClearance - clearanceDist;
    return deficit * deficit;
  }

  return 0;
}

/**
 * BVH-raycasting based path obstruction cost.
 *
 * Uses actual BVH raycasting along the path between two points
 * instead of sampling point-to-obstacle distances. This produces
 * more accurate obstruction measurements, especially for paths
 * that pass near but don't intersect obstacle bounding spheres.
 *
 * Algorithm:
 *  1. Cast rays along the path from `from` to `to`
 *  2. For each ray segment, check for intersections with obstacle meshes
 *  3. Cost = sum of penetration penalties weighted by obstruction severity
 *
 * @param from - Start position
 * @param to - End position
 * @param obstacleObjects - Array of THREE.Object3D obstacles with mesh geometry
 * @param engine - BVHQueryEngine instance (uses default if not provided)
 * @param segmentLength - Length of each ray segment for sampling (default 0.5)
 * @returns Obstruction cost. 0 = clear path.
 */
export function path_obstruction_cost_bvh(
  from: THREE.Vector3,
  to: THREE.Vector3,
  obstacleObjects: THREE.Object3D[],
  engine?: BVHQueryEngine,
  segmentLength: number = 0.5
): number {
  if (obstacleObjects.length === 0) return 0;

  const pathLength = from.distanceTo(to);
  if (pathLength < 1e-6) return 0;

  const bvhEngine = engine ?? getDefaultBVHEngine();
  const pathDirection = to.clone().sub(from).normalize();
  const numSegments = Math.max(2, Math.ceil(pathLength / segmentLength));

  let totalCost = 0;

  for (let i = 0; i <= numSegments; i++) {
    const t = i / numSegments;
    const segmentStart = from.clone().lerp(to, t);

    // Cast a ray from this segment point toward the destination
    // This checks if any obstacle blocks the path from this point forward
    const remainingDist = pathLength * (1 - t);
    const hits = bvhEngine.raycast(
      segmentStart,
      pathDirection,
      Math.min(segmentLength, remainingDist),
      obstacleObjects
    );

    if (hits.length > 0) {
      // Obstacle found along the path at this segment
      for (const hit of hits) {
        // Penalty proportional to how close the hit is to the path center
        // and how close it is to the segment start
        const proximity = 1.0 - (hit.distance / segmentLength);
        totalCost += proximity * proximity;
      }
    }
  }

  // Normalize by number of segments for consistent scaling
  return totalCost / (numSegments + 1);
}
