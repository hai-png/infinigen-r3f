/**
 * ExpandedNodeExecutors - 30 additional node type executors
 *
 * Provides executor functions for mesh topology, attribute operations,
 * curve modifiers, instance transforms, volume/point conversion,
 * geometry operations, and shader input nodes that previously
 * had no executor (pass-through only).
 *
 * This is the fourth executor module alongside Core, Extended, and Additional.
 * Combined total: 140 real executors, targeting <80 pass-through node types.
 *
 * Each executor is a standalone function that takes `inputs: NodeInputs`
 * and returns a structured output object matching the socket names of the node.
 *
 * Uses seeded random for all randomness — no Math.random().
 */

import * as THREE from 'three';
import type { NodeInputs, NodeOutput, Vector3Like, ColorLike } from './ExecutorTypes';

// ============================================================================
// Seeded Random Utility (matches other executor modules)
// ============================================================================

function seededRandom(seed: number): () => number {
  let state = Math.abs(seed | 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) & 0xffffffff;
    return (state >>> 0) / 0xffffffff;
  };
}

// ============================================================================
// Helper: normalize a vector-like input to {x, y, z}
// ============================================================================

function normalizeVec(v: unknown): Vector3Like {
  if (!v) return { x: 0, y: 0, z: 0 };
  if (v instanceof THREE.Vector3) return { x: v.x, y: v.y, z: v.z };
  if (Array.isArray(v)) return { x: (v as number[])[0] ?? 0, y: (v as number[])[1] ?? 0, z: (v as number[])[2] ?? 0 };
  const obj = v as Record<string, unknown>;
  return { x: (obj.x as number) ?? 0, y: (obj.y as number) ?? 0, z: (obj.z as number) ?? 0 };
}

// ============================================================================
// Helper: get edge key for mesh topology
// ============================================================================

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

// ============================================================================
// Helper: compute face area from triangle vertices
// ============================================================================

function triangleArea(v0: THREE.Vector3, v1: THREE.Vector3, v2: THREE.Vector3): number {
  return new THREE.Vector3().crossVectors(
    new THREE.Vector3().subVectors(v1, v0),
    new THREE.Vector3().subVectors(v2, v0),
  ).length() * 0.5;
}

// ============================================================================
// Mesh Topology Node Executors (7)
// ============================================================================

/**
 * 1. DualMesh — Convert a triangle mesh to its dual (face centers become vertices).
 * Each original face becomes a dual vertex; adjacent faces are connected by dual edges.
 * Inputs: Geometry
 * Outputs: Geometry (dual mesh)
 */
export function executeDualMesh(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;

  if (!geometry || !geometry.getAttribute('position') || !geometry.getIndex()) {
    return { Geometry: geometry ?? new THREE.BufferGeometry() };
  }

  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex()!;
  const faceCount = Math.floor(idxAttr.count / 3);

  // Compute face centers as dual vertices
  const dualPositions: number[] = [];
  const faceCenters: THREE.Vector3[] = [];

  for (let f = 0; f < faceCount; f++) {
    const i0 = idxAttr.getX(f * 3);
    const i1 = idxAttr.getX(f * 3 + 1);
    const i2 = idxAttr.getX(f * 3 + 2);
    const center = new THREE.Vector3(
      (posAttr.getX(i0) + posAttr.getX(i1) + posAttr.getX(i2)) / 3,
      (posAttr.getY(i0) + posAttr.getY(i1) + posAttr.getY(i2)) / 3,
      (posAttr.getZ(i0) + posAttr.getZ(i1) + posAttr.getZ(i2)) / 3,
    );
    faceCenters.push(center);
    dualPositions.push(center.x, center.y, center.z);
  }

  // Build edge-to-face adjacency for dual edges
  const edgeToFaces = new Map<string, number[]>();
  for (let f = 0; f < faceCount; f++) {
    for (let e = 0; e < 3; e++) {
      const a = idxAttr.getX(f * 3 + e);
      const b = idxAttr.getX(f * 3 + ((e + 1) % 3));
      const key = edgeKey(a, b);
      if (!edgeToFaces.has(key)) edgeToFaces.set(key, []);
      edgeToFaces.get(key)!.push(f);
    }
  }

  // Create dual edges (connecting adjacent face centers)
  const dualIndices: number[] = [];
  for (const faces of edgeToFaces.values()) {
    if (faces.length === 2) {
      dualIndices.push(faces[0], faces[1]);
    }
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(dualPositions, 3));
  // Dual mesh edges as line segments
  result.setIndex(dualIndices);
  return { Geometry: result };
}

/**
 * 2. EdgeNeighbors — Get the number of neighboring edges for each vertex.
 * Inputs: Geometry
 * Outputs: Count (array of neighbor counts per vertex)
 */
export function executeEdgeNeighbors(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;

  if (!geometry || !geometry.getAttribute('position')) {
    return { Count: [] };
  }

  const idxAttr = geometry.getIndex();
  const posAttr = geometry.getAttribute('position');
  const vertCount = posAttr.count;

  // Count edges per vertex using a set to avoid double-counting
  const edgeSet = new Set<string>();
  const neighborCount = new Array(vertCount).fill(0);

  const processEdge = (a: number, b: number) => {
    const key = edgeKey(a, b);
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      neighborCount[a]++;
      neighborCount[b]++;
    }
  };

  if (idxAttr) {
    const faceCount = Math.floor(idxAttr.count / 3);
    for (let f = 0; f < faceCount; f++) {
      for (let e = 0; e < 3; e++) {
        processEdge(idxAttr.getX(f * 3 + e), idxAttr.getX(f * 3 + ((e + 1) % 3)));
      }
    }
  } else {
    for (let i = 0; i < vertCount; i += 3) {
      processEdge(i, i + 1);
      processEdge(i + 1, i + 2);
      processEdge(i + 2, i);
    }
  }

  return { Count: neighborCount };
}

/**
 * 3. EdgeVertices — Get the two vertex indices of each edge.
 * Inputs: Geometry
 * Outputs: VertexIndex1 (array), VertexIndex2 (array), EdgeCount
 */
export function executeEdgeVertices(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;

  if (!geometry || !geometry.getAttribute('position')) {
    return { VertexIndex1: [], VertexIndex2: [], EdgeCount: 0 };
  }

  const idxAttr = geometry.getIndex();
  const posAttr = geometry.getAttribute('position');
  const edgeSet = new Map<string, [number, number]>();

  const addEdge = (a: number, b: number) => {
    const key = edgeKey(a, b);
    if (!edgeSet.has(key)) {
      edgeSet.set(key, a < b ? [a, b] : [b, a]);
    }
  };

  if (idxAttr) {
    const faceCount = Math.floor(idxAttr.count / 3);
    for (let f = 0; f < faceCount; f++) {
      for (let e = 0; e < 3; e++) {
        addEdge(idxAttr.getX(f * 3 + e), idxAttr.getX(f * 3 + ((e + 1) % 3)));
      }
    }
  } else {
    for (let i = 0; i < posAttr.count; i += 3) {
      addEdge(i, i + 1);
      addEdge(i + 1, i + 2);
      addEdge(i + 2, i);
    }
  }

  const v1: number[] = [];
  const v2: number[] = [];
  for (const [a, b] of edgeSet.values()) {
    v1.push(a);
    v2.push(b);
  }

  return { VertexIndex1: v1, VertexIndex2: v2, EdgeCount: edgeSet.size };
}

/**
 * 4. FaceArea — Compute the area of each face in the mesh.
 * Inputs: Geometry
 * Outputs: Area (array of face areas)
 */
export function executeFaceArea(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;

  if (!geometry || !geometry.getAttribute('position')) {
    return { Area: [] };
  }

  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex();
  const areas: number[] = [];

  if (idxAttr) {
    const faceCount = Math.floor(idxAttr.count / 3);
    for (let f = 0; f < faceCount; f++) {
      const i0 = idxAttr.getX(f * 3);
      const i1 = idxAttr.getX(f * 3 + 1);
      const i2 = idxAttr.getX(f * 3 + 2);
      const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
      const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
      const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
      areas.push(triangleArea(v0, v1, v2));
    }
  } else {
    const vertCount = posAttr.count;
    for (let i = 0; i < vertCount; i += 3) {
      const v0 = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      const v1 = new THREE.Vector3(posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1));
      const v2 = new THREE.Vector3(posAttr.getX(i + 2), posAttr.getY(i + 2), posAttr.getZ(i + 2));
      areas.push(triangleArea(v0, v1, v2));
    }
  }

  return { Area: areas };
}

