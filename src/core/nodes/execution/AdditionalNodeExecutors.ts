/**
 * AdditionalNodeExecutors - 30 additional node type executors
 *
 * Provides executor functions for texture coordinate, geometry operation,
 * texture/evaluation, color/mix, and math/utility node types that previously
 * had no executor (pass-through only). These are among the most-used remaining
 * node types in Infinigen's procedural generation pipeline.
 *
 * Each executor is a standalone function that takes `inputs: NodeInputs`
 * and returns a structured output object matching the socket names of the node.
 *
 * Uses seeded random for all randomness — no Math.random().
 */

import * as THREE from 'three';
import type { NodeInputs, NodeOutput, Vector3Like, ColorLike, NodeExecutorFunction } from './ExecutorTypes';

// ============================================================================
// Seeded Random Utility (matches CoreNodeExecutors.ts / ExtendedNodeExecutors.ts)
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
// Helper: simple hash for noise functions
// ============================================================================

function hashFloat(x: number, y: number, z: number, seed: number): number {
  let h = seed;
  h = ((h << 5) + h + Math.round(x * 1000)) | 0;
  h = ((h << 5) + h + Math.round(y * 1000)) | 0;
  h = ((h << 5) + h + Math.round(z * 1000)) | 0;
  return ((h ^ (h >> 16)) & 0xffff) / 0xffff;
}

// ============================================================================
// Texture Coordinate Node Executors
// ============================================================================

/**
 * 1. TextureCoordinate — Generate UV, Object, Camera, Window, Normal, Reflection coordinates.
 * Inputs: Geometry, From (origin mode: generated/object/camera/window/normal/reflection)
 * Outputs: Vector (coordinate as 3D vector)
 */
export function executeTextureCoordinate(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const from = (inputs.From ?? inputs.from ?? inputs.mode ?? 'generated') as string;
  const position = normalizeVec(inputs.Position ?? inputs.position ?? { x: 0, y: 0, z: 0 });
  const normal = normalizeVec(inputs.Normal ?? inputs.normal ?? { x: 0, y: 1, z: 0 });

  const pos = normalizeVec(position);
  const nrm = normalizeVec(normal);

  if (from === 'object' || from === 'generated') {
    // Object/generated: use vertex position normalized to [0,1] via bounding box
    if (geometry && geometry.getAttribute('position')) {
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z, 0.001);
      return {
        Vector: {
          x: (pos.x - box.min.x) / maxDim,
          y: (pos.y - box.min.y) / maxDim,
          z: (pos.z - box.min.z) / maxDim,
        },
      };
    }
    return { Vector: pos };
  }

  if (from === 'normal') {
    return { Vector: nrm };
  }

  if (from === 'reflection') {
    // Reflection: incident reflected around normal (assume incident = -Z)
    const incident = new THREE.Vector3(0, 0, -1);
    const n = new THREE.Vector3(nrm.x, nrm.y, nrm.z).normalize();
    const reflected = incident.reflect(n);
    return { Vector: { x: reflected.x, y: reflected.y, z: reflected.z } };
  }

  if (from === 'camera') {
    // Camera: approximate as normalized position in view space (Z-forward)
    return {
      Vector: {
        x: -pos.x * 0.5,
        y: -pos.y * 0.5,
        z: -pos.z,
      },
    };
  }

  // 'window' — screen-space approximation
  return { Vector: { x: pos.x * 0.5 + 0.5, y: pos.y * 0.5 + 0.5, z: 0 } };
}

/**
 * 2. Mapping — Vector mapping with translation, rotation, scale, and min/max clamping.
 * Inputs: Vector, Location, Rotation, Scale, Min, Max, UseClamp
 * Outputs: Vector
 */
export function executeMapping(inputs: NodeInputs): NodeOutput {
  const vector = normalizeVec(inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 });
  const location = normalizeVec(inputs.Location ?? inputs.location ?? inputs.Translation ?? inputs.translation ?? { x: 0, y: 0, z: 0 });
  const rotation = normalizeVec(inputs.Rotation ?? inputs.rotation ?? inputs.Euler ?? inputs.euler ?? { x: 0, y: 0, z: 0 });
  const scale = normalizeVec(inputs.Scale ?? inputs.scale ?? { x: 1, y: 1, z: 1 });
  const useClamp = (inputs.UseClamp ?? inputs.useClamp ?? false) as boolean;
  const min = normalizeVec(inputs.Min ?? inputs.min ?? { x: 0, y: 0, z: 0 });
  const max = normalizeVec(inputs.Max ?? inputs.max ?? { x: 1, y: 1, z: 1 });

  // Apply scale, then rotation, then translation (SRT order)
  const v = new THREE.Vector3(vector.x * scale.x, vector.y * scale.y, vector.z * scale.z);

  if (rotation.x !== 0 || rotation.y !== 0 || rotation.z !== 0) {
    const euler = new THREE.Euler(rotation.x, rotation.y, rotation.z, 'XYZ');
    const quat = new THREE.Quaternion().setFromEuler(euler);
    v.applyQuaternion(quat);
  }

  v.x += location.x;
  v.y += location.y;
  v.z += location.z;

  if (useClamp) {
    v.x = Math.max(min.x, Math.min(max.x, v.x));
    v.y = Math.max(min.y, Math.min(max.y, v.y));
    v.z = Math.max(min.z, Math.min(max.z, v.z));
  }

  return { Vector: { x: v.x, y: v.y, z: v.z } };
}

/**
 * 3. UVMap — Access named UV map data from geometry.
 * Inputs: Geometry, UVMap (name), From (source mode)
 * Outputs: Vector (UV coordinate as 3D)
 */
export function executeUVMap(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const uvMapName = (inputs.UVMap ?? inputs.uvMap ?? inputs.Name ?? inputs.name ?? 'uv') as string;
  const from = (inputs.From ?? inputs.from ?? 'uv') as string;

  if (!geometry) {
    return { Vector: { x: 0, y: 0, z: 0 } };
  }

  // Try to read the named UV attribute
  const uvAttr = geometry.getAttribute(uvMapName)
    ?? geometry.getAttribute('uv')
    ?? geometry.getAttribute('uv1')
    ?? geometry.getAttribute('uv2');

  if (uvAttr && uvAttr.count > 0) {
    // Return first UV coordinate as representative sample
    return {
      Vector: {
        x: uvAttr.getX(0) ?? 0,
        y: uvAttr.getY(0) ?? 0,
        z: 0,
      },
    };
  }

  // Fallback: generate UV from position via box projection
  if (geometry.getAttribute('position')) {
    const posAttr = geometry.getAttribute('position');
    const px = posAttr.getX(0) ?? 0;
    const py = posAttr.getY(0) ?? 0;
    return { Vector: { x: px, y: py, z: 0 } };
  }

  return { Vector: { x: 0, y: 0, z: 0 } };
}

/**
 * 4. GeometryNodeInputPosition — Read vertex/point position as attribute.
 * Inputs: Geometry
 * Outputs: Position (vector or array)
 */
export function executeGeometryNodeInputPosition(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;

  if (!geometry || !geometry.getAttribute('position')) {
    return { Position: { x: 0, y: 0, z: 0 } };
  }

  const posAttr = geometry.getAttribute('position');
  if (posAttr.count === 0) {
    return { Position: { x: 0, y: 0, z: 0 } };
  }

  // Return array of positions for per-element access, or first for scalar
  if (posAttr.count === 1) {
    return {
      Position: { x: posAttr.getX(0), y: posAttr.getY(0), z: posAttr.getZ(0) },
    };
  }

  const positions: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < posAttr.count; i++) {
    positions.push({ x: posAttr.getX(i), y: posAttr.getY(i), z: posAttr.getZ(i) });
  }
  return { Position: positions };
}

/**
 * 5. GeometryNodeInputNormal — Read vertex/point normal as attribute.
 * Inputs: Geometry
 * Outputs: Normal (vector or array)
 */
export function executeGeometryNodeInputNormal(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;

  if (!geometry) {
    return { Normal: { x: 0, y: 1, z: 0 } };
  }

  const normalAttr = geometry.getAttribute('normal');
  if (!normalAttr || normalAttr.count === 0) {
    // Compute normals if missing
    geometry.computeVertexNormals();
    const computedNormal = geometry.getAttribute('normal');
    if (!computedNormal || computedNormal.count === 0) {
      return { Normal: { x: 0, y: 1, z: 0 } };
    }
    return { Normal: { x: computedNormal.getX(0), y: computedNormal.getY(0), z: computedNormal.getZ(0) } };
  }

  if (normalAttr.count === 1) {
    return {
      Normal: { x: normalAttr.getX(0), y: normalAttr.getY(0), z: normalAttr.getZ(0) },
    };
  }

  const normals: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < normalAttr.count; i++) {
    normals.push({ x: normalAttr.getX(i), y: normalAttr.getY(i), z: normalAttr.getZ(i) });
  }
  return { Normal: normals };
}

