/**
 * CoreNodeExecutors - 20 critical node type executors
 *
 * Provides executor functions for the most important geometry, curve,
 * sampling, attribute, and mesh-analysis node types that previously
 * had no executor (pass-through only).
 *
 * Each executor is a standalone function that takes `inputs: Record<string, any>`
 * and returns a structured output object matching the socket names of the node.
 */

import * as THREE from 'three';
import { performCSGBoolean, mergeGeometries } from './csg-boolean';

// ============================================================================
// Seeded Random Utility
// ============================================================================

function seededRandom(seed: number): () => number {
  let state = Math.abs(seed | 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) & 0xffffffff;
    return (state >>> 0) / 0xffffffff;
  };
}

// ============================================================================
// Geometry Distribution Executors
// ============================================================================

/**
 * 1. DistributePointsOnFaces
 * Generates random points on mesh faces using face-area-weighted sampling.
 * Inputs: geometry, density, seed, distributionMethod
 * Outputs: Points, Normals, FaceIndices, BarycentricCoords
 */
export function executeDistributePointsOnFaces(inputs: Record<string, any>): any {
  const geometry: THREE.BufferGeometry | null = inputs.Geometry ?? inputs.geometry ?? null;
  const density = inputs.Density ?? inputs.density ?? 1.0;
  const seed = inputs.Seed ?? inputs.seed ?? 0;
  const distributionMethod = inputs.DistributionMethod ?? inputs.distributionMethod ?? 'random';

  if (!geometry) {
    return { Points: [], Normals: [], FaceIndices: [], BarycentricCoords: [] };
  }

  const posAttr = geometry.getAttribute('position');
  const normalAttr = geometry.getAttribute('normal');
  const indexAttr = geometry.getIndex();

  if (!posAttr || posAttr.count === 0) {
    return { Points: [], Normals: [], FaceIndices: [], BarycentricCoords: [] };
  }

  const random = seededRandom(seed);
  const faceCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(posAttr.count / 3);

  // Compute face areas
  let totalArea = 0;
  const faceAreas: number[] = [];
  const cumulativeAreas: number[] = [];

  for (let f = 0; f < faceCount; f++) {
    const i0 = indexAttr ? indexAttr.getX(f * 3) : f * 3;
    const i1 = indexAttr ? indexAttr.getX(f * 3 + 1) : f * 3 + 1;
    const i2 = indexAttr ? indexAttr.getX(f * 3 + 2) : f * 3 + 2;

    const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
    const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
    const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));

    const edge1 = new THREE.Vector3().subVectors(v1, v0);
    const edge2 = new THREE.Vector3().subVectors(v2, v0);
    const area = 0.5 * edge1.cross(edge2).length();

    faceAreas.push(area);
    totalArea += area;
    cumulativeAreas.push(totalArea);
  }

  const targetCount = Math.max(1, Math.floor(totalArea * density));

  const points: { x: number; y: number; z: number }[] = [];
  const normals: { x: number; y: number; z: number }[] = [];
  const faceIndices: number[] = [];
  const barycentricCoords: { x: number; y: number; z: number }[] = [];

  for (let i = 0; i < targetCount; i++) {
    // Area-weighted face selection via binary search on cumulative areas
    const rand = random() * totalArea;
    let faceIdx = 0;
    let lo = 0, hi = cumulativeAreas.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cumulativeAreas[mid] < rand) lo = mid + 1;
      else { faceIdx = mid; hi = mid - 1; }
    }

    // Random barycentric coordinates (uniform on triangle)
    const r1 = Math.sqrt(random());
    const r2 = random();
    const u = 1 - r1;
    const v = r1 * (1 - r2);
    const w = r1 * r2;

    const i0 = indexAttr ? indexAttr.getX(faceIdx * 3) : faceIdx * 3;
    const i1 = indexAttr ? indexAttr.getX(faceIdx * 3 + 1) : faceIdx * 3 + 1;
    const i2 = indexAttr ? indexAttr.getX(faceIdx * 3 + 2) : faceIdx * 3 + 2;

    const p0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
    const p1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
    const p2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));

    const point = new THREE.Vector3()
      .addScaledVector(p0, u)
      .addScaledVector(p1, v)
      .addScaledVector(p2, w);

    points.push({ x: point.x, y: point.y, z: point.z });
    faceIndices.push(faceIdx);
    barycentricCoords.push({ x: u, y: v, z: w });

    // Interpolate normal or compute face normal
    if (normalAttr) {
      const n0 = new THREE.Vector3(normalAttr.getX(i0), normalAttr.getY(i0), normalAttr.getZ(i0));
      const n1 = new THREE.Vector3(normalAttr.getX(i1), normalAttr.getY(i1), normalAttr.getZ(i1));
      const n2 = new THREE.Vector3(normalAttr.getX(i2), normalAttr.getY(i2), normalAttr.getZ(i2));
      const normal = new THREE.Vector3()
        .addScaledVector(n0, u)
        .addScaledVector(n1, v)
        .addScaledVector(n2, w)
        .normalize();
      normals.push({ x: normal.x, y: normal.y, z: normal.z });
    } else {
      const edge1 = new THREE.Vector3().subVectors(p1, p0);
      const edge2 = new THREE.Vector3().subVectors(p2, p0);
      const fn = edge1.cross(edge2).normalize();
      normals.push({ x: fn.x, y: fn.y, z: fn.z });
    }
  }

  return { Points: points, Normals: normals, FaceIndices: faceIndices, BarycentricCoords: barycentricCoords };
}

/**
 * 2. InstanceOnPoints
 * Places instances of geometry at each point position with rotation and scale.
 * Inputs: Points, Instance, Rotation, Scale, Selection
 * Outputs: Instances
 */
export function executeInstanceOnPoints(inputs: Record<string, any>): any {
  const points = inputs.Points ?? inputs.points ?? [];
  const instance = inputs.Instance ?? inputs.instance ?? inputs.geometry ?? null;
  const rotation = inputs.Rotation ?? inputs.rotation ?? { x: 0, y: 0, z: 0 };
  const scale = inputs.Scale ?? inputs.scale ?? 1.0;
  const selection = inputs.Selection ?? inputs.selection ?? null;

  const pointArray = Array.isArray(points) ? points : [points];
  const count = pointArray.length;

  // Build instance transforms
  const instanceMatrices: number[] = [];
  const instancePositions: { x: number; y: number; z: number }[] = [];

  for (let i = 0; i < count; i++) {
    if (selection !== null && Array.isArray(selection) && !selection[i]) continue;

    const p = pointArray[i] ?? { x: 0, y: 0, z: 0 };
    const px = p.x ?? 0, py = p.y ?? 0, pz = p.z ?? 0;
    instancePositions.push({ x: px, y: py, z: pz });

    // Build 4x4 matrix: Scale * Rotation * Translation
    const s = typeof scale === 'number' ? scale : (scale?.x ?? 1);
    const rx = (rotation?.x ?? 0) * (i > 0 ? 0 : 1); // Allow per-instance rotation if array
    const ry = rotation?.y ?? 0;
    const rz = rotation?.z ?? 0;

    const mat = new THREE.Matrix4();
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
    mat.compose(new THREE.Vector3(px, py, pz), quat, new THREE.Vector3(s, s, s));
    instanceMatrices.push(...mat.elements);
  }

  return {
    Instances: {
      type: 'instanced_geometry',
      baseGeometry: instance,
      count: instancePositions.length,
      positions: instancePositions,
      matrices: instanceMatrices,
      _isInstancedData: true,
    },
  };
}

/**
 * 3. RealizeInstances
 * Converts instanced geometry to real (merged) geometry by applying transforms.
 * Inputs: Geometry (may contain instance data)
 * Outputs: Geometry
 */