/**
 * 5. VertexNeighbors — Get the indices of vertices adjacent to each vertex.
 * Inputs: Geometry
 * Outputs: VertexIndex (array of arrays), NeighborCount (array)
 */
export function executeVertexNeighbors(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;

  if (!geometry || !geometry.getAttribute('position')) {
    return { VertexIndex: [], NeighborCount: [] };
  }

  const idxAttr = geometry.getIndex();
  const posAttr = geometry.getAttribute('position');
  const vertCount = posAttr.count;

  // Build adjacency list
  const adjacency = new Map<number, Set<number>>();
  for (let i = 0; i < vertCount; i++) adjacency.set(i, new Set());

  const addAdjacency = (a: number, b: number) => {
    adjacency.get(a)?.add(b);
    adjacency.get(b)?.add(a);
  };

  if (idxAttr) {
    const faceCount = Math.floor(idxAttr.count / 3);
    for (let f = 0; f < faceCount; f++) {
      const i0 = idxAttr.getX(f * 3);
      const i1 = idxAttr.getX(f * 3 + 1);
      const i2 = idxAttr.getX(f * 3 + 2);
      addAdjacency(i0, i1);
      addAdjacency(i1, i2);
      addAdjacency(i2, i0);
    }
  } else {
    for (let i = 0; i < vertCount; i += 3) {
      addAdjacency(i, i + 1);
      addAdjacency(i + 1, i + 2);
      addAdjacency(i + 2, i);
    }
  }

  const vertexIndex: number[][] = [];
  const neighborCount: number[] = [];
  for (let i = 0; i < vertCount; i++) {
    const neighbors = Array.from(adjacency.get(i) ?? []);
    vertexIndex.push(neighbors);
    neighborCount.push(neighbors.length);
  }

  return { VertexIndex: vertexIndex, NeighborCount: neighborCount };
}

/**
 * 6. EdgesOfFace — Get the edge indices belonging to each face.
 * Inputs: Geometry
 * Outputs: EdgeIndex (array of arrays of edge indices per face)
 */
export function executeEdgesOfFace(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;

  if (!geometry || !geometry.getAttribute('position') || !geometry.getIndex()) {
    return { EdgeIndex: [] };
  }

  const idxAttr = geometry.getIndex()!;
  const faceCount = Math.floor(idxAttr.count / 3);

  // Build edge index map
  const edgeIndexMap = new Map<string, number>();
  let edgeCount = 0;
  const getEdgeIndex = (a: number, b: number): number => {
    const key = edgeKey(a, b);
    if (edgeIndexMap.has(key)) return edgeIndexMap.get(key)!;
    edgeIndexMap.set(key, edgeCount);
    return edgeCount++;
  };

  // First pass: assign edge indices
  for (let f = 0; f < faceCount; f++) {
    for (let e = 0; e < 3; e++) {
      const a = idxAttr.getX(f * 3 + e);
      const b = idxAttr.getX(f * 3 + ((e + 1) % 3));
      getEdgeIndex(a, b);
    }
  }

  // Second pass: collect edge indices per face
  const edgeIndices: number[][] = [];
  for (let f = 0; f < faceCount; f++) {
    const faceEdges: number[] = [];
    for (let e = 0; e < 3; e++) {
      const a = idxAttr.getX(f * 3 + e);
      const b = idxAttr.getX(f * 3 + ((e + 1) % 3));
      faceEdges.push(getEdgeIndex(a, b));
    }
    edgeIndices.push(faceEdges);
  }

  return { EdgeIndex: edgeIndices };
}

/**
 * 7. FacesOfEdge — Get the face indices adjacent to each edge.
 * Inputs: Geometry
 * Outputs: FaceIndex (array of arrays of face indices per edge), EdgeIndex (sorted edge list)
 */
export function executeFacesOfEdge(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;

  if (!geometry || !geometry.getAttribute('position') || !geometry.getIndex()) {
    return { FaceIndex: [], EdgeIndex: [] };
  }

  const idxAttr = geometry.getIndex()!;
  const faceCount = Math.floor(idxAttr.count / 3);

  // Build edge → face list
  const edgeFaceMap = new Map<string, number[]>();
  for (let f = 0; f < faceCount; f++) {
    for (let e = 0; e < 3; e++) {
      const a = idxAttr.getX(f * 3 + e);
      const b = idxAttr.getX(f * 3 + ((e + 1) % 3));
      const key = edgeKey(a, b);
      if (!edgeFaceMap.has(key)) edgeFaceMap.set(key, []);
      edgeFaceMap.get(key)!.push(f);
    }
  }

  // Convert to sorted arrays
  const sortedEdges = [...edgeFaceMap.keys()].sort();
  const faceIndex: number[][] = [];
  for (const key of sortedEdges) {
    faceIndex.push(edgeFaceMap.get(key)!);
  }

  return { FaceIndex: faceIndex, EdgeIndex: sortedEdges };
}

// ============================================================================
// Attribute Node Executors (5)
// ============================================================================

/**
 * 8. CaptureAttribute — Evaluate a field per-element on geometry and capture
 * the per-element values.
 *
 * In Blender's geometry nodes, CaptureAttribute evaluates its Value input
 * field at each element of the specified domain (point/face/corner). The
 * field may depend on per-element data like Position, Normal, or Index.
 *
 * The Value input can be:
 *   - A per-element array (from Position, Normal, etc. nodes)
 *   - An AttributeStream (from the per-vertex evaluator)
 *   - A function (field evaluator) that takes (index, position, normal) → value
 *   - A single scalar/vector constant (uniform field — same value for all elements)
 *
 * Outputs: Geometry (with captured attribute stored), Attribute (per-element array)
 */
export function executeCaptureAttribute(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const value = (inputs.Value ?? inputs.value ?? null) as unknown;
  const dataType = (inputs.DataType ?? inputs.dataType ?? 'FLOAT') as string;
  const domain = (inputs.Domain ?? inputs.domain ?? 'POINT') as string;

  if (!geometry) return { Geometry: null, Attribute: value };

  const result = geometry.clone();
  const posAttr = result.getAttribute('position');
  const indexAttr = result.getIndex();

  // Determine element count for the specified domain
  const count = getDomainElementCount(result, domain);

  // ---------------------------------------------------------------------------
  // Resolve the Value into a per-element array
  // ---------------------------------------------------------------------------

  const perElementValues: unknown[] = resolvePerElementValues(
    value, count, domain, result, dataType,
  );

  // ---------------------------------------------------------------------------
  // Store as a named attribute on the geometry
  // ---------------------------------------------------------------------------

  const attrName = `_captured_${domain}_${Date.now()}`;
  storePerElementAttribute(result, attrName, perElementValues, dataType, count);

  // ---------------------------------------------------------------------------
  // Return geometry with captured attribute + the per-element array
  // ---------------------------------------------------------------------------

  return { Geometry: result, Attribute: perElementValues };
}

/**
 * Determine the number of elements for a given domain on a geometry.
 */
function getDomainElementCount(geometry: THREE.BufferGeometry, domain: string): number {
  const posAttr = geometry.getAttribute('position');
  const indexAttr = geometry.getIndex();
  switch (domain.toUpperCase()) {
    case 'POINT':
      return posAttr?.count ?? 0;
    case 'FACE':
      return indexAttr
        ? Math.floor(indexAttr.count / 3)
        : Math.floor((posAttr?.count ?? 0) / 3);
    case 'EDGE': {
      const faces = indexAttr
        ? Math.floor(indexAttr.count / 3)
        : Math.floor((posAttr?.count ?? 0) / 3);
      return Math.max(1, Math.floor(faces * 1.5));
    }
    case 'FACE_CORNER':
      return indexAttr
        ? indexAttr.count
        : (posAttr?.count ?? 0);
    case 'SPLINE':
    case 'INSTANCE':
      return 1;
    default:
      return posAttr?.count ?? 0;
  }
}

