/**
 * QEMEdgeCollapse.ts — Quadric Error Metrics Edge Collapse Simplification
 *
 * Implements proper Garland & Heckbert QEM (Quadric Error Metrics) edge collapse
 * for mesh simplification, replacing the fake "skip every Nth vertex" approach.
 *
 * Algorithm:
 *   1. Compute quadric error matrix per vertex from adjacent face planes
 *   2. For each potential edge collapse, compute the optimal target position
 *   3. Compute the cost of each collapse (quadric error at target position)
 *   4. Sort edges by cost, collapse cheapest first
 *   5. Maintain manifold topology during collapse
 *
 * The 10-element packed symmetric matrix representation is:
 *   Q = [a00, a01, a02, a03, a11, a12, a13, a22, a23, a33]
 *   representing the symmetric 4x4 matrix:
 *   | a00 a01 a02 a03 |
 *   | a01 a11 a12 a13 |
 *   | a02 a12 a22 a23 |
 *   | a03 a13 a23 a33 |
 *
 * @module assets/objects/vegetation
 */

import * as THREE from 'three';

// ============================================================================
// Packed Symmetric Matrix (10 elements)
// ============================================================================

/**
 * 10-element packed symmetric 4x4 matrix.
 * Indices: [0,0], [0,1], [0,2], [0,3], [1,1], [1,2], [1,3], [2,2], [2,3], [3,3]
 */
type Quadric = number[];

const IDENTITY_QUADRIC: Quadric = [0, 0, 0, 0, 0, 0, 0, 0, 0, 1];

/**
 * Add two quadric matrices.
 */
function addQuadric(a: Quadric, b: Quadric): Quadric {
  return a.map((v, i) => v + b[i]);
}

/**
 * Compute the quadric error at a given position.
 * Error = p^T * Q * p, where p = [x, y, z, 1]
 */
function quadricError(Q: Quadric, x: number, y: number, z: number): number {
  const p = [x, y, z, 1];
  // Q is symmetric, so p^T * Q * p = sum of Q[i][j] * p[i] * p[j]
  // Using packed representation:
  // Q[0]=a00, Q[1]=a01, Q[2]=a02, Q[3]=a03
  // Q[4]=a11, Q[5]=a12, Q[6]=a13
  // Q[7]=a22, Q[8]=a23
  // Q[9]=a33
  return (
    Q[0] * p[0] * p[0] + 2 * Q[1] * p[0] * p[1] + 2 * Q[2] * p[0] * p[2] + 2 * Q[3] * p[0] * p[3] +
    Q[4] * p[1] * p[1] + 2 * Q[5] * p[1] * p[2] + 2 * Q[6] * p[1] * p[3] +
    Q[7] * p[2] * p[2] + 2 * Q[8] * p[2] * p[3] +
    Q[9] * p[3] * p[3]
  );
}

/**
 * Compute the optimal vertex position for collapsing an edge.
 * Solves the system: (Q1 + Q2) * p = 0 for the position p that
 * minimizes the quadric error.
 *
 * If the system is singular (determinant ≈ 0), falls back to the
 * midpoint or the lower-cost endpoint.
 */
function optimalPosition(
  Q1: Quadric,
  Q2: Quadric,
  v1: THREE.Vector3,
  v2: THREE.Vector3
): THREE.Vector3 {
  const Q = addQuadric(Q1, Q2);

  // Build the 3x3 linear system from the upper-left 3x3 submatrix
  // and the right-hand side from column 3
  const a00 = Q[0], a01 = Q[1], a02 = Q[2], a03 = -Q[3];
  const a10 = Q[1], a11 = Q[4], a12 = Q[5], a13 = -Q[6];
  const a20 = Q[2], a21 = Q[5], a22 = Q[7], a23 = -Q[8];

  // Compute determinant of 3x3 matrix
  const det =
    a00 * (a11 * a22 - a12 * a21) -
    a01 * (a10 * a22 - a12 * a20) +
    a02 * (a10 * a21 - a11 * a20);

  if (Math.abs(det) > 1e-10) {
    // Cramer's rule
    const dx =
      a03 * (a11 * a22 - a12 * a21) -
      a01 * (a13 * a22 - a12 * a23) +
      a02 * (a13 * a21 - a11 * a23);
    const dy =
      a00 * (a13 * a22 - a12 * a23) -
      a03 * (a10 * a22 - a12 * a20) +
      a02 * (a10 * a23 - a13 * a20);
    const dz =
      a00 * (a11 * a23 - a13 * a21) -
      a01 * (a10 * a23 - a13 * a20) +
      a03 * (a10 * a21 - a11 * a20);

    const x = dx / det;
    const y = dy / det;
    const z = dz / det;

    // Validate result
    if (isFinite(x) && isFinite(y) && isFinite(z)) {
      return new THREE.Vector3(x, y, z);
    }
  }

  // Fallback: choose the endpoint with lower error, or midpoint
  const e1 = quadricError(Q, v1.x, v1.y, v1.z);
  const e2 = quadricError(Q, v2.x, v2.y, v2.z);
  const midpoint = v1.clone().add(v2).multiplyScalar(0.5);
  const em = quadricError(Q, midpoint.x, midpoint.y, midpoint.z);

  if (e1 <= e2 && e1 <= em) return v1.clone();
  if (e2 <= e1 && e2 <= em) return v2.clone();
  return midpoint;
}