export function executeRealizeInstances(inputs: Record<string, any>): any {
  const geometry: THREE.BufferGeometry | null = inputs.Geometry ?? inputs.geometry ?? null;
  const instanceData = inputs.Instances ?? inputs.instances ?? null;

  // If input is instanced data with matrices, expand into real geometry
  if (instanceData && instanceData._isInstancedData && instanceData.baseGeometry) {
    const baseGeo = instanceData.baseGeometry as THREE.BufferGeometry;
    const matrices = instanceData.matrices as number[];
    const count = instanceData.count as number;

    if (!baseGeo.getAttribute('position') || count === 0) {
      return { Geometry: geometry };
    }

    const posAttr = baseGeo.getAttribute('position');
    const normAttr = baseGeo.getAttribute('normal');
    const idxAttr = baseGeo.getIndex();

    const allPositions: number[] = [];
    const allNormals: number[] = [];
    const allIndices: number[] = [];
    let vertexOffset = 0;

    for (let inst = 0; inst < count; inst++) {
      const mat = new THREE.Matrix4().fromArray(matrices.slice(inst * 16, (inst + 1) * 16));
      const normalMat = new THREE.Matrix3().getNormalMatrix(mat);

      for (let v = 0; v < posAttr.count; v++) {
        const pos = new THREE.Vector3(posAttr.getX(v), posAttr.getY(v), posAttr.getZ(v)).applyMatrix4(mat);
        allPositions.push(pos.x, pos.y, pos.z);

        if (normAttr) {
          const n = new THREE.Vector3(normAttr.getX(v), normAttr.getY(v), normAttr.getZ(v)).applyMatrix3(normalMat).normalize();
          allNormals.push(n.x, n.y, n.z);
        }
      }

      if (idxAttr) {
        for (let i = 0; i < idxAttr.count; i++) {
          allIndices.push(idxAttr.getX(i) + vertexOffset);
        }
      } else {
        for (let i = 0; i < posAttr.count; i++) {
          allIndices.push(i + vertexOffset);
        }
      }
      vertexOffset += posAttr.count;
    }

    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
    if (allNormals.length > 0) result.setAttribute('normal', new THREE.Float32BufferAttribute(allNormals, 3));
    result.setIndex(allIndices);
    if (allNormals.length === 0) result.computeVertexNormals();

    return { Geometry: result };
  }

  // If no instance data, pass through geometry
  return { Geometry: geometry };
}

// ============================================================================
// Geometry Sampling Executors
// ============================================================================

/**
 * 4. Proximity
 * Finds closest point/edge/face on target geometry from source positions.
 * Inputs: Geometry, Target, SourcePosition, TargetElement
 * Outputs: Position, Distance, Normal
 */
export function executeProximity(inputs: Record<string, any>): any {
  const target: THREE.BufferGeometry | null = inputs.Target ?? inputs.target ?? null;
  const sourcePosition = inputs.SourcePosition ?? inputs.sourcePosition ?? { x: 0, y: 0, z: 0 };
  const targetElement = inputs.TargetElement ?? inputs.targetElement ?? 'points'; // 'points' | 'edges' | 'faces'

  const sp = new THREE.Vector3(sourcePosition.x ?? 0, sourcePosition.y ?? 0, sourcePosition.z ?? 0);

  if (!target || !target.getAttribute('position')) {
    return { Position: { x: 0, y: 0, z: 0 }, Distance: Infinity, Normal: { x: 0, y: 1, z: 0 } };
  }

  const posAttr = target.getAttribute('position');
  const normalAttr = target.getAttribute('normal');
  const indexAttr = target.getIndex();

  let closestDist = Infinity;
  let closestPos = new THREE.Vector3();
  let closestNormal = new THREE.Vector3(0, 1, 0);

  if (targetElement === 'points') {
    // Brute-force nearest-vertex search
    for (let i = 0; i < posAttr.count; i++) {
      const px = posAttr.getX(i), py = posAttr.getY(i), pz = posAttr.getZ(i);
      const d = sp.distanceTo(new THREE.Vector3(px, py, pz));
      if (d < closestDist) {
        closestDist = d;
        closestPos.set(px, py, pz);
        if (normalAttr) {
          closestNormal.set(normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i)).normalize();
        }
      }
    }
  } else if (targetElement === 'faces') {
    // Check each triangle face for closest point
    const faceCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(posAttr.count / 3);
    for (let f = 0; f < faceCount; f++) {
      const i0 = indexAttr ? indexAttr.getX(f * 3) : f * 3;
      const i1 = indexAttr ? indexAttr.getX(f * 3 + 1) : f * 3 + 1;
      const i2 = indexAttr ? indexAttr.getX(f * 3 + 2) : f * 3 + 2;

      const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
      const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
      const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));

      const closest = closestPointOnTriangle(sp, v0, v1, v2);
      const d = sp.distanceTo(closest);
      if (d < closestDist) {
        closestDist = d;
        closestPos.copy(closest);
        const e1 = new THREE.Vector3().subVectors(v1, v0);
        const e2 = new THREE.Vector3().subVectors(v2, v0);
        closestNormal.crossVectors(e1, e2).normalize();
      }
    }
  } else {
    // Edges: check each edge midpoint as approximation
    const faceCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(posAttr.count / 3);
    for (let f = 0; f < faceCount; f++) {
      const i0 = indexAttr ? indexAttr.getX(f * 3) : f * 3;
      const i1 = indexAttr ? indexAttr.getX(f * 3 + 1) : f * 3 + 1;
      const i2 = indexAttr ? indexAttr.getX(f * 3 + 2) : f * 3 + 2;

      const edges = [[i0, i1], [i1, i2], [i2, i0]];
      for (const [a, b] of edges) {
        const pa = new THREE.Vector3(posAttr.getX(a), posAttr.getY(a), posAttr.getZ(a));
        const pb = new THREE.Vector3(posAttr.getX(b), posAttr.getY(b), posAttr.getZ(b));
        const closest = closestPointOnSegment(sp, pa, pb);
        const d = sp.distanceTo(closest);
        if (d < closestDist) {
          closestDist = d;
          closestPos.copy(closest);
          closestNormal.set(0, 1, 0);
          if (normalAttr) {
            closestNormal.set(
              (normalAttr.getX(a) + normalAttr.getX(b)) / 2,
              (normalAttr.getY(a) + normalAttr.getY(b)) / 2,
              (normalAttr.getZ(a) + normalAttr.getZ(b)) / 2,
            ).normalize();
          }
        }
      }
    }
  }

  return {
    Position: { x: closestPos.x, y: closestPos.y, z: closestPos.z },
    Distance: closestDist,
    Normal: { x: closestNormal.x, y: closestNormal.y, z: closestNormal.z },
  };
}

/**
 * 5. Raycast
 * Casts a ray from source position toward target geometry.
 * Uses Möller-Trumbore ray-triangle intersection.
 * Inputs: Geometry, SourcePosition, Direction, Length
 * Outputs: IsHit, HitPosition, HitNormal, HitFaceIndex, Distance
 */
