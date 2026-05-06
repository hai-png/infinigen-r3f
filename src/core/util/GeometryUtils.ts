/**
 * GeometryUtils.ts
 * 
 * Advanced geometry utilities for mesh operations, bevelling, smoothing,
 * and geometric transformations. Ported from Infinigen's bevelling.py and ocmesher_utils.py.
 */

import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry';

// ============================================================================
// Mesh Bevelling
// ============================================================================

/**
 * Applies a bevel to mesh edges by chamfering vertices.
 * This is a simplified implementation - production would use proper mesh subdivision.
 */
export function bevelMesh(geometry: THREE.BufferGeometry, bevelAmount: number = 0.1, segments: number = 3): THREE.BufferGeometry {
  const positions = geometry.attributes.position.array as Float32Array;
  const normals = geometry.attributes.normal?.array as Float32Array | undefined;
  
  // Create new geometry for beveled result
  const beveledGeometry = new THREE.BufferGeometry();
  
  // For each vertex, we'll create multiple vertices offset along normals
  const newPositions: number[] = [];
  const newNormals: number[] = [];
  
  const vertexCount = positions.length / 3;
  
  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    
    const nx = normals ? normals[i * 3] : 0;
    const ny = normals ? normals[i * 3 + 1] : 0;
    const nz = normals ? normals[i * 3 + 2] : 0;
    
    // Create bevel segments
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const offset = bevelAmount * (1 - t);
      
      newPositions.push(
        x + nx * offset,
        y + ny * offset,
        z + nz * offset
      );
      
      // Interpolate normal for smooth bevel
      newNormals.push(nx, ny, nz);
    }
  }
  
  beveledGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  beveledGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
  
  // Copy UVs if they exist
  if (geometry.attributes.uv) {
    beveledGeometry.setAttribute('uv', geometry.attributes.uv.clone());
  }
  
  beveledGeometry.computeVertexNormals();
  return beveledGeometry;
}

/**
 * Creates a rounded box geometry with beveled edges.
 */
export function createRoundedBox(
  width: number,
  height: number,
  depth: number,
  radius: number = 0.1,
  segments: number = 4
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const eps = 0.00001;
  const radius0 = radius - eps;
  
  // Draw rounded rectangle
  shape.absarc(eps, eps, radius0, -Math.PI / 2, -Math.PI, true);
  shape.absarc(eps, height - eps, radius0, Math.PI, -Math.PI / 2, true);
  shape.absarc(width - eps, height - eps, radius0, -Math.PI / 2, 0, true);
  shape.absarc(width - eps, eps, radius0, 0, -Math.PI / 2, true);
  
  const extrudeSettings = {
    depth: depth - 2 * radius,
    bevelEnabled: true,
    bevelSegments: segments,
    steps: 1,
    bevelSize: radius,
    bevelThickness: radius,
    curveSegments: segments
  };
  
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  
  // Center the geometry
  geometry.center();
  
  return geometry;
}

// ============================================================================
// Mesh Smoothing
// ============================================================================

/**
 * Applies Laplacian smoothing to a mesh.
 * @param iterations Number of smoothing passes
 * @param lambda Smoothing factor (0-1)
 */