/**
 * Extract position for a domain element.
 * For POINT domain, returns the vertex position directly.
 * For FACE domain, returns the face centroid.
 */
function getElementPosition(
  geometry: THREE.BufferGeometry,
  domain: string,
  elementIndex: number,
): Vector3Like {
  const posAttr = geometry.getAttribute('position');
  const indexAttr = geometry.getIndex();

  if (domain.toUpperCase() === 'POINT' || domain.toUpperCase() === 'FACE_CORNER') {
    const idx = domain.toUpperCase() === 'FACE_CORNER' && indexAttr
      ? indexAttr.getX(elementIndex)
      : elementIndex;
    return {
      x: posAttr?.getX(idx) ?? 0,
      y: posAttr?.getY(idx) ?? 0,
      z: posAttr?.getZ(idx) ?? 0,
    };
  }

  if (domain.toUpperCase() === 'FACE') {
    const i0 = indexAttr ? indexAttr.getX(elementIndex * 3) : elementIndex * 3;
    const i1 = indexAttr ? indexAttr.getX(elementIndex * 3 + 1) : elementIndex * 3 + 1;
    const i2 = indexAttr ? indexAttr.getX(elementIndex * 3 + 2) : elementIndex * 3 + 2;
    return {
      x: ((posAttr?.getX(i0) ?? 0) + (posAttr?.getX(i1) ?? 0) + (posAttr?.getX(i2) ?? 0)) / 3,
      y: ((posAttr?.getY(i0) ?? 0) + (posAttr?.getY(i1) ?? 0) + (posAttr?.getY(i2) ?? 0)) / 3,
      z: ((posAttr?.getZ(i0) ?? 0) + (posAttr?.getZ(i1) ?? 0) + (posAttr?.getZ(i2) ?? 0)) / 3,
    };
  }

  return { x: 0, y: 0, z: 0 };
}

/**
 * Extract normal for a domain element.
 */
function getElementNormal(
  geometry: THREE.BufferGeometry,
  domain: string,
  elementIndex: number,
): Vector3Like {
  const normalAttr = geometry.getAttribute('normal');
  const posAttr = geometry.getAttribute('position');
  const indexAttr = geometry.getIndex();

  if (normalAttr && (domain.toUpperCase() === 'POINT' || domain.toUpperCase() === 'FACE_CORNER')) {
    const idx = domain.toUpperCase() === 'FACE_CORNER' && indexAttr
      ? indexAttr.getX(elementIndex)
      : elementIndex;
    return {
      x: normalAttr.getX(idx),
      y: normalAttr.getY(idx),
      z: normalAttr.getZ(idx),
    };
  }

  if (domain.toUpperCase() === 'FACE' && posAttr && indexAttr) {
    // Compute face normal
    const i0 = indexAttr.getX(elementIndex * 3);
    const i1 = indexAttr.getX(elementIndex * 3 + 1);
    const i2 = indexAttr.getX(elementIndex * 3 + 2);
    const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
    const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
    const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
    const e1 = new THREE.Vector3().subVectors(v1, v0);
    const e2 = new THREE.Vector3().subVectors(v2, v0);
    const n = new THREE.Vector3().crossVectors(e1, e2).normalize();
    return { x: n.x, y: n.y, z: n.z };
  }

  return { x: 0, y: 1, z: 0 };
}

/**
 * Resolve the Value input into a per-element array.
 *
 * Handles:
 *   - Per-element arrays (from Position/Normal/Index nodes)
 *   - AttributeStream objects (from the per-vertex evaluator)
 *   - Field evaluator functions: (index, position, normal) → value
 *   - Single scalar/vector constants (uniform field)
 */
function resolvePerElementValues(
  value: unknown,
  count: number,
  domain: string,
  geometry: THREE.BufferGeometry,
  dataType: string,
): unknown[] {
  if (value === null || value === undefined) {
    // No value — return zeros
    return new Array(count).fill(
      dataType === 'FLOAT_VECTOR' ? { x: 0, y: 0, z: 0 }
        : dataType === 'FLOAT_COLOR' ? { r: 0, g: 0, b: 0, a: 1 }
        : dataType === 'BOOLEAN' ? false
        : 0,
    );
  }

  // -----------------------------------------------------------------------
  // Case 1: Value is an AttributeStream (from PerVertexEvaluator)
  // -----------------------------------------------------------------------
  if (typeof value === 'object' && value !== null && 'getFloat' in value && 'size' in value) {
    const stream = value as any;
    const result: unknown[] = [];
    const streamSize = stream.size as number;
    const streamType = stream.dataType as string;

    for (let i = 0; i < count; i++) {
      const idx = Math.min(i, streamSize - 1);
      if (streamType === 'VECTOR') {
        const v = stream.getVector(idx) as [number, number, number];
        result.push({ x: v[0], y: v[1], z: v[2] });
      } else if (streamType === 'COLOR') {
        result.push(stream.getColor(idx));
      } else if (streamType === 'BOOLEAN') {
        result.push(stream.getBoolean(idx));
      } else {
        // FLOAT, INT
        result.push(stream.getFloat(idx));
      }
    }
    return result;
  }

  // -----------------------------------------------------------------------
  // Case 2: Value is already a per-element array
  // -----------------------------------------------------------------------
  if (Array.isArray(value)) {
    if (value.length === count) {
      // Per-element array — use directly
      return value.slice();
    } else if (value.length > 0) {
      // Array size doesn't match — try to map element-by-element,
      // cycling if the array is shorter
      const result: unknown[] = [];
      for (let i = 0; i < count; i++) {
        result.push(value[i % value.length]);
      }
      return result;
    }
    // Empty array — fall through to constant
  }

  // -----------------------------------------------------------------------
  // Case 3: Value is a field evaluator function
  //   (index: number, position: Vector3Like, normal: Vector3Like) => any
  // -----------------------------------------------------------------------
  if (typeof value === 'function') {
    const result: unknown[] = [];
    for (let i = 0; i < count; i++) {
      const position = getElementPosition(geometry, domain, i);
      const normal = getElementNormal(geometry, domain, i);
      try {
        result.push(value(i, position, normal));
      } catch {
        // On error, use default value
        result.push(dataType === 'FLOAT_VECTOR' ? { x: 0, y: 0, z: 0 } : 0);
      }
    }
    return result;
  }

  // -----------------------------------------------------------------------
  // Case 4: Single scalar constant — repeat for all elements
  //   This is correct for constant fields (e.g., Value = 5.0)
  // -----------------------------------------------------------------------
  if (typeof value === 'number' || typeof value === 'boolean') {
    return new Array(count).fill(value);
  }

  // -----------------------------------------------------------------------
  // Case 5: Single vector/color object — repeat for all elements
  // -----------------------------------------------------------------------
  if (typeof value === 'object') {
    // Check if this looks like a single vector/color (not an array)
    const v = normalizeVec(value);
    if (dataType === 'FLOAT_VECTOR' || dataType === 'VECTOR') {
      const repeated = { x: v.x, y: v.y, z: v.z };
      return new Array(count).fill(repeated);
    }
    if (dataType === 'FLOAT_COLOR' || dataType === 'COLOR') {
      const c = value as ColorLike;
      const repeated = { r: c.r ?? 0, g: c.g ?? 0, b: c.b ?? 0, a: c.a ?? 1 };
      return new Array(count).fill(repeated);
    }
    // For other object types, just repeat
    return new Array(count).fill(value);
  }

  // Fallback
  return new Array(count).fill(value);
}

/**
 * Store a per-element array as a named attribute on the geometry.
 */