export function executeRaycast(inputs: Record<string, any>): any {
  const geometry: THREE.BufferGeometry | null = inputs.Geometry ?? inputs.geometry ?? null;
  const sourcePosition = inputs.SourcePosition ?? inputs.sourcePosition ?? { x: 0, y: 0, z: 0 };
  const rayDirection = inputs.Direction ?? inputs.direction ?? inputs.RayDirection ?? { x: 0, y: -1, z: 0 };
  const rayLength = inputs.Length ?? inputs.length ?? 100.0;

  const origin = new THREE.Vector3(sourcePosition.x ?? 0, sourcePosition.y ?? 0, sourcePosition.z ?? 0);
  const direction = new THREE.Vector3(rayDirection.x ?? 0, rayDirection.y ?? -1, rayDirection.z ?? 0).normalize();

  if (!geometry || !geometry.getAttribute('position')) {
    return { IsHit: false, HitPosition: { x: 0, y: 0, z: 0 }, HitNormal: { x: 0, y: 1, z: 0 }, HitFaceIndex: -1, Distance: rayLength };
  }

  const posAttr = geometry.getAttribute('position');
  const indexAttr = geometry.getIndex();
  const faceCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(posAttr.count / 3);

  let closestT = Infinity;
  let closestFaceIdx = -1;
  let closestU = 0, closestV = 0;
  let closestV0 = new THREE.Vector3(), closestV1 = new THREE.Vector3(), closestV2 = new THREE.Vector3();

  const epsilon = 1e-8;

  for (let f = 0; f < faceCount; f++) {
    const i0 = indexAttr ? indexAttr.getX(f * 3) : f * 3;
    const i1 = indexAttr ? indexAttr.getX(f * 3 + 1) : f * 3 + 1;
    const i2 = indexAttr ? indexAttr.getX(f * 3 + 2) : f * 3 + 2;

    const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
    const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
    const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));

    // Möller-Trumbore intersection
    const edge1 = new THREE.Vector3().subVectors(v1, v0);
    const edge2 = new THREE.Vector3().subVectors(v2, v0);
    const h = new THREE.Vector3().crossVectors(direction, edge2);
    const a = edge1.dot(h);

    if (Math.abs(a) < epsilon) continue;
    const fInv = 1 / a;
    const s = new THREE.Vector3().subVectors(origin, v0);
    const u = fInv * s.dot(h);
    if (u < 0 || u > 1) continue;
    const q = new THREE.Vector3().crossVectors(s, edge1);
    const v = fInv * direction.dot(q);
    if (v < 0 || u + v > 1) continue;
    const t = fInv * edge2.dot(q);
    if (t > epsilon && t < closestT && t <= rayLength) {
      closestT = t;
      closestFaceIdx = f;
      closestU = u;
      closestV = v;
      closestV0 = v0;
      closestV1 = v1;
      closestV2 = v2;
    }
  }

  if (closestT < Infinity) {
    const hitPos = new THREE.Vector3()
      .addScaledVector(closestV0, 1 - closestU - closestV)
      .addScaledVector(closestV1, closestU)
      .addScaledVector(closestV2, closestV);
    const e1 = new THREE.Vector3().subVectors(closestV1, closestV0);
    const e2 = new THREE.Vector3().subVectors(closestV2, closestV0);
    const hitNorm = new THREE.Vector3().crossVectors(e1, e2).normalize();

    return {
      IsHit: true,
      HitPosition: { x: hitPos.x, y: hitPos.y, z: hitPos.z },
      HitNormal: { x: hitNorm.x, y: hitNorm.y, z: hitNorm.z },
      HitFaceIndex: closestFaceIdx,
      Distance: closestT,
    };
  }

  return { IsHit: false, HitPosition: { x: 0, y: 0, z: 0 }, HitNormal: { x: 0, y: 1, z: 0 }, HitFaceIndex: -1, Distance: rayLength };
}

/**
 * 6. SampleNearestSurface
 * Samples attributes from the nearest point on a surface.
 * Inputs: Geometry, Position, Attribute
 * Outputs: Value, Distance, Normal, FaceIndex
 */
export function executeSampleNearestSurface(inputs: Record<string, any>): any {
  const geometry: THREE.BufferGeometry | null = inputs.Geometry ?? inputs.geometry ?? null;
  const position = inputs.Position ?? inputs.position ?? { x: 0, y: 0, z: 0 };

  const queryPos = new THREE.Vector3(position.x ?? 0, position.y ?? 0, position.z ?? 0);

  if (!geometry || !geometry.getAttribute('position')) {
    return { Value: 0, Distance: Infinity, Normal: { x: 0, y: 1, z: 0 }, FaceIndex: -1 };
  }

  const posAttr = geometry.getAttribute('position');
  const normalAttr = geometry.getAttribute('normal');
  const indexAttr = geometry.getIndex();
  const faceCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(posAttr.count / 3);

  let closestDist = Infinity;
  let closestPoint = new THREE.Vector3();
  let closestNormal = new THREE.Vector3(0, 1, 0);
  let closestFaceIdx = -1;

  for (let f = 0; f < faceCount; f++) {
    const i0 = indexAttr ? indexAttr.getX(f * 3) : f * 3;
    const i1 = indexAttr ? indexAttr.getX(f * 3 + 1) : f * 3 + 1;
    const i2 = indexAttr ? indexAttr.getX(f * 3 + 2) : f * 3 + 2;

    const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
    const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
    const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));

    const cp = closestPointOnTriangle(queryPos, v0, v1, v2);
    const d = queryPos.distanceTo(cp);
    if (d < closestDist) {
      closestDist = d;
      closestPoint.copy(cp);
      closestFaceIdx = f;
      const e1 = new THREE.Vector3().subVectors(v1, v0);
      const e2 = new THREE.Vector3().subVectors(v2, v0);
      closestNormal.crossVectors(e1, e2).normalize();
    }
  }

  return {
    Value: closestDist,
    Distance: closestDist,
    Normal: { x: closestNormal.x, y: closestNormal.y, z: closestNormal.z },
    FaceIndex: closestFaceIdx,
  };
}

// ============================================================================
// Geometry Operations Executors
// ============================================================================

/**
 * 7. ConvexHull
 * Computes the convex hull of points using the Quickhull algorithm.
 * Inputs: Geometry or Points
 * Outputs: Geometry
 */
export function executeConvexHull(inputs: Record<string, any>): any {
  const geometry: THREE.BufferGeometry | null = inputs.Geometry ?? inputs.geometry ?? null;
  const pointsInput = inputs.Points ?? inputs.points ?? null;

  if (!geometry && !pointsInput) return { Geometry: new THREE.BufferGeometry() };

  // Extract points
  const pts: THREE.Vector3[] = [];
  if (geometry && geometry.getAttribute('position')) {
    const posAttr = geometry.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      pts.push(new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
    }
  } else if (Array.isArray(pointsInput)) {
    for (const p of pointsInput) {
      pts.push(new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0));
    }
  }

  if (pts.length < 4) return { Geometry: geometry ?? new THREE.BufferGeometry() };

  // Quickhull algorithm
  const hull = quickhull(pts);

  // Build geometry from hull triangles
  const positions: number[] = [];
  const normals: number[] = [];

  for (const tri of hull) {
    const v0 = pts[tri[0]], v1 = pts[tri[1]], v2 = pts[tri[2]];
    const e1 = new THREE.Vector3().subVectors(v1, v0);
    const e2 = new THREE.Vector3().subVectors(v2, v0);
    const n = new THREE.Vector3().crossVectors(e1, e2).normalize();

    positions.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
    normals.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return { Geometry: result };
}

/**
 * 8. MergeByDistance
 * Merges vertices that are within a distance threshold.
 * Inputs: Geometry, Distance
 * Outputs: Geometry
 */
