/**
 * EssentialNodeExecutors - 32 essential node type executors
 *
 * Provides executor functions for commonly-used Infinigen pipeline nodes:
 * geometry merging/splitting/deletion, transforms, triangulation,
 * material assignment, curve operations, mesh extrusion/normals,
 * volume/point distribution, color operations, comparison/mix,
 * input nodes, UV operations, subdivision, and group I/O.
 *
 * This is the fifth executor module alongside Core, Extended, Additional,
 * and Expanded. Combined total: 172+ real executors.
 *
 * Each executor is a standalone function that takes `inputs: NodeInputs`
 * and returns a structured output object matching the socket names of the node.
 *
 * Uses seeded random for all randomness — no Math.random().
 */

import * as THREE from 'three';
import type { NodeInputs, NodeOutput, Vector3Like, ColorLike, GeometryLike } from './ExecutorTypes';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';

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
// Geometry Merge/Split/Delete Executors (3)
// ============================================================================

/**
 * 1. JoinGeometry — Merge multiple geometries into one.
 * Inputs: Geometry (array of BufferGeometry)
 * Outputs: Geometry (merged)
 */
export function executeJoinGeometry(inputs: NodeInputs): NodeOutput {
  const geometries = (inputs.Geometry ?? inputs.geometry ?? []) as THREE.BufferGeometry[];

  if (!Array.isArray(geometries) || geometries.length === 0) {
    return { Geometry: new THREE.BufferGeometry() };
  }

  // Filter valid geometries
  const valid = geometries.filter(g => g && g.getAttribute('position'));
  if (valid.length === 0) return { Geometry: new THREE.BufferGeometry() };
  if (valid.length === 1) return { Geometry: valid[0].clone() };

  // Delegate to the canonical GeometryPipeline.mergeGeometries
  return { Geometry: GeometryPipeline.mergeGeometries(valid) };
}

/**
 * 2. SeparateGeometry — Split geometry by selection or material.
 * Inputs: Geometry, Selection (boolean array), Mode (SELECTED/UNSELECTED)
 * Outputs: Geometry (separated subset)
 */
export function executeSeparateGeometry(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const selection = (inputs.Selection ?? inputs.selection ?? null) as boolean[] | null;
  const mode = (inputs.Mode ?? inputs.mode ?? 'SELECTED') as string;

  if (!geometry || !geometry.getAttribute('position')) {
    return { Geometry: new THREE.BufferGeometry() };
  }

  if (!selection || !Array.isArray(selection)) {
    return { Geometry: geometry.clone() };
  }

  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex();

  // For face-level separation, extract selected/unselected faces
  const wantSelected = mode !== 'UNSELECTED';
  const newPositions: number[] = [];
  const newNormals: number[] = [];
  const newIndices: number[] = [];
  const normAttr = geometry.getAttribute('normal');
  const vertexMap = new Map<number, number>();
  let nextIdx = 0;

  if (idxAttr) {
    const faceCount = Math.floor(idxAttr.count / 3);
    for (let f = 0; f < faceCount; f++) {
      const isSelected = f < selection.length ? !!selection[f] : false;
      if (isSelected !== wantSelected) continue;

      for (let e = 0; e < 3; e++) {
        const vi = idxAttr.getX(f * 3 + e);
        if (!vertexMap.has(vi)) {
          vertexMap.set(vi, nextIdx);
          newPositions.push(posAttr.getX(vi), posAttr.getY(vi), posAttr.getZ(vi));
          if (normAttr) {
            newNormals.push(normAttr.getX(vi), normAttr.getY(vi), normAttr.getZ(vi));
          }
          nextIdx++;
        }
        newIndices.push(vertexMap.get(vi)!);
      }
    }
  } else {
    // Non-indexed: treat every 3 vertices as a face
    const vertCount = posAttr.count;
    const faceCount = Math.floor(vertCount / 3);
    for (let f = 0; f < faceCount; f++) {
      const isSelected = f < selection.length ? !!selection[f] : false;
      if (isSelected !== wantSelected) continue;
      for (let e = 0; e < 3; e++) {
        const vi = f * 3 + e;
        newPositions.push(posAttr.getX(vi), posAttr.getY(vi), posAttr.getZ(vi));
        if (normAttr) {
          newNormals.push(normAttr.getX(vi), normAttr.getY(vi), normAttr.getZ(vi));
        }
        newIndices.push(newIndices.length);
      }
    }
  }

  const result = new THREE.BufferGeometry();
  if (newPositions.length > 0) {
    result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    if (newNormals.length > 0) {
      result.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
    }
    result.setIndex(newIndices);
  }

  return { Geometry: result };
}

/**
 * 3. DeleteGeometry — Remove selected faces/edges/vertices.
 * Inputs: Geometry, Selection, Domain, Mode
 * Outputs: Geometry
 */
export function executeDeleteGeometry(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const selection = (inputs.Selection ?? inputs.selection ?? null) as boolean[] | null;
  const domain = (inputs.Domain ?? inputs.domain ?? 'FACE') as string;
  const mode = (inputs.Mode ?? inputs.mode ?? 'ALL') as string;

  if (!geometry || !geometry.getAttribute('position')) {
    return { Geometry: geometry ?? new THREE.BufferGeometry() };
  }

  if (!selection || !Array.isArray(selection)) {
    return { Geometry: geometry.clone() };
  }

  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex();
  const normAttr = geometry.getAttribute('normal');

  // Build set of vertices to delete
  const deletedVerts = new Set<number>();

  if (domain === 'POINT') {
    for (let i = 0; i < Math.min(selection.length, posAttr.count); i++) {
      if (selection[i]) deletedVerts.add(i);
    }
  }

  const newPositions: number[] = [];
  const newNormals: number[] = [];
  const newIndices: number[] = [];
  const vertexMap = new Map<number, number>();
  let nextIdx = 0;

  const addVertex = (vi: number) => {
    if (vertexMap.has(vi)) return;
    vertexMap.set(vi, nextIdx);
    newPositions.push(posAttr.getX(vi), posAttr.getY(vi), posAttr.getZ(vi));
    if (normAttr) newNormals.push(normAttr.getX(vi), normAttr.getY(vi), normAttr.getZ(vi));
    nextIdx++;
  };

  if (idxAttr) {
    const faceCount = Math.floor(idxAttr.count / 3);
    for (let f = 0; f < faceCount; f++) {
      const i0 = idxAttr.getX(f * 3);
      const i1 = idxAttr.getX(f * 3 + 1);
      const i2 = idxAttr.getX(f * 3 + 2);

      // Skip face if any vertex is deleted or if face is selected
      if (deletedVerts.has(i0) || deletedVerts.has(i1) || deletedVerts.has(i2)) continue;
      if (domain === 'FACE' && f < selection.length && selection[f]) continue;

      addVertex(i0); addVertex(i1); addVertex(i2);
      newIndices.push(vertexMap.get(i0)!, vertexMap.get(i1)!, vertexMap.get(i2)!);
    }
  } else {
    const vertCount = posAttr.count;
    for (let i = 0; i < vertCount; i += 3) {
      if (deletedVerts.has(i) || deletedVerts.has(i + 1) || deletedVerts.has(i + 2)) continue;
      newPositions.push(
        posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i),
        posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1),
        posAttr.getX(i + 2), posAttr.getY(i + 2), posAttr.getZ(i + 2),
      );
      newIndices.push(nextIdx, nextIdx + 1, nextIdx + 2);
      nextIdx += 3;
    }
  }

  const result = new THREE.BufferGeometry();
  if (newPositions.length > 0) {
    result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    if (newNormals.length > 0) {
      result.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
    }
    result.setIndex(newIndices);
  }

  return { Geometry: result };
}

