/**
 * SDF (Signed Distance Field) Operations
 * 
 * Ports: infinigen/terrain/mesh_to_sdf/
 * 
 * Provides mesh-to-SDF conversion and SDF boolean operations
 * for advanced terrain manipulation.
 */

import * as THREE from 'three';

export interface SDFConfig {
  resolution: number;
  bounds: THREE.Box3;
  maxDistance?: number;
}

export type SDFData = Float32Array;

/**
 * Signed Distance Field representation
 */
export class SignedDistanceField {
  public data: SDFData;
  public resolution: number;
  public bounds: THREE.Box3;
  public gridSize: [number, number, number];
  public voxelSize: THREE.Vector3;

  constructor(config: SDFConfig) {
    this.resolution = config.resolution;
    this.bounds = config.bounds.clone();
    
    const size = this.bounds.getSize(new THREE.Vector3());
    this.gridSize = [
      Math.floor(size.x / config.resolution),
      Math.floor(size.y / config.resolution),
      Math.floor(size.z / config.resolution),
    ];
    
    this.voxelSize = new THREE.Vector3(
      size.x / this.gridSize[0],
      size.y / this.gridSize[1],
      size.z / this.gridSize[2]
    );
    
    const totalVoxels = this.gridSize[0] * this.gridSize[1] * this.gridSize[2];
    this.data = new Float32Array(totalVoxels);
    
    // Initialize with maximum distance
    this.data.fill(config.maxDistance || Infinity);
  }

  /**
   * Get index in the flat array from 3D coordinates
   */
  getIndex(x: number, y: number, z: number): number {
    const gx = Math.floor((x - this.bounds.min.x) / this.voxelSize.x);
    const gy = Math.floor((y - this.bounds.min.y) / this.voxelSize.y);
    const gz = Math.floor((z - this.bounds.min.z) / this.voxelSize.z);
    
    return gz * this.gridSize[0] * this.gridSize[1] + 
           gy * this.gridSize[0] + 
           gx;
  }

  /**
   * Get SDF value at world position
   */
  getValue(position: THREE.Vector3): number {
    const idx = this.getIndex(position.x, position.y, position.z);
    return this.data[idx];
  }

  /**
   * Set SDF value at world position
   */
  setValue(position: THREE.Vector3, value: number): void {
    const idx = this.getIndex(position.x, position.y, position.z);
    this.data[idx] = value;
  }

  /**
   * Check if position is inside the SDF (negative distance)
   */
  isInside(position: THREE.Vector3): boolean {
    return this.getValue(position) < 0;
  }

  /**
   * Get world position from grid coordinates
   */
  getPosition(gx: number, gy: number, gz: number): THREE.Vector3 {
    return new THREE.Vector3(
      this.bounds.min.x + (gx + 0.5) * this.voxelSize.x,
      this.bounds.min.y + (gy + 0.5) * this.voxelSize.y,
      this.bounds.min.z + (gz + 0.5) * this.voxelSize.z
    );
  }

  /**
   * Sample SDF with trilinear interpolation
   */
  sample(position: THREE.Vector3): number {
    const fx = (position.x - this.bounds.min.x) / this.voxelSize.x - 0.5;
    const fy = (position.y - this.bounds.min.y) / this.voxelSize.y - 0.5;
    const fz = (position.z - this.bounds.min.z) / this.voxelSize.z - 0.5;

    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const z0 = Math.floor(fz);
    
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const z1 = z0 + 1;

    const dx = fx - x0;
    const dy = fy - y0;
    const dz = fz - z0;

    const v000 = this.getSafeValue(x0, y0, z0);
    const v100 = this.getSafeValue(x1, y0, z0);
    const v010 = this.getSafeValue(x0, y1, z0);
    const v110 = this.getSafeValue(x1, y1, z0);
    const v001 = this.getSafeValue(x0, y0, z1);
    const v101 = this.getSafeValue(x1, y0, z1);
    const v011 = this.getSafeValue(x0, y1, z1);
    const v111 = this.getSafeValue(x1, y1, z1);

    const v00 = v000 * (1 - dx) + v100 * dx;
    const v01 = v010 * (1 - dx) + v110 * dx;
    const v10 = v001 * (1 - dx) + v101 * dx;
    const v11 = v011 * (1 - dx) + v111 * dx;

    const v0 = v00 * (1 - dy) + v01 * dy;
    const v1 = v10 * (1 - dy) + v11 * dy;

    return v0 * (1 - dz) + v1 * dz;
  }