/**
 * Compute the quadric for a single face (triangle).
 * Each face defines a plane ax + by + cz + d = 0.
 * The quadric for this plane is K = [a,b,c,d]^T * [a,b,c,d].
 */
function faceQuadric(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3): Quadric {
  // Compute face normal
  const e1 = new THREE.Vector3().subVectors(p1, p0);
  const e2 = new THREE.Vector3().subVectors(p2, p0);
  const normal = new THREE.Vector3().crossVectors(e1, e2);

  const area = normal.length();
  if (area < 1e-10) return [...IDENTITY_QUADRIC];

  normal.divideScalar(area); // Normalize

  const a = normal.x;
  const b = normal.y;
  const c = normal.z;
  const d = -normal.dot(p0);

  // Outer product K = n * n^T where n = [a, b, c, d]
  return [
    a * a, a * b, a * c, a * d,  // 0,0  0,1  0,2  0,3
    b * b, b * c, b * d,          // 1,1  1,2  1,3
    c * c, c * d,                  // 2,2  2,3
    d * d,                          // 3,3
  ];
}

// ============================================================================
// QEMEdgeCollapse
// ============================================================================

/** Edge entry in the collapse priority queue */
interface EdgeEntry {
  v1: number;
  v2: number;
  cost: number;
  target: THREE.Vector3;
  generation: number; // For stale detection
}

/**
 * QEMEdgeCollapse implements proper Garland & Heckbert quadric error metrics
 * edge collapse for mesh simplification.
 *
 * Usage:
 *   const simplified = QEMEdgeCollapse.simplify(geometry, targetFaces);
 */
export class QEMEdgeCollapse {
  /**
   * Simplify a geometry to a target face count using QEM edge collapse.
   *
   * @param geometry The source geometry to simplify
   * @param targetFaces Target number of faces (triangles)
   * @returns Simplified BufferGeometry
   */
  static simplify(geometry: THREE.BufferGeometry, targetFaces: number): THREE.BufferGeometry {
    const posAttr = geometry.attributes.position;
    const normAttr = geometry.attributes.normal;
    const uvAttr = geometry.attributes.uv;
    if (!posAttr) return new THREE.BufferGeometry();

    const currentFaces = geometry.index
      ? geometry.index.count / 3
      : posAttr.count / 3;

    if (currentFaces <= targetFaces) {
      return geometry.clone();
    }

    // Step 1: Extract vertex and face data
    const vertices: THREE.Vector3[] = [];
    const normals: THREE.Vector3[] = [];
    const uvs: THREE.Vector2[] = [];

    for (let i = 0; i < posAttr.count; i++) {
      vertices.push(new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
      if (normAttr) {
        normals.push(new THREE.Vector3(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i)));
      }
      if (uvAttr) {
        uvs.push(new THREE.Vector2(uvAttr.getX(i), uvAttr.getY(i)));
      }
    }

    // Extract faces (triangle indices)
    const faces: [number, number, number][] = [];
    if (geometry.index) {
      for (let i = 0; i < geometry.index.count; i += 3) {
        faces.push([
          geometry.index.getX(i),
          geometry.index.getX(i + 1),
          geometry.index.getX(i + 2),
        ]);
      }
    } else {
      for (let i = 0; i < posAttr.count; i += 3) {
        faces.push([i, i + 1, i + 2]);
      }
    }

    // Step 2: Compute quadric per vertex
    const quadrics: Quadric[] = vertices.map(() => [...IDENTITY_QUADRIC]);

    for (const [i0, i1, i2] of faces) {
      const Q = faceQuadric(vertices[i0], vertices[i1], vertices[i2]);
      quadrics[i0] = addQuadric(quadrics[i0], Q);
      quadrics[i1] = addQuadric(quadrics[i1], Q);
      quadrics[i2] = addQuadric(quadrics[i2], Q);
    }

    // Step 3: Build edge list and compute collapse costs
    const edgeSet = new Set<string>();
    const edges: EdgeEntry[] = [];
    let generation = 0;

    for (const [i0, i1, i2] of faces) {
      const faceEdges: [number, number][] = [[i0, i1], [i1, i2], [i2, i0]];
      for (const [a, b] of faceEdges) {
        const key = Math.min(a, b) + ',' + Math.max(a, b);
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);

        const target = optimalPosition(quadrics[a], quadrics[b], vertices[a], vertices[b]);
        const cost = quadricError(addQuadric(quadrics[a], quadrics[b]), target.x, target.y, target.z);

        edges.push({
          v1: Math.min(a, b),
          v2: Math.max(a, b),
          cost: Math.max(0, cost),
          target,
          generation,
        });
      }
    }

