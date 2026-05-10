/**
 * MeshOptimizer.ts
 * 
 * Post-processing mesh optimization including decimation, 
 * normal smoothing, and topology improvement.
 * 
 * Based on original Infinigen's mesh optimization pipeline.
 */

import { BufferGeometry, Vector3, Vector2, BufferAttribute } from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ---------------------------------------------------------------------------
// Quadric Error Metrics helpers  (Garland & Heckbert 1997)
// ---------------------------------------------------------------------------

/**
 * 4×4 symmetric matrix stored as 10-element upper-triangle array (row-major):
 *
 * Index layout:              Full matrix:
 *  [0]  [1]  [2]  [3]       m00  m01  m02  m03
 *       [4]  [5]  [6]       m01  m11  m12  m13
 *            [7]  [8]       m02  m12  m22  m23
 *                 [9]       m03  m13  m23  m33
 */
type QuadricMatrix = number[];

function createZeroQuadric(): QuadricMatrix {
  return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
}

/**
 * Build a quadric from a plane  ax + by + cz + d = 0.
 * The quadric is K = p·pᵀ where p = [a, b, c, d].
 */
function createPlaneQuadric(a: number, b: number, c: number, d: number): QuadricMatrix {
  return [
    a * a, a * b, a * c, a * d,
           b * b, b * c, b * d,
                  c * c, c * d,
                         d * d,
  ];
}

/** Element-wise addition of two quadric matrices. */
function addQuadrics(q1: QuadricMatrix, q2: QuadricMatrix): QuadricMatrix {
  return q1.map((v, i) => v + q2[i]);
}

/** Evaluate vᵀQv at position (x, y, z) with homogeneous w = 1. */
function evaluateQuadric(q: QuadricMatrix, x: number, y: number, z: number): number {
  const [m00, m01, m02, m03, m11, m12, m13, m22, m23, m33] = q;
  const r0 = m00 * x + m01 * y + m02 * z + m03;
  const r1 = m01 * x + m11 * y + m12 * z + m13;
  const r2 = m02 * x + m12 * y + m22 * z + m23;
  const r3 = m03 * x + m13 * y + m23 * z + m33;
  return x * r0 + y * r1 + z * r2 + r3;
}

/**
 * Find the optimal collapse position for an edge by minimising the
 * combined quadric error, then return the position and its cost.
 *
 * When the summed quadric's upper-left 3×3 block is invertible we solve
 * Q'·v = 0 analytically; otherwise we fall back to the best of v1, v2
 * and their midpoint.
 */
function computeOptimalPosition(
  q: QuadricMatrix,
  v1: Vector3,
  v2: Vector3,
): { position: Vector3; cost: number } {
  const [m00, m01, m02, m03, m11, m12, m13, m22, m23] = q;

  //  A = [[m00, m01, m02],      rhs = [-m03]
  //       [m01, m11, m12],            [-m13]
  //       [m02, m12, m22]]            [-m23]
  const rhs0 = -m03;
  const rhs1 = -m13;
  const rhs2 = -m23;

  // Determinant of A (cofactor expansion along row 0)
  const det =
    m00 * (m11 * m22 - m12 * m12) -
    m01 * (m01 * m22 - m12 * m02) +
    m02 * (m01 * m12 - m11 * m02);

  if (Math.abs(det) > 1e-10) {
    // Adjugate / det  (symmetric ⇒ adjugate is also symmetric)
    const adj00 = m11 * m22 - m12 * m12;
    const adj01 = m02 * m12 - m01 * m22;
    const adj02 = m01 * m12 - m02 * m11;
    const adj11 = m00 * m22 - m02 * m02;
    const adj12 = m01 * m02 - m00 * m12;
    const adj22 = m00 * m11 - m01 * m01;

    const x = (adj00 * rhs0 + adj01 * rhs1 + adj02 * rhs2) / det;
    const y = (adj01 * rhs0 + adj11 * rhs1 + adj12 * rhs2) / det;
    const z = (adj02 * rhs0 + adj12 * rhs1 + adj22 * rhs2) / det;

    const cost = evaluateQuadric(q, x, y, z);
    return { position: new Vector3(x, y, z), cost };
  }

  // Singular – fall back to the best candidate position
  const midpoint = v1.clone().add(v2).multiplyScalar(0.5);
  const candidates = [v1, v2, midpoint];
  let bestCost = Infinity;
  let bestPos = midpoint;

  for (const pos of candidates) {
    const c = evaluateQuadric(q, pos.x, pos.y, pos.z);
    if (c < bestCost) {
      bestCost = c;
      bestPos = pos;
    }
  }

  return { position: bestPos.clone(), cost: bestCost };
}