export function laplacianSmooth(
  geometry: THREE.BufferGeometry,
  iterations: number = 5,
  lambda: number = 0.5
): THREE.BufferGeometry {
  const positions = geometry.attributes.position.array as Float32Array;
  const vertexCount = positions.length / 3;
  
  // Build adjacency information (simplified - assumes indexed geometry)
  const positionCopy = new Float32Array(positions);
  
  for (let iter = 0; iter < iterations; iter++) {
    const smoothed = new Float32Array(positions.length);
    
    for (let i = 0; i < vertexCount; i++) {
      const ix = i * 3;
      const iy = i * 3 + 1;
      const iz = i * 3 + 2;
      
      // Get neighboring vertices (simplified - in full impl would use edge connectivity)
      let sumX = 0, sumY = 0, sumZ = 0;
      let count = 0;
      
      // Sample nearby vertices (this is approximate)
      const sampleRadius = Math.min(10, Math.floor(vertexCount / 10));
      for (let j = 0; j < sampleRadius; j++) {
        const ni = (i + j) % vertexCount;
        sumX += positionCopy[ni * 3];
        sumY += positionCopy[ni * 3 + 1];
        sumZ += positionCopy[ni * 3 + 2];
        count++;
      }
      
      if (count > 0) {
        const avgX = sumX / count;
        const avgY = sumY / count;
        const avgZ = sumZ / count;
        
        smoothed[ix] = positionCopy[ix] + lambda * (avgX - positionCopy[ix]);
        smoothed[iy] = positionCopy[iy] + lambda * (avgY - positionCopy[iy]);
        smoothed[iz] = positionCopy[iz] + lambda * (avgZ - positionCopy[iz]);
      } else {
        smoothed[ix] = positionCopy[ix];
        smoothed[iy] = positionCopy[iy];
        smoothed[iz] = positionCopy[iz];
      }
    }
    
    // Update positions
    for (let i = 0; i < positions.length; i++) {
      positionCopy[i] = smoothed[i];
    }
  }
  
  const result = geometry.clone();
  (result.attributes.position as any).array = positionCopy;
  result.attributes.position.needsUpdate = true;
  result.computeVertexNormals();
  
  return result;
}

// ============================================================================
// Voxelization
// ============================================================================

/**
 * Voxelize a mesh into a 3D grid.
 * @param geometry Input mesh geometry
 * @param resolution Voxel grid resolution (voxels per unit)
 * @returns 3D array of booleans representing occupied voxels
 */
export function voxelizeMesh(
  geometry: THREE.BufferGeometry,
  resolution: number = 10
): { grid: boolean[][][]; bbox: THREE.Box3; voxelSize: number } {
  const bbox = new THREE.Box3().setFromObject(new THREE.Mesh(geometry));
  const size = new THREE.Vector3();
  bbox.getSize(size);
  
  const gridSize = new THREE.Vector3(
    Math.ceil(size.x * resolution),
    Math.ceil(size.y * resolution),
    Math.ceil(size.z * resolution)
  );
  
  const voxelSize = 1 / resolution;
  
  // Initialize 3D grid
  const grid: boolean[][][] = [];
  for (let x = 0; x < gridSize.x; x++) {
    grid[x] = [];
    for (let y = 0; y < gridSize.y; y++) {
      grid[x][y] = new Array(gridSize.z).fill(false);
    }
  }
  
  // Create raycaster for inside test
  const raycaster = new THREE.Raycaster();
  const mesh = new THREE.Mesh(geometry);
  
  // Sample points in grid
  for (let x = 0; x < gridSize.x; x++) {
    for (let y = 0; y < gridSize.y; y++) {
      for (let z = 0; z < gridSize.z; z++) {
        const px = bbox.min.x + (x + 0.5) * voxelSize;
        const py = bbox.min.y + (y + 0.5) * voxelSize;
        const pz = bbox.min.z + (z + 0.5) * voxelSize;
        
        const point = new THREE.Vector3(px, py, pz);
        
        // Raycast in multiple directions to determine if inside
        let insideCount = 0;
        const directions = [
          new THREE.Vector3(1, 0, 0),
          new THREE.Vector3(-1, 0, 0),
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(0, -1, 0),
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(0, 0, -1)
        ];
        
        for (const dir of directions) {
          raycaster.set(point, dir);
          const intersects = raycaster.intersectObject(mesh);
          // If odd number of intersections, we're inside
          if (intersects.length % 2 === 1) {
            insideCount++;
          }
        }
        
        // If majority of rays indicate inside, mark as occupied
        grid[x][y][z] = insideCount >= 3;
      }
    }
  }
  
  return { grid, bbox, voxelSize };
}

/**
 * Converts a voxel grid back to a mesh using marching cubes approximation.
 * Simplified implementation using box instancing.
 */