export function executeMergeByDistance(inputs: Record<string, any>): any {
  const geometry: THREE.BufferGeometry | null = inputs.Geometry ?? inputs.geometry ?? null;
  const distance = inputs.Distance ?? inputs.distance ?? 0.001;
  const distSq = distance * distance;

  if (!geometry || !geometry.getAttribute('position')) return { Geometry: geometry };

  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex();

  // Spatial hashing for efficient merge
  const remap: number[] = [];
  const uniquePositions: number[] = [];
  const gridSize = distance > 0 ? distance / 2 : 0.0005;
  const vertexMap = new Map<string, number>();
  let uniqueCount = 0;

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
    const gx = Math.round(x / gridSize);
    const gy = Math.round(y / gridSize);
    const gz = Math.round(z / gridSize);
    const key = `${gx},${gy},${gz}`;

    let found = false;
    if (vertexMap.has(key)) {
      const existingIdx = vertexMap.get(key)!;
      const ex = uniquePositions[existingIdx * 3];
      const ey = uniquePositions[existingIdx * 3 + 1];
      const ez = uniquePositions[existingIdx * 3 + 2];
      const d = (x - ex) ** 2 + (y - ey) ** 2 + (z - ez) ** 2;
      if (d <= distSq) {
        remap.push(existingIdx);
        found = true;
      }
    }

    if (!found) {
      vertexMap.set(key, uniqueCount);
      uniquePositions.push(x, y, z);
      remap.push(uniqueCount);
      uniqueCount++;
    }
  }

  // Remap indices
  const newIndices: number[] = [];
  const faceCount = idxAttr ? Math.floor(idxAttr.count / 3) : Math.floor(posAttr.count / 3);
  for (let f = 0; f < faceCount; f++) {
    const i0 = idxAttr ? idxAttr.getX(f * 3) : f * 3;
    const i1 = idxAttr ? idxAttr.getX(f * 3 + 1) : f * 3 + 1;
    const i2 = idxAttr ? idxAttr.getX(f * 3 + 2) : f * 3 + 2;
    const r0 = remap[i0], r1 = remap[i1], r2 = remap[i2];
    if (r0 !== r1 && r1 !== r2 && r2 !== r0) {
      newIndices.push(r0, r1, r2);
    }
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(uniquePositions, 3));
  result.setIndex(newIndices);
  result.computeVertexNormals();
  return { Geometry: result };
}

/**
 * 9. SmoothByAngle
 * Smooths normals based on angle threshold. Edges with angle > threshold stay sharp.
 * Inputs: Geometry, Angle, ShadeSmooth
 * Outputs: Geometry
 */
export function executeSmoothByAngle(inputs: Record<string, any>): any {
  const geometry: THREE.BufferGeometry | null = inputs.Geometry ?? inputs.geometry ?? null;
  const angleThreshold = inputs.Angle ?? inputs.angle ?? 30; // degrees
  const shadeSmooth = inputs.ShadeSmooth ?? inputs.shadeSmooth ?? true;

  if (!geometry || !geometry.getAttribute('position')) return { Geometry: geometry };

  if (!shadeSmooth) {
    // Flat shading: compute face normals and duplicate vertices
    const cloned = geometry.clone();
    cloned.computeVertexNormals();
    return { Geometry: cloned };
  }

  const thresholdRad = (angleThreshold * Math.PI) / 180;
  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex();

  if (!idxAttr) {
    // Non-indexed: just compute smooth normals
    const cloned = geometry.clone();
    cloned.computeVertexNormals();
    return { Geometry: cloned };
  }

  // Compute face normals
  const faceCount = Math.floor(idxAttr.count / 3);
  const faceNormals: THREE.Vector3[] = [];
  for (let f = 0; f < faceCount; f++) {
    const i0 = idxAttr.getX(f * 3), i1 = idxAttr.getX(f * 3 + 1), i2 = idxAttr.getX(f * 3 + 2);
    const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
    const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
    const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
    faceNormals.push(new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(v1, v0),
      new THREE.Vector3().subVectors(v2, v0),
    ).normalize());
  }

  // For each vertex, average face normals where adjacent faces have angle < threshold
  const normalArray = new Float32Array(posAttr.count * 3);
  const vertexFaceNormals: Map<number, { normal: THREE.Vector3; faceIdx: number }[]> = new Map();

  for (let f = 0; f < faceCount; f++) {
    for (let j = 0; j < 3; j++) {
      const vi = idxAttr.getX(f * 3 + j);
      if (!vertexFaceNormals.has(vi)) vertexFaceNormals.set(vi, []);
      vertexFaceNormals.get(vi)!.push({ normal: faceNormals[f], faceIdx: f });
    }
  }

  for (let v = 0; v < posAttr.count; v++) {
    const faces = vertexFaceNormals.get(v);
    if (!faces || faces.length === 0) {
      normalArray[v * 3] = 0;
      normalArray[v * 3 + 1] = 1;
      normalArray[v * 3 + 2] = 0;
      continue;
    }

    // Group by smooth groups (faces connected within angle threshold)
    const averaged = new THREE.Vector3();
    const refNormal = faces[0].normal;
    let count = 0;
    for (const { normal } of faces) {
      const angle = Math.acos(Math.max(-1, Math.min(1, refNormal.dot(normal))));
      if (angle <= thresholdRad) {
        averaged.add(normal);
        count++;
      }
    }
    if (count > 0) averaged.divideScalar(count).normalize();
    else averaged.copy(refNormal);

    normalArray[v * 3] = averaged.x;
    normalArray[v * 3 + 1] = averaged.y;
    normalArray[v * 3 + 2] = averaged.z;
  }

  const result = geometry.clone();
  result.setAttribute('normal', new THREE.BufferAttribute(normalArray, 3));
  return { Geometry: result };
}

/**
 * 10. EdgeSplit
 * Splits edges where the angle between adjacent faces exceeds threshold.
 * Inputs: Geometry, Angle, Selection
 * Outputs: Geometry
 */
export function executeEdgeSplit(inputs: Record<string, any>): any {
  const geometry: THREE.BufferGeometry | null = inputs.Geometry ?? inputs.geometry ?? null;
  const angle = inputs.Angle ?? inputs.angle ?? 30; // degrees

  if (!geometry || !geometry.getAttribute('position') || !geometry.getIndex()) return { Geometry: geometry };

  const thresholdRad = (angle * Math.PI) / 180;
  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex();
  const faceCount = Math.floor(idxAttr.count / 3);

  // Compute face normals
  const faceNormals: THREE.Vector3[] = [];
  for (let f = 0; f < faceCount; f++) {
    const i0 = idxAttr.getX(f * 3), i1 = idxAttr.getX(f * 3 + 1), i2 = idxAttr.getX(f * 3 + 2);
    const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
    const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
    const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
    faceNormals.push(new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(v1, v0),
      new THREE.Vector3().subVectors(v2, v0),
    ).normalize());
  }

  // Find edges to split (edges shared by faces with angle > threshold)
  const edgeKey = (a: number, b: number) => a < b ? `${a}-${b}` : `${b}-${a}`;
  const edgeFaces = new Map<string, number[]>();
  for (let f = 0; f < faceCount; f++) {
    for (let j = 0; j < 3; j++) {
      const a = idxAttr.getX(f * 3 + j);
      const b = idxAttr.getX(f * 3 + ((j + 1) % 3));
      const key = edgeKey(a, b);
      if (!edgeFaces.has(key)) edgeFaces.set(key, []);
      edgeFaces.get(key)!.push(f);
    }
  }

  const edgesToSplit = new Set<string>();
  for (const [key, faces] of edgeFaces) {
    if (faces.length === 2) {
      const angleBetween = Math.acos(Math.max(-1, Math.min(1, faceNormals[faces[0]].dot(faceNormals[faces[1]]))));
      if (angleBetween > thresholdRad) edgesToSplit.add(key);
    }
  }

  // For vertices on split edges, duplicate them for each face
  const newPositions = new Float32Array(posAttr.array as Float32Array);
  const newIndices: number[] = [];
  const vertexDuplicate = new Map<number, number>(); // original -> duplicate

  let nextVertex = posAttr.count;

  for (let f = 0; f < faceCount; f++) {
    for (let j = 0; j < 3; j++) {
      const a = idxAttr.getX(f * 3 + j);
      const b = idxAttr.getX(f * 3 + ((j + 1) % 3));
      const key = edgeKey(a, b);

      if (edgesToSplit.has(key)) {
        // Duplicate vertices on this edge for this face
        for (const vi of [a, b]) {
          if (!vertexDuplicate.has(vi)) {
            const dupIdx = nextVertex++;
            newIndices.push(dupIdx);
            // Will extend positions array below
            vertexDuplicate.set(vi, dupIdx);
          } else {
            newIndices.push(vertexDuplicate.get(vi)!);
          }
        }
      } else {
        newIndices.push(idxAttr.getX(f * 3 + j));
      }
    }
  }

  // Extend position array for duplicates
  const finalPositions = new Float32Array(nextVertex * 3);
  finalPositions.set(newPositions);
  for (const [orig, dup] of vertexDuplicate) {
    finalPositions[dup * 3] = (posAttr.array as Float32Array)[orig * 3];
    finalPositions[dup * 3 + 1] = (posAttr.array as Float32Array)[orig * 3 + 1];
    finalPositions[dup * 3 + 2] = (posAttr.array as Float32Array)[orig * 3 + 2];
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.BufferAttribute(finalPositions, 3));
  result.setIndex(newIndices);
  result.computeVertexNormals();
  return { Geometry: result };
}