/**
 * 6. GeometryNodeInputTangent — Compute tangent vectors from UV and position.
 * Inputs: Geometry, DirectionType
 * Outputs: Tangent (vector or array)
 */
export function executeGeometryNodeInputTangent(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const directionType = (inputs.DirectionType ?? inputs.directionType ?? 'normal') as string; // 'normal' | 'uv'

  if (!geometry || !geometry.getAttribute('position')) {
    return { Tangent: { x: 1, y: 0, z: 0 } };
  }

  const posAttr = geometry.getAttribute('position');
  const normalAttr = geometry.getAttribute('normal');
  const uvAttr = geometry.getAttribute('uv');
  const indexAttr = geometry.getIndex();

  const tangents: { x: number; y: number; z: number }[] = [];

  if (directionType === 'uv' && uvAttr && indexAttr) {
    // Compute tangents from UV mapping (simplified per-face tangent)
    const faceCount = Math.floor(indexAttr.count / 3);
    for (let f = 0; f < faceCount; f++) {
      const i0 = indexAttr.getX(f * 3);
      const i1 = indexAttr.getX(f * 3 + 1);
      const i2 = indexAttr.getX(f * 3 + 2);

      const p0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
      const p1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
      const p2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));

      const uv0 = new THREE.Vector2(uvAttr.getX(i0), uvAttr.getY(i0));
      const uv1 = new THREE.Vector2(uvAttr.getX(i1), uvAttr.getY(i1));
      const uv2 = new THREE.Vector2(uvAttr.getX(i2), uvAttr.getY(i2));

      const edge1 = new THREE.Vector3().subVectors(p1, p0);
      const edge2 = new THREE.Vector3().subVectors(p2, p0);
      const duv1 = new THREE.Vector2().subVectors(uv1, uv0);
      const duv2 = new THREE.Vector2().subVectors(uv2, uv0);

      const det = duv1.x * duv2.y - duv2.x * duv1.y;
      let tangent: THREE.Vector3;
      if (Math.abs(det) > 1e-8) {
        const r = 1 / det;
        tangent = new THREE.Vector3(
          (edge1.x * duv2.y - edge2.x * duv1.y) * r,
          (edge1.y * duv2.y - edge2.y * duv1.y) * r,
          (edge1.z * duv2.y - edge2.z * duv1.y) * r,
        ).normalize();
      } else {
        tangent = edge1.normalize();
      }
      tangents.push({ x: tangent.x, y: tangent.y, z: tangent.z });
    }
  } else {
    // Compute tangent as perpendicular to normal
    const count = normalAttr ? normalAttr.count : posAttr.count;
    for (let i = 0; i < count; i++) {
      const n = normalAttr
        ? new THREE.Vector3(normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i)).normalize()
        : new THREE.Vector3(0, 1, 0);

      // Choose a vector not parallel to normal
      const ref = Math.abs(n.y) < 0.99
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);
      const tangent = new THREE.Vector3().crossVectors(n, ref).normalize();
      tangents.push({ x: tangent.x, y: tangent.y, z: tangent.z });
    }
  }

  if (tangents.length === 0) {
    return { Tangent: { x: 1, y: 0, z: 0 } };
  }
  if (tangents.length === 1) {
    return { Tangent: tangents[0] };
  }
  return { Tangent: tangents };
}

// ============================================================================
// Geometry Operation Node Executors
// ============================================================================

/**
 * 7. SubdivideMesh — Subdivide mesh faces (loop or simple subdivision).
 * Inputs: Geometry, Level, SubdivisionType
 * Outputs: Geometry
 */
export function executeSubdivideMesh(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const level = (inputs.Level ?? inputs.level ?? 1) as number;
  const subType = (inputs.SubdivisionType ?? inputs.subdivisionType ?? 'simple') as string; // 'simple' | 'loop'

  if (!geometry || !geometry.getAttribute('position')) return { Geometry: geometry };

  // Use Three.js SubdivisionLogic via tessellation
  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex();

  let currentPositions = Float32Array.from(posAttr.array as Float32Array);
  let currentIndices: number[];

  if (idxAttr) {
    currentIndices = [];
    for (let i = 0; i < idxAttr.count; i++) {
      currentIndices.push(idxAttr.getX(i));
    }
  } else {
    currentIndices = [];
    for (let i = 0; i < posAttr.count; i++) {
      currentIndices.push(i);
    }
  }

  for (let iter = 0; iter < Math.min(level, 5); iter++) {
    const newPositions = Array.from(currentPositions);
    const newIndices: number[] = [];
    const edgeMidpoints = new Map<string, number>();

    const getMidpoint = (a: number, b: number): number => {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (edgeMidpoints.has(key)) return edgeMidpoints.get(key)!;
      const idx = newPositions.length / 3;
      newPositions.push(
        (currentPositions[a * 3] + currentPositions[b * 3]) / 2,
        (currentPositions[a * 3 + 1] + currentPositions[b * 3 + 1]) / 2,
        (currentPositions[a * 3 + 2] + currentPositions[b * 3 + 2]) / 2,
      );
      edgeMidpoints.set(key, idx);
      return idx;
    };

    for (let f = 0; f < currentIndices.length; f += 3) {
      const a = currentIndices[f], b = currentIndices[f + 1], c = currentIndices[f + 2];
      const ab = getMidpoint(a, b);
      const bc = getMidpoint(b, c);
      const ca = getMidpoint(c, a);
      // Split each triangle into 4 sub-triangles
      newIndices.push(a, ab, ca);
      newIndices.push(b, bc, ab);
      newIndices.push(c, ca, bc);
      newIndices.push(ab, bc, ca);
    }

    currentPositions = new Float32Array(newPositions);
    currentIndices = newIndices;
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(currentPositions, 3));
  result.setIndex(currentIndices);
  result.computeVertexNormals();
  return { Geometry: result };
}

/**
 * 8. DecimateMesh — Reduce polygon count with edge collapse.
 * Inputs: Geometry, Ratio (0..1 target ratio), Method
 * Outputs: Geometry
 */
export function executeDecimateMesh(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const ratio = (inputs.Ratio ?? inputs.ratio ?? 0.5) as number;
  const method = (inputs.Method ?? inputs.method ?? 'edge_collapse') as string;

  if (!geometry || !geometry.getAttribute('position')) return { Geometry: geometry };

  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex();

  if (!idxAttr) {
    // Non-indexed: just return as-is (decimation needs indexed geometry)
    return { Geometry: geometry.clone() };
  }

  const faceCount = Math.floor(idxAttr.count / 3);
  const targetFaces = Math.max(1, Math.floor(faceCount * Math.max(0.01, Math.min(1, ratio))));

  if (targetFaces >= faceCount) return { Geometry: geometry.clone() };

  // Simple edge-collapse decimation: iteratively remove faces with smallest area
  const faceAreas: { idx: number; area: number }[] = [];
  for (let f = 0; f < faceCount; f++) {
    const i0 = idxAttr.getX(f * 3), i1 = idxAttr.getX(f * 3 + 1), i2 = idxAttr.getX(f * 3 + 2);
    const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
    const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
    const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
    const area = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(v1, v0),
      new THREE.Vector3().subVectors(v2, v0),
    ).length() * 0.5;
    faceAreas.push({ idx: f, area });
  }

  faceAreas.sort((a, b) => a.area - b.area);

  // Keep faces with largest area (remove smallest)
  const keepSet = new Set<number>();
  for (let i = faceCount - targetFaces; i < faceCount; i++) {
    keepSet.add(faceAreas[i].idx);
  }

  const newIndices: number[] = [];
  for (const fIdx of keepSet) {
    newIndices.push(idxAttr.getX(fIdx * 3), idxAttr.getX(fIdx * 3 + 1), idxAttr.getX(fIdx * 3 + 2));
  }

  const result = geometry.clone();
  result.setIndex(newIndices);
  result.computeVertexNormals();
  return { Geometry: result };
}

/**
 * 9. ExtrudeFaces — Extrude selected faces along normals.
 * Inputs: Geometry, Offset, Selection, Individual
 * Outputs: Geometry
 */