export function voxelGridToMesh(
  grid: boolean[][][],
  bbox: THREE.Box3,
  voxelSize: number
): THREE.InstancedMesh {
  let count = 0;
  for (let x = 0; x < grid.length; x++) {
    for (let y = 0; y < grid[x].length; y++) {
      for (let z = 0; z < grid[x][y].length; z++) {
        if (grid[x][y][z]) count++;
      }
    }
  }
  
  const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
  const material = new THREE.MeshStandardMaterial({ color: 0x808080 });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  
  let idx = 0;
  const dummy = new THREE.Object3D();
  
  for (let x = 0; x < grid.length; x++) {
    for (let y = 0; y < grid[x].length; y++) {
      for (let z = 0; z < grid[x][y].length; z++) {
        if (grid[x][y][z]) {
          const px = bbox.min.x + x * voxelSize + voxelSize / 2;
          const py = bbox.min.y + y * voxelSize + voxelSize / 2;
          const pz = bbox.min.z + z * voxelSize + voxelSize / 2;
          
          dummy.position.set(px, py, pz);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx++, dummy.matrix);
        }
      }
    }
  }
  
  return mesh;
}

// ============================================================================
// Convex Decomposition (Simplified)
// ============================================================================

/**
 * Approximates a mesh with a convex hull.
 * Uses Three.js ConvexGeometry (requires vertices).
 */
export function approximateConvexHull(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const positions = geometry.attributes.position.array as Float32Array;
  const vertices: THREE.Vector3[] = [];
  
  for (let i = 0; i < positions.length; i += 3) {
    vertices.push(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
  }
  
  // Remove duplicate vertices
  const uniqueVertices = vertices.filter((v, i, arr) => {
    return arr.findIndex(v2 => v2.equals(v)) === i;
  });
  
  try {
    const convexGeom = new ConvexGeometry(uniqueVertices);
    return convexGeom;
  } catch (e) {
    console.warn('Convex decomposition failed, returning original geometry');
    return geometry.clone();
  }
}

/**
 * Splits a mesh into approximately convex parts.
 * Simplified version that just returns the convex hull.
 * Full implementation would use HACD or similar algorithm.
 */
export function decomposeIntoConvexParts(
  geometry: THREE.BufferGeometry,
  maxParts: number = 5
): THREE.BufferGeometry[] {
  // For now, just return convex hull
  // A full implementation would recursively split concave regions
  return [approximateConvexHull(geometry)];
}

// ============================================================================
// Geometric Transformations
// ============================================================================

/**
 * Applies a transformation matrix to geometry vertices.
 */
export function transformGeometry(
  geometry: THREE.BufferGeometry,
  matrix: THREE.Matrix4
): THREE.BufferGeometry {
  const result = geometry.clone();
  result.applyMatrix4(matrix);
  return result;
}

/**
 * Mirrors geometry across a plane.
 * @param axis 'x', 'y', or 'z'
 */
export function mirrorGeometry(
  geometry: THREE.BufferGeometry,
  axis: 'x' | 'y' | 'z' = 'x'
): THREE.BufferGeometry {
  const result = geometry.clone();
  const positions = result.attributes.position.array as Float32Array;
  
  for (let i = 0; i < positions.length; i += 3) {
    if (axis === 'x') positions[i] = -positions[i];
    else if (axis === 'y') positions[i + 1] = -positions[i + 1];
    else if (axis === 'z') positions[i + 2] = -positions[i + 2];
  }
  
  result.computeVertexNormals();
  return result;
}

/**
 * Scales geometry non-uniformly.
 */
export function scaleGeometry(
  geometry: THREE.BufferGeometry,
  scaleX: number,
  scaleY: number,
  scaleZ: number
): THREE.BufferGeometry {
  const result = geometry.clone();
  const positions = result.attributes.position.array as Float32Array;
  
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] *= scaleX;
    positions[i + 1] *= scaleY;
    positions[i + 2] *= scaleZ;
  }
  
  result.computeVertexNormals();
  return result;
}