// ============================================================================
// Curve Operations Executors
// ============================================================================

/**
 * 11. CurveToMesh
 * Converts a curve to a tube mesh with configurable radius and segments.
 * Inputs: Curve, ProfileCurve, Radius, Resolution
 * Outputs: Geometry
 */
export function executeCurveToMesh(inputs: Record<string, any>): any {
  const curvePoints = inputs.Curve ?? inputs.curve ?? inputs.points ?? null;
  const radius = inputs.Radius ?? inputs.radius ?? 0.1;
  const resolution = inputs.Resolution ?? inputs.resolution ?? 8; // radial segments
  const segments = inputs.Segments ?? inputs.segments ?? 16; // along curve

  if (!curvePoints) return { Geometry: new THREE.BufferGeometry() };

  // Build curve from points
  const pts: THREE.Vector3[] = [];
  if (curvePoints instanceof THREE.BufferGeometry) {
    const posAttr = curvePoints.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      pts.push(new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
    }
  } else if (Array.isArray(curvePoints)) {
    for (const p of curvePoints) {
      pts.push(new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0));
    }
  } else if (curvePoints instanceof THREE.Curve) {
    for (let i = 0; i <= segments; i++) {
      pts.push(curvePoints.getPoint(i / segments));
    }
  }

  if (pts.length < 2) return { Geometry: new THREE.BufferGeometry() };

  // Use TubeGeometry if possible, or build manually
  const threeCurve = new THREE.CatmullRomCurve3(pts);
  const tubeGeo = new THREE.TubeGeometry(threeCurve, segments, radius, resolution, false);

  return { Geometry: tubeGeo };
}

/**
 * 12. CurveResample
 * Resamples a curve with uniform spacing along its length.
 * Inputs: Curve, Count, Length, Mode
 * Outputs: Curve
 */
export function executeCurveResample(inputs: Record<string, any>): any {
  const curvePoints = inputs.Curve ?? inputs.curve ?? inputs.points ?? null;
  const count = inputs.Count ?? inputs.count ?? 10;
  const length = inputs.Length ?? inputs.length ?? 0; // 0 = use count
  const mode = inputs.Mode ?? inputs.mode ?? 'count'; // 'count' | 'length'

  if (!curvePoints) return { Curve: [] };

  const pts: THREE.Vector3[] = [];
  if (Array.isArray(curvePoints)) {
    for (const p of curvePoints) {
      pts.push(new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0));
    }
  } else if (curvePoints instanceof THREE.BufferGeometry) {
    const posAttr = curvePoints.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      pts.push(new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
    }
  }

  if (pts.length < 2) return { Curve: pts.map(p => ({ x: p.x, y: p.y, z: p.z })) };

  const curve = new THREE.CatmullRomCurve3(pts);
  const curveLength = curve.getLength();

  let sampleCount: number;
  if (mode === 'length' && length > 0) {
    sampleCount = Math.max(2, Math.floor(curveLength / length));
  } else {
    sampleCount = Math.max(2, count);
  }

  const resampled: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const t = i / (sampleCount - 1);
    const p = curve.getPoint(t);
    resampled.push({ x: p.x, y: p.y, z: p.z });
  }

  return { Curve: resampled };
}

/**
 * 13. FillCurve
 * Fills a closed curve with a triangulated mesh (ear-clipping).
 * Inputs: Curve, Mode
 * Outputs: Geometry
 */
export function executeFillCurve(inputs: Record<string, any>): any {
  const curvePoints = inputs.Curve ?? inputs.curve ?? inputs.points ?? null;
  const mode = inputs.Mode ?? inputs.mode ?? 'triangle_fan';

  if (!curvePoints) return { Geometry: new THREE.BufferGeometry() };

  const pts: THREE.Vector3[] = [];
  if (Array.isArray(curvePoints)) {
    for (const p of curvePoints) {
      pts.push(new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0));
    }
  }

  if (pts.length < 3) return { Geometry: new THREE.BufferGeometry() };

  // Project to 2D for triangulation (use dominant axis)
  const center = new THREE.Vector3();
  for (const p of pts) center.add(p);
  center.divideScalar(pts.length);

  // Compute normal of the polygon plane
  const normal = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    const curr = pts[i];
    const next = pts[(i + 1) % pts.length];
    normal.x += (curr.y - next.y) * (curr.z + next.z);
    normal.y += (curr.z - next.z) * (curr.x + next.x);
    normal.z += (curr.x - next.x) * (curr.y + next.y);
  }
  normal.normalize();

  // Ear-clipping triangulation
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (const p of pts) {
    positions.push(p.x, p.y, p.z);
    normals.push(normal.x, normal.y, normal.z);
  }

  // Simple triangle fan from center
  for (let i = 0; i < pts.length; i++) {
    positions.push(pts[i].x, pts[i].y, pts[i].z);
    normals.push(normal.x, normal.y, normal.z);
  }

  const centerIdx = pts.length;
  for (let i = 0; i < pts.length; i++) {
    const next = (i + 1) % pts.length;
    indices.push(centerIdx, i, next);
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  result.setIndex(indices);
  return { Geometry: result };
}

/**
 * 14. TrimCurve
 * Trims a curve to start/end factors.
 * Inputs: Curve, Start, End, Mode
 * Outputs: Curve
 */
export function executeTrimCurve(inputs: Record<string, any>): any {
  const curvePoints = inputs.Curve ?? inputs.curve ?? inputs.points ?? null;
  const start = inputs.Start ?? inputs.start ?? 0.0;
  const end = inputs.End ?? inputs.end ?? 1.0;

  if (!curvePoints) return { Curve: [] };

  const pts: THREE.Vector3[] = [];
  if (Array.isArray(curvePoints)) {
    for (const p of curvePoints) {
      pts.push(new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0));
    }
  }

  if (pts.length < 2) return { Curve: pts.map(p => ({ x: p.x, y: p.y, z: p.z })) };

  const curve = new THREE.CatmullRomCurve3(pts);
  const s = Math.max(0, Math.min(1, start));
  const e = Math.max(s, Math.min(1, end));

  const trimCount = Math.max(2, Math.round(pts.length * (e - s)));
  const result: { x: number; y: number; z: number }[] = [];

  for (let i = 0; i < trimCount; i++) {
    const t = s + (i / (trimCount - 1)) * (e - s);
    const p = curve.getPoint(t);
    result.push({ x: p.x, y: p.y, z: p.z });
  }

  return { Curve: result };
}