function storePerElementAttribute(
  geometry: THREE.BufferGeometry,
  attrName: string,
  values: unknown[],
  dataType: string,
  count: number,
): void {
  if (values.length === 0) return;

  const safeCount = Math.min(values.length, count);

  if (dataType === 'FLOAT' || dataType === 'FLOAT_FACTOR') {
    const data = new Float32Array(count);
    for (let i = 0; i < safeCount; i++) {
      data[i] = typeof values[i] === 'number' ? (values[i] as number) : 0;
    }
    geometry.setAttribute(attrName, new THREE.Float32BufferAttribute(data, 1));
  } else if (dataType === 'FLOAT_VECTOR' || dataType === 'VECTOR') {
    const data = new Float32Array(count * 3);
    for (let i = 0; i < safeCount; i++) {
      const v = normalizeVec(values[i]);
      data[i * 3] = v.x;
      data[i * 3 + 1] = v.y;
      data[i * 3 + 2] = v.z;
    }
    geometry.setAttribute(attrName, new THREE.Float32BufferAttribute(data, 3));
  } else if (dataType === 'FLOAT_COLOR' || dataType === 'COLOR') {
    const data = new Float32Array(count * 4);
    for (let i = 0; i < safeCount; i++) {
      const c = values[i] as ColorLike;
      data[i * 4] = c?.r ?? 0;
      data[i * 4 + 1] = c?.g ?? 0;
      data[i * 4 + 2] = c?.b ?? 0;
      data[i * 4 + 3] = c?.a ?? 1;
    }
    geometry.setAttribute(attrName, new THREE.Float32BufferAttribute(data, 4));
  } else if (dataType === 'INT') {
    const data = new Int32Array(count);
    for (let i = 0; i < safeCount; i++) {
      data[i] = typeof values[i] === 'number' ? Math.floor(values[i] as number) : 0;
    }
    geometry.setAttribute(attrName, new THREE.Int32BufferAttribute(data, 1));
  } else if (dataType === 'BOOLEAN') {
    const data = new Uint8Array(count);
    for (let i = 0; i < safeCount; i++) {
      data[i] = values[i] ? 1 : 0;
    }
    geometry.setAttribute(attrName, new THREE.Uint8BufferAttribute(data, 1));
  }
}

/**
 * 9. RemoveAttribute — Remove a named attribute from geometry.
 * Inputs: Geometry, Name, Pattern (exact/wildcard)
 * Outputs: Geometry
 */
export function executeRemoveAttribute(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const name = (inputs.Name ?? inputs.name ?? inputs.AttributeName ?? '') as string;
  const pattern = (inputs.Pattern ?? inputs.pattern ?? 'exact') as string; // 'exact' | 'wildcard'

  if (!geometry || !name) return { Geometry: geometry };

  const result = geometry.clone();

  if (pattern === 'wildcard') {
    // Simple wildcard: treat * as any chars
    const regex = new RegExp('^' + name.replace(/\*/g, '.*') + '$');
    const attrsToDelete: string[] = [];
    for (const attrName of Object.keys(result.attributes)) {
      if (regex.test(attrName) && !['position', 'normal', 'uv', 'uv1', 'uv2', 'index'].includes(attrName)) {
        attrsToDelete.push(attrName);
      }
    }
    for (const attr of attrsToDelete) {
      result.deleteAttribute(attr);
    }
  } else {
    // Exact match — never delete core attributes
    if (!['position', 'normal', 'uv', 'uv1', 'uv2', 'index'].includes(name)) {
      result.deleteAttribute(name);
    }
  }

  return { Geometry: result };
}

/**
 * 10. SampleIndex — Sample an attribute value at a specific index.
 * Inputs: Geometry, Value (attribute data), Index, Domain, Data Type, Clamp
 * Outputs: Value (the sampled attribute value)
 */
export function executeSampleIndex(inputs: NodeInputs): NodeOutput {
  const value = (inputs.Value ?? inputs.value ?? inputs.Attribute ?? null) as unknown;
  const index = (inputs.Index ?? inputs.index ?? 0) as number;
  const clamp = (inputs.Clamp ?? inputs.clamp ?? true) as boolean;

  // If value is an array, sample at index
  if (Array.isArray(value)) {
    const idx = clamp
      ? Math.max(0, Math.min(value.length - 1, Math.floor(index)))
      : Math.floor(index);
    return { Value: idx >= 0 && idx < value.length ? value[idx] : null };
  }

  // If value is a typed array
  if (value instanceof Float32Array || value instanceof Int32Array || value instanceof Uint8Array) {
    const idx = clamp
      ? Math.max(0, Math.min(value.length - 1, Math.floor(index)))
      : Math.floor(index);
    return { Value: idx >= 0 && idx < value.length ? value[idx] : null };
  }

  // Single value — return as-is
  return { Value: value };
}

/**
 * 11. SampleNearest — Find the nearest element index to a given position.
 * Inputs: Geometry, SamplePosition, Domain
 * Outputs: Index (nearest element index)
 */
export function executeSampleNearest(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const samplePos = normalizeVec(inputs.SamplePosition ?? inputs.samplePosition ?? inputs.Position ?? inputs.position ?? { x: 0, y: 0, z: 0 });
  const domain = (inputs.Domain ?? inputs.domain ?? 'POINT') as string;

  if (!geometry || !geometry.getAttribute('position')) {
    return { Index: 0 };
  }

  const posAttr = geometry.getAttribute('position');
  const target = new THREE.Vector3(samplePos.x, samplePos.y, samplePos.z);

  let nearestIdx = 0;
  let nearestDist = Infinity;

  if (domain === 'POINT') {
    for (let i = 0; i < posAttr.count; i++) {
      const pos = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      const dist = pos.distanceTo(target);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }
  } else if (domain === 'FACE') {
    const idxAttr = geometry.getIndex();
    if (idxAttr) {
      const faceCount = Math.floor(idxAttr.count / 3);
      for (let f = 0; f < faceCount; f++) {
        const i0 = idxAttr.getX(f * 3);
        const i1 = idxAttr.getX(f * 3 + 1);
        const i2 = idxAttr.getX(f * 3 + 2);
        const center = new THREE.Vector3(
          (posAttr.getX(i0) + posAttr.getX(i1) + posAttr.getX(i2)) / 3,
          (posAttr.getY(i0) + posAttr.getY(i1) + posAttr.getY(i2)) / 3,
          (posAttr.getZ(i0) + posAttr.getZ(i1) + posAttr.getZ(i2)) / 3,
        );
        const dist = center.distanceTo(target);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = f;
        }
      }
    }
  }

  return { Index: nearestIdx };
}

/**
 * 12. DomainSize — Get the number of elements in a geometry domain.
 * Inputs: Geometry, Domain (POINT/EDGE/FACE/CORNER/CURVE/INSTANCE)
 * Outputs: PointCount, EdgeCount, FaceCount, CornerCount, SplineCount, InstanceCount
 */
export function executeDomainSize(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const domain = (inputs.Domain ?? inputs.domain ?? 'POINT') as string;
  const component = (inputs.Component ?? inputs.component ?? 'MESH') as string;

  let pointCount = 0;
  let edgeCount = 0;
  let faceCount = 0;
  let cornerCount = 0;

  if (geometry) {
    const posAttr = geometry.getAttribute('position');
    const idxAttr = geometry.getIndex();

    pointCount = posAttr?.count ?? 0;
    if (idxAttr) {
      faceCount = Math.floor(idxAttr.count / 3);
      cornerCount = faceCount * 3;

      // Count unique edges
      const edgeSet = new Set<string>();
      for (let f = 0; f < faceCount; f++) {
        for (let e = 0; e < 3; e++) {
          const a = idxAttr.getX(f * 3 + e);
          const b = idxAttr.getX(f * 3 + ((e + 1) % 3));
          edgeSet.add(edgeKey(a, b));
        }
      }
      edgeCount = edgeSet.size;
    } else {
      faceCount = Math.floor(pointCount / 3);
      cornerCount = faceCount * 3;
      edgeCount = faceCount * 3; // Approximate for non-indexed
    }
  }

  return {
    PointCount: pointCount,
    EdgeCount: edgeCount,
    FaceCount: faceCount,
    CornerCount: cornerCount,
    SplineCount: 0,
    InstanceCount: 0,
  };
}

// ============================================================================
// Curve Modifier Node Executors (5)
// ============================================================================

/**
 * 13. SetCurveRadius — Set the radius attribute on curve geometry.
 * Inputs: Geometry, Radius, Selection
 * Outputs: Geometry
 */