/**
 * Calculates the surface area of a mesh.
 */
export function calculateSurfaceArea(geometry: THREE.BufferGeometry): number {
  const positions = geometry.attributes.position.array as Float32Array;
  const indices = geometry.index?.array ?? null;
  
  let area = 0;
  
  if (indices) {
    for (let i = 0; i < indices.length; i += 3) {
      const a = new THREE.Vector3(
        positions[indices[i] * 3],
        positions[indices[i] * 3 + 1],
        positions[indices[i] * 3 + 2]
      );
      const b = new THREE.Vector3(
        positions[indices[i + 1] * 3],
        positions[indices[i + 1] * 3 + 1],
        positions[indices[i + 1] * 3 + 2]
      );
      const c = new THREE.Vector3(
        positions[indices[i + 2] * 3],
        positions[indices[i + 2] * 3 + 1],
        positions[indices[i + 2] * 3 + 2]
      );
      
      area += new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(b, a),
        new THREE.Vector3().subVectors(c, a)
      ).length() / 2;
    }
  } else {
    for (let i = 0; i < positions.length; i += 9) {
      const a = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
      const b = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);
      const c = new THREE.Vector3(positions[i + 6], positions[i + 7], positions[i + 8]);
      
      area += new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(b, a),
        new THREE.Vector3().subVectors(c, a)
      ).length() / 2;
    }
  }
  
  return area;
}

// ============================================================================
// Loop Subdivision Surface
// ============================================================================

/**
 * Apply one level of Loop subdivision to smooth a mesh.
 *
 * Loop subdivision splits each triangle into 4 sub-triangles by inserting
 * edge midpoints, then smooths vertex positions using Loop's weights:
 *   - Existing vertices: weighted average of their original position and
 *     the average of their neighbors (beta = 3/(8*n) for n neighbors)
 *   - New edge vertices: weighted average of the two edge endpoints (3/8 each)
 *     and the two opposite vertices of triangles sharing the edge (1/8 each)
 *
 * This produces a smoother mesh that eliminates faceted junctions between
 * body parts (e.g., where a sphere meets a cylinder at a joint).
 *
 * @param geometry - Input BufferGeometry (will be converted to non-indexed if indexed)
 * @param levels - Number of subdivision levels (default 1, max 2 recommended)
 * @returns New BufferGeometry with subdivided and smoothed surface
 */
export function loopSubdivide(
  geometry: THREE.BufferGeometry,
  levels: number = 1,
): THREE.BufferGeometry {
  let result = geometry;

  // Ensure non-indexed geometry for easier processing
  if (result.index) {
    result = result.toNonIndexed();
  }

  for (let level = 0; level < levels; level++) {
    result = subdivideOnce(result);
  }

  return result;
}

/**
 * Single pass of Loop subdivision.
 */
