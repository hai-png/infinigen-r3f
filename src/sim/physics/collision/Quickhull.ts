/**
 * Quickhull Convex Hull Algorithm
 *
 * Computes the convex hull of a set of 3D points using the Quickhull algorithm.
 * Used by the physics system to create proper convex hull colliders from
 * arbitrary mesh geometry, replacing box approximations.
 *
 * Also provides support functions for GJK collision detection.
 *
 * References:
 *   - Barber, Dobkin, Huhdanpaa, "The Quickhull Algorithm for Convex Hulls" (1996)
 *   - Ericson, "Real-Time Collision Detection", Chapter 4
 *
 * @module Quickhull
 */

import * as THREE from 'three';

// ============================================================================
// Public Types
// ============================================================================

/** A triangular face on the convex hull. */
export interface HullFace {
  /** Vertex indices (CCW when viewed from outside the hull). */
  indices: [number, number, number];
  /** Outward-pointing unit normal. */
  normal: THREE.Vector3;
  /** Indices of input points that lie outside this face. */
  outsideSet: number[];
  /** Index of the point in outsideSet furthest from the face, or null. */
  furthestPoint: number | null;
  /** Signed distance of furthestPoint from the face plane (positive = outside). */
  furthestDistance: number;
}

/** A unique directed edge on the hull. */
export interface HullEdge {
  from: number;
  to: number;
}

/** Result of the convex hull computation. */
export interface QuickhullResult {
  /** Vertices of the hull (subset of the input). */
  vertices: THREE.Vector3[];
  /** Triangular faces of the hull. */
  faces: HullFace[];
  /** Unique undirected edges of the hull. */
  edges: HullEdge[];
  /** Number of hull vertices. */
  vertexCount: number;
  /** Number of hull faces. */
  faceCount: number;
}

// ============================================================================
// Internal Types
// ============================================================================

/** Internal face representation used during construction. */
interface InternalFace {
  indices: [number, number, number];
  normal: THREE.Vector3;
  outsideSet: number[];
  furthestPoint: number | null;
  furthestDistance: number;
  /** Signed distance from the origin to the face plane (normal · vertex). */
  offset: number;
}