// ============================================================================
// Mesh Analysis Executors
// ============================================================================

/**
 * 15. MeshBoolean
 * CSG boolean operation on two geometries using three-bvh-csg.
 *
 * Supported operations: 'union' | 'subtract' | 'intersect'
 * Also supports individual boolean node types (BooleanUnion, BooleanIntersect,
 * BooleanDifference) via the _nodeType input key.
 *
 * Inputs: Geometry (or MeshA / Mesh1), Operand (or MeshB / Mesh2), Operation, _nodeType
 * Outputs: Geometry
 */
/**
 * Helper: resolve the boolean operation from various input formats.
 *
 * Supported formats:
 *  - String (case-insensitive): 'union' | 'subtract' | 'intersect' |
 *    'UNION' | 'DIFFERENCE' | 'INTERSECT' | 'INTERSECTION' | 'addition'
 *  - Numeric (Blender enum index):
 *    0 = INTERSECT, 1 = UNION, 2 = DIFFERENCE
 *  - Defaults to 'union' if unresolvable
 */
function resolveBooleanOperation(
  rawOp: any,
  nodeType?: string,
): 'union' | 'subtract' | 'intersect' {
  // If we already have a normalised string, return early
  if (rawOp === 'union' || rawOp === 'subtract' || rawOp === 'intersect') {
    return rawOp;
  }

  // Numeric enum (Blender MeshBoolean operation indices)
  if (typeof rawOp === 'number') {
    switch (rawOp) {
      case 0: return 'intersect';  // INTERSECT
      case 1: return 'union';      // UNION
      case 2: return 'subtract';   // DIFFERENCE
      default: return 'union';
    }
  }

  // String normalisation
  if (rawOp != null) {
    const op = String(rawOp).toLowerCase().trim();
    if (op === 'union' || op === 'addition') return 'union';
    if (op === 'subtract' || op === 'difference') return 'subtract';
    if (op === 'intersect' || op === 'intersection') return 'intersect';
  }

  // Infer from node type name
  if (nodeType) {
    const nt = String(nodeType).toLowerCase();
    if (nt.includes('union')) return 'union';
    if (nt.includes('intersect')) return 'intersect';
    if (nt.includes('difference')) return 'subtract';
  }

  // Default
  return 'union';
}

export function executeMeshBoolean(
  inputs: Record<string, any>,
  settings?: Record<string, any>,
): any {
  const geometry: THREE.BufferGeometry | null =
    inputs.Geometry ?? inputs.geometry ?? inputs.MeshA ?? inputs['Mesh 1'] ?? inputs.Mesh1 ?? null;
  const operand: THREE.BufferGeometry | null =
    inputs.Operand ?? inputs.operand ?? inputs.MeshB ?? inputs.geometry2 ?? inputs['Mesh 2'] ?? inputs.Mesh2 ?? null;

  // Resolve the operation from multiple possible sources (in priority order):
  //  1. Explicit Operation input socket value
  //  2. Node settings / properties (passed via wrapWithSettings)
  //  3. Legacy fallback properties on the inputs object
  //  4. _nodeType inference for individual boolean nodes
  const rawOperation =
    inputs.Operation ?? inputs.operation ??
    settings?.operation ??
    inputs.properties?.operation ?? inputs.operation_property ??
    inputs._nodeType ??
    null;

  const operation = resolveBooleanOperation(rawOperation, inputs._nodeType);

  // Edge cases: missing inputs
  if (!geometry) return { Geometry: new THREE.BufferGeometry() };
  if (!operand) return { Geometry: geometry };

  try {
    return { Geometry: performCSGBoolean(geometry, operand, operation) };
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[CoreNodeExecutors] meshBoolean CSG fallback for', operation, ':', err);
    }
    // Fall back to simple merge for union; return first geometry for other ops
    if (operation === 'union') {
      try { return { Geometry: mergeGeometries(geometry, operand) }; } catch { /* ignore */ }
    }
    return { Geometry: geometry };
  }
}

// performCSGBoolean and mergeGeometries are now imported from ./csg-boolean.ts
// which has proper geometry cloning, missing attribute handling, and
// Evaluator attribute list configuration. The previous inline version
// had bugs that caused subtract/intersect to silently return the first
// geometry unchanged (missing UVs crashed the Evaluator, and the
// ensureIndexed helper did not clone already-indexed geometries,
// leading to mutation by Brush.prepareGeometry()).

/**
 * 16. MeshToCurve
 * Extracts mesh edges as curves.
 * Inputs: Geometry, Selection
 * Outputs: Curve
 */
export function executeMeshToCurve(inputs: Record<string, any>): any {
  const geometry: THREE.BufferGeometry | null = inputs.Geometry ?? inputs.geometry ?? null;
  const selection = inputs.Selection ?? inputs.selection ?? null;

  if (!geometry || !geometry.getAttribute('position')) return { Curve: [] };

  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex();

  const curves: { x: number; y: number; z: number }[][] = [];

  if (idxAttr) {
    // Extract boundary edges (edges that belong to only one face)
    const edgeFaceCount = new Map<string, { a: number; b: number; count: number }>();
    const faceCount = Math.floor(idxAttr.count / 3);

    for (let f = 0; f < faceCount; f++) {
      if (selection !== null && Array.isArray(selection) && !selection[f]) continue;
      for (let j = 0; j < 3; j++) {
        const a = idxAttr.getX(f * 3 + j);
        const b = idxAttr.getX(f * 3 + ((j + 1) % 3));
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        const existing = edgeFaceCount.get(key);
        if (existing) existing.count++;
        else edgeFaceCount.set(key, { a, b, count: 1 });
      }
    }

    // Collect boundary edges (count === 1) and chain them into curves
    const boundaryEdges: [number, number][] = [];
    for (const [, edge] of edgeFaceCount) {
      if (edge.count === 1) boundaryEdges.push([edge.a, edge.b]);
    }

    // Simple chain: just output each edge as a 2-point curve
    for (const [a, b] of boundaryEdges) {
      curves.push([
        { x: posAttr.getX(a), y: posAttr.getY(a), z: posAttr.getZ(a) },
        { x: posAttr.getX(b), y: posAttr.getY(b), z: posAttr.getZ(b) },
      ]);
    }
  } else {
    // Non-indexed: every 3 vertices form a face, output edges
    for (let i = 0; i < posAttr.count; i += 3) {
      curves.push([
        { x: posAttr.getX(i), y: posAttr.getY(i), z: posAttr.getZ(i) },
        { x: posAttr.getX(i + 1), y: posAttr.getY(i + 1), z: posAttr.getZ(i + 1) },
        { x: posAttr.getX(i + 2), y: posAttr.getY(i + 2), z: posAttr.getZ(i + 2) },
      ]);
    }
  }

  return { Curve: curves };
}

/**
 * 17. FaceSetBoundaries
 * Finds boundary edges of face groups (where face attribute changes).
 * Inputs: Geometry, FaceAttribute
 * Outputs: Geometry (line segments), BoundaryEdges
 */