export function executeExtrudeFaces(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const offset = (inputs.Offset ?? inputs.offset ?? inputs.distance ?? 0.5) as number;
  const selection = (inputs.Selection ?? inputs.selection ?? null) as unknown[] | null;
  const individual = (inputs.Individual ?? inputs.individual ?? true) as boolean;

  if (!geometry || !geometry.getAttribute('position') || !geometry.getIndex()) {
    return { Geometry: geometry ?? new THREE.BufferGeometry() };
  }

  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex()!;
  const faceCount = Math.floor(idxAttr.count / 3);

  // Compute face normals
  const faceNormals: THREE.Vector3[] = [];
  for (let f = 0; f < faceCount; f++) {
    const i0 = idxAttr.getX(f * 3), i1 = idxAttr.getX(f * 3 + 1), i2 = idxAttr.getX(f * 3 + 2);
    const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
    const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
    const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
    const n = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(v1, v0),
      new THREE.Vector3().subVectors(v2, v0),
    ).normalize();
    faceNormals.push(n);
  }

  // For each selected face, create extruded geometry
  const newPositions: number[] = [];
  const newIndices: number[] = [];
  let vertOffset = 0;

  for (let f = 0; f < faceCount; f++) {
    const isSelected = selection === null || (Array.isArray(selection) && selection[f]);
    const i0 = idxAttr.getX(f * 3), i1 = idxAttr.getX(f * 3 + 1), i2 = idxAttr.getX(f * 3 + 2);

    const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
    const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
    const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
    const n = faceNormals[f];

    if (isSelected) {
      // Original face (bottom)
      newPositions.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
      // Extruded face (top)
      const o = n.clone().multiplyScalar(offset);
      newPositions.push(v0.x + o.x, v0.y + o.y, v0.z + o.z);
      newPositions.push(v1.x + o.x, v1.y + o.y, v1.z + o.z);
      newPositions.push(v2.x + o.x, v2.y + o.y, v2.z + o.z);

      // Bottom face
      newIndices.push(vertOffset, vertOffset + 1, vertOffset + 2);
      // Top face (reversed winding)
      newIndices.push(vertOffset + 5, vertOffset + 4, vertOffset + 3);
      // Side faces (3 quads = 6 triangles)
      newIndices.push(vertOffset, vertOffset + 3, vertOffset + 1);
      newIndices.push(vertOffset + 1, vertOffset + 3, vertOffset + 4);
      newIndices.push(vertOffset + 1, vertOffset + 4, vertOffset + 2);
      newIndices.push(vertOffset + 2, vertOffset + 4, vertOffset + 5);
      newIndices.push(vertOffset + 2, vertOffset + 5, vertOffset);
      newIndices.push(vertOffset, vertOffset + 5, vertOffset + 3);

      vertOffset += 6;
    } else {
      // Keep face as-is
      newPositions.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
      newIndices.push(vertOffset, vertOffset + 1, vertOffset + 2);
      vertOffset += 3;
    }
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  result.setIndex(newIndices);
  result.computeVertexNormals();
  return { Geometry: result };
}

/**
 * 10. InsetFaces — Inset selected faces by a percentage of their area.
 * Inputs: Geometry, Distance, Selection, Individual
 * Outputs: Geometry
 */
export function executeInsetFaces(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const distance = (inputs.Distance ?? inputs.distance ?? inputs.thickness ?? 0.1) as number;
  const selection = (inputs.Selection ?? inputs.selection ?? null) as unknown[] | null;

  if (!geometry || !geometry.getAttribute('position') || !geometry.getIndex()) {
    return { Geometry: geometry ?? new THREE.BufferGeometry() };
  }

  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex()!;
  const faceCount = Math.floor(idxAttr.count / 3);

  const newPositions: number[] = [];
  const newIndices: number[] = [];
  let vertOffset = 0;

  for (let f = 0; f < faceCount; f++) {
    const isSelected = selection === null || (Array.isArray(selection) && selection[f]);
    const i0 = idxAttr.getX(f * 3), i1 = idxAttr.getX(f * 3 + 1), i2 = idxAttr.getX(f * 3 + 2);

    const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
    const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
    const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));

    if (isSelected) {
      // Inset: move each vertex toward face centroid by distance
      const center = new THREE.Vector3().add(v0).add(v1).add(v2).divideScalar(3);
      const t = Math.max(0, Math.min(1, distance));
      const iv0 = v0.clone().lerp(center, t);
      const iv1 = v1.clone().lerp(center, t);
      const iv2 = v2.clone().lerp(center, t);

      // Outer face (original)
      newPositions.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
      // Inner face (inset)
      newPositions.push(iv0.x, iv0.y, iv0.z, iv1.x, iv1.y, iv1.z, iv2.x, iv2.y, iv2.z);

      // Inner triangle
      newIndices.push(vertOffset + 3, vertOffset + 4, vertOffset + 5);
      // Bridge quads (outer -> inner)
      newIndices.push(vertOffset, vertOffset + 1, vertOffset + 4);
      newIndices.push(vertOffset, vertOffset + 4, vertOffset + 3);
      newIndices.push(vertOffset + 1, vertOffset + 2, vertOffset + 5);
      newIndices.push(vertOffset + 1, vertOffset + 5, vertOffset + 4);
      newIndices.push(vertOffset + 2, vertOffset, vertOffset + 3);
      newIndices.push(vertOffset + 2, vertOffset + 3, vertOffset + 5);

      vertOffset += 6;
    } else {
      newPositions.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
      newIndices.push(vertOffset, vertOffset + 1, vertOffset + 2);
      vertOffset += 3;
    }
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  result.setIndex(newIndices);
  result.computeVertexNormals();
  return { Geometry: result };
}

/**
 * 11. FlipFaces — Reverse face winding order (flip normals).
 * Inputs: Geometry, Selection
 * Outputs: Geometry
 */
export function executeFlipFaces(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const selection = (inputs.Selection ?? inputs.selection ?? null) as unknown[] | null;

  if (!geometry || !geometry.getAttribute('position')) return { Geometry: geometry };

  const result = geometry.clone();
  const idxAttr = result.getIndex();

  if (idxAttr) {
    const faceCount = Math.floor(idxAttr.count / 3);
    for (let f = 0; f < faceCount; f++) {
      const isSelected = selection === null || (Array.isArray(selection) && selection[f]);
      if (isSelected) {
        // Swap two vertices to reverse winding
        const a = idxAttr.getX(f * 3 + 1);
        const b = idxAttr.getX(f * 3 + 2);
        idxAttr.setX(f * 3 + 1, b);
        idxAttr.setX(f * 3 + 2, a);
      }
    }
    idxAttr.needsUpdate = true;
  }

  // Flip normals if present
  const normalAttr = result.getAttribute('normal');
  if (normalAttr) {
    for (let i = 0; i < normalAttr.count; i++) {
      normalAttr.setX(i, -normalAttr.getX(i));
      normalAttr.setY(i, -normalAttr.getY(i));
      normalAttr.setZ(i, -normalAttr.getZ(i));
    }
    normalAttr.needsUpdate = true;
  } else {
    result.computeVertexNormals();
  }

  return { Geometry: result };
}

/**
 * 12. RotateMesh — Apply rotation to mesh geometry.
 * Inputs: Geometry, Rotation (Euler), Space, Selection
 * Outputs: Geometry
 */
export function executeRotateMesh(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const rotation = normalizeVec(inputs.Rotation ?? inputs.rotation ?? inputs.Euler ?? inputs.euler ?? { x: 0, y: 0, z: 0 });

  if (!geometry || !geometry.getAttribute('position')) return { Geometry: geometry };

  const euler = new THREE.Euler(rotation.x, rotation.y, rotation.z, 'XYZ');
  const quat = new THREE.Quaternion().setFromEuler(euler);
  const mat4 = new THREE.Matrix4().makeRotationFromQuaternion(quat);
  const normalMat = new THREE.Matrix3().getNormalMatrix(mat4);

  const result = geometry.clone();
  const posAttr = result.getAttribute('position');
  const normAttr = result.getAttribute('normal');

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

  return { Geometry: result };
}

/**
 * 13. ScaleMesh — Apply scale to mesh geometry.
 * Inputs: Geometry, Scale (vector or uniform), Center, Selection
 * Outputs: Geometry
 */
export function executeScaleMesh(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const scale = normalizeVec(inputs.Scale ?? inputs.scale ?? { x: 1, y: 1, z: 1 });
  const center = normalizeVec(inputs.Center ?? inputs.center ?? inputs.Origin ?? inputs.origin ?? { x: 0, y: 0, z: 0 });

  if (!geometry || !geometry.getAttribute('position')) return { Geometry: geometry };

  const result = geometry.clone();
  const posAttr = result.getAttribute('position');
  const normAttr = result.getAttribute('normal');
  const cx = center.x, cy = center.y, cz = center.z;
  const invScale = new THREE.Vector3(1 / scale.x, 1 / scale.y, 1 / scale.z).normalize();

  for (let i = 0; i < posAttr.count; i++) {
    const px = (posAttr.getX(i) - cx) * scale.x + cx;
    const py = (posAttr.getY(i) - cy) * scale.y + cy;
    const pz = (posAttr.getZ(i) - cz) * scale.z + cz;
    posAttr.setXYZ(i, px, py, pz);
  }
  posAttr.needsUpdate = true;

  if (normAttr) {
    for (let i = 0; i < normAttr.count; i++) {
      const n = new THREE.Vector3(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i)).multiply(invScale).normalize();
      normAttr.setXYZ(i, n.x, n.y, n.z);
    }
    normAttr.needsUpdate = true;
  }

  return { Geometry: result };
}