/** An edge on the horizon between visible and hidden faces. */
interface HorizonEdge {
  from: number;
  to: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TOLERANCE = 1e-6;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Compute the signed distance from a point to the plane defined by the face.
 * Positive means the point is on the side the normal points to (outside).
 */
function signedDistanceToFace(point: THREE.Vector3, face: InternalFace): number {
  return point.dot(face.normal) - face.offset;
}

/**
 * Compute the outward normal of a triangle and ensure it points away from
 * the given interior point.
 *
 * @param a,b,c Triangle vertices (in that order).
 * @param interior A point known to be on the interior side of the face.
 * @returns The outward unit normal.
 */
function computeOutwardNormal(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  interior: THREE.Vector3
): THREE.Vector3 {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  const normal = new THREE.Vector3().crossVectors(ab, ac);
  const len = normal.length();

  if (len < 1e-12) {
    // Degenerate triangle — return an arbitrary normal, caller must handle
    return new THREE.Vector3(0, 1, 0);
  }

  normal.divideScalar(len);

  // Ensure the normal points away from the interior point
  const toInterior = new THREE.Vector3().subVectors(interior, a);
  if (normal.dot(toInterior) > 0) {
    normal.negate();
  }

  return normal;
}

/**
 * Update the outside set, furthest point, and furthest distance for a face.
 */
function updateOutsideSet(
  face: InternalFace,
  points: THREE.Vector3[],
  candidateIndices: number[],
  tolerance: number
): void {
  face.outsideSet = [];
  face.furthestPoint = null;
  face.furthestDistance = 0;

  for (const idx of candidateIndices) {
    const dist = signedDistanceToFace(points[idx], face);
    if (dist > tolerance) {
      face.outsideSet.push(idx);
      if (dist > face.furthestDistance) {
        face.furthestDistance = dist;
        face.furthestPoint = idx;
      }
    }
  }
}

/**
 * Create an InternalFace from three vertex indices, ensuring outward normal.
 */
function createFace(
  indices: [number, number, number],
  points: THREE.Vector3[],
  interior: THREE.Vector3
): InternalFace {
  const normal = computeOutwardNormal(
    points[indices[0]],
    points[indices[1]],
    points[indices[2]],
    interior
  );
  const offset = points[indices[0]].dot(normal);

  return {
    indices,
    normal,
    outsideSet: [],
    furthestPoint: null,
    furthestDistance: 0,
    offset,
  };
}

/**
 * Find the index of the point with the maximum value along the given axis.
 * @param points Array of points
 * @param axis 0=x, 1=y, 2=z
 */
function findExtreme(points: THREE.Vector3[], axis: number): number {
  let bestIdx = 0;
  let bestVal = points[0].getComponent(axis);
  for (let i = 1; i < points.length; i++) {
    const val = points[i].getComponent(axis);
    if (val > bestVal) {
      bestVal = val;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Find the index of the point with the minimum value along the given axis.
 */
function findMinExtreme(points: THREE.Vector3[], axis: number): number {
  let bestIdx = 0;
  let bestVal = points[0].getComponent(axis);
  for (let i = 1; i < points.length; i++) {
    const val = points[i].getComponent(axis);
    if (val < bestVal) {
      bestVal = val;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Find the point farthest from the line segment between a and b.
 */
function findFarthestFromLine(
  points: THREE.Vector3[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  exclude: Set<number>
): number {
  const ab = new THREE.Vector3().subVectors(b, a);
  const abLenSq = ab.lengthSq();

  let bestIdx = -1;
  let bestDist = -1;

  for (let i = 0; i < points.length; i++) {
    if (exclude.has(i)) continue;
    const ap = new THREE.Vector3().subVectors(points[i], a);

    // Distance from point to line = |ap - (ap·ab/|ab|²) * ab|
    let distSq: number;
    if (abLenSq < 1e-12) {
      // Degenerate line — just use distance from a
      distSq = ap.lengthSq();
    } else {
      const t = ap.dot(ab) / abLenSq;
      const projection = new THREE.Vector3().copy(ab).multiplyScalar(t);
      const perpendicular = new THREE.Vector3().subVectors(ap, projection);
      distSq = perpendicular.lengthSq();
    }

    if (distSq > bestDist) {
      bestDist = distSq;
      bestIdx = i;
    }
  }

  return bestIdx;
}

/**
 * Find the point farthest from the plane defined by three points, on the side
 * the normal points to (the "outside" relative to the interior point).
 */
function findFarthestFromPlane(
  points: THREE.Vector3[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  interior: THREE.Vector3,
  exclude: Set<number>,
  tolerance: number
): number {
  const normal = computeOutwardNormal(a, b, c, interior);
  const offset = a.dot(normal);

  let bestIdx = -1;
  let bestDist = tolerance; // Must be strictly outside

  for (let i = 0; i < points.length; i++) {
    if (exclude.has(i)) continue;
    const dist = points[i].dot(normal) - offset;
    if (dist > bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  return bestIdx;
}

/**
 * Find the point with the largest absolute distance from the plane defined
 * by three points, regardless of which side. Used for initial simplex
 * construction where we don't yet know which side is "outside."
 *
 * @returns { index, signedDist } where signedDist is positive if on the
 *          normal side, negative if on the other side. index is -1 if
 *          no point is farther than tolerance from the plane.
 */
function findFarthestAbsFromPlane(
  points: THREE.Vector3[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  exclude: Set<number>,
  tolerance: number
): { index: number; signedDist: number } {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  const normal = new THREE.Vector3().crossVectors(ab, ac);
  const len = normal.length();

  if (len < 1e-12) {
    return { index: -1, signedDist: 0 };
  }

  normal.divideScalar(len);
  const offset = a.dot(normal);

  let bestIdx = -1;
  let bestAbsDist = tolerance;

  for (let i = 0; i < points.length; i++) {
    if (exclude.has(i)) continue;
    const dist = points[i].dot(normal) - offset;
    const absDist = Math.abs(dist);
    if (absDist > bestAbsDist) {
      bestAbsDist = absDist;
      bestIdx = i;
      // Store the actual signed distance so caller knows which side
    }
  }

  if (bestIdx < 0) {
    return { index: -1, signedDist: 0 };
  }

  const signedDist = points[bestIdx].dot(normal) - offset;
  return { index: bestIdx, signedDist };
}

/**
 * Collect unique edges from a set of faces.
 */
function collectEdges(faces: InternalFace[]): HullEdge[] {
  const edgeSet = new Set<string>();
  const edges: HullEdge[] = [];

  for (const face of faces) {
    const [a, b, c] = face.indices;
    const pairs = [
      [Math.min(a, b), Math.max(a, b)],
      [Math.min(b, c), Math.max(b, c)],
      [Math.min(c, a), Math.max(c, a)],
    ];
    for (const [from, to] of pairs) {
      const key = `${from}:${to}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ from, to });
      }
    }
  }

  return edges;
}

// ============================================================================
// Initial Simplex Construction
// ============================================================================

/**
 * Build the initial tetrahedron (simplex) from the point cloud.
 * Finds four non-degenerate points: two extremes along the most spread axis,
 * then the point farthest from the line between them, then the point farthest
 * from the resulting triangle plane.
 *
 * @returns An array of 4 point indices, or fewer if the input is degenerate.
 */
function buildInitialSimplex(
  points: THREE.Vector3[],
  tolerance: number
): number[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [0];
  if (points.length === 2) return [0, 1];

  // Find extreme points along each axis
  const maxXIdx = findExtreme(points, 0);
  const minXIdx = findMinExtreme(points, 0);
  const maxYIdx = findExtreme(points, 1);
  const minYIdx = findMinExtreme(points, 1);
  const maxZIdx = findExtreme(points, 2);
  const minZIdx = findMinExtreme(points, 2);

  // Find the pair of extremes that are farthest apart
  const candidates = [
    [minXIdx, maxXIdx],
    [minYIdx, maxYIdx],
    [minZIdx, maxZIdx],
  ];

  let bestPair = candidates[0];
  let bestDist = points[candidates[0][0]].distanceTo(points[candidates[0][1]]);

  for (let i = 1; i < candidates.length; i++) {
    const d = points[candidates[i][0]].distanceTo(points[candidates[i][1]]);
    if (d > bestDist) {
      bestDist = d;
      bestPair = candidates[i];
    }
  }

  const [i0, i1] = bestPair;
  const excludeLine = new Set<number>([i0, i1]);

  // Find the point farthest from the line i0→i1
  const i2 = findFarthestFromLine(points, points[i0], points[i1], excludeLine);

  if (i2 < 0) {
    // All points are collinear
    return [i0, i1];
  }

  // Find the point farthest from the plane of i0, i1, i2 (either side).
  // We use findFarthestAbsFromPlane because we don't yet know which side
  // is "outside" — we just need any point not coplanar with the triangle.
  const excludePlane = new Set<number>([i0, i1, i2]);
  const planeResult = findFarthestAbsFromPlane(
    points,
    points[i0],
    points[i1],
    points[i2],
    excludePlane,
    tolerance
  );

  if (planeResult.index < 0) {
    // All points are coplanar
    return [i0, i1, i2];
  }

  return [i0, i1, i2, planeResult.index];
}

// ============================================================================
// Horizon Edge Detection
// ============================================================================

/**
 * Given the set of faces visible from an exterior point, find the horizon
 * edges — edges shared between a visible face and a hidden face.
 *
 * The horizon is the boundary of the "light cone" from the exterior point.
 * The returned edges are oriented so that the visible face is on the left
 * when walking along the edge from `from` to `to`.
 *
 * @param visibleFaces Indices into the faces array of visible faces.
 * @param faces The full array of faces.
 * @returns Array of oriented horizon edges.
 */
function findHorizonEdges(
  visibleFaces: Set<number>,
  faces: InternalFace[]
): HorizonEdge[] {
  const horizon: HorizonEdge[] = [];

  for (const fi of visibleFaces) {
    const face = faces[fi];
    const [a, b, c] = face.indices;

    // Each face has 3 edges: a→b, b→c, c→a
    // An edge is on the horizon if the adjacent face sharing that edge
    // is NOT visible.
    const edges: [number, number][] = [
      [a, b],
      [b, c],
      [c, a],
    ];

    for (const [from, to] of edges) {
      // Find the adjacent face sharing this edge (reversed: to→from)
      const adjIdx = findAdjacentFace(faces, to, from, fi);
      if (adjIdx < 0 || !visibleFaces.has(adjIdx)) {
        // This edge is on the horizon
        // Orient so that from→to has the visible face on the left,
        // meaning when we create new faces from the exterior point to
        // each horizon edge, the winding is correct.
        horizon.push({ from, to });
      }
    }
  }

  return horizon;
}

/**
 * Find the face that shares the edge (edgeFrom → edgeTo) with the given face,
 * excluding the given face itself.
 *
 * In a well-formed convex hull, each edge is shared by exactly two faces,
 * and the edge appears in opposite order in the two faces.
 *
 * @returns Index of the adjacent face, or -1 if not found.
 */
function findAdjacentFace(
  faces: InternalFace[],
  edgeFrom: number,
  edgeTo: number,
  excludeFace: number
): number {
  for (let i = 0; i < faces.length; i++) {
    if (i === excludeFace) continue;
    const [a, b, c] = faces[i].indices;
    // Check if the reversed edge (to→from) appears in this face
    if (
      (a === edgeFrom && b === edgeTo) ||
      (b === edgeFrom && c === edgeTo) ||
      (c === edgeFrom && a === edgeTo)
    ) {
      return i;
    }
  }
  return -1;
}

// ============================================================================
// Main Quickhull Algorithm
// ============================================================================

/**
 * Compute the convex hull of a set of 3D points using the Quickhull algorithm.
 *
 * The algorithm works by:
 * 1. Building an initial tetrahedron from extreme points.
 * 2. Assigning all remaining points to the faces they are outside of.
 * 3. Iteratively: pick the face with the farthest outside point, find the
 *    horizon of visible faces, delete visible faces, create new faces from
 *    the point to each horizon edge, and reassign orphaned points.
 * 4. Repeat until no face has outside points.
 *
 * @param points Input point cloud (will NOT be modified).
 * @param tolerance Numerical tolerance for coplanarity tests (default 1e-6).
 * @returns QuickhullResult with hull vertices, faces, and edges.
 */
export function computeConvexHull(
  points: THREE.Vector3[],
  tolerance: number = DEFAULT_TOLERANCE
): QuickhullResult {
  // ---- Handle degenerate inputs ----
  if (points.length === 0) {
    return {
      vertices: [],
      faces: [],
      edges: [],
      vertexCount: 0,
      faceCount: 0,
    };
  }

  if (points.length === 1) {
    return {
      vertices: [points[0].clone()],
      faces: [],
      edges: [],
      vertexCount: 1,
      faceCount: 0,
    };
  }

  // Clone input points to avoid mutations
  const pts = points.map((p) => p.clone());

  // ---- Build initial simplex ----
  const simplexIndices = buildInitialSimplex(pts, tolerance);

  if (simplexIndices.length < 2) {
    // All points are the same (or very close)
    return {
      vertices: [pts[0].clone()],
      faces: [],
      edges: [],
      vertexCount: 1,
      faceCount: 0,
    };
  }

  if (simplexIndices.length === 2) {
    // Collinear case — return a line segment
    const [a, b] = simplexIndices;
    return {
      vertices: [pts[a].clone(), pts[b].clone()],
      faces: [],
      edges: [{ from: 0, to: 1 }],
      vertexCount: 2,
      faceCount: 0,
    };
  }

  if (simplexIndices.length === 3) {
    // Coplanar case — return a single triangle
    const [a, b, c] = simplexIndices;
    const normal = new THREE.Vector3()
      .crossVectors(
        new THREE.Vector3().subVectors(pts[b], pts[a]),
        new THREE.Vector3().subVectors(pts[c], pts[a])
      )
      .normalize();

    return {
      vertices: [pts[a].clone(), pts[b].clone(), pts[c].clone()],
      faces: [
        {
          indices: [0, 1, 2],
          normal,
          outsideSet: [],
          furthestPoint: null,
          furthestDistance: 0,
        },
      ],
      edges: [
        { from: 0, to: 1 },
        { from: 1, to: 2 },
        { from: 2, to: 0 },
      ],
      vertexCount: 3,
      faceCount: 1,
    };
  }

  // ---- Full 3D case: we have a non-degenerate tetrahedron ----
  const [si0, si1, si2, si3] = simplexIndices;

  // Compute the centroid of the simplex as the interior reference point
  const centroid = new THREE.Vector3()
    .add(pts[si0])
    .add(pts[si1])
    .add(pts[si2])
    .add(pts[si3])
    .divideScalar(4);

  // Build the 4 faces of the initial tetrahedron with outward normals
  const faces: InternalFace[] = [
    createFace([si0, si1, si2], pts, centroid),
    createFace([si0, si3, si1], pts, centroid),
    createFace([si0, si2, si3], pts, centroid),
    createFace([si1, si3, si2], pts, centroid),
  ];

  // Collect all input point indices that are NOT part of the simplex
  const simplexSet = new Set(simplexIndices);
  const remainingIndices: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (!simplexSet.has(i)) {
      remainingIndices.push(i);
    }
  }

  // Assign remaining points to face outside sets
  for (const face of faces) {
    updateOutsideSet(face, pts, remainingIndices, tolerance);
  }

  // ---- Main iteration ----
  const maxIterations = pts.length * 10; // Safety bound
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    // Find the face with the farthest outside point
    let bestFaceIdx = -1;
    let bestDist = 0;

    for (let i = 0; i < faces.length; i++) {
      if (faces[i].furthestPoint !== null && faces[i].furthestDistance > bestDist) {
        bestDist = faces[i].furthestDistance;
        bestFaceIdx = i;
      }
    }

    // No face has outside points — we're done
    if (bestFaceIdx < 0) break;

    const farthestIdx = faces[bestFaceIdx].furthestPoint!;
    const farthestPoint = pts[farthestIdx];

    // Find all faces visible from the farthest point
    const visibleFaces = new Set<number>();
    for (let i = 0; i < faces.length; i++) {
      const dist = signedDistanceToFace(farthestPoint, faces[i]);
      if (dist > tolerance) {
        visibleFaces.add(i);
      }
    }

    if (visibleFaces.size === 0) {
      // Numerical issue — should not happen since bestFaceIdx is visible
      // Remove the point from the face's outside set to avoid infinite loop
      faces[bestFaceIdx].outsideSet = faces[bestFaceIdx].outsideSet.filter(
        (idx) => idx !== farthestIdx
      );
      // Recompute furthest point
      faces[bestFaceIdx].furthestPoint = null;
      faces[bestFaceIdx].furthestDistance = 0;
      for (const idx of faces[bestFaceIdx].outsideSet) {
        const d = signedDistanceToFace(pts[idx], faces[bestFaceIdx]);
        if (d > faces[bestFaceIdx].furthestDistance) {
          faces[bestFaceIdx].furthestDistance = d;
          faces[bestFaceIdx].furthestPoint = idx;
        }
      }
      continue;
    }

    // Find horizon edges
    const horizon = findHorizonEdges(visibleFaces, faces);

    if (horizon.length === 0) {
      // Degenerate — remove point from all visible face outside sets
      for (const fi of visibleFaces) {
        faces[fi].outsideSet = faces[fi].outsideSet.filter(
          (idx) => idx !== farthestIdx
        );
        // Recompute furthest
        faces[fi].furthestPoint = null;
        faces[fi].furthestDistance = 0;
        for (const idx of faces[fi].outsideSet) {
          const d = signedDistanceToFace(pts[idx], faces[fi]);
          if (d > faces[fi].furthestDistance) {
            faces[fi].furthestDistance = d;
            faces[fi].furthestPoint = idx;
          }
        }
      }
      continue;
    }

    // Collect orphaned points: all outside points of visible faces
    const orphanedPoints = new Set<number>();
    for (const fi of visibleFaces) {
      for (const idx of faces[fi].outsideSet) {
        orphanedPoints.add(idx);
      }
    }
    // Remove the farthest point itself from orphans (it's now a hull vertex)
    orphanedPoints.delete(farthestIdx);

    // Remove visible faces (iterate in reverse to maintain indices)
    const visibleArray = Array.from(visibleFaces).sort((a, b) => b - a);
    for (const fi of visibleArray) {
      faces.splice(fi, 1);
    }

    // Create new faces: one for each horizon edge connected to the farthest point
    const newFaces: InternalFace[] = [];
    for (const edge of horizon) {
      // The new face is: edge.from → edge.to → farthestIdx
      // Oriented so the outward normal points away from the interior (centroid side)
      const newFace = createFace(
        [edge.from, edge.to, farthestIdx],
        pts,
        centroid
      );
      newFaces.push(newFace);
    }

    // Add the new faces to the hull
    faces.push(...newFaces);

    // Reassign orphaned points to the new faces (and any existing faces they might be outside)
    const reassignCandidates = Array.from(orphanedPoints);
    for (const newFace of newFaces) {
      updateOutsideSet(newFace, pts, reassignCandidates, tolerance);
    }

    // Also check orphaned points against existing faces (they might be outside
    // a non-visible face too, but this is rare — still, for correctness:)
    // Actually, orphaned points can only be outside new faces because they
    // were outside the old visible faces, and the new faces cover that region.
    // But due to numerical issues, some might fall on existing faces. We do
    // a quick check against all faces for any remaining orphans.
    const assignedOrphans = new Set<number>();
    for (const newFace of newFaces) {
      for (const idx of newFace.outsideSet) {
        assignedOrphans.add(idx);
      }
    }
    const unassigned = reassignCandidates.filter((idx) => !assignedOrphans.has(idx));
    if (unassigned.length > 0) {
      for (const face of faces) {
        for (const idx of unassigned) {
          if (assignedOrphans.has(idx)) continue;
          const dist = signedDistanceToFace(pts[idx], face);
          if (dist > tolerance) {
            face.outsideSet.push(idx);
            assignedOrphans.add(idx);
            if (face.furthestPoint === null || dist > face.furthestDistance) {
              face.furthestDistance = dist;
              face.furthestPoint = idx;
            }
          }
        }
      }
    }
  }

  // ---- Build result ----
  // Collect all unique vertex indices used by the hull faces
  const vertexIndexSet = new Set<number>();
  for (const face of faces) {
    vertexIndexSet.add(face.indices[0]);
    vertexIndexSet.add(face.indices[1]);
    vertexIndexSet.add(face.indices[2]);
  }

  // Create a mapping from original point indices to compact hull vertex indices
  const vertexMap = new Map<number, number>();
  const hullVertices: THREE.Vector3[] = [];
  let compactIdx = 0;
  for (const origIdx of vertexIndexSet) {
    vertexMap.set(origIdx, compactIdx);
    hullVertices.push(pts[origIdx].clone());
    compactIdx++;
  }

  // Build hull faces with remapped indices
  const hullFaces: HullFace[] = faces.map((face) => ({
    indices: [
      vertexMap.get(face.indices[0])!,
      vertexMap.get(face.indices[1])!,
      vertexMap.get(face.indices[2])!,
    ] as [number, number, number],
    normal: face.normal.clone(),
    outsideSet: [], // Not needed in final result
    furthestPoint: null,
    furthestDistance: 0,
  }));

  // Build unique edges
  const hullEdges = collectEdges(faces).map((e) => ({
    from: vertexMap.get(e.from)!,
    to: vertexMap.get(e.to)!,
  }));

  return {
    vertices: hullVertices,
    faces: hullFaces,
    edges: hullEdges,
    vertexCount: hullVertices.length,
    faceCount: hullFaces.length,
  };
}

// ============================================================================
// Support Function for GJK
// ============================================================================

/**
 * Support function for GJK collision detection: find the vertex of a convex
 * hull that is furthest along the given direction.
 *
 * This is the critical integration point with GJK.ts. The GJK algorithm
 * calls support functions to explore the Minkowski difference, and for
 * convex hull colliders this function provides the support mapping.
 *
 * Complexity: O(n) where n = number of hull vertices. For small hulls
 * this is fine; for large hulls consider precomputing a hill-climbing
 * adjacency structure.
 *
 * @param direction Search direction (does not need to be normalized).
 * @param hullVertices Array of hull vertices (from QuickhullResult.vertices).
 * @returns The vertex furthest along the given direction.
 */
export function convexHullSupport(
  direction: THREE.Vector3,
  hullVertices: THREE.Vector3[]
): THREE.Vector3 {
  if (hullVertices.length === 0) {
    return new THREE.Vector3();
  }

  if (hullVertices.length === 1) {
    return hullVertices[0].clone();
  }

  let bestIdx = 0;
  let bestDot = direction.dot(hullVertices[0]);

  for (let i = 1; i < hullVertices.length; i++) {
    const d = direction.dot(hullVertices[i]);
    if (d > bestDot) {
      bestDot = d;
      bestIdx = i;
    }
  }

  return hullVertices[bestIdx].clone();
}

/**
 * Create a GJK-compatible support function (matching the SupportFunction type
 * from GJK.ts) for a convex hull.
 *
 * Usage:
 * ```ts
 * const hull = computeConvexHull(points);
 * const supportFn = createConvexHullSupportFn(hull.vertices);
 * // Now pass supportFn to gjkIntersect()
 * ```
 *
 * @param hullVertices Array of hull vertices (from QuickhullResult.vertices).
 * @returns A support function compatible with GJK.ts.
 */
export function createConvexHullSupportFn(
  hullVertices: THREE.Vector3[]
): (direction: THREE.Vector3) => THREE.Vector3 {
  return (direction: THREE.Vector3): THREE.Vector3 => {
    return convexHullSupport(direction, hullVertices);
  };
}

// ============================================================================
// Convenience: Convex Hull from BufferGeometry
// ============================================================================

/**
 * Compute the convex hull from a THREE.BufferGeometry's position attribute.
 *
 * This is the primary convenience entry point for the physics pipeline:
 * given an arbitrary mesh, extract its position data, compute the convex
 * hull, and return the result for collider construction.
 *
 * @param geometry Input BufferGeometry (must have a position attribute).
 * @param tolerance Numerical tolerance for coplanarity tests.
 * @returns QuickhullResult with hull vertices, faces, and edges.
 */
export function computeConvexHullFromGeometry(
  geometry: THREE.BufferGeometry,
  tolerance: number = DEFAULT_TOLERANCE
): QuickhullResult {
  const positionAttr = geometry.getAttribute('position');

  if (!positionAttr) {
    return {
      vertices: [],
      faces: [],
      edges: [],
      vertexCount: 0,
      faceCount: 0,
    };
  }

  const points: THREE.Vector3[] = [];

  // Handle both interleaved and non-interleaved position attributes
  if (positionAttr instanceof THREE.InterleavedBufferAttribute) {
    for (let i = 0; i < positionAttr.count; i++) {
      points.push(
        new THREE.Vector3(
          positionAttr.getX(i),
          positionAttr.getY(i),
          positionAttr.getZ(i)
        )
      );
    }
  } else {
    const array = positionAttr.array;
    if (array instanceof Float32Array) {
      for (let i = 0; i < positionAttr.count; i++) {
        const offset = i * 3;
        points.push(
          new THREE.Vector3(array[offset], array[offset + 1], array[offset + 2])
        );
      }
    } else {
      // Generic path for other typed arrays
      for (let i = 0; i < positionAttr.count; i++) {
        points.push(
          new THREE.Vector3(
            positionAttr.getX(i),
            positionAttr.getY(i),
            positionAttr.getZ(i)
          )
        );
      }
    }
  }

  // Deduplicate vertices (important for indexed geometries)
  const uniquePoints = deduplicatePoints(points, tolerance);

  return computeConvexHull(uniquePoints, tolerance);
}

/**
 * Remove duplicate points (within tolerance) from the input array.
 * This is important for indexed geometries where many vertices may share
 * the same position.
 */
function deduplicatePoints(
  points: THREE.Vector3[],
  tolerance: number
): THREE.Vector3[] {
  if (points.length <= 1) return points;

  const tolSq = tolerance * tolerance;
  const result: THREE.Vector3[] = [points[0]];

  outer: for (let i = 1; i < points.length; i++) {
    for (let j = 0; j < result.length; j++) {
      if (points[i].distanceToSquared(result[j]) < tolSq) {
        continue outer;
      }
    }
    result.push(points[i]);
  }

  return result;
}

// ============================================================================
// Convenience: Convex Hull from Float32Array
// ============================================================================

/**
 * Compute the convex hull from a Float32Array of xyz triples.
 *
 * @param data Flat array of xyz values: [x0, y0, z0, x1, y1, z1, ...].
 * @param tolerance Numerical tolerance for coplanarity tests.
 * @returns QuickhullResult with hull vertices, faces, and edges.
 */
export function computeConvexHullFromFloat32Array(
  data: Float32Array,
  tolerance: number = DEFAULT_TOLERANCE
): QuickhullResult {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < data.length; i += 3) {
    points.push(new THREE.Vector3(data[i], data[i + 1], data[i + 2]));
  }
  return computeConvexHull(points, tolerance);
}