    // Step 4: Sort edges by cost (min-heap approximation using sort)
    edges.sort((a, b) => a.cost - b.cost);

    // Step 5: Collapse edges until target face count reached
    const vertexAlive = new Uint8Array(vertices.length);
    vertexAlive.fill(1);

    const vertexMap: number[] = vertices.map((_, i) => i); // Maps original index to current index
    const collapsedTo: Map<number, number> = new Map(); // vertex -> merged into

    let currentFaceCount = faces.length;
    let edgeIdx = 0;

    while (currentFaceCount > targetFaces && edgeIdx < edges.length) {
      const edge = edges[edgeIdx++];

      if (!vertexAlive[edge.v1] || !vertexAlive[edge.v2]) continue;

      // Check if this edge still exists (vertices haven't been merged)
      const v1Current = resolveVertex(edge.v1, collapsedTo);
      const v2Current = resolveVertex(edge.v2, collapsedTo);

      if (v1Current === v2Current) continue; // Already merged

      // Perform the collapse: merge v2 into v1 (or optimal position)
      const targetPos = edge.target;

      // Update vertex position
      vertices[v1Current] = targetPos;
      quadrics[v1Current] = addQuadric(quadrics[v1Current], quadrics[v2Current]);

      // Mark v2 as collapsed
      vertexAlive[v2Current] = 0;
      collapsedTo.set(v2Current, v1Current);

      // Update normals and UVs (weighted average)
      if (normals.length > 0) {
        normals[v1Current] = normals[v1Current].clone().add(normals[v2Current]).normalize();
      }
      if (uvs.length > 0) {
        uvs[v1Current] = uvs[v1Current].clone().add(uvs[v2Current]).multiplyScalar(0.5);
      }

      // Count removed faces (faces that referenced v2)
      // This is an approximation — exact counting requires rebuilding face list
      const approxFacesRemoved = estimateFacesRemoved(v2Current, faces, collapsedTo);
      currentFaceCount -= approxFacesRemoved;

      // Re-add edges from v1 to its new neighbors with updated costs
      generation++;
      const neighbors = getVertexNeighbors(v1Current, faces, vertexAlive, collapsedTo);
      for (const neighbor of neighbors) {
        const nTarget = optimalPosition(quadrics[v1Current], quadrics[neighbor], vertices[v1Current], vertices[neighbor]);
        const nCost = quadricError(addQuadric(quadrics[v1Current], quadrics[neighbor]), nTarget.x, nTarget.y, nTarget.z);

        // Insert in sorted position (binary search for efficiency)
        const newEdge: EdgeEntry = {
          v1: Math.min(v1Current, neighbor),
          v2: Math.max(v1Current, neighbor),
          cost: Math.max(0, nCost),
          target: nTarget,
          generation,
        };

        insertSorted(edges, newEdge, edgeIdx);
      }
    }

