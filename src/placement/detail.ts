/**
 * Detail System - Mesh Resolution Adaptation
 * 
 * Ported from: infinigen/core/placement/detail.py
 * 
 * Provides adaptive mesh resolution based on camera distance,
 * supporting remeshing, subdivision, and merging operations.
 */

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Configuration for detail level operations
 */
export interface DetailConfig {
  /** Global multiplier for face size calculation */
  globalMultiplier?: number;
  /** Minimum face size clamp */
  globalClipMin?: number;
  /** Maximum face size clamp */
  globalClipMax?: number;
  /** Scatter resolution distance */
  scatterResDistance?: number;
}

const defaultConfig: DetailConfig = {
  globalMultiplier: 1,
  globalClipMin: 0.003,
  globalClipMax: 1,
  scatterResDistance: 4,
};

/**
 * Calculate target face size based on camera distance
 * 
 * @param obj - Object or position to calculate detail for
 * @param camera - Three.js camera (uses scene camera if not provided)
 * @param config - Detail configuration
 * @returns Target face size in world units
 */
export function calculateTargetFaceSize(
  obj: THREE.Object3D | THREE.Vector3 | number,
  camera?: THREE.Camera,
  config: DetailConfig = {}
): number {
  const cfg = { ...defaultConfig, ...config };
  
  if (!camera) {
    return cfg.globalClipMin!;
  }

  let dist: number;
  
  if (obj instanceof THREE.Object3D) {
    // Calculate distance from camera to closest point on object's bounding box
    const bbox = new THREE.Box3().setFromObject(obj);
    const cameraPos = camera.getWorldPosition(new THREE.Vector3());
    
    // Find closest point on bbox to camera
    const closestPoint = bbox.clampPoint(cameraPos, new THREE.Vector3());
    dist = cameraPos.distanceTo(closestPoint);
  } else if (obj instanceof THREE.Vector3) {
    const cameraPos = camera.getWorldPosition(new THREE.Vector3());
    dist = cameraPos.distanceTo(obj);
  } else if (typeof obj === 'number') {
    dist = obj;
  } else {
    throw new Error(`Invalid object type for targetFaceSize: ${typeof obj}`);
  }

  // Calculate pixel dimensions at distance
  const camData = camera as THREE.PerspectiveCamera;
  
  if (!camData.isPerspectiveCamera && !camData.isOrthographicCamera) {
    return cfg.globalClipMin!;
  }

  // For perspective camera
  if (camData.isPerspectiveCamera) {
    const fov = camData.fov * (Math.PI / 180);
    const aspect = camData.aspect;
    
    // Calculate sensor dimensions at distance
    const sensorHeight = 2 * Math.tan(fov / 2) * dist;
    const sensorWidth = sensorHeight * aspect;
    
    // Get render resolution
    const pixelWidth = camData.viewport?.width || 1920;
    const pixelHeight = camData.viewport?.height || 1080;
    
    // Calculate pixel dimensions in world space
    const pixelDimX = sensorWidth / pixelWidth;
    const pixelDimY = sensorHeight / pixelHeight;
    
    const res = Math.min(pixelDimX, pixelDimY);
    
    return Math.max(
      cfg.globalClipMin!,
      Math.min(cfg.globalClipMax!, cfg.globalMultiplier! * res)
    );
  }
  
  // For orthographic camera
  const frustumHeight = camData.top - camData.bottom;
  const frustumWidth = camData.right - camData.left;
  
  const pixelWidth = camData.viewport?.width || 1920;
  const pixelHeight = camData.viewport?.height || 1080;
  
  const pixelDimX = frustumWidth / pixelWidth;
  const pixelDimY = frustumHeight / pixelHeight;
  
  const res = Math.min(pixelDimX, pixelDimY);
  
  return Math.max(
    cfg.globalClipMin!,
    Math.min(cfg.globalClipMax!, cfg.globalMultiplier! * res)
  );
}

/**
 * Remesh geometry to target face size
 * 
 * Note: This is a simplified version. Full remeshing requires
 * external libraries like geometry-processing-js or custom implementation.
 * 
 * @param geometry - Input geometry
 * @param faceSize - Target face size
 * @returns Remeshed geometry (or same if operation not available)
 */