export function executeFaceSetBoundaries(inputs: Record<string, any>): any {
  const geometry: THREE.BufferGeometry | null = inputs.Geometry ?? inputs.geometry ?? null;
  const faceAttrName = inputs.FaceAttribute ?? inputs.faceAttribute ?? 'material_index';

  if (!geometry || !geometry.getAttribute('position') || !geometry.getIndex()) {
    return { Geometry: new THREE.BufferGeometry(), BoundaryEdges: [] };
  }

  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex();
  const faceCount = Math.floor(idxAttr.count / 3);

  // Get face attribute values
  const faceAttr = geometry.getAttribute(faceAttrName);
  const faceValues: number[] = [];
  for (let f = 0; f < faceCount; f++) {
    if (faceAttr) {
      const i0 = idxAttr.getX(f * 3);
      faceValues.push(faceAttr.getX(i0) ?? 0);
    } else {
      faceValues.push(0);
    }
  }

  // Find edges shared by faces with different attribute values
  const edgeKey = (a: number, b: number) => a < b ? `${a}-${b}` : `${b}-${a}`;
  const edgeFaces = new Map<string, { faces: number[]; verts: [number, number] }>();

  for (let f = 0; f < faceCount; f++) {
    for (let j = 0; j < 3; j++) {
      const a = idxAttr.getX(f * 3 + j);
      const b = idxAttr.getX(f * 3 + ((j + 1) % 3));
      const key = edgeKey(a, b);
      if (!edgeFaces.has(key)) edgeFaces.set(key, { faces: [], verts: [a, b] });
      edgeFaces.get(key)!.faces.push(f);
    }
  }

  const boundaryPositions: number[] = [];
  const boundaryEdges: [number, number][] = [];

  for (const [, edge] of edgeFaces) {
    if (edge.faces.length >= 2) {
      const v0 = faceValues[edge.faces[0]];
      const v1 = faceValues[edge.faces[1]];
      if (v0 !== v1) {
        const [a, b] = edge.verts;
        boundaryPositions.push(
          posAttr.getX(a), posAttr.getY(a), posAttr.getZ(a),
          posAttr.getX(b), posAttr.getY(b), posAttr.getZ(b),
        );
        boundaryEdges.push([a, b]);
      }
    } else if (edge.faces.length === 1) {
      // Mesh boundary
      const [a, b] = edge.verts;
      boundaryPositions.push(
        posAttr.getX(a), posAttr.getY(a), posAttr.getZ(a),
        posAttr.getX(b), posAttr.getY(b), posAttr.getZ(b),
      );
      boundaryEdges.push([a, b]);
    }
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(boundaryPositions, 3));

  return { Geometry: result, BoundaryEdges: boundaryEdges };
}

// ============================================================================
// Attribute Executors
// ============================================================================

/**
 * 18. StoreNamedAttribute
 * Stores a custom named attribute on geometry.
 * Inputs: Geometry, Name, Domain, DataType, Value
 * Outputs: Geometry
 */
export function executeStoreNamedAttribute(inputs: Record<string, any>): any {
  const geometry: THREE.BufferGeometry | null = inputs.Geometry ?? inputs.geometry ?? null;
  const name = inputs.Name ?? inputs.name ?? 'custom_attribute';
  const domain = inputs.Domain ?? inputs.domain ?? 'point';
  const dataType = inputs.DataType ?? inputs.dataType ?? 'float';
  const value = inputs.Value ?? inputs.value ?? 0;

  if (!geometry) return { Geometry: null };

  const result = geometry.clone();
  const posAttr = result.getAttribute('position');
  if (!posAttr) return { Geometry: result };

  // Determine element count based on domain
  let count: number;
  switch (domain) {
    case 'point': count = posAttr.count; break;
    case 'face': {
      const idx = result.getIndex();
      count = idx ? Math.floor(idx.count / 3) : Math.floor(posAttr.count / 3);
      break;
    }
    default: count = posAttr.count;
  }

  // Create attribute array based on data type
  let itemSize: number;
  let array: Float32Array | Int32Array | Uint8Array;

  switch (dataType) {
    case 'float':
      itemSize = 1;
      array = new Float32Array(count);
      if (typeof value === 'number') array.fill(value);
      else if (Array.isArray(value)) for (let i = 0; i < Math.min(count, value.length); i++) array[i] = value[i];
      break;
    case 'vector':
      itemSize = 3;
      array = new Float32Array(count * 3);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const vx = value.x ?? 0, vy = value.y ?? 0, vz = value.z ?? 0;
        for (let i = 0; i < count; i++) { array[i * 3] = vx; array[i * 3 + 1] = vy; array[i * 3 + 2] = vz; }
      } else if (Array.isArray(value)) {
        for (let i = 0; i < Math.min(count * 3, value.length); i++) array[i] = value[i];
      }
      break;
    case 'color':
      itemSize = 3;
      array = new Float32Array(count * 3);
      if (value && typeof value === 'object' && 'r' in value) {
        for (let i = 0; i < count; i++) { array[i * 3] = value.r; array[i * 3 + 1] = value.g; array[i * 3 + 2] = value.b; }
      }
      break;
    case 'boolean':
      itemSize = 1;
      array = new Uint8Array(count);
      if (typeof value === 'boolean') array.fill(value ? 1 : 0);
      else if (Array.isArray(value)) for (let i = 0; i < Math.min(count, value.length); i++) array[i] = value[i] ? 1 : 0;
      break;
    case 'integer':
      itemSize = 1;
      array = new Int32Array(count);
      if (typeof value === 'number') array.fill(Math.floor(value));
      else if (Array.isArray(value)) for (let i = 0; i < Math.min(count, value.length); i++) array[i] = Math.floor(value[i]);
      break;
    default:
      itemSize = 1;
      array = new Float32Array(count).fill(0);
  }

  result.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
  return { Geometry: result };
}

/**
 * 19. NamedAttribute
 * Reads a named attribute from geometry.
 * Inputs: Geometry, Name
 * Outputs: Attribute, Exists
 */
export function executeNamedAttribute(inputs: Record<string, any>): any {
  const geometry: THREE.BufferGeometry | null = inputs.Geometry ?? inputs.geometry ?? null;
  const name = inputs.Name ?? inputs.name ?? '';

  if (!geometry || !name) return { Attribute: [], Exists: false };

  const attr = geometry.getAttribute(name);
  if (!attr) return { Attribute: [], Exists: false };

  const array = attr.array as Float32Array | Int32Array | Uint8Array;
  const itemSize = attr.itemSize;
  const count = attr.count;

  const result: any[] = [];
  for (let i = 0; i < count; i++) {
    if (itemSize === 1) {
      result.push(array[i]);
    } else {
      const item: number[] = [];
      for (let j = 0; j < itemSize; j++) item.push(array[i * itemSize + j]);
      result.push(itemSize === 3 ? { x: item[0], y: item[1], z: item[2] } : item);
    }
  }

  return { Attribute: result, Exists: true };
}

/**
 * 20. AttributeStatistic
 * Computes statistics of an attribute (min, max, mean, median, sum, variance, std dev).
 * Inputs: Geometry, Attribute, Domain
 * Outputs: Mean, Min, Max, Sum, Count, Variance, StdDev, Range, Median
 */
export function executeAttributeStatistic(inputs: Record<string, any>): any {
  const geometry: THREE.BufferGeometry | null = inputs.Geometry ?? inputs.geometry ?? null;
  const attributeName = inputs.Attribute ?? inputs.attribute ?? inputs.AttributeName ?? null;
  const domain = inputs.Domain ?? inputs.domain ?? 'point';

  if (!geometry || !geometry.getAttribute('position')) {
    return { Mean: 0, Min: 0, Max: 0, Sum: 0, Count: 0, Variance: 0, StdDev: 0, Range: 0, Median: 0 };
  }

  // Extract scalar values from the specified attribute (or position magnitude as fallback)
  let values: number[];
  const attr = attributeName && typeof attributeName === 'string' && geometry.hasAttribute(attributeName)
    ? geometry.getAttribute(attributeName)
    : null;
  const posAttr = geometry.getAttribute('position');

  if (attr) {
    values = [];
    const arr = attr.array as Float32Array;
    for (let i = 0; i < attr.count; i++) {
      values.push(arr[i * attr.itemSize]); // Use first component for statistics
    }
  } else {
    // Default: use position magnitudes
    values = [];
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
      values.push(Math.sqrt(x * x + y * y + z * z));
    }
  }

  // Also handle array input directly
  if (Array.isArray(attributeName) && attributeName.length > 0 && typeof attributeName[0] === 'number') {
    values = attributeName as number[];
  }

  if (values.length === 0) {
    return { Mean: 0, Min: 0, Max: 0, Sum: 0, Count: 0, Variance: 0, StdDev: 0, Range: 0, Median: 0 };
  }

  const count = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / count;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / count;
  const stdDev = Math.sqrt(variance);

  // Median
  const sorted = [...values].sort((a, b) => a - b);
  const median = count % 2 === 0
    ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
    : sorted[Math.floor(count / 2)];

  return { Mean: mean, Min: min, Max: max, Sum: sum, Count: count, Variance: variance, StdDev: stdDev, Range: range, Median: median };
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Closest point on a line segment */
function closestPointOnSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ap = new THREE.Vector3().subVectors(p, a);
  const t = Math.max(0, Math.min(1, ap.dot(ab) / Math.max(1e-10, ab.dot(ab))));
  return a.clone().addScaledVector(ab, t);
}