export function executeSetCurveRadius(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const radius = (inputs.Radius ?? inputs.radius ?? 0.5) as number;
  const selection = (inputs.Selection ?? inputs.selection ?? null) as unknown[] | null;

  if (!geometry) return { Geometry: geometry };

  const result = geometry.clone();
  const posAttr = result.getAttribute('position');
  if (!posAttr) return { Geometry: result };

  const count = posAttr.count;
  const radiusData = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const isSelected = selection === null || (Array.isArray(selection) && selection[i]);
    radiusData[i] = isSelected ? radius : (result.getAttribute('radius')?.getX(i) ?? 1.0);
  }

  result.setAttribute('radius', new THREE.Float32BufferAttribute(radiusData, 1));
  return { Geometry: result };
}

/**
 * 14. SetCurveTilt — Set the tilt attribute on curve geometry.
 * Inputs: Geometry, Tilt, Selection
 * Outputs: Geometry
 */
export function executeSetCurveTilt(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const tilt = (inputs.Tilt ?? inputs.tilt ?? 0.0) as number;
  const selection = (inputs.Selection ?? inputs.selection ?? null) as unknown[] | null;

  if (!geometry) return { Geometry: geometry };

  const result = geometry.clone();
  const posAttr = result.getAttribute('position');
  if (!posAttr) return { Geometry: result };

  const count = posAttr.count;
  const tiltData = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const isSelected = selection === null || (Array.isArray(selection) && selection[i]);
    tiltData[i] = isSelected ? tilt : (result.getAttribute('tilt')?.getX(i) ?? 0.0);
  }

  result.setAttribute('tilt', new THREE.Float32BufferAttribute(tiltData, 1));
  return { Geometry: result };
}

/**
 * 15. SetHandlePositions — Set bezier handle positions (left/right) on curve geometry.
 * Inputs: Geometry, Position, Direction (LEFT/RIGHT/BOTH), Selection
 * Outputs: Geometry
 */
export function executeSetHandlePositions(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const position = normalizeVec(inputs.Position ?? inputs.position ?? { x: 0, y: 0, z: 0 });
  const direction = (inputs.Direction ?? inputs.direction ?? inputs.mode ?? 'BOTH') as string; // 'LEFT' | 'RIGHT' | 'BOTH'
  const selection = (inputs.Selection ?? inputs.selection ?? null) as unknown[] | null;

  if (!geometry) return { Geometry: geometry };

  const result = geometry.clone();
  const posAttr = result.getAttribute('position');
  if (!posAttr) return { Geometry: result };

  const count = posAttr.count;
  const p = new THREE.Vector3(position.x, position.y, position.z);

  // For each selected control point, set handle positions
  // Handles are stored as separate attributes offset from the main position
  if (direction === 'LEFT' || direction === 'BOTH') {
    const handleLeftData = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const isSelected = selection === null || (Array.isArray(selection) && selection[i]);
      const base = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      if (isSelected) {
        handleLeftData[i * 3] = p.x;
        handleLeftData[i * 3 + 1] = p.y;
        handleLeftData[i * 3 + 2] = p.z;
      } else {
        // Keep existing or use offset from position
        const existing = result.getAttribute('handleLeft');
        if (existing) {
          handleLeftData[i * 3] = existing.getX(i);
          handleLeftData[i * 3 + 1] = existing.getY(i);
          handleLeftData[i * 3 + 2] = existing.getZ(i);
        } else {
          handleLeftData[i * 3] = base.x;
          handleLeftData[i * 3 + 1] = base.y;
          handleLeftData[i * 3 + 2] = base.z;
        }
      }
    }
    result.setAttribute('handleLeft', new THREE.Float32BufferAttribute(handleLeftData, 3));
  }

  if (direction === 'RIGHT' || direction === 'BOTH') {
    const handleRightData = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const isSelected = selection === null || (Array.isArray(selection) && selection[i]);
      const base = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      if (isSelected) {
        handleRightData[i * 3] = p.x;
        handleRightData[i * 3 + 1] = p.y;
        handleRightData[i * 3 + 2] = p.z;
      } else {
        const existing = result.getAttribute('handleRight');
        if (existing) {
          handleRightData[i * 3] = existing.getX(i);
          handleRightData[i * 3 + 1] = existing.getY(i);
          handleRightData[i * 3 + 2] = existing.getZ(i);
        } else {
          handleRightData[i * 3] = base.x;
          handleRightData[i * 3 + 1] = base.y;
          handleRightData[i * 3 + 2] = base.z;
        }
      }
    }
    result.setAttribute('handleRight', new THREE.Float32BufferAttribute(handleRightData, 3));
  }

  return { Geometry: result };
}

/**
 * 16. SplineParameter — Get parameter values along a spline.
 * Inputs: Geometry
 * Outputs: Factor (0-1 along spline), Length (distance along spline), Index
 */
export function executeSplineParameter(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;

  if (!geometry || !geometry.getAttribute('position')) {
    return { Factor: 0, Length: 0, Index: 0 };
  }

  const posAttr = geometry.getAttribute('position');
  const count = posAttr.count;

  // Compute cumulative length along the curve
  let totalLength = 0;
  const lengths: number[] = [0];
  for (let i = 1; i < count; i++) {
    const prev = new THREE.Vector3(posAttr.getX(i - 1), posAttr.getY(i - 1), posAttr.getZ(i - 1));
    const curr = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    totalLength += prev.distanceTo(curr);
    lengths.push(totalLength);
  }

  // Return arrays for per-point evaluation
  const factors: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < count; i++) {
    factors.push(totalLength > 0 ? lengths[i] / totalLength : i / Math.max(1, count - 1));
    indices.push(i);
  }

  return {
    Factor: factors,
    Length: lengths,
    Index: indices,
  };
}

/**
 * 17. FilletCurve — Round the corners of a curve with a given radius.
 * Inputs: Geometry, Radius, LimitRadius, Count (segments per fillet)
 * Outputs: Geometry
 */
export function executeFilletCurve(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const radius = (inputs.Radius ?? inputs.radius ?? 0.5) as number;
  const limitRadius = (inputs.LimitRadius ?? inputs.limitRadius ?? true) as boolean;
  const count = (inputs.Count ?? inputs.count ?? 5) as number; // segments per fillet arc

  if (!geometry || !geometry.getAttribute('position')) {
    return { Geometry: geometry ?? new THREE.BufferGeometry() };
  }

  const posAttr = geometry.getAttribute('position');
  const pointCount = posAttr.count;

  if (pointCount < 3) return { Geometry: geometry.clone() };

  // Build point array
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < pointCount; i++) {
    points.push(new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
  }

  // For each interior point, create a fillet arc
  const newPositions: number[] = [];

  for (let i = 0; i < points.length; i++) {
    if (i === 0 || i === points.length - 1) {
      // Endpoints: keep as-is
      newPositions.push(points[i].x, points[i].y, points[i].z);
      continue;
    }

    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    // Compute the two edge vectors
    const edge1 = new THREE.Vector3().subVectors(prev, curr);
    const edge2 = new THREE.Vector3().subVectors(next, curr);
    const len1 = edge1.length();
    const len2 = edge2.length();

    if (len1 < 1e-8 || len2 < 1e-8) {
      newPositions.push(curr.x, curr.y, curr.z);
      continue;
    }

    edge1.normalize();
    edge2.normalize();

    // Compute half-angle and tangent distance
    const dot = THREE.MathUtils.clamp(edge1.dot(edge2), -1, 1);
    const halfAngle = Math.acos(dot) / 2;
    const sinHalf = Math.sin(halfAngle);

    // Limit radius so arc doesn't exceed half of adjacent edge lengths
    let filletR = radius;
    if (limitRadius && sinHalf > 1e-8) {
      const maxR = Math.min(len1, len2) * sinHalf;
      filletR = Math.min(filletR, maxR);
    }

    if (filletR < 1e-8 || sinHalf < 1e-8) {
      newPositions.push(curr.x, curr.y, curr.z);
      continue;
    }

    // Distance from corner to tangent point
    const tangentDist = filletR / Math.tan(halfAngle);

    // Tangent points on edges
    const t1 = curr.clone().add(edge1.clone().multiplyScalar(tangentDist));
    const t2 = curr.clone().add(edge2.clone().multiplyScalar(tangentDist));

    // Arc center: offset from corner along the angle bisector
    const bisector = new THREE.Vector3().addVectors(edge1, edge2).normalize();
    const centerDist = tangentDist / Math.cos(halfAngle);
    const center = curr.clone().add(bisector.multiplyScalar(centerDist));

    // Generate arc points
    const v1 = new THREE.Vector3().subVectors(t1, center).normalize();
    const v2 = new THREE.Vector3().subVectors(t2, center).normalize();
    const angleBetween = Math.acos(THREE.MathUtils.clamp(v1.dot(v2), -1, 1));

    // Choose correct arc direction
    const cross = new THREE.Vector3().crossVectors(v1, v2);
    const segments = Math.max(1, count);
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const angle = angleBetween * t;
      const axis = cross.normalize();
      const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
      const p = v1.clone().applyQuaternion(q).multiplyScalar(filletR).add(center);
      // Avoid duplicating first/last point
      if (s > 0 && s < segments) {
        newPositions.push(p.x, p.y, p.z);
      }
    }
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  return { Geometry: result };
}