/**
 * 14. TranslateMesh — Apply translation to mesh geometry.
 * Inputs: Geometry, Translation, Selection
 * Outputs: Geometry
 */
export function executeTranslateMesh(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const translation = normalizeVec(inputs.Translation ?? inputs.translation ?? inputs.Offset ?? inputs.offset ?? { x: 0, y: 0, z: 0 });

  if (!geometry || !geometry.getAttribute('position')) return { Geometry: geometry };

  const result = geometry.clone();
  const posAttr = result.getAttribute('position');

  for (let i = 0; i < posAttr.count; i++) {
    posAttr.setXYZ(i, posAttr.getX(i) + translation.x, posAttr.getY(i) + translation.y, posAttr.getZ(i) + translation.z);
  }
  posAttr.needsUpdate = true;

  // Normals unchanged by pure translation
  return { Geometry: result };
}

// ============================================================================
// Texture/Evaluation Node Executors
// ============================================================================

/**
 * 15. BrickTexture — Procedural brick pattern with mortar, offset, color variation.
 * Inputs: Vector, Color1, Color2, Mortar, Scale, MortarSize, Offset, Bias, Seed
 * Outputs: Color, Fac
 */
export function executeBrickTexture(inputs: NodeInputs): NodeOutput {
  const vector = normalizeVec(inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 });
  const color1 = (inputs.Color1 ?? inputs.color1 ?? { r: 0.8, g: 0.6, b: 0.4 }) as ColorLike;
  const color2 = (inputs.Color2 ?? inputs.color2 ?? { r: 0.6, g: 0.4, b: 0.2 }) as ColorLike;
  const mortarColor = (inputs.Mortar ?? inputs.mortar ?? inputs.MortarColor ?? inputs.mortarColor ?? { r: 0.5, g: 0.5, b: 0.5 }) as ColorLike;
  const scale = (inputs.Scale ?? inputs.scale ?? 5.0) as number;
  const mortarSize = (inputs.MortarSize ?? inputs.mortarSize ?? 0.02) as number;
  const offset = (inputs.Offset ?? inputs.offset ?? 0.5) as number;
  const bias = (inputs.Bias ?? inputs.bias ?? 0.0) as number;
  const seed = (inputs.Seed ?? inputs.seed ?? 0) as number;

  const random = seededRandom(seed);

  // Scale coordinates
  const sx = vector.x * scale;
  const sy = vector.y * scale;

  // Determine row and apply offset
  const row = Math.floor(sy);
  const rowOffset = (row % 2 === 0) ? 0 : offset;
  const col = Math.floor(sx + rowOffset);

  // Fractional position within brick
  const fx = sx + rowOffset - col;
  const fy = sy - row;

  // Mortar test: close to edge of brick cell
  const isMortarX = fx < mortarSize || fx > (1 - mortarSize);
  const isMortarY = fy < mortarSize || fy > (1 - mortarSize);
  const isMortar = isMortarX || isMortarY;

  // Color variation per brick (seeded by row/col)
  const variationRandom = seededRandom(seed + row * 137 + col * 311);
  const variation = 1.0 + bias * (variationRandom() - 0.5) * 2;

  let r: number, g: number, b: number, fac: number;

  if (isMortar) {
    r = mortarColor.r ?? 0.5;
    g = mortarColor.g ?? 0.5;
    b = mortarColor.b ?? 0.5;
    fac = 0;
  } else {
    // Alternate between color1 and color2
    const useColor2 = ((row + col) % 2 === 0);
    const base = useColor2 ? color2 : color1;
    r = (base.r ?? 0.5) * variation;
    g = (base.g ?? 0.3) * variation;
    b = (base.b ?? 0.2) * variation;
    fac = 1;
  }

  return {
    Color: { r: Math.max(0, Math.min(1, r)), g: Math.max(0, Math.min(1, g)), b: Math.max(0, Math.min(1, b)) },
    Fac: fac,
  };
}

/**
 * 16. CheckerTexture — Checkerboard pattern with scale and color inputs.
 * Inputs: Vector, Color1, Color2, Scale
 * Outputs: Color, Fac
 */
export function executeCheckerTexture(inputs: NodeInputs): NodeOutput {
  const vector = normalizeVec(inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 });
  const color1 = (inputs.Color1 ?? inputs.color1 ?? { r: 0.8, g: 0.8, b: 0.8 }) as ColorLike;
  const color2 = (inputs.Color2 ?? inputs.color2 ?? { r: 0.2, g: 0.2, b: 0.2 }) as ColorLike;
  const scale = (inputs.Scale ?? inputs.scale ?? 5.0) as number;

  const sx = vector.x * scale;
  const sy = vector.y * scale;
  const sz = vector.z * scale;

  // 3D checkerboard
  const check = (Math.floor(sx) + Math.floor(sy) + Math.floor(sz)) % 2;

  if (check === 0) {
    return {
      Color: { r: color1.r ?? 0.8, g: color1.g ?? 0.8, b: color1.b ?? 0.8 },
      Fac: 1.0,
    };
  } else {
    return {
      Color: { r: color2.r ?? 0.2, g: color2.g ?? 0.2, b: color2.b ?? 0.2 },
      Fac: 0.0,
    };
  }
}

/**
 * 17. GradientTexture — Linear, quadratic, easing, diagonal, radial, spherical gradients.
 * Inputs: Vector, GradientType, ColorRamp (optional)
 * Outputs: Color, Fac
 */
export function executeGradientTexture(inputs: NodeInputs): NodeOutput {
  const vector = normalizeVec(inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 });
  const gradientType = (inputs.GradientType ?? inputs.gradientType ?? inputs.type ?? 'linear') as string;

  let t: number;

  switch (gradientType) {
    case 'quadratic':
      t = vector.x * vector.x;
      break;
    case 'easing': {
      const cx = Math.max(0, Math.min(1, vector.x));
      t = cx * cx * (3 - 2 * cx); // smoothstep
      break;
    }
    case 'diagonal':
      t = (vector.x + vector.y) * 0.5;
      break;
    case 'radial':
      t = Math.atan2(vector.y - 0.5, vector.x - 0.5) / (2 * Math.PI) + 0.5;
      break;
    case 'spherical': {
      const dx = vector.x - 0.5, dy = vector.y - 0.5, dz = vector.z - 0.5;
      t = Math.max(0, 1 - 2 * Math.sqrt(dx * dx + dy * dy + dz * dz));
      break;
    }
    case 'quadratic_sphere': {
      const ddx = vector.x - 0.5, ddy = vector.y - 0.5;
      const r = Math.sqrt(ddx * ddx + ddy * ddy);
      t = Math.max(0, 1 - 2 * r * r);
      break;
    }
    default: // 'linear'
      t = vector.x;
  }

  t = Math.max(0, Math.min(1, t));

  // Simple black-to-white gradient (color ramp can be applied separately)
  return {
    Color: { r: t, g: t, b: t },
    Fac: t,
  };
}

/**
 * 18. MagicTexture — Psychedelic magic texture using sine recursion.
 * Inputs: Vector, Scale, Depth, Distortion
 * Outputs: Color, Fac
 */
export function executeMagicTexture(inputs: NodeInputs): NodeOutput {
  const vector = normalizeVec(inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 });
  const scale = (inputs.Scale ?? inputs.scale ?? 5.0) as number;
  const depth = (inputs.Depth ?? inputs.depth ?? 2) as number;
  const distortion = (inputs.Distortion ?? inputs.distortion ?? 1.0) as number;

  const x = vector.x * scale;
  const y = vector.y * scale;
  const z = vector.z * scale;

  let ax = Math.sin(x + distortion);
  let ay = Math.sin(y + distortion);
  let az = Math.sin(z + distortion);

  for (let i = 1; i < Math.min(depth, 10); i++) {
    const nx = Math.sin(ax * 2.03 + ay * 1.71 + az * 1.39) * 0.5 + 0.5;
    const ny = Math.sin(ax * 1.93 + ay * 2.11 + az * 1.53) * 0.5 + 0.5;
    const nz = Math.sin(ax * 2.17 + ay * 1.89 + az * 2.03) * 0.5 + 0.5;
    ax = nx * distortion;
    ay = ny * distortion;
    az = nz * distortion;
  }

  const r = Math.abs(ax);
  const g = Math.abs(ay);
  const b = Math.abs(az);
  const fac = (r + g + b) / 3;

  return {
    Color: { r: Math.max(0, Math.min(1, r)), g: Math.max(0, Math.min(1, g)), b: Math.max(0, Math.min(1, b)) },
    Fac: Math.max(0, Math.min(1, fac)),
  };
}