  private getSafeValue(gx: number, gy: number, gz: number): number {
    if (gx < 0 || gx >= this.gridSize[0] ||
        gy < 0 || gy >= this.gridSize[1] ||
        gz < 0 || gz >= this.gridSize[2]) {
      return Infinity;
    }
    const idx = gz * this.gridSize[0] * this.gridSize[1] + 
                gy * this.gridSize[0] + 
                gx;
    return this.data[idx];
  }
}

/**
 * Convert a mesh to SDF
 */
export function meshToSDF(
  geometry: THREE.BufferGeometry,
  config: SDFConfig
): SignedDistanceField {
  const sdf = new SignedDistanceField(config);
  
  // Get mesh triangles
  const positions = geometry.attributes.position.array;
  const indices = geometry.index?.array || Array.from({ length: positions.length / 3 }, (_, i) => i);
  
  // For each voxel, compute distance to mesh
  for (let z = 0; z < sdf.gridSize[2]; z++) {
    for (let y = 0; y < sdf.gridSize[1]; y++) {
      for (let x = 0; x < sdf.gridSize[0]; x++) {
        const pos = sdf.getPosition(x, y, z);
        const distance = pointToMeshDistance(pos, positions, indices);
        sdf.setValue(pos, distance);
      }
    }
  }
  
  // Flood fill to determine inside/outside
  floodFillSDF(sdf);
  
  return sdf;
}

/**
 * Compute distance from point to mesh
 */
function pointToMeshDistance(
  point: THREE.Vector3,
  positions: ArrayLike<number>,
  indices: ArrayLike<number>
): number {
  let minDistance = Infinity;
  
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;
    
    const a = new THREE.Vector3(positions[i0], positions[i0 + 1], positions[i0 + 2]);
    const b = new THREE.Vector3(positions[i1], positions[i1 + 1], positions[i1 + 2]);
    const c = new THREE.Vector3(positions[i2], positions[i2 + 1], positions[i2 + 2]);
    
    const dist = pointToTriangleDistance(point, a, b, c);
    minDistance = Math.min(minDistance, dist);
  }
  
  return minDistance;
}

/**
 * Compute distance from point to triangle
 */
function pointToTriangleDistance(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3
): number {
  // Implementation of point-triangle distance
  // Using barycentric coordinates
  const ab = b.clone().sub(a);
  const ac = c.clone().sub(a);
  const ap = p.clone().sub(a);
  
  const d1 = ab.dot(ap);
  const d2 = ac.dot(ap);
  
  if (d1 <= 0 && d2 <= 0) return p.distanceTo(a);
  
  const bp = p.clone().sub(b);
  const d3 = ab.dot(bp);
  const d4 = ac.dot(bp);
  
  if (d3 >= 0 && d4 <= d3) return p.distanceTo(b);
  
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const pb = a.clone().lerp(b, v);
    return p.distanceTo(pb);
  }
  
  const cp = p.clone().sub(c);
  const d5 = ab.dot(cp);
  const d6 = ac.dot(cp);
  
  if (d6 >= 0 && d5 <= d6) return p.distanceTo(c);
  
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const v = d2 / (d2 - d6);
    const pc = a.clone().lerp(c, v);
    return p.distanceTo(pc);
  }
  
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const v = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    const bc = b.clone().lerp(c, v);
    return p.distanceTo(bc);
  }
  
  // Point is inside the triangle
  const abXac = ab.clone().cross(ac);
  const dist = Math.abs(abXac.dot(ap)) / abXac.length();
  return dist;
}