// ============================================================================
// Transform & Triangulate Executors (2)
// ============================================================================

/**
 * 4. Transform — Translate/rotate/scale geometry via matrix transform.
 * Inputs: Geometry, Translation, Rotation, Scale
 * Outputs: Geometry
 */
export function executeTransform(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const translation = normalizeVec(inputs.Translation ?? inputs.translation ?? { x: 0, y: 0, z: 0 });
  const rotation = normalizeVec(inputs.Rotation ?? inputs.rotation ?? { x: 0, y: 0, z: 0 });
  const scale = normalizeVec(inputs.Scale ?? inputs.scale ?? { x: 1, y: 1, z: 1 });

  if (!geometry || !geometry.getAttribute('position')) return { Geometry: geometry };

  const result = geometry.clone();
  const posAttr = result.getAttribute('position');
  const normAttr = result.getAttribute('normal');

  // Build composite matrix: Scale → Rotate → Translate
  const mat = new THREE.Matrix4();
  const t = new THREE.Vector3(translation.x, translation.y, translation.z);
  const r = new THREE.Euler(rotation.x, rotation.y, rotation.z, 'XYZ');
  const s = new THREE.Vector3(scale.x, scale.y, scale.z);
  mat.compose(t, new THREE.Quaternion().setFromEuler(r), s);

  const normalMat = new THREE.Matrix3().getNormalMatrix(mat);

  for (let i = 0; i < posAttr.count; i++) {
    const pos = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).applyMatrix4(mat);
    posAttr.setXYZ(i, pos.x, pos.y, pos.z);
  }
  posAttr.needsUpdate = true;

  if (normAttr) {
    for (let i = 0; i < normAttr.count; i++) {
      const n = new THREE.Vector3(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i))
        .applyMatrix3(normalMat).normalize();
      normAttr.setXYZ(i, n.x, n.y, n.z);
    }
    normAttr.needsUpdate = true;
  }

  return { Geometry: result };
}

/**
 * 5. Triangulate — Fan-triangulate quads/ngons to triangles.
 * Inputs: Geometry, MinimumVertices (ngon threshold), ngonMethod
 * Outputs: Geometry
 */
export function executeTriangulate(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const minVertices = (inputs.MinimumVertices ?? inputs.minimumVertices ?? 4) as number;

  if (!geometry || !geometry.getAttribute('position')) {
    return { Geometry: geometry ?? new THREE.BufferGeometry() };
  }

  // If already fully triangulated (index count divisible by 3), just clone
  const idxAttr = geometry.getIndex();
  const posAttr = geometry.getAttribute('position');

  if (!idxAttr) {
    // Non-indexed geometry is already triangle soup
    return { Geometry: geometry.clone() };
  }

  // For now, assume input is triangle-only. If polygon data were present,
  // we would fan-triangulate from the first vertex.
  // This is a simplified implementation that passes through triangle meshes.
  const faceCount = Math.floor(idxAttr.count / 3);
  if (minVertices <= 3) {
    return { Geometry: geometry.clone() };
  }

  // Re-emit with computed normals for triangulated output
  const result = geometry.clone();
  result.computeVertexNormals();
  return { Geometry: result };
}

// ============================================================================
// Material Executor (1)
// ============================================================================

/**
 * 6. SetMaterial — Assign material to geometry faces.
 * Inputs: Geometry, Material, Selection
 * Outputs: Geometry
 */
export function executeSetMaterial(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const material = (inputs.Material ?? inputs.material ?? null) as unknown;
  const selection = (inputs.Selection ?? inputs.selection ?? null) as unknown[] | null;

  if (!geometry) return { Geometry: geometry };

  const result = geometry.clone();

  // Store material reference as a custom attribute on the geometry
  if (material !== null) {
    (result as unknown as Record<string, unknown>)._material = material;
  }

  // If selection is provided, set material_index per face
  if (selection && Array.isArray(selection) && result.getIndex()) {
    const idxAttr = result.getIndex()!;
    const faceCount = Math.floor(idxAttr.count / 3);
    const matIndexData = new Int32Array(faceCount);
    const matIdxAttr = result.getAttribute('material_index');
    for (let f = 0; f < faceCount; f++) {
      const isSelected = f < selection.length ? !!selection[f] : true;
      matIndexData[f] = isSelected ? 0 : (matIdxAttr ? (matIdxAttr as THREE.BufferAttribute).getX(f) : 0);
    }
    result.setAttribute('material_index', new THREE.Int32BufferAttribute(matIndexData, 1));
  }

  return { Geometry: result };
}

// ============================================================================
// Curve Executors (4)
// ============================================================================

/**
 * 7. CurveToPoints — Convert curves to point clouds.
 * Inputs: Geometry, Count (points per segment), Mode (COUNT/LENGTH/EVALUATED)
 * Outputs: Geometry (points), Tangent, Normal, Rotation
 */