/** Closest point on a triangle to a point (using barycentric coordinates) */
function closestPointOnTriangle(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): THREE.Vector3 {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  const ap = new THREE.Vector3().subVectors(p, a);

  const d1 = ab.dot(ap);
  const d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) return a.clone();

  const bp = new THREE.Vector3().subVectors(p, b);
  const d3 = ab.dot(bp);
  const d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) return b.clone();

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return a.clone().addScaledVector(ab, v);
  }

  const cp = new THREE.Vector3().subVectors(p, c);
  const d5 = ab.dot(cp);
  const d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) return c.clone();

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return a.clone().addScaledVector(ac, w);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return b.clone().addScaledVector(new THREE.Vector3().subVectors(c, b), w);
  }

  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return a.clone().addScaledVector(ab, v).addScaledVector(ac, w);
}

/** Quickhull algorithm - returns array of triangle indices */
function quickhull(points: THREE.Vector3[]): [number, number, number][] {
  const n = points.length;
  if (n < 4) return [[0, 1, 2]];

  // Find extreme points along each axis
  let minI = [0, 0, 0], maxI = [0, 0, 0];
  for (let i = 1; i < n; i++) {
    for (let axis = 0; axis < 3; axis++) {
      const v = points[i].getComponent(axis);
      if (v < points[minI[axis]].getComponent(axis)) minI[axis] = i;
      if (v > points[maxI[axis]].getComponent(axis)) maxI[axis] = i;
    }
  }

  // Find the pair with maximum distance
  let bestDist = 0, bestA = 0, bestB = 0;
  for (const a of [...minI, ...maxI]) {
    for (const b of [...minI, ...maxI]) {
      if (a === b) continue;
      const d = points[a].distanceTo(points[b]);
      if (d > bestDist) { bestDist = d; bestA = a; bestB = b; }
    }
  }

  // Find the point farthest from line AB
  const ab = new THREE.Vector3().subVectors(points[bestB], points[bestA]).normalize();
  let bestC = -1, bestDistC = 0;
  for (let i = 0; i < n; i++) {
    if (i === bestA || i === bestB) continue;
    const ap = new THREE.Vector3().subVectors(points[i], points[bestA]);
    const perpDist = ap.clone().sub(ab.clone().multiplyScalar(ap.dot(ab))).length();
    if (perpDist > bestDistC) { bestDistC = perpDist; bestC = i; }
  }

  if (bestC === -1) return [[bestA, bestB, bestB]]; // Degenerate

  // Find the point farthest from plane ABC
  const normal = new THREE.Vector3().crossVectors(
    new THREE.Vector3().subVectors(points[bestB], points[bestA]),
    new THREE.Vector3().subVectors(points[bestC], points[bestA]),
  ).normalize();

  let bestD = -1, bestDistD = 0;
  for (let i = 0; i < n; i++) {
    if (i === bestA || i === bestB || i === bestC) continue;
    const dist = Math.abs(new THREE.Vector3().subVectors(points[i], points[bestA]).dot(normal));
    if (dist > bestDistD) { bestDistD = dist; bestD = i; }
  }

  if (bestD === -1) {
    // All points coplanar, return single triangle
    return [[bestA, bestB, bestC]];
  }

  // Initial tetrahedron faces (ensure outward-facing normals)
  const dSign = new THREE.Vector3().subVectors(points[bestD], points[bestA]).dot(normal) > 0 ? 1 : -1;
  const faces: [number, number, number][] = dSign > 0
    ? [[bestA, bestC, bestB], [bestA, bestB, bestD], [bestB, bestC, bestD], [bestC, bestA, bestD]]
    : [[bestA, bestB, bestC], [bestA, bestD, bestB], [bestB, bestD, bestC], [bestC, bestD, bestA]];

  // Iteratively add points outside the hull
  const assigned = new Set([bestA, bestB, bestC, bestD]);

  for (let iter = 0; iter < n; iter++) {
    // Find unassigned point farthest outside any face
    let bestPoint = -1, bestFaceIdx = -1, bestFaceDist = 0;

    for (let i = 0; i < n; i++) {
      if (assigned.has(i)) continue;
      for (let fi = 0; fi < faces.length; fi++) {
        const [a, b, c] = faces[fi];
        const faceNormal = new THREE.Vector3().crossVectors(
          new THREE.Vector3().subVectors(points[b], points[a]),
          new THREE.Vector3().subVectors(points[c], points[a]),
        ).normalize();
        const dist = new THREE.Vector3().subVectors(points[i], points[a]).dot(faceNormal);
        if (dist > bestFaceDist) {
          bestFaceDist = dist;
          bestPoint = i;
          bestFaceIdx = fi;
        }
      }
    }

    if (bestPoint === -1 || bestFaceDist < 1e-8) break; // All points inside

    assigned.add(bestPoint);

    // Find all faces visible from the new point
    const visibleFaces: number[] = [];
    for (let fi = 0; fi < faces.length; fi++) {
      const [a, b, c] = faces[fi];
      const faceNormal = new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(points[b], points[a]),
        new THREE.Vector3().subVectors(points[c], points[a]),
      ).normalize();
      const dist = new THREE.Vector3().subVectors(points[bestPoint], points[a]).dot(faceNormal);
      if (dist > 1e-8) visibleFaces.push(fi);
    }

    // Find horizon edges (edges shared by one visible and one invisible face)
    const horizonEdges: [number, number][] = [];
    for (const vfi of visibleFaces) {
      const [a, b, c] = faces[vfi];
      const edges: [number, number][] = [[a, b], [b, c], [c, a]];
      for (const edge of edges) {
        const eKey = edge[0] < edge[1] ? `${edge[0]}-${edge[1]}` : `${edge[1]}-${edge[0]}`;
        let shared = false;
        for (const ofi of visibleFaces) {
          if (ofi === vfi) continue;
          const [oa, ob, oc] = faces[ofi];
          const oEdges = [[oa, ob], [ob, oc], [oc, oa]];
          for (const oe of oEdges) {
            const oeKey = oe[0] < oe[1] ? `${oe[0]}-${oe[1]}` : `${oe[1]}-${oe[0]}`;
            if (eKey === oeKey) { shared = true; break; }
          }
          if (shared) break;
        }
        if (!shared) horizonEdges.push(edge);
      }
    }

    // Remove visible faces
    const newFaces = faces.filter((_, fi) => !visibleFaces.includes(fi));

    // Add new faces connecting horizon edges to the new point
    for (const [a, b] of horizonEdges) {
      newFaces.push([a, b, bestPoint]);
    }

    faces.length = 0;
    faces.push(...newFaces);
  }

  return faces;
}

// mergeGeometries is now imported from ./csg-boolean.ts