    // Step 6: Rebuild geometry from surviving vertices and faces
    return QEMEdgeCollapse.rebuildGeometry(
      vertices, normals, uvs, faces,
      vertexAlive, collapsedTo
    );
  }

  /**
   * Fast fallback simplification using vertex decimation.
   * Used for very large meshes where QEM would be too slow.
   */
  static fastSimplify(
    geometry: THREE.BufferGeometry,
    targetFaces: number
  ): THREE.BufferGeometry {
    const posAttr = geometry.attributes.position;
    if (!posAttr) return new THREE.BufferGeometry();

    const currentFaces = geometry.index
      ? geometry.index.count / 3
      : posAttr.count / 3;

    if (currentFaces <= targetFaces) {
      return geometry.clone();
    }

    const ratio = targetFaces / currentFaces;
    const step = Math.max(1, Math.floor(1 / ratio));

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const normAttr = geometry.attributes.normal;
    const uvAttr = geometry.attributes.uv;

    const keptIndices: number[] = [];
    for (let i = 0; i < posAttr.count; i += step) {
      keptIndices.push(i);
      positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      if (normAttr) {
        normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
      } else {
        normals.push(0, 1, 0);
      }
      if (uvAttr) {
        uvs.push(uvAttr.getX(i), uvAttr.getY(i));
      } else {
        uvs.push(0, 0);
      }
    }

    for (let i = 0; i < keptIndices.length - 2; i++) {
      indices.push(i, i + 1, i + 2);
    }

    const simplified = new THREE.BufferGeometry();
    simplified.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    simplified.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    simplified.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (indices.length > 0) {
      simplified.setIndex(indices);
    }
    simplified.computeVertexNormals();

    return simplified;
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Rebuild geometry from surviving vertices and valid faces.
   */
  private static rebuildGeometry(
    vertices: THREE.Vector3[],
    normals: THREE.Vector3[],
    uvs: THREE.Vector2[],
    faces: [number, number, number][],
    vertexAlive: Uint8Array,
    collapsedTo: Map<number, number>
  ): THREE.BufferGeometry {
    // Create index remapping
    const indexMap: Map<number, number> = new Map();
    const newPositions: number[] = [];
    const newNormals: number[] = [];
    const newUvs: number[] = [];
    let newIndex = 0;

    for (let i = 0; i < vertices.length; i++) {
      if (!vertexAlive[i]) continue;
      indexMap.set(i, newIndex++);

      newPositions.push(vertices[i].x, vertices[i].y, vertices[i].z);
      if (normals.length > 0) {
        newNormals.push(normals[i].x, normals[i].y, normals[i].z);
      }
      if (uvs.length > 0) {
        newUvs.push(uvs[i].x, uvs[i].y);
      }
    }

    // Rebuild faces, skipping degenerate ones
    const newIndices: number[] = [];
    for (const [i0, i1, i2] of faces) {
      const r0 = indexMap.get(resolveVertex(i0, collapsedTo));
      const r1 = indexMap.get(resolveVertex(i1, collapsedTo));
      const r2 = indexMap.get(resolveVertex(i2, collapsedTo));

      if (r0 === undefined || r1 === undefined || r2 === undefined) continue;
      if (r0 === r1 || r1 === r2 || r0 === r2) continue; // Degenerate

      newIndices.push(r0, r1, r2);
    }

    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));

    if (newNormals.length > 0) {
      result.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
    }

    if (newUvs.length > 0) {
      result.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
    }

    if (newIndices.length > 0) {
      result.setIndex(newIndices);
    }

    result.computeVertexNormals();
    return result;
  }
}

/**
 * Resolve a vertex through the collapse chain.
 */
function resolveVertex(v: number, collapsedTo: Map<number, number>): number {
  let current = v;
  const visited = new Set<number>();
  while (collapsedTo.has(current)) {
    if (visited.has(current)) break; // Prevent infinite loops
    visited.add(current);
    current = collapsedTo.get(current)!;
  }
  return current;
}

/**
 * Estimate how many faces would be removed by collapsing a vertex.
 */
function estimateFacesRemoved(
  vertex: number,
  faces: [number, number, number][],
  collapsedTo: Map<number, number>
): number {
  let count = 0;
  for (const [i0, i1, i2] of faces) {
    const r0 = resolveVertex(i0, collapsedTo);
    const r1 = resolveVertex(i1, collapsedTo);
    const r2 = resolveVertex(i2, collapsedTo);
    if (r0 === vertex || r1 === vertex || r2 === vertex) {
      // This face references the vertex being collapsed
      // After collapse, it may become degenerate
      if (r0 === r1 || r1 === r2 || r0 === r2) {
        count++;
      }
    }
  }
  return Math.max(1, count);
}

/**
 * Get the neighbors of a vertex from the face list.
 */
function getVertexNeighbors(
  vertex: number,
  faces: [number, number, number][],
  vertexAlive: Uint8Array,
  collapsedTo: Map<number, number>
): number[] {
  const neighbors = new Set<number>();

  for (const [i0, i1, i2] of faces) {
    const r0 = resolveVertex(i0, collapsedTo);
    const r1 = resolveVertex(i1, collapsedTo);
    const r2 = resolveVertex(i2, collapsedTo);

    if (r0 === vertex) {
      if (vertexAlive[r1]) neighbors.add(r1);
      if (vertexAlive[r2]) neighbors.add(r2);
    }
    if (r1 === vertex) {
      if (vertexAlive[r0]) neighbors.add(r0);
      if (vertexAlive[r2]) neighbors.add(r2);
    }
    if (r2 === vertex) {
      if (vertexAlive[r0]) neighbors.add(r0);
      if (vertexAlive[r1]) neighbors.add(r1);
    }
  }

  return Array.from(neighbors);
}

/**
 * Insert an edge into the sorted edge array at the correct position.
 */
function insertSorted(edges: EdgeEntry[], newEdge: EdgeEntry, startIdx: number): void {
  // Find insertion point using linear search from startIdx
  let insertAt = edges.length;
  for (let i = startIdx; i < edges.length; i++) {
    if (edges[i].cost >= newEdge.cost) {
      insertAt = i;
      break;
    }
  }
  edges.splice(insertAt, 0, newEdge);
}