/**
 * 19. WaveTexture — Bands, rings, waves with distortion and detail.
 * Inputs: Vector, Scale, Distortion, Detail, DetailScale, WaveType, Direction, BandsDirection
 * Outputs: Color, Fac
 */
export function executeWaveTexture(inputs: NodeInputs): NodeOutput {
  const vector = normalizeVec(inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 });
  const scale = (inputs.Scale ?? inputs.scale ?? 5.0) as number;
  const distortion = (inputs.Distortion ?? inputs.distortion ?? 0.0) as number;
  const detail = (inputs.Detail ?? inputs.detail ?? 2.0) as number;
  const detailScale = (inputs.DetailScale ?? inputs.detailScale ?? 1.0) as number;
  const waveType = (inputs.WaveType ?? inputs.waveType ?? 'bands') as string; // 'bands' | 'rings'
  const bandsDirection = (inputs.BandsDirection ?? inputs.bandsDirection ?? 'x') as string; // 'x' | 'y' | 'z' | 'diagonal'

  const x = vector.x * scale;
  const y = vector.y * scale;
  const z = vector.z * scale;

  let phase: number;
  if (waveType === 'rings') {
    const dist = Math.sqrt(x * x + y * y + z * z);
    phase = dist;
  } else {
    // Bands
    switch (bandsDirection) {
      case 'y': phase = y; break;
      case 'z': phase = z; break;
      case 'diagonal': phase = (x + y + z) / 1.732; break;
      default: phase = x;
    }
  }

  // Add distortion
  if (Math.abs(distortion) > 1e-6) {
    const dNoise = Math.sin(x * 1.7 + y * 2.3 + z * 3.1) * distortion;
    phase += dNoise;
  }

  // Add detail octaves
  let value = Math.sin(phase);
  let amp = 1.0;
  let freq = detailScale;
  for (let o = 1; o < Math.min(detail, 6); o++) {
    amp *= 0.5;
    freq *= 2;
    value += amp * Math.sin(phase * freq);
  }

  // Normalize to [0, 1]
  const fac = Math.max(0, Math.min(1, value * 0.5 + 0.5));

  return {
    Color: { r: fac, g: fac, b: fac },
    Fac: fac,
  };
}

/**
 * 20. WhiteNoiseTexture — Random value per-element based on input vector.
 * Inputs: Vector, Seed
 * Outputs: Value, Color
 */
export function executeWhiteNoiseTexture(inputs: NodeInputs): NodeOutput {
  const vector = normalizeVec(inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 });
  const seed = (inputs.Seed ?? inputs.seed ?? 0) as number;

  // Use hash function for deterministic random based on position
  const v1 = hashFloat(vector.x, vector.y, vector.z, seed);
  const v2 = hashFloat(vector.y, vector.z, vector.x, seed + 1);
  const v3 = hashFloat(vector.z, vector.x, vector.y, seed + 2);

  return {
    Value: v1,
    Color: { r: v1, g: v2, b: v3 },
  };
}

// ============================================================================
// Color/Mix Node Executors
// ============================================================================

/**
 * 21. ColorRamp — Evaluate a color ramp at a given factor with multiple interpolation modes.
 * Inputs: Factor, ColorRamp (stops array), Interpolation
 * Outputs: Color, Alpha
 */
export function executeColorRamp(inputs: NodeInputs): NodeOutput {
  const factor = (inputs.Factor ?? inputs.factor ?? inputs.Value ?? inputs.value ?? 0.5) as number;
  const colorRamp = (inputs.ColorRamp ?? inputs.colorRamp ?? inputs.Stops ?? inputs.stops ?? null) as unknown[] | null;
  const interpolation = (inputs.Interpolation ?? inputs.interpolation ?? 'linear') as string; // 'linear' | 'constant' | 'ease' | 'cardinal' | 'b_spline'

  // Default gradient: black to white
  if (!colorRamp || !Array.isArray(colorRamp) || colorRamp.length === 0) {
    const t = Math.max(0, Math.min(1, factor));
    return { Color: { r: t, g: t, b: t }, Alpha: 1.0 };
  }

  // Sort stops by position
  const stops = [...colorRamp]
    .map((s: unknown) => {
      const obj = s as Record<string, unknown>;
      return {
        position: typeof s === 'object' && s !== null ? (obj.position ?? obj.pos ?? obj.t ?? 0) as number : 0,
        color: typeof s === 'object' && s !== null ? (obj.color ?? { r: obj.r ?? 0, g: obj.g ?? 0, b: obj.b ?? 0 }) as ColorLike : { r: s as number, g: s as number, b: s as number },
        alpha: typeof s === 'object' && s !== null ? (obj.alpha ?? 1.0) as number : 1.0,
      };
    })
    .sort((a: { position: number }, b: { position: number }) => a.position - b.position);

  if (stops.length === 0) {
    return { Color: { r: 0, g: 0, b: 0 }, Alpha: 1.0 };
  }

  const t = Math.max(0, Math.min(1, factor));

  // Find surrounding stops
  let lowerIdx = 0;
  let upperIdx = stops.length - 1;
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].position && t <= stops[i + 1].position) {
      lowerIdx = i;
      upperIdx = i + 1;
      break;
    }
  }

  const lower = stops[lowerIdx];
  const upper = stops[upperIdx];
  const range = upper.position - lower.position;

  let blendT: number;
  if (range < 1e-8) {
    blendT = 0;
  } else {
    blendT = (t - lower.position) / range;
  }

  // Apply interpolation mode
  switch (interpolation) {
    case 'constant':
      blendT = blendT < 0.5 ? 0 : 1;
      break;
    case 'ease':
      blendT = blendT * blendT * (3 - 2 * blendT);
      break;
    case 'cardinal':
    case 'b_spline':
      // Approximate with smootherstep
      blendT = blendT * blendT * blendT * (blendT * (blendT * 6 - 15) + 10);
      break;
    default: // 'linear'
      break;
  }

  const r = (lower.color.r ?? 0) + blendT * ((upper.color.r ?? 0) - (lower.color.r ?? 0));
  const g = (lower.color.g ?? 0) + blendT * ((upper.color.g ?? 0) - (lower.color.g ?? 0));
  const b = (lower.color.b ?? 0) + blendT * ((upper.color.b ?? 0) - (lower.color.b ?? 0));
  const a = lower.alpha + blendT * (upper.alpha - lower.alpha);

  return {
    Color: { r, g, b },
    Alpha: a,
  };
}

/**
 * 22. Curves — Apply RGB curves (bezier control points) to color input.
 * Inputs: Color, CurveR, CurveG, CurveB, Fac
 * Outputs: Color
 */
export function executeCurves(inputs: NodeInputs): NodeOutput {
  const color = (inputs.Color ?? inputs.color ?? inputs.Fac ?? inputs.fac ?? { r: 0.5, g: 0.5, b: 0.5 }) as ColorLike;
  const curveR = (inputs.CurveR ?? inputs.curveR ?? inputs.CurveRed ?? null) as unknown;
  const curveG = (inputs.CurveG ?? inputs.curveG ?? inputs.CurveGreen ?? null) as unknown;
  const curveB = (inputs.CurveB ?? inputs.curveB ?? inputs.CurveBlue ?? null) as unknown;
  const fac = (inputs.Fac ?? inputs.fac ?? 1.0) as number;

  const evaluateCurve = (t: number, points: unknown[]): number => {
    if (!points || !Array.isArray(points) || points.length === 0) return t;
    // Points are [{x, y}, ...] — x is input, y is output
    const sorted = [...points].sort((a: unknown, b: unknown) => ((a as Record<string, number>).x ?? 0) - ((b as Record<string, number>).x ?? 0));
    const tx = Math.max(0, Math.min(1, t));

    // Find surrounding points
    let lower = sorted[0] as Record<string, number>, upper = sorted[sorted.length - 1] as Record<string, number>;
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i] as Record<string, number>;
      const nxt = sorted[i + 1] as Record<string, number>;
      if (tx >= (cur.x ?? 0) && tx <= (nxt.x ?? 0)) {
        lower = cur;
        upper = nxt;
        break;
      }
    }

    const range = (upper.x ?? 1) - (lower.x ?? 0);
    if (range < 1e-8) return lower.y ?? t;

    const blend = (tx - (lower.x ?? 0)) / range;
    const ly = lower.y ?? 0;
    const uy = upper.y ?? 1;
    return ly + blend * (uy - ly);
  };

  const inputR = color.r ?? 0.5;
  const inputG = color.g ?? 0.5;
  const inputB = color.b ?? 0.5;

  const outR = evaluateCurve(inputR, curveR as unknown[]);
  const outG = evaluateCurve(inputG, curveG as unknown[]);
  const outB = evaluateCurve(inputB, curveB as unknown[]);

  // Blend with original by fac
  const f = Math.max(0, Math.min(1, fac));
  return {
    Color: {
      r: inputR * (1 - f) + outR * f,
      g: inputG * (1 - f) + outG * f,
      b: inputB * (1 - f) + outB * f,
    },
  };
}