function subdivideOnce(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const posAttr = geometry.attributes.position;
  if (!posAttr) return geometry;

  const positions = posAttr.array as Float32Array;
  const vertexCount = posAttr.count;
  const faceCount = vertexCount / 3;

  // Build vertex adjacency from triangle connectivity
  // Use a position-based hash to identify shared vertices
  const eps = 1e-6;

  // Round vertex positions to identify duplicates
  const vertexKeys: string[] = [];
  const uniquePositions: THREE.Vector3[] = [];
  const vertexToUnique = new Map<string, number>();

  function posKey(x: number, y: number, z: number): string {
    return `${Math.round(x / eps) * eps},${Math.round(y / eps) * eps},${Math.round(z / eps) * eps}`;
  }

  // Build unique vertex list
  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const key = posKey(x, y, z);

    if (!vertexToUnique.has(key)) {
      vertexToUnique.set(key, uniquePositions.length);
      uniquePositions.push(new THREE.Vector3(x, y, z));
    }
    vertexKeys.push(key);
  }

  const uniqueCount = uniquePositions.length;

  // Build face list using unique vertex indices
  const faces: [number, number, number][] = [];
  const vertexFaces = new Map<number, number[]>(); // uniqueVertex -> [face indices]
  const vertexNeighbors = new Map<number, Set<number>>(); // uniqueVertex -> Set<neighbor unique vertices>

  for (let i = 0; i < uniqueCount; i++) {
    vertexFaces.set(i, []);
    vertexNeighbors.set(i, new Set());
  }

  for (let f = 0; f < faceCount; f++) {
    const i0 = vertexToUnique.get(vertexKeys[f * 3])!;
    const i1 = vertexToUnique.get(vertexKeys[f * 3 + 1])!;
    const i2 = vertexToUnique.get(vertexKeys[f * 3 + 2])!;

    faces.push([i0, i1, i2]);

    vertexFaces.get(i0)!.push(f);
    vertexFaces.get(i1)!.push(f);
    vertexFaces.get(i2)!.push(f);

    vertexNeighbors.get(i0)!.add(i1);
    vertexNeighbors.get(i0)!.add(i2);
    vertexNeighbors.get(i1)!.add(i0);
    vertexNeighbors.get(i1)!.add(i2);
    vertexNeighbors.get(i2)!.add(i0);
    vertexNeighbors.get(i2)!.add(i1);
  }

  // Build edge map: edgeKey -> { endpoints, oppositeVertices }
  const edgeMap = new Map<string, { v0: number; v1: number; opposites: number[] }>();

  function edgeKey(a: number, b: number): string {
    return a < b ? `${a}_${b}` : `${b}_${a}`;
  }

  for (const [i0, i1, i2] of faces) {
    const edges = [
      edgeKey(i0, i1),
      edgeKey(i1, i2),
      edgeKey(i0, i2),
    ];
    const opposites = [i2, i0, i1];

    for (let e = 0; e < 3; e++) {
      const ek = edges[e];
      if (!edgeMap.has(ek)) {
        const [a, b] = ek.split('_').map(Number);
        edgeMap.set(ek, { v0: a, v1: b, opposites: [] });
      }
      edgeMap.get(ek)!.opposites.push(opposites[e]);
    }
  }

  // Compute new positions for existing vertices (Loop smoothing rule)
  const newUniquePositions: THREE.Vector3[] = [];
  for (let i = 0; i < uniqueCount; i++) {
    const neighbors = vertexNeighbors.get(i)!;
    const n = neighbors.size;

    if (n < 2) {
      // Boundary or isolated vertex: keep original
      newUniquePositions.push(uniquePositions[i].clone());
      continue;
    }

    // Loop weight: beta = 3/(8*n) for interior vertices
    // Simplified: use 1/(4*n) for better behavior on low-valence vertices
    const beta = n > 3 ? 3 / (8 * n) : 3 / (8 * n);

    const avg = new THREE.Vector3();
    for (const ni of neighbors) {
      avg.add(uniquePositions[ni]);
    }
    avg.divideScalar(n);

    const newPos = uniquePositions[i].clone().multiplyScalar(1 - n * beta);
    newPos.add(avg.multiplyScalar(n * beta));
    newUniquePositions.push(newPos);
  }

  // Compute new edge vertex positions and assign indices
  const edgeVertexIndex = new Map<string, number>();
  for (const [ek, edge] of edgeMap) {
    const newPos = new THREE.Vector3();

    if (edge.opposites.length === 2) {
      // Interior edge: Loop rule 3/8 + 3/8 for endpoints, 1/8 + 1/8 for opposites
      newPos.addScaledVector(uniquePositions[edge.v0], 3 / 8);
      newPos.addScaledVector(uniquePositions[edge.v1], 3 / 8);
      newPos.addScaledVector(uniquePositions[edge.opposites[0]], 1 / 8);
      newPos.addScaledVector(uniquePositions[edge.opposites[1]], 1 / 8);
    } else {
      // Boundary edge: simple midpoint
      newPos.addScaledVector(uniquePositions[edge.v0], 0.5);
      newPos.addScaledVector(uniquePositions[edge.v1], 0.5);
    }

    edgeVertexIndex.set(ek, newUniquePositions.length);
    newUniquePositions.push(newPos);
  }

  // Build new faces: each triangle splits into 4
  const newFaces: [number, number, number][] = [];

  for (const [i0, i1, i2] of faces) {
    const e01 = edgeVertexIndex.get(edgeKey(i0, i1))!;
    const e12 = edgeVertexIndex.get(edgeKey(i1, i2))!;
    const e02 = edgeVertexIndex.get(edgeKey(i0, i2))!;

    // Central triangle
    newFaces.push([e01, e12, e02]);
    // Three corner triangles
    newFaces.push([i0, e01, e02]);
    newFaces.push([i1, e12, e01]);
    newFaces.push([i2, e02, e12]);
  }

  // Build output geometry
  const outPositions = new Float32Array(newFaces.length * 9);
  let idx = 0;
  for (const [a, b, c] of newFaces) {
    outPositions[idx++] = newUniquePositions[a].x;
    outPositions[idx++] = newUniquePositions[a].y;
    outPositions[idx++] = newUniquePositions[a].z;
    outPositions[idx++] = newUniquePositions[b].x;
    outPositions[idx++] = newUniquePositions[b].y;
    outPositions[idx++] = newUniquePositions[b].z;
    outPositions[idx++] = newUniquePositions[c].x;
    outPositions[idx++] = newUniquePositions[c].y;
    outPositions[idx++] = newUniquePositions[c].z;
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(outPositions, 3));
  result.computeVertexNormals();

  // Copy UVs if they existed (approximate — remap using barycentric interpolation)
  if (geometry.attributes.uv) {
    const outUvs = new Float32Array(newFaces.length * 6);
    // Simple: assign (0,0), (1,0), (0,1) per triangle for now
    // (proper UV interpolation would need original UV mapping through the subdivision)
    let uvIdx = 0;
    for (const _face of newFaces) {
      outUvs[uvIdx++] = 0; outUvs[uvIdx++] = 0;
      outUvs[uvIdx++] = 1; outUvs[uvIdx++] = 0;
      outUvs[uvIdx++] = 0; outUvs[uvIdx++] = 1;
    }
    result.setAttribute('uv', new THREE.Float32BufferAttribute(outUvs, 2));
  }

  return result;
}