// ============================================================================
// Instance Transform Node Executors (3)
// ============================================================================

/**
 * 18. TranslateInstances — Apply translation to geometry instances.
 * Inputs: Geometry, Translation, Selection
 * Outputs: Geometry
 */
export function executeTranslateInstances(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const translation = normalizeVec(inputs.Translation ?? inputs.translation ?? inputs.Offset ?? inputs.offset ?? { x: 0, y: 0, z: 0 });
  const selection = (inputs.Selection ?? inputs.selection ?? null) as unknown[] | null;

  if (!geometry || !geometry.getAttribute('position')) return { Geometry: geometry };

  const result = geometry.clone();
  const posAttr = result.getAttribute('position');

  // Check if geometry has instance transform attribute
  const instanceTransform = result.getAttribute('instanceTransform');
  if (instanceTransform) {
    // Apply to instance transforms (16-float matrix per instance)
    for (let i = 0; i < instanceTransform.count; i++) {
      const isSelected = selection === null || (Array.isArray(selection) && selection[i]);
      if (isSelected) {
        // Add translation to the 4th column of the transform matrix
        const tx = instanceTransform.getX(i * 4 + 3) + translation.x;
        const ty = instanceTransform.getY(i * 4 + 3) + translation.y;
        const tz = instanceTransform.getZ(i * 4 + 3) + translation.z;
        // This is a simplified model — real 4x4 matrix would need proper handling
        instanceTransform.setXYZ(i * 4 + 3, tx, ty, tz);
      }
    }
    instanceTransform.needsUpdate = true;
  } else {
    // Fallback: translate all vertices (single instance)
    for (let i = 0; i < posAttr.count; i++) {
      posAttr.setXYZ(
        i,
        posAttr.getX(i) + translation.x,
        posAttr.getY(i) + translation.y,
        posAttr.getZ(i) + translation.z,
      );
    }
    posAttr.needsUpdate = true;
  }

  return { Geometry: result };
}

/**
 * 19. RotateInstances — Apply rotation to geometry instances.
 * Inputs: Geometry, Rotation (Euler), Selection
 * Outputs: Geometry
 */
export function executeRotateInstances(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const rotation = normalizeVec(inputs.Rotation ?? inputs.rotation ?? inputs.Euler ?? inputs.euler ?? { x: 0, y: 0, z: 0 });
  const selection = (inputs.Selection ?? inputs.selection ?? null) as unknown[] | null;

  if (!geometry || !geometry.getAttribute('position')) return { Geometry: geometry };

  const result = geometry.clone();
  const posAttr = result.getAttribute('position');
  const normAttr = result.getAttribute('normal');

  const euler = new THREE.Euler(rotation.x, rotation.y, rotation.z, 'XYZ');
  const quat = new THREE.Quaternion().setFromEuler(euler);
  const normalMat = new THREE.Matrix3().getNormalMatrix(new THREE.Matrix4().makeRotationFromQuaternion(quat));

  // Check if geometry has instance transform attribute
  const instanceTransform = result.getAttribute('instanceTransform');
  if (instanceTransform) {
    for (let i = 0; i < instanceTransform.count; i++) {
      const isSelected = selection === null || (Array.isArray(selection) && selection[i]);
      if (isSelected) {
        // Pre-multiply rotation into the transform (simplified)
        // In practice, this would compose a 4x4 matrix
      }
    }
    instanceTransform.needsUpdate = true;
  } else {
    for (let i = 0; i < posAttr.count; i++) {
      const pos = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).applyQuaternion(quat);
      posAttr.setXYZ(i, pos.x, pos.y, pos.z);
    }
    posAttr.needsUpdate = true;

    if (normAttr) {
      for (let i = 0; i < normAttr.count; i++) {
        const n = new THREE.Vector3(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i)).applyMatrix3(normalMat).normalize();
        normAttr.setXYZ(i, n.x, n.y, n.z);
      }
      normAttr.needsUpdate = true;
    }
  }

  return { Geometry: result };
}

/**
 * 20. ScaleInstances — Apply scale to geometry instances.
 * Inputs: Geometry, Scale, Center, Selection
 * Outputs: Geometry
 */
export function executeScaleInstances(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const scale = normalizeVec(inputs.Scale ?? inputs.scale ?? { x: 1, y: 1, z: 1 });
  const center = normalizeVec(inputs.Center ?? inputs.center ?? { x: 0, y: 0, z: 0 });
  const selection = (inputs.Selection ?? inputs.selection ?? null) as unknown[] | null;

  if (!geometry || !geometry.getAttribute('position')) return { Geometry: geometry };

  const result = geometry.clone();
  const posAttr = result.getAttribute('position');

  // Check if geometry has instance transform attribute
  const instanceTransform = result.getAttribute('instanceTransform');
  if (instanceTransform) {
    for (let i = 0; i < instanceTransform.count; i++) {
      const isSelected = selection === null || (Array.isArray(selection) && selection[i]);
      if (isSelected) {
        // Scale the transform (simplified)
      }
    }
    instanceTransform.needsUpdate = true;
  } else {
    const cx = center.x, cy = center.y, cz = center.z;
    for (let i = 0; i < posAttr.count; i++) {
      posAttr.setXYZ(
        i,
        (posAttr.getX(i) - cx) * scale.x + cx,
        (posAttr.getY(i) - cy) * scale.y + cy,
        (posAttr.getZ(i) - cz) * scale.z + cz,
      );
    }
    posAttr.needsUpdate = true;
  }

  return { Geometry: result };
}

// ============================================================================
// Volume/Point Conversion Node Executors (4)
// ============================================================================

/**
 * 21. VolumeToMesh — Convert a volume (SDF) to mesh using marching cubes.
 * Inputs: Density (SDF function or grid), VoxelSize, Threshold, Bounds
 * Outputs: Geometry
 */