// ---------------------------------------------------------------------------
// Min-heap priority queue
// ---------------------------------------------------------------------------

class MinHeap<T> {
  private heap: { key: number; value: T }[] = [];

  push(key: number, value: T): void {
    this.heap.push({ key, value });
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): { key: number; value: T } | null {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  get size(): number {
    return this.heap.length;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.heap[parent].key <= this.heap[i].key) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  private sinkDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.heap[left].key < this.heap[smallest].key) smallest = left;
      if (right < n && this.heap[right].key < this.heap[smallest].key) smallest = right;
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }
}

export interface OptimizationConfig {
  targetFaceCount: number;
  aggressiveDecimation: boolean;
  preserveBoundaries: boolean;
  smoothNormals: boolean;
  normalSmoothingAngle: number;
  removeDegenerateFaces: boolean;
  weldVertices: boolean;
  weldThreshold: number;
  seed?: number;
}

const DEFAULT_OPTIMIZATION_CONFIG: OptimizationConfig = {
  targetFaceCount: 10000,
  aggressiveDecimation: false,
  preserveBoundaries: true,
  smoothNormals: true,
  normalSmoothingAngle: 30,
  removeDegenerateFaces: true,
  weldVertices: true,
  weldThreshold: 0.0001,
  seed: 42,
};

interface Face {
  indices: [number, number, number];
  normal: Vector3;
  area: number;
}

interface Vertex {
  position: Vector3;
  normal: Vector3;
  uv: Vector2 | null;
  faces: number[];
}

/**
 * Optimizes terrain meshes for performance and quality
 */
export class MeshOptimizer {
  private config: OptimizationConfig;
  private rng: SeededRandom;

  constructor(config: Partial<OptimizationConfig> = {}) {
    this.config = { ...DEFAULT_OPTIMIZATION_CONFIG, ...config };
    this.rng = new SeededRandom(this.config.seed ?? 42);
  }

  /**
   * Apply full optimization pipeline to geometry
   */
  optimize(geometry: BufferGeometry): BufferGeometry {
    let optimizedGeom = geometry.clone();

    // Step 1: Remove degenerate faces
    if (this.config.removeDegenerateFaces) {
      optimizedGeom = this.removeDegenerateFaces(optimizedGeom);
    }

    // Step 2: Weld vertices
    if (this.config.weldVertices) {
      optimizedGeom = this.weldVertices(optimizedGeom);
    }

    // Step 3: Decimate if needed
    const faceCount = optimizedGeom.index 
      ? optimizedGeom.index.count / 3 
      : optimizedGeom.getAttribute('position').count / 3;
    
    if (faceCount > this.config.targetFaceCount) {
      optimizedGeom = this.decimate(optimizedGeom);
    }

    // Step 4: Smooth normals
    if (this.config.smoothNormals) {
      optimizedGeom = this.smoothNormals(optimizedGeom);
    }

    return optimizedGeom;
  }

  /**
   * Remove degenerate (zero-area) faces
   */
  private removeDegenerateFaces(geometry: BufferGeometry): BufferGeometry {
    const positions = geometry.getAttribute('position');
    const index = geometry.getIndex();

    if (!index) return geometry;

    const validIndices: number[] = [];
    const v0 = new Vector3();
    const v1 = new Vector3();
    const v2 = new Vector3();
    const edge1 = new Vector3();
    const edge2 = new Vector3();
    const cross = new Vector3();

    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);

      v0.fromBufferAttribute(positions, a);
      v1.fromBufferAttribute(positions, b);
      v2.fromBufferAttribute(positions, c);

      edge1.subVectors(v1, v0);
      edge2.subVectors(v2, v0);
      cross.crossVectors(edge1, edge2);