/**
 * Apply one level of Loop subdivision specifically for smoothing creature
 * body part junctions. This is a convenience wrapper that ensures the
 * geometry is properly prepared for subdivision.
 *
 * @param geometry - Input geometry (typically from sphere/cylinder primitives)
 * @param levels - Subdivision levels (default 1)
 * @returns Smoothed geometry with ~4x more triangles per level
 */
export function smoothCreatureJunction(
  geometry: THREE.BufferGeometry,
  levels: number = 1,
): THREE.BufferGeometry {
  return loopSubdivide(geometry, levels);
}

/**
 * Calculates the volume of a closed mesh (using divergence theorem).
 */
export function calculateVolume(geometry: THREE.BufferGeometry): number {
  const positions = geometry.attributes.position.array as Float32Array;
  const indices = geometry.index?.array ?? null;
  
  let volume = 0;
  
  if (indices) {
    for (let i = 0; i < indices.length; i += 3) {
      const a = new THREE.Vector3(
        positions[indices[i] * 3],
        positions[indices[i] * 3 + 1],
        positions[indices[i] * 3 + 2]
      );
      const b = new THREE.Vector3(
        positions[indices[i + 1] * 3],
        positions[indices[i + 1] * 3 + 1],
        positions[indices[i + 1] * 3 + 2]
      );
      const c = new THREE.Vector3(
        positions[indices[i + 2] * 3],
        positions[indices[i + 2] * 3 + 1],
        positions[indices[i + 2] * 3 + 2]
      );
      
      volume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
    }
  }
  
  return Math.abs(volume);
}