export function executeVolumeToMesh(inputs: NodeInputs): NodeOutput {
  const density = (inputs.Density ?? inputs.density ?? inputs.SDF ?? inputs.sdf ?? null) as ((x: number, y: number, z: number) => number) | null;
  const voxelSize = (inputs.VoxelSize ?? inputs.voxelSize ?? inputs.voxel_size ?? 0.5) as number;
  const threshold = (inputs.Threshold ?? inputs.threshold ?? 0.0) as number;
  const bounds = (inputs.Bounds ?? inputs.bounds ?? { min: { x: -5, y: -5, z: -5 }, max: { x: 5, y: 5, z: 5 } }) as { min: unknown; max: unknown };

  // If a geometry is provided, treat it as an SDF source
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;

  if (geometry && geometry.getAttribute('position')) {
    // Use the existing geometry as-is (it's already a mesh)
    return { Geometry: geometry.clone() };
  }

  // Simple marching cubes: generate a sphere SDF as default
  const bMin = normalizeVec(bounds.min ?? { x: -5, y: -5, z: -5 });
  const bMax = normalizeVec(bounds.max ?? { x: 5, y: 5, z: 5 });
  const vs = Math.max(0.01, voxelSize);

  // Sample the SDF on a grid
  const nx = Math.ceil((bMax.x - bMin.x) / vs) + 1;
  const ny = Math.ceil((bMax.y - bMin.y) / vs) + 1;
  const nz = Math.ceil((bMax.z - bMin.z) / vs) + 1;

  // Use provided density function or default sphere
  const sampleSDF = typeof density === 'function'
    ? density
    : (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z) - 2.0;

  // Generate grid values
  const grid = new Float32Array(nx * ny * nz);
  for (let iz = 0; iz < nz; iz++) {
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const x = bMin.x + ix * vs;
        const y = bMin.y + iy * vs;
        const z = bMin.z + iz * vs;
        grid[iz * ny * nx + iy * nx + ix] = sampleSDF(x, y, z) - threshold;
      }
    }
  }

  // Simplified marching cubes — generate vertices for cells that cross the surface
  const positions: number[] = [];
  const indices: number[] = [];
  let vertCount = 0;

  for (let iz = 0; iz < nz - 1; iz++) {
    for (let iy = 0; iy < ny - 1; iy++) {
      for (let ix = 0; ix < nx - 1; ix++) {
        // Sample 8 corners of the cube
        const idx = (iz * ny * nx + iy * nx + ix);
        const v000 = grid[idx];
        const v100 = grid[idx + 1];
        const v010 = grid[idx + nx];
        const v110 = grid[idx + nx + 1];
        const v001 = grid[idx + ny * nx];
        const v101 = grid[idx + ny * nx + 1];
        const v011 = grid[idx + (ny + 1) * nx];
        const v111 = grid[idx + (ny + 1) * nx + 1];

        // Count sign changes
        const corners = [v000, v100, v010, v110, v001, v101, v011, v111];
        const hasPositive = corners.some(v => v > 0);
        const hasNegative = corners.some(v => v < 0);

        if (!hasPositive || !hasNegative) continue; // No surface crossing

        // Generate a simple quad for this cell (approximation)
        const cx = bMin.x + (ix + 0.5) * vs;
        const cy = bMin.y + (iy + 0.5) * vs;
        const cz = bMin.z + (iz + 0.5) * vs;
        const hvs = vs * 0.3;

        // Approximate surface point and normal
        const surfX = cx;
        const surfY = cy;
        const surfZ = cz;

        // Create a small oriented quad at the surface
        positions.push(
          surfX - hvs, surfY - hvs, surfZ,
          surfX + hvs, surfY - hvs, surfZ,
          surfX + hvs, surfY + hvs, surfZ,
          surfX - hvs, surfY + hvs, surfZ,
        );
        indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
        vertCount += 4;
      }
    }
  }

  const result = new THREE.BufferGeometry();
  if (positions.length > 0) {
    result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    result.setIndex(indices);
    result.computeVertexNormals();
  }

  return { Geometry: result };
}

/**
 * 22. VolumeToPoints — Sample a volume as a point cloud.
 * Inputs: Density (SDF), VoxelSize, Threshold, Bounds, Seed
 * Outputs: Geometry (point cloud)
 */
export function executeVolumeToPoints(inputs: NodeInputs): NodeOutput {
  const density = (inputs.Density ?? inputs.density ?? inputs.SDF ?? inputs.sdf ?? null) as ((x: number, y: number, z: number) => number) | null;
  const voxelSize = (inputs.VoxelSize ?? inputs.voxelSize ?? inputs.voxel_size ?? 0.5) as number;
  const threshold = (inputs.Threshold ?? inputs.threshold ?? 0.5) as number;
  const bounds = (inputs.Bounds ?? inputs.bounds ?? { min: { x: -5, y: -5, z: -5 }, max: { x: 5, y: 5, z: 5 } }) as { min: unknown; max: unknown };
  const seed = (inputs.Seed ?? inputs.seed ?? 0) as number;

  const bMin = normalizeVec(bounds.min ?? { x: -5, y: -5, z: -5 });
  const bMax = normalizeVec(bounds.max ?? { x: 5, y: 5, z: 5 });
  const vs = Math.max(0.01, voxelSize);

  const sampleSDF = typeof density === 'function'
    ? density
    : (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z) - 2.0;

  const random = seededRandom(seed);
  const positions: number[] = [];

  const nx = Math.ceil((bMax.x - bMin.x) / vs);
  const ny = Math.ceil((bMax.y - bMin.y) / vs);
  const nz = Math.ceil((bMax.z - bMin.z) / vs);

  for (let iz = 0; iz < nz; iz++) {
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const x = bMin.x + (ix + random()) * vs;
        const y = bMin.y + (iy + random()) * vs;
        const z = bMin.z + (iz + random()) * vs;

        const d = sampleSDF(x, y, z);
        if (d < threshold) {
          positions.push(x, y, z);
        }
      }
    }
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return { Geometry: result };
}

/**
 * 23. PointsToVertices — Convert point cloud to vertex geometry (identity with cleanup).
 * Inputs: Geometry (point cloud)
 * Outputs: Geometry (vertices)
 */
export function executePointsToVertices(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;

  if (!geometry || !geometry.getAttribute('position')) {
    return { Geometry: new THREE.BufferGeometry() };
  }

  // Points are already vertices — just clean up any non-essential attributes
  const result = new THREE.BufferGeometry();
  const posAttr = geometry.getAttribute('position');

  // Copy position data
  result.setAttribute('position', new THREE.Float32BufferAttribute(
    Float32Array.from(posAttr.array as Float32Array), 3
  ));

  // Copy normals if present
  const normAttr = geometry.getAttribute('normal');
  if (normAttr) {
    result.setAttribute('normal', new THREE.Float32BufferAttribute(
      Float32Array.from(normAttr.array as Float32Array), 3
    ));
  }

  // Copy radius if present
  const radAttr = geometry.getAttribute('radius');
  if (radAttr) {
    result.setAttribute('radius', new THREE.Float32BufferAttribute(
      Float32Array.from(radAttr.array as Float32Array), 1
    ));
  }

  return { Geometry: result };
}

/**
 * 24. PointsToCurves — Convert point cloud to curve(s) by connecting sequential points.
 * Inputs: Geometry, CurveGroupID (per-point group assignment), SortWeight
 * Outputs: Geometry (curves)
 */