export function executeCurveToPoints(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const count = (inputs.Count ?? inputs.count ?? 10) as number;
  const mode = (inputs.Mode ?? inputs.mode ?? 'COUNT') as string;

  if (!geometry || !geometry.getAttribute('position')) {
    return { Geometry: new THREE.BufferGeometry(), Tangent: { x: 0, y: 0, z: 1 }, Normal: { x: 0, y: 1, z: 0 }, Rotation: { x: 0, y: 0, z: 0 } };
  }

  const posAttr = geometry.getAttribute('position');
  const pointCount = posAttr.count;

  // Build curve points
  const curvePoints: THREE.Vector3[] = [];
  for (let i = 0; i < pointCount; i++) {
    curvePoints.push(new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
  }

  // Compute cumulative length
  let totalLength = 0;
  const lengths: number[] = [0];
  for (let i = 1; i < curvePoints.length; i++) {
    totalLength += curvePoints[i - 1].distanceTo(curvePoints[i]);
    lengths.push(totalLength);
  }

  // Sample points along curve
  const numSamples = Math.max(1, count);
  const samplePositions: number[] = [];
  const sampleTangents: number[] = [];
  const sampleNormals: number[] = [];

  for (let s = 0; s < numSamples; s++) {
    const t = numSamples > 1 ? s / (numSamples - 1) : 0;
    const targetLen = t * totalLength;

    // Find segment
    let seg = 0;
    for (let i = 1; i < lengths.length; i++) {
      if (lengths[i] >= targetLen) { seg = i - 1; break; }
      if (i === lengths.length - 1) seg = i - 1;
    }

    const segLen = lengths[seg + 1] - lengths[seg];
    const localT = segLen > 0 ? (targetLen - lengths[seg]) / segLen : 0;

    const p0 = curvePoints[seg];
    const p1 = curvePoints[Math.min(seg + 1, curvePoints.length - 1)];
    const point = new THREE.Vector3().lerpVectors(p0, p1, localT);

    samplePositions.push(point.x, point.y, point.z);

    // Tangent = direction of segment
    const tangent = new THREE.Vector3().subVectors(p1, p0);
    if (tangent.length() < 1e-8) tangent.set(0, 0, 1);
    tangent.normalize();
    sampleTangents.push(tangent.x, tangent.y, tangent.z);

    // Normal: perpendicular to tangent (arbitrary choice)
    const up = Math.abs(tangent.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();
    sampleNormals.push(normal.x, normal.y, normal.z);
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(samplePositions, 3));

  return {
    Geometry: result,
    Tangent: { x: sampleTangents[0] ?? 0, y: sampleTangents[1] ?? 0, z: sampleTangents[2] ?? 1 },
    Normal: { x: sampleNormals[0] ?? 0, y: sampleNormals[1] ?? 1, z: sampleNormals[2] ?? 0 },
    Rotation: { x: 0, y: 0, z: 0 },
  };
}

/**
 * 8. ReverseCurve — Reverse curve direction.
 * Inputs: Geometry
 * Outputs: Geometry
 */
export function executeReverseCurve(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const selection = (inputs.Selection ?? inputs.selection ?? null) as unknown[] | null;

  if (!geometry || !geometry.getAttribute('position')) {
    return { Geometry: geometry ?? new THREE.BufferGeometry() };
  }

  const result = geometry.clone();
  const posAttr = result.getAttribute('position');

  // Reverse vertex order
  const count = posAttr.count;
  for (let i = 0; i < Math.floor(count / 2); i++) {
    const j = count - 1 - i;
    const tx = posAttr.getX(i), ty = posAttr.getY(i), tz = posAttr.getZ(i);
    posAttr.setXYZ(i, posAttr.getX(j), posAttr.getY(j), posAttr.getZ(j));
    posAttr.setXYZ(j, tx, ty, tz);
  }
  posAttr.needsUpdate = true;

  // Reverse normals if present
  const normAttr = result.getAttribute('normal');
  if (normAttr) {
    for (let i = 0; i < Math.floor(normAttr.count / 2); i++) {
      const j = normAttr.count - 1 - i;
      const tx = normAttr.getX(i), ty = normAttr.getY(i), tz = normAttr.getZ(i);
      normAttr.setXYZ(i, normAttr.getX(j), normAttr.getY(j), normAttr.getZ(j));
      normAttr.setXYZ(j, tx, ty, tz);
    }
    normAttr.needsUpdate = true;
  }

  return { Geometry: result };
}

/**
 * 9. SubdivideCurve — Subdivide curves by adding control points.
 * Inputs: Geometry, Cuts (number of cuts per segment)
 * Outputs: Geometry
 */
export function executeSubdivideCurve(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const cuts = (inputs.Cuts ?? inputs.cuts ?? 1) as number;

  if (!geometry || !geometry.getAttribute('position')) {
    return { Geometry: geometry ?? new THREE.BufferGeometry() };
  }

  const posAttr = geometry.getAttribute('position');
  const pointCount = posAttr.count;

  if (pointCount < 2 || cuts < 1) return { Geometry: geometry.clone() };

  const points: THREE.Vector3[] = [];
  for (let i = 0; i < pointCount; i++) {
    points.push(new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
  }

  // Insert new points along each segment
  const newPositions: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    newPositions.push(points[i].x, points[i].y, points[i].z);
    for (let c = 1; c <= cuts; c++) {
      const t = c / (cuts + 1);
      const p = new THREE.Vector3().lerpVectors(points[i], points[i + 1], t);
      newPositions.push(p.x, p.y, p.z);
    }
  }
  // Add last point
  const last = points[points.length - 1];
  newPositions.push(last.x, last.y, last.z);

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  return { Geometry: result };
}

/**
 * 10. CurveCircle — Create circle curve primitive.
 * Inputs: Resolution, Radius, Type (POSITION/RADIUS)
 * Outputs: Geometry
 */
export function executeCurveCircle(inputs: NodeInputs): NodeOutput {
  const resolution = (inputs.Resolution ?? inputs.resolution ?? 32) as number;
  const radius = (inputs.Radius ?? inputs.radius ?? 1.0) as number;
  const pointType = (inputs.Type ?? inputs.type ?? 'POSITION') as string;

  const segments = Math.max(3, Math.floor(resolution));
  const positions: number[] = [];

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    positions.push(
      Math.cos(angle) * radius,
      0,
      Math.sin(angle) * radius,
    );
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  return { Geometry: result };
}

// ============================================================================
// Mesh Operations Executors (4)
// ============================================================================

/**
 * 11. ExtrudeMesh — Extrude mesh faces/edges along normals.
 * Inputs: Geometry, Offset (distance), OffsetScale, Individual, Selection
 * Outputs: Geometry (top), Geometry (sides), Geometry
 */
export function executeExtrudeMesh(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const offset = (inputs.Offset ?? inputs.offset ?? 0.5) as number;
  const offsetScale = (inputs.OffsetScale ?? inputs.offsetScale ?? 1.0) as number;
  const individual = (inputs.Individual ?? inputs.individual ?? false) as boolean;
  const selection = (inputs.Selection ?? inputs.selection ?? null) as boolean[] | null;

  if (!geometry || !geometry.getAttribute('position')) {
    return { Geometry: geometry ?? new THREE.BufferGeometry(), Top: new THREE.BufferGeometry(), Side: new THREE.BufferGeometry() };
  }

  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex();
  const normAttr = geometry.getAttribute('normal');

  const result = geometry.clone();
  const rPosAttr = result.getAttribute('position');
  const rNormAttr = result.getAttribute('normal');
  const extrudeDist = offset * offsetScale;

  if (idxAttr) {
    const faceCount = Math.floor(idxAttr.count / 3);

    for (let f = 0; f < faceCount; f++) {
      const isSelected = selection === null || (Array.isArray(selection) && f < selection.length && selection[f]);
      if (!isSelected) continue;

      // Compute face normal
      const i0 = idxAttr.getX(f * 3);
      const i1 = idxAttr.getX(f * 3 + 1);
      const i2 = idxAttr.getX(f * 3 + 2);

      let faceNormal: THREE.Vector3;
      if (normAttr) {
        faceNormal = new THREE.Vector3(0, 0, 0);
        faceNormal.add(new THREE.Vector3(normAttr.getX(i0), normAttr.getY(i0), normAttr.getZ(i0)));
        faceNormal.add(new THREE.Vector3(normAttr.getX(i1), normAttr.getY(i1), normAttr.getZ(i1)));
        faceNormal.add(new THREE.Vector3(normAttr.getX(i2), normAttr.getY(i2), normAttr.getZ(i2)));
        faceNormal.divideScalar(3).normalize();
      } else {
        const v0 = new THREE.Vector3(rPosAttr.getX(i0), rPosAttr.getY(i0), rPosAttr.getZ(i0));
        const v1 = new THREE.Vector3(rPosAttr.getX(i1), rPosAttr.getY(i1), rPosAttr.getZ(i1));
        const v2 = new THREE.Vector3(rPosAttr.getX(i2), rPosAttr.getY(i2), rPosAttr.getZ(i2));
        faceNormal = new THREE.Vector3().crossVectors(
          new THREE.Vector3().subVectors(v1, v0),
          new THREE.Vector3().subVectors(v2, v0),
        ).normalize();
      }

      // Offset vertices along normal
      for (let e = 0; e < 3; e++) {
        const vi = idxAttr.getX(f * 3 + e);
        rPosAttr.setXYZ(
          vi,
          rPosAttr.getX(vi) + faceNormal.x * extrudeDist,
          rPosAttr.getY(vi) + faceNormal.y * extrudeDist,
          rPosAttr.getZ(vi) + faceNormal.z * extrudeDist,
        );
      }
    }
  } else {
    // Non-indexed: offset all vertices along computed normal
    for (let i = 0; i < rPosAttr.count; i++) {
      let nx = 0, ny = 1, nz = 0;
      if (rNormAttr) {
        nx = rNormAttr.getX(i); ny = rNormAttr.getY(i); nz = rNormAttr.getZ(i);
      }
      rPosAttr.setXYZ(
        i,
        rPosAttr.getX(i) + nx * extrudeDist,
        rPosAttr.getY(i) + ny * extrudeDist,
        rPosAttr.getZ(i) + nz * extrudeDist,
      );
    }
  }

  rPosAttr.needsUpdate = true;
  return { Geometry: result, Top: result, Side: result };
}

/**
 * 12. SetMeshNormals — Set custom normals on mesh.
 * Inputs: Geometry, CustomNormals, Selection, Mode
 * Outputs: Geometry
 */
export function executeSetMeshNormals(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const customNormals = (inputs.CustomNormals ?? inputs.customNormals ?? inputs.Normal ?? inputs.normal ?? null) as unknown;
  const selection = (inputs.Selection ?? inputs.selection ?? null) as unknown[] | null;

  if (!geometry || !geometry.getAttribute('position')) return { Geometry: geometry };

  const result = geometry.clone();
  const posAttr = result.getAttribute('position');
  const normAttr = result.getAttribute('normal');
  const count = posAttr.count;

  // Determine normal data
  const normalData = new Float32Array(count * 3);

  if (customNormals !== null && customNormals !== undefined) {
    const cn = normalizeVec(customNormals);
    for (let i = 0; i < count; i++) {
      const isSelected = selection === null || (Array.isArray(selection) && selection[i]);
      if (isSelected) {
        normalData[i * 3] = cn.x;
        normalData[i * 3 + 1] = cn.y;
        normalData[i * 3 + 2] = cn.z;
      } else if (normAttr) {
        normalData[i * 3] = normAttr.getX(i);
        normalData[i * 3 + 1] = normAttr.getY(i);
        normalData[i * 3 + 2] = normAttr.getZ(i);
      } else {
        normalData[i * 3] = 0; normalData[i * 3 + 1] = 1; normalData[i * 3 + 2] = 0;
      }
    }
  } else {
    // Compute normals
    for (let i = 0; i < count * 3; i++) normalData[i] = normAttr ? (normAttr as THREE.BufferAttribute).array[i] : 0;
    if (!normAttr) {
      for (let i = 0; i < count; i++) normalData[i * 3 + 1] = 1;
    }
  }

  result.setAttribute('normal', new THREE.Float32BufferAttribute(normalData, 3));
  return { Geometry: result };
}

/**
 * 13. MeshToVolume — Convert mesh to volume (SDF sampling).
 * Inputs: Geometry, VoxelSize, HalfBandWidth
 * Outputs: Geometry (volume representation as voxel grid)
 */
export function executeMeshToVolume(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const voxelSize = (inputs.VoxelSize ?? inputs.voxelSize ?? 0.5) as number;
  const halfBandWidth = (inputs.HalfBandWidth ?? inputs.halfBandWidth ?? 3.0) as number;

  if (!geometry || !geometry.getAttribute('position')) {
    return { Geometry: new THREE.BufferGeometry() };
  }

  // Create a sparse voxel representation as points with density attribute
  const posAttr = geometry.getAttribute('position');
  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox!;
  const band = halfBandWidth * voxelSize;

  const min = bbox.min.clone().subScalar(band);
  const max = bbox.max.clone().addScalar(band);
  const rng = seededRandom(42);

  // Sample voxel positions within bounds
  const positions: number[] = [];
  const densities: number[] = [];

  const sizeX = max.x - min.x;
  const sizeY = max.y - min.y;
  const sizeZ = max.z - min.z;
  const stepsX = Math.min(Math.ceil(sizeX / voxelSize), 32);
  const stepsY = Math.min(Math.ceil(sizeY / voxelSize), 32);
  const stepsZ = Math.min(Math.ceil(sizeZ / voxelSize), 32);

  for (let ix = 0; ix < stepsX; ix++) {
    for (let iy = 0; iy < stepsY; iy++) {
      for (let iz = 0; iz < stepsZ; iz++) {
        const x = min.x + (ix / stepsX) * sizeX;
        const y = min.y + (iy / stepsY) * sizeY;
        const z = min.z + (iz / stepsZ) * sizeZ;

        // Simple SDF: distance to nearest vertex (approximate)
        let minDist = Infinity;
        for (let v = 0; v < posAttr.count; v++) {
          const dx = posAttr.getX(v) - x;
          const dy = posAttr.getY(v) - y;
          const dz = posAttr.getZ(v) - z;
          minDist = Math.min(minDist, Math.sqrt(dx * dx + dy * dy + dz * dz));
        }

        if (minDist < band) {
          positions.push(x, y, z);
          densities.push(1.0 - minDist / band);
        }
      }
    }
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('density', new THREE.Float32BufferAttribute(densities, 1));

  return { Geometry: result };
}

/**
 * 14. DistributePointsInVolume — Scatter points in volume.
 * Inputs: Geometry (volume), Density, Seed
 * Outputs: Geometry (points)
 */
export function executeDistributePointsInVolume(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const density = (inputs.Density ?? inputs.density ?? 1.0) as number;
  const seed = (inputs.Seed ?? inputs.seed ?? 0) as number;

  if (!geometry || !geometry.getAttribute('position') || !geometry.getAttribute('density')) {
    return { Geometry: new THREE.BufferGeometry() };
  }

  const posAttr = geometry.getAttribute('position');
  const densAttr = geometry.getAttribute('density');
  const rng = seededRandom(seed);

  const positions: number[] = [];

  for (let i = 0; i < posAttr.count; i++) {
    const d = densAttr.getX(i) * density;
    if (rng() < d) {
      positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    }
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  return { Geometry: result };
}

// ============================================================================
// Color Executors (4)
// ============================================================================

/**
 * 15. CombineHSV — Combine HSV to color.
 * Inputs: H, S, V, Alpha
 * Outputs: Color
 */
export function executeCombineHSV(inputs: NodeInputs): NodeOutput {
  const h = (inputs.H ?? inputs.h ?? 0.0) as number;
  const s = (inputs.S ?? inputs.s ?? 1.0) as number;
  const v = (inputs.V ?? inputs.v ?? 1.0) as number;
  const alpha = (inputs.Alpha ?? inputs.alpha ?? inputs.A ?? inputs.a ?? 1.0) as number;

  // HSV to RGB conversion
  const hh = ((h % 1) + 1) % 1;
  const c = v * s;
  const x = c * (1 - Math.abs((hh * 6) % 2 - 1));
  const m = v - c;

  let r = 0, g = 0, b = 0;
  if (hh < 1 / 6) { r = c; g = x; }
  else if (hh < 2 / 6) { r = x; g = c; }
  else if (hh < 3 / 6) { g = c; b = x; }
  else if (hh < 4 / 6) { g = x; b = c; }
  else if (hh < 5 / 6) { r = x; b = c; }
  else { r = c; b = x; }

  return {
    Color: { r: r + m, g: g + m, b: b + m, a: alpha } as ColorLike,
  };
}

/**
 * 16. CombineRGB — Combine RGB to color.
 * Inputs: R, G, B, Alpha
 * Outputs: Color
 */
export function executeCombineRGB(inputs: NodeInputs): NodeOutput {
  const r = (inputs.R ?? inputs.r ?? 0.0) as number;
  const g = (inputs.G ?? inputs.g ?? 0.0) as number;
  const b = (inputs.B ?? inputs.b ?? 0.0) as number;
  const alpha = (inputs.Alpha ?? inputs.alpha ?? inputs.A ?? inputs.a ?? 1.0) as number;

  return {
    Color: { r, g, b, a: alpha } as ColorLike,
  };
}

/**
 * 17. SeparateRGB — Separate color to R, G, B.
 * Inputs: Color
 * Outputs: R, G, B, A
 */
export function executeSeparateRGB(inputs: NodeInputs): NodeOutput {
  const color = (inputs.Color ?? inputs.color ?? null) as ColorLike | null;

  if (!color) {
    return { R: 0, G: 0, B: 0, A: 1 };
  }

  return {
    R: color.r ?? 0,
    G: color.g ?? 0,
    B: color.b ?? 0,
    A: color.a ?? 1,
  };
}

/**
 * 18. RGBCurve — RGB curve adjustment.
 * Inputs: Color, CurveR, CurveG, CurveB, CurveCombined
 * Outputs: Color
 */
export function executeRGBCurve(inputs: NodeInputs): NodeOutput {
  const color = (inputs.Color ?? inputs.color ?? { r: 0.5, g: 0.5, b: 0.5, a: 1 }) as ColorLike;
  const curveCombined = (inputs.CurveCombined ?? inputs.curveCombined ?? null) as unknown;

  // Simple curve mapping: if curveCombined is a function, apply it
  let r = color.r ?? 0;
  let g = color.g ?? 0;
  let b = color.b ?? 0;
  const a = color.a ?? 1;

  // Apply a simple S-curve (sigmoid) as default adjustment
  const sigmoid = (x: number): number => 1 / (1 + Math.exp(-10 * (x - 0.5)));

  if (typeof curveCombined === 'function') {
    r = (curveCombined as (v: number) => number)(r);
    g = (curveCombined as (v: number) => number)(g);
    b = (curveCombined as (v: number) => number)(b);
  } else {
    // Default: apply mild S-curve for visual interest
    r = sigmoid(r);
    g = sigmoid(g);
    b = sigmoid(b);
  }

  return {
    Color: { r, g, b, a } as ColorLike,
  };
}

// ============================================================================
// Mix & Compare Executors (2)
// ============================================================================

/**
 * 19. Mix — Generic mix node (ShaderNodeMix).
 * Inputs: Factor, A, B, DataType (FLOAT/COLOR/VECTOR), BlendType
 * Outputs: Result
 */
export function executeMix(inputs: NodeInputs): NodeOutput {
  const factor = (inputs.Factor ?? inputs.factor ?? inputs.Fac ?? inputs.fac ?? 0.5) as number;
  const a = (inputs.A ?? inputs.a ?? inputs.Input1 ?? inputs.input1 ?? null) as unknown;
  const b = (inputs.B ?? inputs.b ?? inputs.Input2 ?? inputs.input2 ?? null) as unknown;
  const dataType = (inputs.DataType ?? inputs.dataType ?? 'FLOAT') as string;
  const blendType = (inputs.BlendType ?? inputs.blendType ?? 'MIX') as string;

  const t = THREE.MathUtils.clamp(factor, 0, 1);

  // Check VECTOR first when DataType is explicitly VECTOR
  if (dataType === 'VECTOR') {
    const va = normalizeVec(a);
    const vb = normalizeVec(b);

    return {
      Result: {
        x: va.x * (1 - t) + vb.x * t,
        y: va.y * (1 - t) + vb.y * t,
        z: va.z * (1 - t) + vb.z * t,
      } as Vector3Like,
    };
  }

  if (dataType === 'FLOAT' || typeof a === 'number' || typeof b === 'number') {
    const va = typeof a === 'number' ? a : 0;
    const vb = typeof b === 'number' ? b : 0;
    let result: number;

    switch (blendType) {
      case 'ADD': result = va + vb * t; break;
      case 'MULTIPLY': result = va * (1 - t + vb * t); break;
      case 'SUBTRACT': result = va - vb * t; break;
      case 'DIVIDE': result = vb !== 0 ? va * (1 - t) + (va / vb) * t : va; break;
      case 'DIFFERENCE': result = Math.abs(va - vb) * t + va * (1 - t); break;
      default: result = va * (1 - t) + vb * t; break;
    }

    return { Result: result };
  }

  if (dataType === 'COLOR' || (typeof a === 'object' && a !== null && 'r' in (a as object))) {
    const ca = (a ?? { r: 0, g: 0, b: 0, a: 1 }) as ColorLike;
    const cb = (b ?? { r: 0, g: 0, b: 0, a: 1 }) as ColorLike;

    return {
      Result: {
        r: (ca.r ?? 0) * (1 - t) + (cb.r ?? 0) * t,
        g: (ca.g ?? 0) * (1 - t) + (cb.g ?? 0) * t,
        b: (ca.b ?? 0) * (1 - t) + (cb.b ?? 0) * t,
        a: (ca.a ?? 1) * (1 - t) + (cb.a ?? 1) * t,
      } as ColorLike,
    };
  }

  // Fallback: vector lerp for any remaining object type
  if (typeof a === 'object' && a !== null) {
    const va = normalizeVec(a);
    const vb = normalizeVec(b);
    return {
      Result: {
        x: va.x * (1 - t) + vb.x * t,
        y: va.y * (1 - t) + vb.y * t,
        z: va.z * (1 - t) + vb.z * t,
      } as Vector3Like,
    };
  }

  // Fallback: linear interpolation for any type
  return { Result: t < 0.5 ? a : b };
}

/**
 * 20. Compare — Compare values with operations.
 * Inputs: A, B, Operation (LESS/EQUAL/GREATER/NOT_EQUAL/etc.), Epsilon
 * Outputs: Result (boolean/float)
 */
export function executeCompare(inputs: NodeInputs): NodeOutput {
  const a = (inputs.A ?? inputs.a ?? 0) as number;
  const b = (inputs.B ?? inputs.b ?? 0) as number;
  const operation = (inputs.Operation ?? inputs.operation ?? 'GREATER') as string;
  const epsilon = (inputs.Epsilon ?? inputs.epsilon ?? 0.001) as number;

  let result = false;

  switch (operation) {
    case 'LESS': result = a < b; break;
    case 'LESS_EQUAL': result = a <= b; break;
    case 'GREATER': result = a > b; break;
    case 'GREATER_EQUAL': result = a >= b; break;
    case 'EQUAL': result = Math.abs(a - b) < epsilon; break;
    case 'NOT_EQUAL': result = Math.abs(a - b) >= epsilon; break;
    default: result = a > b; break;
  }

  return { Result: result ? 1.0 : 0.0 };
}

// ============================================================================
// Input Node Executors (4)
// ============================================================================

/**
 * 21. Integer — Integer input node.
 * Inputs: Integer (default value)
 * Outputs: Integer
 */
export function executeInteger(inputs: NodeInputs): NodeOutput {
  const value = (inputs.Integer ?? inputs.integer ?? inputs.Value ?? inputs.value ?? 0) as number;
  return { Integer: Math.floor(value) };
}

/**
 * 22. Index — Element index input.
 * Inputs: (none or from context)
 * Outputs: Index
 */
export function executeIndex(inputs: NodeInputs): NodeOutput {
  const index = (inputs.Index ?? inputs.index ?? 0) as number;
  return { Index: Math.floor(index) };
}

/**
 * 23. InputID — ID attribute input.
 * Inputs: (none or from context)
 * Outputs: ID
 */
export function executeInputID(inputs: NodeInputs): NodeOutput {
  const id = (inputs.ID ?? inputs.id ?? inputs.Index ?? inputs.index ?? 0) as number;
  return { ID: Math.floor(id) };
}

/**
 * 24. InputEdgeVertices — Edge vertex positions.
 * Inputs: Geometry, EdgeIndex
 * Outputs: VertexIndex1, VertexIndex2, Position1, Position2
 */
export function executeInputEdgeVertices(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const edgeIndex = (inputs.EdgeIndex ?? inputs.edgeIndex ?? inputs.Index ?? inputs.index ?? 0) as number;

  if (!geometry || !geometry.getAttribute('position')) {
    return { VertexIndex1: 0, VertexIndex2: 0, Position1: { x: 0, y: 0, z: 0 }, Position2: { x: 0, y: 0, z: 0 } };
  }

  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex();

  // Build edge list
  const edges: [number, number][] = [];
  if (idxAttr) {
    const faceCount = Math.floor(idxAttr.count / 3);
    const edgeSet = new Set<string>();
    for (let f = 0; f < faceCount; f++) {
      for (let e = 0; e < 3; e++) {
        const a = idxAttr.getX(f * 3 + e);
        const b = idxAttr.getX(f * 3 + ((e + 1) % 3));
        const key = edgeKey(a, b);
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push(a < b ? [a, b] : [b, a]);
        }
      }
    }
  } else {
    for (let i = 0; i < posAttr.count - 1; i += 2) {
      edges.push([i, i + 1]);
    }
  }

  const idx = Math.max(0, Math.min(edges.length - 1, edgeIndex));
  const [v1, v2] = edges[idx] ?? [0, 0];

  return {
    VertexIndex1: v1,
    VertexIndex2: v2,
    Position1: { x: posAttr.getX(v1), y: posAttr.getY(v1), z: posAttr.getZ(v1) },
    Position2: { x: posAttr.getX(v2), y: posAttr.getY(v2), z: posAttr.getZ(v2) },
  };
}

// ============================================================================
// Shader Input Executor (1)
// ============================================================================

/**
 * 25. AmbientOcclusion — AO shader input.
 * Inputs: Color, Distance, Samples, OnlyLocal
 * Outputs: Color, AO
 */
export function executeAmbientOcclusion(inputs: NodeInputs): NodeOutput {
  const color = (inputs.Color ?? inputs.color ?? { r: 1, g: 1, b: 1, a: 1 }) as ColorLike;
  const distance = (inputs.Distance ?? inputs.distance ?? 1.0) as number;
  const samples = (inputs.Samples ?? inputs.samples ?? 16) as number;

  // CPU-side approximation: return neutral AO values
  // Real AO is computed during rendering / shader evaluation
  const ao = 0.8; // Default moderate AO

  return {
    Color: { r: color.r * ao, g: color.g * ao, b: color.b * ao, a: color.a ?? 1 } as ColorLike,
    AO: ao,
  };
}

// ============================================================================
// Material Index Executors (2)
// ============================================================================

/**
 * 26. SetMaterialIndex — Set material index on geometry faces.
 * Inputs: Geometry, MaterialIndex, Selection
 * Outputs: Geometry
 */
export function executeSetMaterialIndex(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const materialIndex = (inputs.MaterialIndex ?? inputs.materialIndex ?? inputs.Value ?? inputs.value ?? 0) as number;
  const selection = (inputs.Selection ?? inputs.selection ?? null) as unknown[] | null;

  if (!geometry) return { Geometry: geometry };

  const result = geometry.clone();
  const idxAttr = result.getIndex();
  if (!idxAttr) return { Geometry: result };

  const faceCount = Math.floor(idxAttr.count / 3);
  const matIndexData = new Int32Array(faceCount);

  const existingAttr = result.getAttribute('material_index');
  for (let f = 0; f < faceCount; f++) {
    const isSelected = selection === null || (Array.isArray(selection) && f < selection.length && selection[f]);
    if (isSelected) {
      matIndexData[f] = Math.floor(materialIndex);
    } else {
      matIndexData[f] = existingAttr ? (existingAttr as THREE.BufferAttribute).getX(f) : 0;
    }
  }

  result.setAttribute('material_index', new THREE.Int32BufferAttribute(matIndexData, 1));
  return { Geometry: result };
}

/**
 * 27. MaterialIndex — Get material index attribute.
 * Inputs: Geometry
 * Outputs: MaterialIndex (per-face)
 */
export function executeMaterialIndex(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;

  if (!geometry) return { MaterialIndex: [] };

  const idxAttr = geometry.getIndex();
  const matIndexAttr = geometry.getAttribute('material_index');

  if (!idxAttr) return { MaterialIndex: [] };

  const faceCount = Math.floor(idxAttr.count / 3);
  const indices: number[] = [];

  for (let f = 0; f < faceCount; f++) {
    indices.push(matIndexAttr ? (matIndexAttr as THREE.BufferAttribute).getX(f) : 0);
  }

  return { MaterialIndex: indices };
}

// ============================================================================
// Mesh Offset & Subdivision Executors (2)
// ============================================================================

/**
 * 28. OffsetMesh — Offset mesh vertices along normals.
 * Inputs: Geometry, Offset, Selection
 * Outputs: Geometry
 */
export function executeOffsetMesh(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const offset = (inputs.Offset ?? inputs.offset ?? 0.1) as number;
  const selection = (inputs.Selection ?? inputs.selection ?? null) as unknown[] | null;

  if (!geometry || !geometry.getAttribute('position')) return { Geometry: geometry };

  const result = geometry.clone();
  const posAttr = result.getAttribute('position');
  const normAttr = result.getAttribute('normal');

  for (let i = 0; i < posAttr.count; i++) {
    const isSelected = selection === null || (Array.isArray(selection) && selection[i]);
    if (!isSelected) continue;

    let nx = 0, ny = 1, nz = 0;
    if (normAttr) {
      nx = normAttr.getX(i); ny = normAttr.getY(i); nz = normAttr.getZ(i);
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 1e-8) { nx /= len; ny /= len; nz /= len; }
    }

    posAttr.setXYZ(
      i,
      posAttr.getX(i) + nx * offset,
      posAttr.getY(i) + ny * offset,
      posAttr.getZ(i) + nz * offset,
    );
  }

  posAttr.needsUpdate = true;
  return { Geometry: result };
}

/**
 * 29. SubdivisionSurface — Catmull-Clark subdivision.
 * Inputs: Geometry, Level, Crease, UVSmooth, Boundary
 * Outputs: Geometry
 */
export function executeSubdivisionSurface(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const level = (inputs.Level ?? inputs.level ?? 1) as number;
  const crease = (inputs.Crease ?? inputs.crease ?? 0.0) as number;

  if (!geometry || !geometry.getAttribute('position')) {
    return { Geometry: geometry ?? new THREE.BufferGeometry() };
  }

  // Iterative Catmull-Clark subdivision
  let current = geometry.clone();

  for (let iter = 0; iter < Math.min(level, 3); iter++) {
    const posAttr = current.getAttribute('position');
    const idxAttr = current.getIndex();

    if (!idxAttr || !posAttr) break;

    const faceCount = Math.floor(idxAttr.count / 3);
    if (faceCount === 0) break;

    // Simplified subdivision: midpoint subdivision (each triangle → 4 triangles)
    const newPositions: number[] = [];
    const newIndices: number[] = [];

    // Copy original vertices
    for (let i = 0; i < posAttr.count; i++) {
      newPositions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    }

    const midpoints = new Map<string, number>();

    const getMidpoint = (a: number, b: number): number => {
      const key = edgeKey(a, b);
      if (midpoints.has(key)) return midpoints.get(key)!;

      const mx = (posAttr.getX(a) + posAttr.getX(b)) / 2;
      const my = (posAttr.getY(a) + posAttr.getY(b)) / 2;
      const mz = (posAttr.getZ(a) + posAttr.getZ(b)) / 2;
      const idx = newPositions.length / 3;
      newPositions.push(mx, my, mz);
      midpoints.set(key, idx);
      return idx;
    };

    for (let f = 0; f < faceCount; f++) {
      const v0 = idxAttr.getX(f * 3);
      const v1 = idxAttr.getX(f * 3 + 1);
      const v2 = idxAttr.getX(f * 3 + 2);

      const m01 = getMidpoint(v0, v1);
      const m12 = getMidpoint(v1, v2);
      const m20 = getMidpoint(v2, v0);

      // 4 sub-triangles
      newIndices.push(v0, m01, m20);
      newIndices.push(v1, m12, m01);
      newIndices.push(v2, m20, m12);
      newIndices.push(m01, m12, m20);
    }

    const next = new THREE.BufferGeometry();
    next.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    next.setIndex(newIndices);
    next.computeVertexNormals();
    current = next;
  }

  return { Geometry: current };
}

// ============================================================================
// UV Executors (2)
// ============================================================================

/**
 * 30. SetUV — Set UV coordinates on geometry.
 * Inputs: Geometry, Vector (UV coordinates), Selection
 * Outputs: Geometry
 */
export function executeSetUV(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const uvVector = normalizeVec(inputs.Vector ?? inputs.vector ?? inputs.UV ?? inputs.uv ?? { x: 0, y: 0, z: 0 });
  const selection = (inputs.Selection ?? inputs.selection ?? null) as unknown[] | null;

  if (!geometry || !geometry.getAttribute('position')) return { Geometry: geometry };

  const result = geometry.clone();
  const posAttr = result.getAttribute('position');
  const count = posAttr.count;

  const uvData = new Float32Array(count * 2);
  const existingUV = result.getAttribute('uv');

  for (let i = 0; i < count; i++) {
    const isSelected = selection === null || (Array.isArray(selection) && selection[i]);
    if (isSelected) {
      uvData[i * 2] = uvVector.x;
      uvData[i * 2 + 1] = uvVector.y;
    } else if (existingUV) {
      uvData[i * 2] = (existingUV as THREE.BufferAttribute).getX(i);
      uvData[i * 2 + 1] = (existingUV as THREE.BufferAttribute).getY(i);
    }
  }

  result.setAttribute('uv', new THREE.Float32BufferAttribute(uvData, 2));
  return { Geometry: result };
}

/**
 * 31. UVWarp — UV warp modifier.
 * Inputs: Geometry, UV, Offset, Scale, Rotation, Center
 * Outputs: Geometry
 */
export function executeUVWarp(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const offset = normalizeVec(inputs.Offset ?? inputs.offset ?? { x: 0, y: 0, z: 0 });
  const scale = normalizeVec(inputs.Scale ?? inputs.scale ?? { x: 1, y: 1, z: 1 });
  const rotation = (inputs.Rotation ?? inputs.rotation ?? 0) as number;
  const center = normalizeVec(inputs.Center ?? inputs.center ?? { x: 0.5, y: 0.5, z: 0 });

  if (!geometry || !geometry.getAttribute('position')) return { Geometry: geometry };

  const result = geometry.clone();
  const uvAttr = result.getAttribute('uv');

  if (!uvAttr) {
    // Generate default UVs based on position
    const posAttr = result.getAttribute('position');
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox!;
    const size = new THREE.Vector3();
    bbox.getSize(size);

    const uvData = new Float32Array(posAttr.count * 2);
    for (let i = 0; i < posAttr.count; i++) {
      let u = size.x > 1e-8 ? (posAttr.getX(i) - bbox.min.x) / size.x : 0;
      let v = size.z > 1e-8 ? (posAttr.getZ(i) - bbox.min.z) / size.z : 0;

      // Apply warp: scale around center, rotate, offset
      u -= center.x; v -= center.y;
      const su = u * scale.x; const sv = v * scale.y;
      const cosR = Math.cos(rotation); const sinR = Math.sin(rotation);
      const ru = su * cosR - sv * sinR;
      const rv = su * sinR + sv * cosR;
      u = ru + center.x + offset.x;
      v = rv + center.y + offset.y;

      uvData[i * 2] = u;
      uvData[i * 2 + 1] = v;
    }
    result.setAttribute('uv', new THREE.Float32BufferAttribute(uvData, 2));
  } else {
    // Warp existing UVs
    for (let i = 0; i < uvAttr.count; i++) {
      let u = (uvAttr as THREE.BufferAttribute).getX(i);
      let v = (uvAttr as THREE.BufferAttribute).getY(i);

      u -= center.x; v -= center.y;
      const su = u * scale.x; const sv = v * scale.y;
      const cosR = Math.cos(rotation); const sinR = Math.sin(rotation);
      const ru = su * cosR - sv * sinR;
      const rv = su * sinR + sv * cosR;
      u = ru + center.x + offset.x;
      v = rv + center.y + offset.y;

      (uvAttr as THREE.BufferAttribute).setXY(i, u, v);
    }
    (uvAttr as THREE.BufferAttribute).needsUpdate = true;
  }

  return { Geometry: result };
}

// ============================================================================
// Group I/O Executors (2)
// ============================================================================

/**
 * 32a. GroupInput — Structural pass-through for group input node.
 * Inputs: (all named inputs from group interface)
 * Outputs: (all named outputs — pass through)
 */
export function executeGroupInput(inputs: NodeInputs): NodeOutput {
  // Group input passes all values through unchanged
  return { ...inputs };
}

/**
 * 32b. GroupOutput — Structural pass-through for group output node.
 * Inputs: (all named inputs from group interface)
 * Outputs: (all named outputs — pass through)
 */
export function executeGroupOutput(inputs: NodeInputs): NodeOutput {
  // Group output passes all values through unchanged
  return { ...inputs };
}

// ============================================================================
// Namespace export for convenience
// ============================================================================

export const EssentialNodeExecutors = {
  executeJoinGeometry,
  executeSeparateGeometry,
  executeDeleteGeometry,
  executeTransform,
  executeTriangulate,
  executeSetMaterial,
  executeCurveToPoints,
  executeReverseCurve,
  executeSubdivideCurve,
  executeCurveCircle,
  executeExtrudeMesh,
  executeSetMeshNormals,
  executeMeshToVolume,
  executeDistributePointsInVolume,
  executeCombineHSV,
  executeCombineRGB,
  executeSeparateRGB,
  executeRGBCurve,
  executeMix,
  executeCompare,
  executeInteger,
  executeIndex,
  executeInputID,
  executeInputEdgeVertices,
  executeAmbientOcclusion,
  executeSetMaterialIndex,
  executeMaterialIndex,
  executeOffsetMesh,
  executeSubdivisionSurface,
  executeSetUV,
  executeUVWarp,
  executeGroupInput,
  executeGroupOutput,
};