/**
 * 23. SeparateColor — Split color into R, G, B, A components (RGB, HSV, HSL modes).
 * Inputs: Color, Mode
 * Outputs: Red, Green, Blue, Alpha
 */
export function executeSeparateColor(inputs: NodeInputs): NodeOutput {
  const color = (inputs.Color ?? inputs.color ?? { r: 0.5, g: 0.5, b: 0.5 }) as ColorLike;
  const mode = (inputs.Mode ?? inputs.mode ?? inputs.ColorSpace ?? inputs.colorSpace ?? 'rgb') as string;

  const r = color.r ?? 0;
  const g = color.g ?? 0;
  const b = color.b ?? 0;
  const a = color.a ?? 1.0;

  if (mode === 'hsv') {
    // RGB to HSV conversion
    const c = new THREE.Color(r, g, b);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    // HSV: h is [0,1], s is [0,1], v (=l adjusted) is [0,1]
    // THREE.getHSL returns HSL, approximate HSV: v = max(r,g,b), s = (v-min)/v
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const v = max;
    const s = max > 1e-8 ? (max - min) / max : 0;
    const h = hsl.h;
    return { Red: h, Green: s, Blue: v, Alpha: a };
  }

  if (mode === 'hsl') {
    const c = new THREE.Color(r, g, b);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    return { Red: hsl.h, Green: hsl.s, Blue: hsl.l, Alpha: a };
  }

  // Default: RGB
  return { Red: r, Green: g, Blue: b, Alpha: a };
}

/**
 * 24. CombineColor — Combine R, G, B, A into color (RGB, HSV, HSL modes).
 * Inputs: Red, Green, Blue, Alpha, Mode
 * Outputs: Color
 */
export function executeCombineColor(inputs: NodeInputs): NodeOutput {
  const red = (inputs.Red ?? inputs.red ?? inputs.R ?? inputs.r ?? 0) as number;
  const green = (inputs.Green ?? inputs.green ?? inputs.G ?? inputs.g ?? 0) as number;
  const blue = (inputs.Blue ?? inputs.blue ?? inputs.B ?? inputs.b ?? 0) as number;
  const alpha = (inputs.Alpha ?? inputs.alpha ?? inputs.A ?? inputs.a ?? 1.0) as number;
  const mode = (inputs.Mode ?? inputs.mode ?? inputs.ColorSpace ?? inputs.colorSpace ?? 'rgb') as string;

  if (mode === 'hsv') {
    // HSV to RGB
    const c = new THREE.Color();
    c.setHSL(red, green, blue * 0.5); // Approximate: HSL as proxy
    return { Color: { r: c.r, g: c.g, b: c.b, a: alpha } };
  }

  if (mode === 'hsl') {
    const c = new THREE.Color();
    c.setHSL(red, green, blue);
    return { Color: { r: c.r, g: c.g, b: c.b, a: alpha } };
  }

  // Default: RGB
  return { Color: { r: red, g: green, b: blue, a: alpha } };
}

// ============================================================================
// Math/Utility Node Executors
// ============================================================================

/**
 * 25. BooleanMath — AND, OR, NOT, NAND, NOR, XOR, IMPLY on boolean inputs.
 * Inputs: Boolean1, Boolean2, Operation
 * Outputs: Boolean
 */
export function executeBooleanMath(inputs: NodeInputs): NodeOutput {
  const a = (inputs.Boolean1 ?? inputs.boolean1 ?? inputs.A ?? inputs.a ?? inputs.Boolean ?? inputs.boolean ?? false) as boolean;
  const b = (inputs.Boolean2 ?? inputs.boolean2 ?? inputs.B ?? inputs.b ?? false) as boolean;
  const operation = (inputs.Operation ?? inputs.operation ?? 'and') as string;

  const ba = Boolean(a);
  const bb = Boolean(b);

  let result: boolean;
  switch (operation) {
    case 'or':
      result = ba || bb;
      break;
    case 'not':
      result = !ba;
      break;
    case 'nand':
      result = !(ba && bb);
      break;
    case 'nor':
      result = !(ba || bb);
      break;
    case 'xor':
      result = ba !== bb;
      break;
    case 'imply':
      result = !ba || bb;
      break;
    case 'nimply':
      result = ba && !bb;
      break;
    default: // 'and'
      result = ba && bb;
  }

  return { Boolean: result };
}

/**
 * 26. FloatCompare — Compare floats: less, equal, greater, not equal, etc.
 * Inputs: A, B, Operation, Epsilon (for equal)
 * Outputs: Boolean
 */
export function executeFloatCompare(inputs: NodeInputs): NodeOutput {
  const a = (inputs.A ?? inputs.a ?? inputs.Value1 ?? inputs.value1 ?? 0.0) as number;
  const b = (inputs.B ?? inputs.b ?? inputs.Value2 ?? inputs.value2 ?? 0.0) as number;
  const operation = (inputs.Operation ?? inputs.operation ?? 'less_than') as string;
  const epsilon = (inputs.Epsilon ?? inputs.epsilon ?? 0.001) as number;

  const fa = typeof a === 'number' ? a : 0;
  const fb = typeof b === 'number' ? b : 0;

  let result: boolean;
  switch (operation) {
    case 'equal':
      result = Math.abs(fa - fb) <= epsilon;
      break;
    case 'not_equal':
      result = Math.abs(fa - fb) > epsilon;
      break;
    case 'greater_than':
      result = fa > fb;
      break;
    case 'greater_equal':
      result = fa >= fb;
      break;
    case 'less_equal':
      result = fa <= fb;
      break;
    default: // 'less_than'
      result = fa < fb;
  }

  return { Boolean: result };
}

/**
 * 27. MapRange (vector) — Map 3D vector from one range to another with steering.
 * Inputs: Vector, FromMin, FromMax, ToMin, ToMax, Clamp, InterpolationType
 * Outputs: Vector
 */
export function executeMapRangeVector(inputs: NodeInputs): NodeOutput {
  const vector = normalizeVec(inputs.Vector ?? inputs.vector ?? inputs.Value ?? inputs.value ?? { x: 0, y: 0, z: 0 });
  const fromMin = normalizeVec(inputs.FromMin ?? inputs.fromMin ?? { x: 0, y: 0, z: 0 });
  const fromMax = normalizeVec(inputs.FromMax ?? inputs.fromMax ?? { x: 1, y: 1, z: 1 });
  const toMin = normalizeVec(inputs.ToMin ?? inputs.toMin ?? { x: 0, y: 0, z: 0 });
  const toMax = normalizeVec(inputs.ToMax ?? inputs.toMax ?? { x: 1, y: 1, z: 1 });
  const shouldClamp = (inputs.Clamp ?? inputs.clamp ?? true) as boolean;
  const interpolationType = (inputs.InterpolationType ?? inputs.interpolationType ?? 'linear') as string;

  const mapComponent = (val: number, fMin: number, fMax: number, tMin: number, tMax: number): number => {
    const fromRange = fMax - fMin;
    const toRange = tMax - tMin;

    let t: number;
    if (Math.abs(fromRange) < 1e-10) {
      t = 0;
    } else {
      t = (val - fMin) / fromRange;
    }

    switch (interpolationType) {
      case 'stepped':
        t = Math.floor(t);
        break;
      case 'smoothstep': {
        const ct = Math.max(0, Math.min(1, t));
        t = ct * ct * (3 - 2 * ct);
        break;
      }
      case 'smootherstep': {
        const ct = Math.max(0, Math.min(1, t));
        t = ct * ct * ct * (ct * (ct * 6 - 15) + 10);
        break;
      }
      default:
        break;
    }

    if (shouldClamp) {
      t = Math.max(0, Math.min(1, t));
    }

    return tMin + t * toRange;
  };

  return {
    Vector: {
      x: mapComponent(vector.x, fromMin.x, fromMax.x, toMin.x, toMax.x),
      y: mapComponent(vector.y, fromMin.y, fromMax.y, toMin.y, toMax.y),
      z: mapComponent(vector.z, fromMin.z, fromMax.z, toMin.z, toMax.z),
    },
  };
}