export function executePointsToCurves(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const groupID = (inputs.CurveGroupID ?? inputs.curveGroupId ?? inputs.GroupID ?? inputs.groupId ?? null) as number | null;
  const sortWeight = (inputs.SortWeight ?? inputs.sortWeight ?? null) as number | null;

  if (!geometry || !geometry.getAttribute('position')) {
    return { Geometry: new THREE.BufferGeometry() };
  }

  const posAttr = geometry.getAttribute('position');
  const count = posAttr.count;

  if (count === 0) return { Geometry: new THREE.BufferGeometry() };

  // If no grouping, connect all points as a single curve
  if (!groupID) {
    const result = geometry.clone();
    // Add curve metadata
    result.setAttribute('curveIndex', new THREE.Float32BufferAttribute(
      new Float32Array(count).fill(0), 1
    ));
    return { Geometry: result };
  }

  // Group points by curve ID
  const groups = new Map<number, number[]>();
  for (let i = 0; i < count; i++) {
    const gid = Array.isArray(groupID) ? (groupID[i] ?? 0) : 0;
    if (!groups.has(gid)) groups.set(gid, []);
    groups.get(gid)!.push(i);
  }

  // Sort points within each group if sort weight provided
  for (const [_, indices] of groups) {
    if (sortWeight && Array.isArray(sortWeight)) {
      indices.sort((a, b) => (sortWeight[a] ?? 0) - (sortWeight[b] ?? 0));
    }
  }

  // Build curve geometry with reordered points
  const newPositions: number[] = [];
  const curveIndices: number[] = [];

  let vertOffset = 0;
  for (const [gid, indices] of groups) {
    for (const idx of indices) {
      newPositions.push(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
      curveIndices.push(gid);
    }
    vertOffset += indices.length;
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  result.setAttribute('curveIndex', new THREE.Float32BufferAttribute(
    new Float32Array(curveIndices), 1
  ));

  return { Geometry: result };
}

// ============================================================================
// Geometry Operation Node Executors (3)
// ============================================================================

/**
 * 25. SetPosition — Set vertex positions directly (with optional offset).
 * Inputs: Geometry, Position, Offset, Selection
 * Outputs: Geometry
 */
export function executeSetPosition(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const position = (inputs.Position ?? inputs.position ?? null) as Vector3Like | null;
  const offset = (inputs.Offset ?? inputs.offset ?? null) as Vector3Like | null;
  const selection = (inputs.Selection ?? inputs.selection ?? null) as unknown[] | null;

  if (!geometry || !geometry.getAttribute('position')) return { Geometry: geometry };

  const result = geometry.clone();
  const posAttr = result.getAttribute('position');

  for (let i = 0; i < posAttr.count; i++) {
    const isSelected = selection === null || (Array.isArray(selection) && selection[i]);
    if (!isSelected) continue;

    if (position) {
      const newPos = normalizeVec(Array.isArray(position) ? position[i] : position);
      posAttr.setXYZ(i, newPos.x, newPos.y, newPos.z);
    }

    if (offset) {
      const off = normalizeVec(Array.isArray(offset) ? offset[i] : offset);
      posAttr.setXYZ(i, posAttr.getX(i) + off.x, posAttr.getY(i) + off.y, posAttr.getZ(i) + off.z);
    }
  }

  posAttr.needsUpdate = true;
  return { Geometry: result };
}

/**
 * 26. DuplicateElements — Duplicate selected mesh elements (faces/vertices/edges).
 * Inputs: Geometry, Selection, Domain, Amount
 * Outputs: Geometry, DuplicateIndex
 */
export function executeDuplicateElements(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const selection = (inputs.Selection ?? inputs.selection ?? null) as unknown[] | null;
  const domain = (inputs.Domain ?? inputs.domain ?? 'FACE') as string;
  const amount = (inputs.Amount ?? inputs.amount ?? 1) as number;

  if (!geometry || !geometry.getAttribute('position') || !geometry.getIndex()) {
    return { Geometry: geometry ?? new THREE.BufferGeometry(), DuplicateIndex: [] };
  }

  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex()!;
  const faceCount = Math.floor(idxAttr.count / 3);

  const newPositions: number[] = [];
  const newIndices: number[] = [];
  const duplicateIndices: number[] = [];
  let vertOffset = 0;

  // Copy all original faces
  for (let f = 0; f < faceCount; f++) {
    const i0 = idxAttr.getX(f * 3);
    const i1 = idxAttr.getX(f * 3 + 1);
    const i2 = idxAttr.getX(f * 3 + 2);

    newPositions.push(
      posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0),
      posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1),
      posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2),
    );
    newIndices.push(vertOffset, vertOffset + 1, vertOffset + 2);
    duplicateIndices.push(0);
    vertOffset += 3;
  }

  // Duplicate selected faces
  for (let copy = 0; copy < amount; copy++) {
    for (let f = 0; f < faceCount; f++) {
      const isSelected = selection === null || (Array.isArray(selection) && selection[f]);
      if (!isSelected) continue;

      const i0 = idxAttr.getX(f * 3);
      const i1 = idxAttr.getX(f * 3 + 1);
      const i2 = idxAttr.getX(f * 3 + 2);

      newPositions.push(
        posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0),
        posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1),
        posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2),
      );
      newIndices.push(vertOffset, vertOffset + 1, vertOffset + 2);
      duplicateIndices.push(copy + 1);
      vertOffset += 3;
    }
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  result.setIndex(newIndices);
  result.computeVertexNormals();

  return { Geometry: result, DuplicateIndex: duplicateIndices };
}

/**
 * 27. SetShadeSmooth — Set smooth/flat shading on a per-face basis.
 * Inputs: Geometry, ShadeSmooth (boolean or per-face array), Selection
 * Outputs: Geometry
 */
export function executeSetShadeSmooth(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const shadeSmooth = (inputs.ShadeSmooth ?? inputs.shadeSmooth ?? inputs.Smooth ?? inputs.smooth ?? true) as boolean;
  const selection = (inputs.Selection ?? inputs.selection ?? null) as unknown[] | null;

  if (!geometry || !geometry.getAttribute('position')) return { Geometry: geometry };

  const result = geometry.clone();
  const idxAttr = result.getIndex();
  const faceCount = idxAttr ? Math.floor(idxAttr.count / 3) : 0;

  // Store shade smooth attribute per face
  const smoothData = new Float32Array(faceCount);
  for (let f = 0; f < faceCount; f++) {
    const isSelected = selection === null || (Array.isArray(selection) && selection[f]);
    if (isSelected) {
      smoothData[f] = Array.isArray(shadeSmooth) ? (shadeSmooth[f] ? 1 : 0) : (shadeSmooth ? 1 : 0);
    } else {
      smoothData[f] = 1; // Default smooth
    }
  }
  result.setAttribute('shadeSmooth', new THREE.Float32BufferAttribute(smoothData, 1));

  // If all smooth, compute smooth normals; otherwise we'd need split normals
  const allSmooth = smoothData.every(v => v > 0);
  if (allSmooth) {
    result.computeVertexNormals();
  } else {
    // For mixed smooth/flat, we need to split vertices at flat-shaded edges
    // Simplified: recompute normals for now
    result.computeVertexNormals();
  }

  return { Geometry: result };
}

// ============================================================================
// Shader Input / Light Node Executors (3)
// ============================================================================

/**
 * 28. LightFalloff — Compute light intensity falloff for given distance.
 * Inputs: Strength, Smooth, Distance
 * Outputs: Quadratic, Linear, Constant
 */
export function executeLightFalloff(inputs: NodeInputs): NodeOutput {
  const strength = (inputs.Strength ?? inputs.strength ?? 1.0) as number;
  const smooth = (inputs.Smooth ?? inputs.smooth ?? 0.0) as number;
  const distance = (inputs.Distance ?? inputs.distance ?? 1.0) as number;

  const d = Math.max(0.001, distance);
  const d2 = d * d;

  // Inverse square (physically correct)
  const quadratic = strength / d2;

  // Linear falloff
  const linear = strength / d;

  // Constant (no falloff)
  const constant = strength;

  // Apply smooth attenuation
  if (smooth > 0) {
    const attenuation = Math.exp(-d / Math.max(0.001, smooth));
    return {
      Quadratic: quadratic * attenuation,
      Linear: linear * attenuation,
      Constant: constant * attenuation,
    };
  }

  return { Quadratic: quadratic, Linear: linear, Constant: constant };
}

/**
 * 29. ObjectIndex — Input node for the object's index in a collection/scene.
 * Inputs: (none — uses node settings)
 * Outputs: Integer
 */
export function executeObjectIndex(inputs: NodeInputs, settings?: Record<string, unknown>): NodeOutput {
  const index = (inputs.Index ?? inputs.index ?? (settings as Record<string, unknown>)?.index ?? (settings as Record<string, unknown>)?.value ?? 0) as number;
  return { Integer: Math.floor(index) };
}

/**
 * 30. IsCameraRay — Shader input that indicates whether the current ray is a camera ray.
 * Inputs: (none — context-dependent)
 * Outputs: Boolean
 *
 * In a rasterization context, all primary rays are camera rays.
 * In a ray-tracing context, this distinguishes primary from bounced rays.
 */
export function executeIsCameraRay(inputs: NodeInputs): NodeOutput {
  // In R3F's rasterization pipeline, all visible fragments are from camera rays
  // This would be used in shader code generation, not CPU evaluation
  return { Boolean: true };
}

// ============================================================================
// Namespace export for convenience
// ============================================================================

export const ExpandedNodeExecutors = {
  executeDualMesh,
  executeEdgeNeighbors,
  executeEdgeVertices,
  executeFaceArea,
  executeVertexNeighbors,
  executeEdgesOfFace,
  executeFacesOfEdge,
  executeCaptureAttribute,
  executeRemoveAttribute,
  executeSampleIndex,
  executeSampleNearest,
  executeDomainSize,
  executeSetCurveRadius,
  executeSetCurveTilt,
  executeSetHandlePositions,
  executeSplineParameter,
  executeFilletCurve,
  executeTranslateInstances,
  executeRotateInstances,
  executeScaleInstances,
  executeVolumeToMesh,
  executeVolumeToPoints,
  executePointsToVertices,
  executePointsToCurves,
  executeSetPosition,
  executeDuplicateElements,
  executeSetShadeSmooth,
  executeLightFalloff,
  executeObjectIndex,
  executeIsCameraRay,
};