      // Keep face if area is significant
      if (cross.length() > 1e-6) {
        validIndices.push(a, b, c);
      }
    }

    const newIndex = new Uint32Array(validIndices);
    const newGeometry = geometry.clone();
    // @ts-ignore - BufferGeometry.setIndex typing
    newGeometry.setIndex(newIndex);
    
    return newGeometry;
  }

  /**
   * Weld nearby vertices together
   */
  private weldVertices(geometry: BufferGeometry): BufferGeometry {
    const positions = geometry.getAttribute('position') as BufferAttribute;
    const normals = geometry.getAttribute('normal') as BufferAttribute | null;
    const uvs = geometry.getAttribute('uv') as BufferAttribute | null;
    const index = geometry.getIndex();

    const vertexMap = new Map<string, number>();
    const newPositions: number[] = [];
    const newNormals: number[] = [];
    const newUvs: number[] = [];
    const newIndex: number[] = [];

    const tempVec = new Vector3();
    const tempNormal = new Vector3();
    const tempUV = new Vector2();

    for (let i = 0; i < positions.count; i++) {
      tempVec.fromBufferAttribute(positions, i);
      
      // Create hash key from position
      const key = `${Math.round(tempVec.x / this.config.weldThreshold)},${
        Math.round(tempVec.y / this.config.weldThreshold)
      },${Math.round(tempVec.z / this.config.weldThreshold)}`;

      if (!vertexMap.has(key)) {
        // New unique vertex
        const newIndex = newPositions.length / 3;
        vertexMap.set(key, newIndex);

        newPositions.push(tempVec.x, tempVec.y, tempVec.z);

        if (normals) {
          tempNormal.fromBufferAttribute(normals, i);
          newNormals.push(tempNormal.x, tempNormal.y, tempNormal.z);
        }

        if (uvs) {
          tempUV.fromBufferAttribute(uvs, i);
          newUvs.push(tempUV.x, tempUV.y);
        }
      }
    }

    // Remap indices
    if (index) {
      for (let i = 0; i < index.count; i++) {
        const oldIdx = index.getX(i);
        const tempVec2 = new Vector3().fromBufferAttribute(positions, oldIdx);
        const key = `${Math.round(tempVec2.x / this.config.weldThreshold)},${
          Math.round(tempVec2.y / this.config.weldThreshold)
        },${Math.round(tempVec2.z / this.config.weldThreshold)}`;
        
        newIndex.push(vertexMap.get(key)!);
      }
    } else {
      for (let i = 0; i < positions.count; i++) {
        const tempVec2 = new Vector3().fromBufferAttribute(positions, i);
        const key = `${Math.round(tempVec2.x / this.config.weldThreshold)},${
          Math.round(tempVec2.y / this.config.weldThreshold)
        },${Math.round(tempVec2.z / this.config.weldThreshold)}`;
        
        newIndex.push(vertexMap.get(key)!);
      }
    }

    const newGeometry = new BufferGeometry();
    newGeometry.setAttribute('position', new BufferAttribute(new Float32Array(newPositions), 3));
    
    if (newNormals.length > 0) {
      newGeometry.setAttribute('normal', new BufferAttribute(new Float32Array(newNormals), 3));
    }
    
    if (newUvs.length > 0) {
      newGeometry.setAttribute('uv', new BufferAttribute(new Float32Array(newUvs), 2));
    }
    
    newGeometry.setIndex(new BufferAttribute(new Uint32Array(newIndex), 1));
    newGeometry.computeVertexNormals();

    return newGeometry;
  }

  /**
   * Simplify mesh through Quadric Error Metrics edge-collapse decimation.
   *
   * Implements the Garland & Heckbert (1997) algorithm:
   *  1. Compute quadric error matrices for each vertex from its adjacent
   *     face planes (area-weighted).
   *  2. For each potential edge collapse, compute the cost (sum of the
   *     two endpoint quadrics) and the optimal target position.
   *  3. Insert all candidates into a min-heap sorted by collapse cost.
   *  4. Iteratively collapse the cheapest edge, update the merged
   *     vertex's quadric (Q1 + Q2), and re-evaluate affected edges.
   *  5. Stop when the target face count is reached.
   */
  private decimate(geometry: BufferGeometry): BufferGeometry {
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const uvs = geometry.getAttribute('uv');
    const index = geometry.getIndex();

    if (!index) return geometry;

    const initialFaceCount = index.count / 3;
    const targetFaces = Math.min(this.config.targetFaceCount, initialFaceCount);
    if (initialFaceCount <= targetFaces) return geometry;

    // ------------------------------------------------------------------
    // 1. Extract mesh data
    // ------------------------------------------------------------------
    const vertexCount = positions.count;
    const vertPositions: Vector3[] = [];
    const vertNormals: Vector3[] = [];
    const vertUVs: Vector2[] = [];

    for (let i = 0; i < vertexCount; i++) {
      vertPositions.push(new Vector3(positions.getX(i), positions.getY(i), positions.getZ(i)));
      if (normals) {
        vertNormals.push(new Vector3(normals.getX(i), normals.getY(i), normals.getZ(i)));
      }
      if (uvs) {
        vertUVs.push(new Vector2(uvs.getX(i), uvs.getY(i)));
      }
    }

    // Faces – removed faces are marked with all indices = -1
    const faces: [number, number, number][] = [];
    for (let i = 0; i < index.count; i += 3) {
      faces.push([index.getX(i), index.getX(i + 1), index.getX(i + 2)]);
    }

    // ------------------------------------------------------------------
    // 2. Build adjacency structures
    // ------------------------------------------------------------------
    const vertexFaces: Map<number, Set<number>> = new Map();
    for (let i = 0; i < vertexCount; i++) vertexFaces.set(i, new Set());
    for (let fi = 0; fi < faces.length; fi++) {
      for (const vi of faces[fi]) {
        vertexFaces.get(vi)!.add(fi);
      }
    }

    const vertexNeighbors: Map<number, Set<number>> = new Map();
    for (let i = 0; i < vertexCount; i++) vertexNeighbors.set(i, new Set());
    for (const [a, b, c] of faces) {
      vertexNeighbors.get(a)!.add(b);
      vertexNeighbors.get(a)!.add(c);
      vertexNeighbors.get(b)!.add(a);
      vertexNeighbors.get(b)!.add(c);
      vertexNeighbors.get(c)!.add(a);
      vertexNeighbors.get(c)!.add(b);
    }

    const edgeKey = (a: number, b: number) =>
      a < b ? `${a}_${b}` : `${b}_${a}`;

    // ------------------------------------------------------------------
    // 3. Compute area-weighted quadrics per vertex
    // ------------------------------------------------------------------
    const quadrics: QuadricMatrix[] = [];
    for (let i = 0; i < vertexCount; i++) quadrics.push(createZeroQuadric());

    for (let fi = 0; fi < faces.length; fi++) {
      const [a, b, c] = faces[fi];
      const v0 = vertPositions[a];
      const v1 = vertPositions[b];
      const v2 = vertPositions[c];

      const edge1 = new Vector3().subVectors(v1, v0);
      const edge2 = new Vector3().subVectors(v2, v0);
      const normal = new Vector3().crossVectors(edge1, edge2);

      const area = normal.length();
      if (area < 1e-12) continue; // skip degenerate faces

      normal.divideScalar(area); // normalise
      const d = -normal.dot(v0);

      const q = createPlaneQuadric(normal.x, normal.y, normal.z, d);
      // Area-weight the quadric for better geometric fidelity
      for (let i = 0; i < 10; i++) q[i] *= area;

      quadrics[a] = addQuadrics(quadrics[a], q);
      quadrics[b] = addQuadrics(quadrics[b], q);
      quadrics[c] = addQuadrics(quadrics[c], q);
    }

    // ------------------------------------------------------------------
    // 4. Identify boundary edges and vertices
    // ------------------------------------------------------------------
    const isBoundaryEdge = new Map<string, boolean>();
    const boundaryVertices = new Set<number>();

    for (let fi = 0; fi < faces.length; fi++) {
      const [a, b, c] = faces[fi];
      const pairs: [number, number][] = [
        [a, b],
        [b, c],
        [c, a],
      ];
      for (const [v1, v2] of pairs) {
        const key = edgeKey(v1, v2);
        if (isBoundaryEdge.has(key)) {
          isBoundaryEdge.set(key, false); // shared by ≥ 2 faces → interior
        } else {
          isBoundaryEdge.set(key, true); // seen once so far → potential boundary
        }
      }
    }

    for (const [key, isBnd] of isBoundaryEdge) {
      if (isBnd) {
        const parts = key.split('_');
        boundaryVertices.add(Number(parts[0]));
        boundaryVertices.add(Number(parts[1]));
      }
    }

    // ------------------------------------------------------------------
    // 5. Seed the priority queue with all valid edge collapses
    // ------------------------------------------------------------------
    interface CollapseCandidate {
      v1: number;
      v2: number;
      position: Vector3;
      generation: number;
    }

    const heap = new MinHeap<CollapseCandidate>();
    const edgeGenerations = new Map<string, number>();

    const evaluateEdge = (a: number, b: number): void => {
      const key = edgeKey(a, b);
      const combined = addQuadrics(quadrics[a], quadrics[b]);
      const { position, cost } = computeOptimalPosition(
        combined,
        vertPositions[a],
        vertPositions[b],
      );
      const gen = (edgeGenerations.get(key) ?? -1) + 1;
      edgeGenerations.set(key, gen);
      heap.push(Math.max(cost, 0), {
        v1: Math.min(a, b),
        v2: Math.max(a, b),
        position,
        generation: gen,
      });
    };

    for (const [key, isBnd] of isBoundaryEdge) {
      if (this.config.preserveBoundaries && isBnd) continue;
      const parts = key.split('_');
      evaluateEdge(Number(parts[0]), Number(parts[1]));
    }

    // ------------------------------------------------------------------
    // 6. Iterative edge collapse
    // ------------------------------------------------------------------
    const alive = new Array(vertexCount).fill(true);
    let currentFaceCount = faces.length;

    while (currentFaceCount > targetFaces && heap.size > 0) {
      const entry = heap.pop();
      if (!entry) break;

      const { v1, v2, position, generation } = entry.value;
      const key = edgeKey(v1, v2);

      // Skip stale entries
      if (generation !== (edgeGenerations.get(key) ?? -1)) continue;
      if (!alive[v1] || !alive[v2]) continue;

      // Respect boundary preservation
      if (this.config.preserveBoundaries && isBoundaryEdge.get(key)) continue;
      if (
        this.config.preserveBoundaries &&
        boundaryVertices.has(v1) &&
        boundaryVertices.has(v2)
      )
        continue;

      // --- Collapse v2 into v1 ---
      vertPositions[v1].copy(position);
      quadrics[v1] = addQuadrics(quadrics[v1], quadrics[v2]);

      // Interpolate normals / UVs for the merged vertex
      if (vertNormals.length > 0) {
        vertNormals[v1]
          .add(vertNormals[v2])
          .normalize();
      }
      if (vertUVs.length > 0) {
        vertUVs[v1].add(vertUVs[v2]).multiplyScalar(0.5);
      }

      // Replace v2 with v1 in all faces that reference v2
      const v2Faces = [...vertexFaces.get(v2)!];
      const removedFaces: number[] = [];

      for (const fi of v2Faces) {
        const face = faces[fi];
        if (face[0] === -1) continue; // already removed

        // Degenerate: face already contains v1 → remove it
        if (face[0] === v1 || face[1] === v1 || face[2] === v1) {
          removedFaces.push(fi);
          continue;
        }

        for (let k = 0; k < 3; k++) {
          if (face[k] === v2) face[k] = v1;
        }

        vertexFaces.get(v1)!.add(fi);
        vertexFaces.get(v2)!.delete(fi);
      }

      // Remove degenerate faces
      for (const fi of removedFaces) {
        const face = faces[fi];
        if (face[0] === -1) continue;

        for (const vi of face) {
          vertexFaces.get(vi)?.delete(fi);
        }

        face[0] = -1;
        face[1] = -1;
        face[2] = -1;
        currentFaceCount--;
      }

      // Update vertex-vertex adjacency
      const v2Neighbors = [...vertexNeighbors.get(v2)!];
      for (const vn of v2Neighbors) {
        if (!alive[vn]) continue;
        vertexNeighbors.get(vn)!.delete(v2);
        if (vn !== v1) {
          vertexNeighbors.get(v1)!.add(vn);
          vertexNeighbors.get(vn)!.add(v1);
        }
      }
      vertexNeighbors.get(v1)!.delete(v2);
      vertexNeighbors.get(v1)!.delete(v1); // safety

      // Kill v2
      alive[v2] = false;
      vertexNeighbors.get(v2)!.clear();
      vertexFaces.get(v2)!.clear();

      // Re-evaluate edges adjacent to the merged vertex v1
      for (const vn of vertexNeighbors.get(v1)!) {
        if (!alive[vn]) continue;
        const ekey = edgeKey(v1, vn);
        if (this.config.preserveBoundaries && isBoundaryEdge.get(ekey)) continue;
        if (
          this.config.preserveBoundaries &&
          boundaryVertices.has(v1) &&
          boundaryVertices.has(vn)
        )
          continue;
        evaluateEdge(v1, vn);
      }
    }

    // ------------------------------------------------------------------
    // 7. Build output geometry
    // ------------------------------------------------------------------
    const usedVertices = new Set<number>();
    const survivingFaces: [number, number, number][] = [];

    for (const face of faces) {
      if (face[0] === -1) continue;
      survivingFaces.push([face[0], face[1], face[2]]);
      usedVertices.add(face[0]);
      usedVertices.add(face[1]);
      usedVertices.add(face[2]);
    }

    // Remap vertex indices to a contiguous range
    const vertexRemap = new Map<number, number>();
    const sortedUsed = [...usedVertices].sort((a, b) => a - b);
    for (let i = 0; i < sortedUsed.length; i++) {
      vertexRemap.set(sortedUsed[i], i);
    }

    const newPositions: number[] = [];
    const newNormals: number[] = [];
    const newUvs: number[] = [];

    for (const oldIdx of sortedUsed) {
      const pos = vertPositions[oldIdx];
      newPositions.push(pos.x, pos.y, pos.z);

      if (vertNormals.length > 0) {
        const n = vertNormals[oldIdx];
        newNormals.push(n.x, n.y, n.z);
      }

      if (vertUVs.length > 0) {
        const uv = vertUVs[oldIdx];
        newUvs.push(uv.x, uv.y);
      }
    }

    const newIndices: number[] = [];
    for (const [a, b, c] of survivingFaces) {
      newIndices.push(
        vertexRemap.get(a)!,
        vertexRemap.get(b)!,
        vertexRemap.get(c)!,
      );
    }

    const newGeometry = new BufferGeometry();
    newGeometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(newPositions), 3),
    );

    if (newNormals.length > 0) {
      newGeometry.setAttribute(
        'normal',
        new BufferAttribute(new Float32Array(newNormals), 3),
      );
    }

    if (newUvs.length > 0) {
      newGeometry.setAttribute(
        'uv',
        new BufferAttribute(new Float32Array(newUvs), 2),
      );
    }

    newGeometry.setIndex(
      new BufferAttribute(new Uint32Array(newIndices), 1),
    );
    newGeometry.computeVertexNormals();

    return newGeometry;
  }

  /**
   * Smooth vertex normals based on adjacent face normals
   */
  private smoothNormals(geometry: BufferGeometry): BufferGeometry {
    const positions = geometry.getAttribute('position');
    const index = geometry.getIndex();
    
    if (!index) {
      geometry.computeVertexNormals();
      return geometry;
    }

    const normals = geometry.getAttribute('normal');
    const newNormals = new Float32Array(normals.count * 3);
    
    const faceNormals: Vector3[] = [];
    const v0 = new Vector3();
    const v1 = new Vector3();
    const v2 = new Vector3();
    const edge1 = new Vector3();
    const edge2 = new Vector3();

    // Calculate face normals
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);

      v0.fromBufferAttribute(positions, a);
      v1.fromBufferAttribute(positions, b);
      v2.fromBufferAttribute(positions, c);

      edge1.subVectors(v1, v0);
      edge2.subVectors(v2, v0);
      
      const normal = new Vector3().crossVectors(edge1, edge2).normalize();
      faceNormals.push(normal);
    }

    // Accumulate normals per vertex
    const vertexNormals = new Array<Vector3>(positions.count);
    for (let i = 0; i < positions.count; i++) {
      vertexNormals[i] = new Vector3();
    }

    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      const faceNormal = faceNormals[i / 3];

      vertexNormals[a].add(faceNormal);
      vertexNormals[b].add(faceNormal);
      vertexNormals[c].add(faceNormal);
    }

    // Normalize and apply angle-based smoothing
    for (let i = 0; i < positions.count; i++) {
      const normal = vertexNormals[i];
      if (normal.length() > 0) {
        normal.normalize();
        
        // Optional: limit smoothing based on angle threshold
        if (this.config.normalSmoothingAngle < 180) {
          // Could implement angle-based limiting here
        }
        
        newNormals[i * 3] = normal.x;
        newNormals[i * 3 + 1] = normal.y;
        newNormals[i * 3 + 2] = normal.z;
      }
    }

    const newGeometry = geometry.clone();
    newGeometry.setAttribute('normal', new BufferAttribute(new Float32Array(newNormals), 3));
    
    return newGeometry;
  }

  /**
   * Update optimization configuration
   */
  setConfig(config: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): OptimizationConfig {
    return { ...this.config };
  }
}

export default MeshOptimizer;