/**
 * Flood fill to determine inside/outside
 */
function floodFillSDF(sdf: SignedDistanceField): void {
  const queue: [number, number, number][] = [];
  const visited = new Set<string>();
  
  // Start from all boundary voxels
  for (let x = 0; x < sdf.gridSize[0]; x++) {
    for (let y = 0; y < sdf.gridSize[1]; y++) {
      queue.push([x, y, 0]);
      queue.push([x, y, sdf.gridSize[2] - 1]);
    }
  }
  for (let x = 0; x < sdf.gridSize[0]; x++) {
    for (let z = 0; z < sdf.gridSize[2]; z++) {
      queue.push([x, 0, z]);
      queue.push([x, sdf.gridSize[1] - 1, z]);
    }
  }
  for (let y = 0; y < sdf.gridSize[1]; y++) {
    for (let z = 0; z < sdf.gridSize[2]; z++) {
      queue.push([0, y, z]);
      queue.push([sdf.gridSize[0] - 1, y, z]);
    }
  }
  
  // BFS flood fill
  while (queue.length > 0) {
    const [x, y, z] = queue.shift()!;
    const key = `${x},${y},${z}`;
    
    if (visited.has(key)) continue;
    if (x < 0 || x >= sdf.gridSize[0] ||
        y < 0 || y >= sdf.gridSize[1] ||
        z < 0 || z >= sdf.gridSize[2]) continue;
    
    visited.add(key);
    
    // Mark as outside (positive distance)
    const pos = sdf.getPosition(x, y, z);
    if (sdf.getValue(pos) > 0) {
      sdf.setValue(pos, Math.abs(sdf.getValue(pos)));
    }
    
    // Add neighbors
    queue.push([x + 1, y, z], [x - 1, y, z],
               [x, y + 1, z], [x, y - 1, z],
               [x, y, z + 1], [x, y, z - 1]);
  }
  
  // Invert interior distances
  for (let z = 0; z < sdf.gridSize[2]; z++) {
    for (let y = 0; y < sdf.gridSize[1]; y++) {
      for (let x = 0; x < sdf.gridSize[0]; x++) {
        const pos = sdf.getPosition(x, y, z);
        const val = sdf.getValue(pos);
        if (!visited.has(`${x},${y},${z}`) && val > 0) {
          sdf.setValue(pos, -val);
        }
      }
    }
  }
}

/**
 * Boolean operation on two SDFs
 */
export function sdfBoolean(
  sdf1: SignedDistanceField,
  sdf2: SignedDistanceField,
  operation: 'union' | 'intersection' | 'difference'
): SignedDistanceField {
  // Use the bounds of sdf1 for the result
  const result = new SignedDistanceField({
    resolution: sdf1.resolution,
    bounds: sdf1.bounds,
  });
  
  for (let z = 0; z < result.gridSize[2]; z++) {
    for (let y = 0; y < result.gridSize[1]; y++) {
      for (let x = 0; x < result.gridSize[0]; x++) {
        const pos = result.getPosition(x, y, z);
        const d1 = sdf1.sample(pos);
        const d2 = sdf2.sample(pos);
        
        let value: number;
        switch (operation) {
          case 'union':
            value = Math.min(d1, d2);
            break;
          case 'intersection':
            value = Math.max(d1, d2);
            break;
          case 'difference':
            value = Math.min(d1, -d2);
            break;
        }
        
        result.setValue(pos, value);
      }
    }
  }
  
  return result;
}

/**
 * Smooth union of two SDFs
 */