export function remeshGeometry(
  geometry: THREE.BufferGeometry,
  faceSize: number,
  minRemeshSize?: number
): THREE.BufferGeometry {
  const effectiveSize = minRemeshSize 
    ? Math.max(faceSize, minRemeshSize)
    : faceSize;
  
  console.debug(`Remeshing geometry to voxel size: ${effectiveSize.toFixed(4)}`);
  
  // TODO: Implement actual remeshing using external library
  // For now, return original geometry with warning
  console.warn('Full remeshing not yet implemented. Consider using simplify-geometry or similar library.');
  
  return geometry;
}

/**
 * Subdivide geometry to reach target face size
 * 
 * @param geometry - Input geometry
 * @param fromFaceSize - Current approximate face size
 * @param toFaceSize - Target face size
 * @param maxLevels - Maximum subdivision levels
 * @returns Subdivided geometry
 */
export function subdivideToFaceSize(
  geometry: THREE.BufferGeometry,
  fromFaceSize: number,
  toFaceSize: number,
  maxLevels: number = 6
): THREE.BufferGeometry {
  if (toFaceSize >= fromFaceSize) {
    console.warn(
      `subdivideToFaceSize: fromFaceSize (${fromFaceSize}) < toFaceSize (${toFaceSize}). ` +
      'Subdivision cannot increase face size.'
    );
    return geometry;
  }

  const levels = Math.ceil(Math.log2(fromFaceSize / toFaceSize));
  const clampedLevels = Math.min(levels, maxLevels);
  
  if (clampedLevels < levels) {
    console.warn(
      `subdivideToFaceSize: attempted ${levels} levels, clamping to ${maxLevels}`
    );
  }

  console.debug(`Subdividing geometry: ${clampedLevels} levels`);
  
  // Use Three.js SubdivisionModifier if available
  // For now, return original geometry
  // TODO: Integrate with @react-three/drei or implement Loop subdivision
  
  return geometry;
}

/**
 * Merge vertices by distance threshold
 * 
 * @param geometry - Input geometry
 * @param distance - Merge threshold
 * @returns Geometry with merged vertices
 */
export function mergeByDistance(
  geometry: THREE.BufferGeometry,
  distance: number
): THREE.BufferGeometry {
  console.debug(`Merging vertices with threshold: ${distance.toFixed(6)}`);
  
  try {
    const merged = mergeVertices(geometry, distance);
    return merged;
  } catch (error) {
    console.error('Failed to merge vertices:', error);
    return geometry;
  }
}

/**
 * Calculate min and max edge lengths in geometry
 * 
 * @param geometry - Input geometry
 * @returns Tuple of [minEdgeLength, maxEdgeLength]
 */
export function getMinMaxEdgeLengths(
  geometry: THREE.BufferGeometry
): [number, number] {
  const positions = geometry.attributes.position.array as Float32Array;
  const index = geometry.index;
  
  if (!index) {
    // Non-indexed geometry - estimate from vertex density
    const bbox = new THREE.Box3().setFromObject(
      new THREE.Mesh(geometry)
    );
    const diagonal = bbox.max.distanceTo(bbox.min);
    const approxEdgeLength = diagonal / Math.sqrt(positions.length / 3);
    return [approxEdgeLength, approxEdgeLength * 2];
  }
  
  const indices = index.array;
  const edgeLengths: number[] = [];
  
  // Sample edges (not all for performance)
  const sampleRate = Math.max(1, Math.floor(indices.length / 1000));
  
  for (let i = 0; i < indices.length; i += 3 * sampleRate) {
    const i0 = indices[i];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];
    
    const v0 = new THREE.Vector3(
      positions[i0 * 3],
      positions[i0 * 3 + 1],
      positions[i0 * 3 + 2]
    );
    const v1 = new THREE.Vector3(
      positions[i1 * 3],
      positions[i1 * 3 + 1],
      positions[i1 * 3 + 2]
    );
    const v2 = new THREE.Vector3(
      positions[i2 * 3],
      positions[i2 * 3 + 1],
      positions[i2 * 3 + 2]
    );
    
    edgeLengths.push(v0.distanceTo(v1));
    edgeLengths.push(v1.distanceTo(v2));
    edgeLengths.push(v2.distanceTo(v0));
  }
  
  edgeLengths.sort((a, b) => a - b);
  
  const len = edgeLengths.length;
  if (len <= 4) {
    return [edgeLengths[0] || 0.01, edgeLengths[len - 1] || 0.01];
  }
  
  // Return 25th and 75th percentile
  return [
    edgeLengths[Math.floor(len * 0.25)],
    edgeLengths[Math.floor(len * 0.75)]
  ];
}

