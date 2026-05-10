/**
 * Footprint Computer — Compute 2D footprints from 3D meshes
 *
 * Gap 9 Fix: Uses the geometry-2d.ts Polygon2D class to compute
 * convex hull footprints from THREE.Mesh objects.
 *
 * The footprint is the convex hull of the mesh vertices projected
 * onto the XZ plane (Y is up).
 */

import * as THREE from 'three';
import { Polygon2D as GeoPolygon2D, Point2D } from '../geometry-2d';
import { Polygon2D as UnifiedPolygon2D } from '../unified/UnifiedConstraintSystem';

// ============================================================================
// computeFootprint
// ============================================================================

/**
 * Compute the 2D footprint of a mesh by projecting vertices onto the XZ plane
 * and computing the convex hull.
 *
 * @param mesh The THREE.Mesh to compute a footprint for
 * @param simplify If true, simplify the hull to at most maxVertices vertices
 * @param maxVertices Maximum number of vertices in the simplified hull (default 8)
 * @returns A Polygon2D (from geometry-2d.ts) representing the footprint
 */
export function computeFootprint(
  mesh: THREE.Mesh,
  simplify: boolean = true,
  maxVertices: number = 8
): GeoPolygon2D {
  const projected = projectVerticesToXZ(mesh);

  if (projected.length < 3) {
    // Fallback: use bounding box
    const box = new THREE.Box3().setFromObject(mesh);
    return GeoPolygon2D.fromBoundingBox(box);
  }

  // Compute convex hull
  const hull = convexHull(projected);

  if (simplify && hull.length > maxVertices) {
    const simplified = simplifyPolygon(hull, maxVertices);
    return new GeoPolygon2D(simplified);
  }

  return new GeoPolygon2D(hull);
}

/**
 * Compute the 2D footprint and return it as a unified system Polygon2D.
 * This is the primary API for the constraint system.
 */
export function computeFootprintUnified(
  mesh: THREE.Mesh,
  simplify: boolean = true,
  maxVertices: number = 8
): UnifiedPolygon2D {
  const geoFootprint = computeFootprint(mesh, simplify, maxVertices);
  // Convert from geometry-2d Point2D to unified THREE.Vector2
  const vertices = geoFootprint.vertices.map(
    p => new THREE.Vector2(p.x, p.y)
  );
  return new UnifiedPolygon2D(vertices);
}

/**
 * Compute a footprint from a bounding box (fallback when no mesh geometry available).
 */
export function footprintFromBoundingBox(box: THREE.Box3): UnifiedPolygon2D {
  return UnifiedPolygon2D.fromBoundingBox(box);
}

// ============================================================================
// Vertex Projection
// ============================================================================

/**
 * Project all vertices of a mesh onto the XZ plane.
 */
function projectVerticesToXZ(mesh: THREE.Mesh): Point2D[] {
  const points: Point2D[] = [];
  const position = mesh.geometry.attributes.position;
  const matrixWorld = mesh.matrixWorld;

  const vertex = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    vertex.applyMatrix4(matrixWorld);

    points.push(new Point2D(vertex.x, vertex.z));
  }

  return points;
}

// ============================================================================
// Convex Hull — Andrew's Monotone Chain Algorithm
// ============================================================================

/**
 * Compute the convex hull of a set of 2D points.
 * Returns vertices in counter-clockwise order.
 */
function convexHull(points: Point2D[]): Point2D[] {
  if (points.length < 3) return points.map(p => p.clone());

  // Sort lexicographically
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);

  // Remove duplicates
  const unique: Point2D[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].x - unique[unique.length - 1].x) > 1e-10 ||
        Math.abs(sorted[i].y - unique[unique.length - 1].y) > 1e-10) {
      unique.push(sorted[i]);
    }
  }

  if (unique.length < 3) return unique;

  // Build lower hull
  const lower: Point2D[] = [];
  for (const p of unique) {
    while (lower.length >= 2 && cross2D(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // Build upper hull
  const upper: Point2D[] = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i];
    while (upper.length >= 2 && cross2D(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  // Remove last point of each half (it's repeated)
  lower.pop();
  upper.pop();

  return [...lower, ...upper];
}

function cross2D(o: Point2D, a: Point2D, b: Point2D): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

// ============================================================================
// Polygon Simplification — Douglas-Peucker variant
// ============================================================================

/**
 * Simplify a convex polygon to approximately maxVertices vertices.
 * Removes the least significant edges (shortest edges are collapsed first).
 */
function simplifyPolygon(vertices: Point2D[], maxVertices: number): Point2D[] {
  if (vertices.length <= maxVertices) return vertices;

  // For convex polygons: iteratively remove the vertex that creates
  // the smallest area change
  let current = [...vertices];

  while (current.length > maxVertices) {
    let minAreaChange = Infinity;
    let minIdx = 0;

    for (let i = 0; i < current.length; i++) {
      const prev = current[(i - 1 + current.length) % current.length];
      const curr = current[i];
      const next = current[(i + 1) % current.length];

      // Area of triangle formed by prev-curr-next
      const areaChange = Math.abs(
        (curr.x - prev.x) * (next.y - prev.y) -
        (next.x - prev.x) * (curr.y - prev.y)
      ) / 2;

      if (areaChange < minAreaChange) {
        minAreaChange = areaChange;
        minIdx = i;
      }
    }

    current.splice(minIdx, 1);
  }

  return current;
}