/**
 * 28. RotationToEuler — Convert quaternion/axis-angle rotation to Euler angles.
 * Inputs: Rotation (quaternion {x,y,z,w} or axis+angle), Mode
 * Outputs: Euler
 */
export function executeRotationToEuler(inputs: NodeInputs): NodeOutput {
  const rotation = (inputs.Rotation ?? inputs.rotation ?? inputs.Quaternion ?? inputs.quaternion ?? null) as unknown;
  const mode = (inputs.Mode ?? inputs.mode ?? 'quaternion') as string; // 'quaternion' | 'axis_angle'

  let quat: THREE.Quaternion;

  if (mode === 'axis_angle') {
    const axis = normalizeVec(inputs.Axis ?? inputs.axis ?? { x: 0, y: 0, z: 1 });
    const angle = (inputs.Angle ?? inputs.angle ?? 0) as number;
    quat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(axis.x, axis.y, axis.z).normalize(),
      angle,
    );
  } else {
    // Quaternion
    if (rotation && typeof rotation === 'object') {
      const r = rotation as Record<string, number>;
      quat = new THREE.Quaternion(
        r.x ?? 0,
        r.y ?? 0,
        r.z ?? 0,
        r.w ?? 1,
      );
    } else {
      quat = new THREE.Quaternion(); // Identity
    }
  }

  const euler = new THREE.Euler().setFromQuaternion(quat, 'XYZ');
  return { Euler: { x: euler.x, y: euler.y, z: euler.z } };
}

/**
 * 29. EulerToRotation — Convert Euler angles to quaternion/axis-angle.
 * Inputs: Euler (rotation vector), OutputMode
 * Outputs: Rotation (quaternion {x,y,z,w} or axis+angle)
 */
export function executeEulerToRotation(inputs: NodeInputs): NodeOutput {
  const euler = normalizeVec(inputs.Euler ?? inputs.euler ?? inputs.Rotation ?? inputs.rotation ?? { x: 0, y: 0, z: 0 });
  const outputMode = (inputs.OutputMode ?? inputs.outputMode ?? inputs.Mode ?? inputs.mode ?? 'quaternion') as string; // 'quaternion' | 'axis_angle'

  const eulerObj = new THREE.Euler(euler.x, euler.y, euler.z, 'XYZ');
  const quat = new THREE.Quaternion().setFromEuler(eulerObj);

  if (outputMode === 'axis_angle') {
    // Compute axis-angle from quaternion manually
    const angle = 2 * Math.acos(Math.max(-1, Math.min(1, quat.w)));
    const s = Math.sqrt(Math.max(0, 1 - quat.w * quat.w));
    const axis = s > 1e-8
      ? new THREE.Vector3(quat.x / s, quat.y / s, quat.z / s)
      : new THREE.Vector3(0, 0, 1);
    return {
      Axis: { x: axis.x, y: axis.y, z: axis.z },
      Angle: angle,
    };
  }

  // Default: quaternion
  return {
    Rotation: { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
  };
}

/**
 * 30. AccumulateField — Running total/average/min/max across geometry elements.
 * Inputs: Geometry, Value, GroupIndex, ResultType
 * Outputs: Leading, Trailing, Total
 *
 * Supports data_type property: 'FLOAT' (scalar), 'FLOAT_VECTOR' (vec3), 'FLOAT_COLOR' (rgb).
 * When Value is an array of vectors/colors, accumulates each component independently.
 */
export function executeAccumulateField(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const value = (inputs.Value ?? inputs.value ?? inputs.Attribute ?? inputs.attribute ?? 1.0) as number | number[] | Vector3Like[] | ColorLike[];
  const groupIndex = (inputs.GroupIndex ?? inputs.groupIndex ?? 0) as number | number[];
  const resultType = (inputs.ResultType ?? inputs.resultType ?? 'total') as string; // 'total' | 'average' | 'min' | 'max'
  const dataType = (inputs.data_type ?? inputs.DataType ?? 'FLOAT') as string; // 'FLOAT' | 'FLOAT_VECTOR' | 'FLOAT_COLOR'

  // ── Vector / Color accumulation support ──

  // Determine component count based on data_type
  const componentCount = dataType === 'FLOAT_VECTOR' ? 3 : dataType === 'FLOAT_COLOR' ? 3 : 1;

  if (componentCount > 1) {
    // Vector or Color accumulation: accumulate each component independently
    // Normalize value input to array of number arrays (each of length componentCount)
    let values: number[][];
    if (Array.isArray(value) && value.length > 0) {
      const firstEl = value[0];
      if (typeof firstEl === 'number') {
        // Flat number array — reshape into component groups
        values = [];
        for (let i = 0; i < value.length; i += componentCount) {
          const comp: number[] = [];
          for (let c = 0; c < componentCount; c++) {
            comp.push((value as number[])[i + c] ?? 0);
          }
          values.push(comp);
        }
      } else if (typeof firstEl === 'object' && firstEl !== null) {
        // Array of vector/color-like objects
        values = (value as (Vector3Like | ColorLike)[]).map(v => {
          if (dataType === 'FLOAT_VECTOR') {
            const vec = v as Vector3Like;
            return [vec.x ?? 0, vec.y ?? 0, vec.z ?? 0];
          } else {
            const col = v as ColorLike;
            return [col.r ?? 0, col.g ?? 0, col.b ?? 0];
          }
        });
      } else {
        values = [[typeof firstEl === 'number' ? firstEl : 0]];
      }
    } else if (typeof value === 'number') {
      // Single scalar broadcast to all components
      values = [[value, value, value]];
    } else {
      values = [[0, 0, 0]];
    }

    if (values.length === 0) {
      return {
        Leading: componentCount === 3 ? { x: 0, y: 0, z: 0 } : 0,
        Trailing: componentCount === 3 ? { x: 0, y: 0, z: 0 } : 0,
        Total: componentCount === 3 ? { x: 0, y: 0, z: 0 } : 0,
      };
    }

    // Group indices
    const groups: Map<number, number[][]> = new Map();
    if (Array.isArray(groupIndex)) {
      for (let i = 0; i < values.length; i++) {
        const g = (groupIndex as number[])[i] ?? 0;
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g)!.push(values[i]);
      }
    } else {
      groups.set(0, values);
    }

    // Compute accumulation per group per component
    const leading: number[][] = [];
    const trailing: number[][] = [];
    const total: number[][] = [];

    for (const [, groupValues] of groups) {
      const runningTotals = new Array(componentCount).fill(0);
      const runningMins = new Array(componentCount).fill(Infinity);
      const runningMaxs = new Array(componentCount).fill(-Infinity);
      const groupLeading: number[][] = [];
      const groupTrailing: number[][] = [];

      for (let i = 0; i < groupValues.length; i++) {
        const val = groupValues[i];
        const leadVal: number[] = new Array(componentCount);
        const trailVal: number[] = new Array(componentCount);

        for (let c = 0; c < componentCount; c++) {
          const vc = val[c] ?? 0;
          switch (resultType) {
            case 'average':
              runningTotals[c] += vc;
              leadVal[c] = i > 0 ? runningTotals[c] / (i + 1) : 0;
              trailVal[c] = runningTotals[c] / (i + 1);
              break;
            case 'min':
              runningMins[c] = Math.min(runningMins[c], vc);
              leadVal[c] = i > 0 ? runningMins[c] : Infinity;
              trailVal[c] = runningMins[c];
              break;
            case 'max':
              runningMaxs[c] = Math.max(runningMaxs[c], vc);
              leadVal[c] = i > 0 ? runningMaxs[c] : -Infinity;
              trailVal[c] = runningMaxs[c];
              break;
            default: // 'total'
              leadVal[c] = runningTotals[c];
              runningTotals[c] += vc;
              trailVal[c] = runningTotals[c];
          }
        }

        groupLeading.push(leadVal);
        groupTrailing.push(trailVal);
      }

      leading.push(...groupLeading);
      trailing.push(...groupTrailing);
      const totalVal = groupTrailing.length > 0 ? groupTrailing[groupTrailing.length - 1] : new Array(componentCount).fill(0);
      total.push(totalVal);
    }

    // Convert arrays back to vector/color-like objects
    const toOutput = (arr: number[][]): Vector3Like[] | Vector3Like => {
      const objects = arr.map(a => {
        if (dataType === 'FLOAT_COLOR') {
          return { r: a[0], g: a[1], b: a[2] } as unknown as Vector3Like;
        }
        return { x: a[0], y: a[1], z: a[2] } as Vector3Like;
      });
      return objects.length === 1 ? objects[0] : objects;
    };

    const toTotalOutput = (arr: number[][]): Vector3Like | Vector3Like[] => {
      const objects = arr.map(a => {
        if (dataType === 'FLOAT_COLOR') {
          return { r: a[0], g: a[1], b: a[2] } as unknown as Vector3Like;
        }
        return { x: a[0], y: a[1], z: a[2] } as Vector3Like;
      });
      return objects.length === 1 ? objects[0] : objects;
    };

    return {
      Leading: toOutput(leading),
      Trailing: toOutput(trailing),
      Total: toTotalOutput(total),
    };
  }

  // ── Scalar (FLOAT) accumulation path (original implementation) ──

  // Collect values from geometry attribute or direct input
  let values: number[];
  if (Array.isArray(value)) {
    values = (value as unknown[]).map((v: unknown) => typeof v === 'number' ? v : 0);
  } else if (geometry && typeof value === 'string') {
    const attr = geometry.getAttribute(value);
    if (attr) {
      values = [];
      for (let i = 0; i < attr.count; i++) {
        values.push(attr.getX(i));
      }
    } else {
      values = [typeof value === 'number' ? value : 0];
    }
  } else {
    values = [typeof value === 'number' ? value : 0];
  }

  if (values.length === 0) {
    return { Leading: 0, Trailing: 0, Total: 0 };
  }

  // Group indices: if array, group elements; otherwise all in one group
  const groups: Map<number, number[]> = new Map();
  if (Array.isArray(groupIndex)) {
    for (let i = 0; i < values.length; i++) {
      const g = groupIndex[i] ?? 0;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(values[i]);
    }
  } else {
    groups.set(0, values);
  }

  // Compute accumulation per group
  const leading: number[] = [];
  const trailing: number[] = [];
  const total: number[] = [];

  for (const [, groupValues] of groups) {
    let runningTotal = 0;
    let runningMin = Infinity;
    let runningMax = -Infinity;
    const groupLeading: number[] = [];
    const groupTrailing: number[] = [];

    for (let i = 0; i < groupValues.length; i++) {
      switch (resultType) {
        case 'average':
          runningTotal += groupValues[i];
          groupLeading.push(i > 0 ? runningTotal / (i + 1) : 0);
          groupTrailing.push(runningTotal / (i + 1));
          break;
        case 'min':
          runningMin = Math.min(runningMin, groupValues[i]);
          groupLeading.push(i > 0 ? runningMin : Infinity);
          groupTrailing.push(runningMin);
          break;
        case 'max':
          runningMax = Math.max(runningMax, groupValues[i]);
          groupLeading.push(i > 0 ? runningMax : -Infinity);
          groupTrailing.push(runningMax);
          break;
        default: // 'total'
          groupLeading.push(runningTotal);
          runningTotal += groupValues[i];
          groupTrailing.push(runningTotal);
      }
    }

    leading.push(...groupLeading);
    trailing.push(...groupTrailing);
    total.push(groupTrailing.length > 0 ? groupTrailing[groupTrailing.length - 1] : 0);
  }

  return {
    Leading: leading.length === 1 ? leading[0] : leading,
    Trailing: trailing.length === 1 ? trailing[0] : trailing,
    Total: total.length === 1 ? total[0] : total,
  };
}