export function sdfSmoothUnion(
  sdf1: SignedDistanceField,
  sdf2: SignedDistanceField,
  k: number = 0.5
): SignedDistanceField {
  const result = new SignedDistanceField({
    resolution: sdf1.resolution,
    bounds: sdf1.bounds,
  });
  
  for (let z = 0; z < result.gridSize[2]; z++) {
    for (let y = 0; y < result.gridSize[1]; y++) {
      for (let x = 0; x < result.gridSize[0]; x++) {
        const pos = result.getPosition(x, y, z);
        const d1 = sdf1.sample(pos);
        const d2 = sdf2.sample(pos);
        
        // Smooth minimum
        const h = Math.max(0, Math.min(1, (d2 - d1 + k) / (2 * k)));
        const value = d2 + (d1 - d2) * h - k * h * (1 - h);
        
        result.setValue(pos, value);
      }
    }
  }
  
  return result;
}

/**
 * Offset/Surface SDF by a distance
 */
export function sdfOffset(
  sdf: SignedDistanceField,
  distance: number
): SignedDistanceField {
  const result = new SignedDistanceField({
    resolution: sdf.resolution,
    bounds: sdf.bounds,
  });
  
  for (let z = 0; z < result.gridSize[2]; z++) {
    for (let y = 0; y < result.gridSize[1]; y++) {
      for (let x = 0; x < result.gridSize[0]; x++) {
        const pos = result.getPosition(x, y, z);
        const value = sdf.sample(pos) - distance;
        result.setValue(pos, value);
      }
    }
  }
  
  return result;
}

/**
 * Extract isosurface from SDF using Marching Cubes
 */
export function extractIsosurface(
  sdf: SignedDistanceField,
  isolevel: number = 0
): THREE.BufferGeometry {
  // Simplified marching cubes implementation
  const vertices: THREE.Vector3[] = [];
  const indices: number[] = [];
  
  // This would need a full marching cubes implementation
  // For now, return empty geometry as placeholder
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
  geometry.setIndex([]);
  
  return geometry;
}

/**
 * Create SDF from primitive shapes
 */
export function createPrimitiveSDF(
  type: 'sphere' | 'box' | 'cylinder' | 'plane',
  bounds: THREE.Box3,
  resolution: number,
  params: any
): SignedDistanceField {
  const sdf = new SignedDistanceField({ resolution, bounds });
  
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  
  for (let z = 0; z < sdf.gridSize[2]; z++) {
    for (let y = 0; y < sdf.gridSize[1]; y++) {
      for (let x = 0; x < sdf.gridSize[0]; x++) {
        const pos = sdf.getPosition(x, y, z);
        const localPos = pos.clone().sub(center);
        
        let distance: number;
        
        switch (type) {
          case 'sphere':
            distance = localPos.length() - (params.radius || size.x / 2);
            break;
          case 'box':
            const halfSize = params.size ? 
              new THREE.Vector3(params.size[0]/2, params.size[1]/2, params.size[2]/2) :
              size.clone().multiplyScalar(0.5);
            const q = localPos.clone().abs().sub(halfSize);
            distance = new THREE.Vector3(
              Math.max(q.x, 0),
              Math.max(q.y, 0),
              Math.max(q.z, 0)
            ).length() + Math.min(Math.max(q.x, Math.max(q.y, q.z)), 0);
            break;
          case 'cylinder':
            const h = params.height || size.y / 2;
            const r = params.radius || Math.min(size.x, size.z) / 2;
            const d = new THREE.Vector2(localPos.x, localPos.z).length() - r;
            distance = new THREE.Vector2(Math.max(d, 0), Math.abs(localPos.y) - h).length() + 
                       Math.min(Math.max(d, Math.abs(localPos.y) - h), 0);
            break;
          case 'plane':
            distance = Math.abs(localPos.y) - (params.thickness || 0.1);
            break;
          default:
            distance = Infinity;
        }
        
        sdf.setValue(pos, distance);
      }
    }
  }
  
  return sdf;
}