/**
 * Adapt mesh resolution based on method
 * 
 * @param geometry - Input geometry
 * @param faceSize - Target face size
 * @param method - Adaptation method
 * @param approx - Approximation factor for area-based methods (0-0.5)
 * @returns Adapted geometry
 */
export type AdaptMethod = 
  | 'subdivide'
  | 'subdiv_by_area'
  | 'merge_down'
  | 'remesh'
  | 'sharp_remesh';

export function adaptMeshResolution(
  geometry: THREE.BufferGeometry,
  faceSize: number,
  method: AdaptMethod,
  approx: number = 0.2
): THREE.BufferGeometry {
  if (faceSize <= 0) {
    throw new Error('faceSize must be positive');
  }
  
  if (approx < 0 || approx > 0.5) {
    throw new Error('approx must be between 0 and 0.5');
  }

  console.debug(
    `Adapting mesh resolution: method=${method}, faceSize=${faceSize.toFixed(6)}`
  );

  // Check if geometry has polygons
  const indexCount = geometry.index?.count || geometry.attributes.position.count;
  if (indexCount === 0) {
    console.debug('Ignoring adaptMeshResolution: no polygons');
    return geometry;
  }

  const [lmin, lmax] = getMinMaxEdgeLengths(geometry);

  switch (method) {
    case 'subdivide':
      if (lmax > faceSize) {
        return subdivideToFaceSize(geometry, lmax, faceSize);
      }
      break;
      
    case 'subdiv_by_area': {
      // Estimate average face area
      const totalArea = estimateSurfaceArea(geometry);
      const faceCount = geometry.index 
        ? geometry.index.count / 3 
        : geometry.attributes.position.count / 3;
      const avgArea = totalArea / Math.max(1, faceCount);
      const approxFaceSize = Math.sqrt(avgArea * (1 - approx));
      
      if (approxFaceSize > faceSize) {
        return subdivideToFaceSize(geometry, approxFaceSize, faceSize);
      }
      break;
    }
    
    case 'merge_down':
      if (lmin < faceSize) {
        return mergeByDistance(geometry, faceSize);
      }
      break;
      
    case 'remesh':
      return remeshGeometry(geometry, faceSize);
      
    case 'sharp_remesh':
      // Sharp remesh preserves features better
      return remeshGeometry(geometry, faceSize);
      
    default:
      throw new Error(`Unrecognized adaptMeshResolution method: ${method}`);
  }

  return geometry;
}

/**
 * Estimate surface area of geometry
 * 
 * @param geometry - Input geometry
 * @returns Estimated surface area
 */
export function estimateSurfaceArea(geometry: THREE.BufferGeometry): number {
  const positions = geometry.attributes.position.array as Float32Array;
  const index = geometry.index;
  
  if (!index) {
    // Non-indexed: assume triangles
    const totalArea = positions.length / 9; // 3 vertices * 3 coords per triangle
    const bbox = new THREE.Box3().setFromObject(new THREE.Mesh(geometry));
    const diagonal = bbox.max.distanceTo(bbox.min);
    return totalArea * (diagonal * diagonal / 10); // Rough estimate
  }
  
  const indices = index.array;
  let totalArea = 0;
  
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];
    
    const v0 = new THREE.Vector3(
      positions[i0 * 3],
      positions[i0 * 3 + 1],
      positions[i0 * 3 + 2]
    );
    const v1 = new THREE.Vector3(
      positions[i1 * 3],
      positions[i1 * 3 + 1],
      positions[i1 * 3 + 2]
    );
    const v2 = new THREE.Vector3(
      positions[i2 * 3],
      positions[i2 * 3 + 1],
      positions[i2 * 3 + 2]
    );
    
    // Triangle area using cross product
    const edge1 = new THREE.Vector3().subVectors(v1, v0);
    const edge2 = new THREE.Vector3().subVectors(v2, v0);
    const cross = new THREE.Vector3().crossVectors(edge1, edge2);
    totalArea += cross.length() / 2;
  }
  
  return totalArea;
}

/**
 * Scattering resolution based on distance
 * 
 * @param distance - Distance from camera
 * @param config - Configuration
 * @returns Recommended scatter resolution
 */
export function getScatterResDistance(
  distance: number,
  config: DetailConfig = {}
): number {
  const cfg = { ...defaultConfig, ...config };
  return cfg.scatterResDistance! * (distance / 10);
}