// ============================================================================
// Registry
// ============================================================================

/**
 * AdditionalNodeExecutors registry — maps node type names to executor functions.
 * This can be merged with the CoreNodeExecutors and ExtendedNodeExecutors registries
 * by the NodeEvaluator to provide full coverage of node types.
 */
export class AdditionalNodeExecutors {
  static registry: Map<string, NodeExecutorFunction> = new Map([
    // Texture Coordinate Nodes
    ['TextureCoordinate', executeTextureCoordinate],
    ['texture_coordinate', executeTextureCoordinate],
    ['ShaderNodeTexCoord', executeTextureCoordinate],
    ['Mapping', executeMapping],
    ['mapping', executeMapping],
    ['ShaderNodeMapping', executeMapping],
    ['UVMap', executeUVMap],
    ['uv_map', executeUVMap],
    ['GeometryNodeInputPosition', executeGeometryNodeInputPosition],
    ['input_position', executeGeometryNodeInputPosition],
    ['GeometryNodeInputNormal', executeGeometryNodeInputNormal],
    ['input_normal', executeGeometryNodeInputNormal],
    ['GeometryNodeInputTangent', executeGeometryNodeInputTangent],
    ['input_tangent', executeGeometryNodeInputTangent],

    // Geometry Operation Nodes
    ['SubdivideMesh', executeSubdivideMesh],
    ['subdivide_mesh', executeSubdivideMesh],
    ['GeometryNodeSubdivisionSurface', executeSubdivideMesh],
    ['DecimateMesh', executeDecimateMesh],
    ['decimate_mesh', executeDecimateMesh],
    ['GeometryNodeDecimate', executeDecimateMesh],
    ['ExtrudeFaces', executeExtrudeFaces],
    ['extrude_faces', executeExtrudeFaces],
    ['GeometryNodeExtrudeFaces', executeExtrudeFaces],
    ['InsetFaces', executeInsetFaces],
    ['inset_faces', executeInsetFaces],
    ['GeometryNodeInsetFaces', executeInsetFaces],
    ['FlipFaces', executeFlipFaces],
    ['flip_faces', executeFlipFaces],
    ['GeometryNodeFlipFaces', executeFlipFaces],
    ['RotateMesh', executeRotateMesh],
    ['rotate_mesh', executeRotateMesh],
    ['GeometryNodeRotateMesh', executeRotateMesh],
    ['ScaleMesh', executeScaleMesh],
    ['scale_mesh', executeScaleMesh],
    ['GeometryNodeScaleMesh', executeScaleMesh],
    ['TranslateMesh', executeTranslateMesh],
    ['translate_mesh', executeTranslateMesh],
    ['GeometryNodeTranslateMesh', executeTranslateMesh],

    // Texture/Evaluation Nodes
    ['BrickTexture', executeBrickTexture],
    ['brick_texture', executeBrickTexture],
    ['ShaderNodeTexBrick', executeBrickTexture],
    ['CheckerTexture', executeCheckerTexture],
    ['checker_texture', executeCheckerTexture],
    ['ShaderNodeTexChecker', executeCheckerTexture],
    ['GradientTexture', executeGradientTexture],
    ['gradient_texture', executeGradientTexture],
    ['ShaderNodeTexGradient', executeGradientTexture],
    ['MagicTexture', executeMagicTexture],
    ['magic_texture', executeMagicTexture],
    ['ShaderNodeTexMagic', executeMagicTexture],
    ['WaveTexture', executeWaveTexture],
    ['wave_texture', executeWaveTexture],
    ['ShaderNodeTexWave', executeWaveTexture],
    ['WhiteNoiseTexture', executeWhiteNoiseTexture],
    ['white_noise_texture', executeWhiteNoiseTexture],
    ['ShaderNodeTexWhiteNoise', executeWhiteNoiseTexture],

    // Color/Mix Nodes
    ['ColorRamp', executeColorRamp],
    ['color_ramp', executeColorRamp],
    ['ShaderNodeValToRGB', executeColorRamp],
    ['Curves', executeCurves],
    ['curves', executeCurves],
    ['ShaderNodeCurveRGB', executeCurves],
    ['SeparateColor', executeSeparateColor],
    ['separate_color', executeSeparateColor],
    ['FunctionNodeSeparateColor', executeSeparateColor],
    ['CombineColor', executeCombineColor],
    ['combine_color', executeCombineColor],
    ['FunctionNodeCombineColor', executeCombineColor],

    // Math/Utility Nodes
    ['BooleanMath', executeBooleanMath],
    ['boolean_math', executeBooleanMath],
    ['FunctionNodeBooleanMath', executeBooleanMath],
    ['FloatCompare', executeFloatCompare],
    ['float_compare', executeFloatCompare],
    ['FunctionNodeFloatCompare', executeFloatCompare],
    ['MapRangeVector', executeMapRangeVector],
    ['map_range_vector', executeMapRangeVector],
    ['ShaderNodeVectorMapRange', executeMapRangeVector],
    ['RotationToEuler', executeRotationToEuler],
    ['rotation_to_euler', executeRotationToEuler],
    ['FunctionNodeRotationToEuler', executeRotationToEuler],
    ['EulerToRotation', executeEulerToRotation],
    ['euler_to_rotation', executeEulerToRotation],
    ['FunctionNodeEulerToRotation', executeEulerToRotation],
    ['AccumulateField', executeAccumulateField],
    ['accumulate_field', executeAccumulateField],
    ['GeometryNodeAccumulateField', executeAccumulateField],
  ]);
}
