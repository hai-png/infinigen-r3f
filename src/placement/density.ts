/**
 * Density System - Placement Masking and Selection
 * 
 * Ported from: infinigen/core/placement/density.py
 * 
 * Provides density control for asset placement through
 * noise-based selection, normal filtering, and tag masking.
 */

import * as THREE from 'three';

/**
 * Tag dictionary for object classification
 * Maps tag names to numeric identifiers
 */
export type TagDictionary = Record<string, number>;

let globalTagDict: TagDictionary | null = null;

/**
 * Set the global tag dictionary
 * 
 * @param tagDict - Dictionary mapping tags to numeric IDs
 */
export function setTagDictionary(tagDict: TagDictionary): void {
  globalTagDict = tagDict;
}

/**
 * Get the current tag dictionary
 * 
 * @returns Current tag dictionary or empty object
 */
export function getTagDictionary(): TagDictionary {
  return globalTagDict || {};
}

/**
 * Configuration for placement mask generation
 */
export interface PlacementMaskConfig {
  /** Noise scale for randomization (default: 0.05) */
  scale?: number;
  /** Selection threshold (0-1, default: 0.55) */
  selectThreshold?: number | null;
  /** Normal direction threshold (default: 0.5) */
  normalThreshold?: number | null;
  /** High normal threshold for backface culling (default: 2.0) */
  normalThresholdHigh?: number | null;
  /** Preferred normal direction for placement (default: [0,0,1]) */
  normalDir?: [number, number, number];
  /** Tag filter for placement (supports comma-separated, negation with -) */
  tag?: string | null;
  /** Altitude range [min, max] for placement */
  altitudeRange?: [number, number] | null;
  /** Return scalar values instead of boolean mask */
  returnScalar?: boolean;
}

const defaultPlacementConfig: Required<PlacementMaskConfig> = {
  scale: 0.05,
  selectThreshold: 0.55,
  normalThreshold: 0.5,
  normalThresholdHigh: 2.0,
  normalDir: [0, 0, 1],
  tag: null,
  altitudeRange: null,
  returnScalar: false,
};

/**
 * Generate placement mask based on configuration
 * 
 * This function creates a filter that determines where assets
 * should be placed based on various criteria.
 * 
 * @param config - Placement configuration
 * @returns Function that evaluates placement mask at given points
 */
export function createPlacementMask(
  config: PlacementMaskConfig = {}
): (points: THREE.Vector3[], normals: THREE.Vector3[]) => Float32Array {
  const cfg = { ...defaultPlacementConfig, ...config };
  
  return (points: THREE.Vector3[], normals: THREE.Vector3[]): Float32Array => {
    const mask = new Float32Array(points.length);
    
    // Precompute noise if needed
    let noiseValues: Float32Array | null = null;
    if (cfg.selectThreshold !== null) {
      noiseValues = generateSimplexNoise(points, cfg.scale!);
    }
    
    for (let i = 0; i < points.length; i++) {
      let weight = 1.0;
      
      // Apply noise-based selection
      if (cfg.selectThreshold !== null && noiseValues) {
        const threshold = cfg.selectThreshold + (Math.random() - 0.5) * 0.05;
        if (noiseValues[i] <= threshold) {
          weight = 0;
        } else if (cfg.returnScalar) {
          // Smoothstep interpolation for scalar mode
          const t = (noiseValues[i] - threshold) / (0.75 - threshold);
          weight = smoothstep(0, 1, t);
        }
      }
      
      // Apply normal direction filtering
      if (cfg.normalThreshold !== null && weight > 0) {
        const normal = normals[i];
        const refNormal = new THREE.Vector3(...cfg.normalDir!).normalize();
        const dot = normal.dot(refNormal);
        
        if (dot < cfg.normalThreshold!) {
          weight = 0;
        }
        
        // Apply high threshold for backface culling
        if (cfg.normalThresholdHigh !== null && weight > 0) {
          const backDot = normal.dot(new THREE.Vector3().copy(refNormal).negate());
          if (backDot < -cfg.normalThresholdHigh!) {
            weight = 0;
          }
        }
      }
      
      // Apply tag filtering (if tag dict available)
      if (cfg.tag !== null && weight > 0 && globalTagDict) {
        // Tag filtering requires point-specific tag information
        // This would be implemented based on your scene's tagging system
        // For now, this is a placeholder
        const pointTag = getPointTag(points[i]);
        if (pointTag && !matchesTagFilter(pointTag, cfg.tag!)) {
          weight = 0;
        }
      }
      
      // Apply altitude range filtering
      if (cfg.altitudeRange !== null && weight > 0) {
        const [minAlt, maxAlt] = cfg.altitudeRange!;
        const altitude = points[i].y;
        
        if (altitude < minAlt || altitude > maxAlt) {
          weight = 0;
        }
      }
      
      mask[i] = weight;
    }
    
    return mask;
  };
}

/**
 * Parse tag filter string and check if point tag matches
 * 
 * Supports comma-separated tags and negation with '-' prefix
 * Example: "rock,grass" matches rock OR grass
 * Example: "water,-rock" matches water AND NOT rock
 * 
 * @param pointTag - Tag of the point
 * @param filter - Filter string
 * @returns True if tag matches filter
 */
function matchesTagFilter(pointTag: string, filter: string): boolean {
  const parts = filter.split(',').map(s => s.trim());
  let matching = true;
  
  for (const part of parts) {
    if (part.startsWith('-')) {
      // Negation: exclude this tag
      if (pointTag.includes(part.substring(1))) {
        matching = false;
        break;
      }
    } else {
      // Positive: include if contains this tag
      if (!pointTag.includes(part)) {
        matching = false;
        break;
      }
    }
  }
  
  return matching;
}

/**
 * Placeholder for point-specific tag retrieval
 * 
 * In a real implementation, this would query a spatial data structure
 * or attribute system to get the tag at a specific point.
 * 
 * @param point - 3D position
 * @returns Tag string or null
 */
function getPointTag(point: THREE.Vector3): string | null {
  // TODO: Implement based on your scene's tagging system
  // Could use octree, BVH, or other spatial indexing
  return null;
}

/**
 * Generate Simplex noise values at given points
 * 
 * @param points - Array of 3D positions
 * @param scale - Noise scale (frequency)
 * @returns Array of noise values (0-1)
 */
function generateSimplexNoise(
  points: THREE.Vector3[],
  scale: number
): Float32Array {
  const values = new Float32Array(points.length);
  
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    // Simple hash-based pseudo-noise (replace with proper Simplex/Perlin noise)
    const n = simpleHashNoise(p.x * scale, p.y * scale, p.z * scale);
    values[i] = n;
  }
  
  return values;
}

/**
 * Simple hash-based noise function
 * 
 * This is a basic implementation. For production use,
 * consider using a proper noise library like 'simplex-noise'.
 * 
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param z - Z coordinate
 * @returns Noise value in range [0, 1]
 */
function simpleHashNoise(x: number, y: number, z: number): number {
  const dot = x * 12.9898 + y * 78.233 + z * 45.5432;
  const sin = Math.sin(dot) * 43758.5453;
  return sin - Math.floor(sin);
}

/**
 * Smoothstep interpolation
 * 
 * @param edge0 - Lower edge
 * @param edge1 - Upper edge
 * @param x - Value to interpolate
 * @returns Interpolated value
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Calculate local density at points
 * 
 * @param points - Array of positions
 * @param radius - Search radius for density calculation
 * @returns Array of density values
 */
export function calculateLocalDensity(
  points: THREE.Vector3[],
  radius: number = 1.0
): Float32Array {
  const densities = new Float32Array(points.length);
  
  // Simple O(n²) implementation - optimize with spatial hashing for large datasets
  for (let i = 0; i < points.length; i++) {
    let count = 0;
    const pi = points[i];
    
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      
      const dist = pi.distanceTo(points[j]);
      if (dist < radius) {
        count++;
      }
    }
    
    densities[i] = count / (Math.PI * radius * radius);
  }
  
  return densities;
}

/**
 * Apply density-based thinning to points
 * 
 * Removes points in high-density areas to achieve more uniform distribution
 * 
 * @param points - Input points
 * @param normals - Corresponding normals
 * @param targetDensity - Desired maximum density
 * @param radius - Neighborhood radius
 * @returns Filtered points and normals
 */
export function applyDensityThinning(
  points: THREE.Vector3[],
  normals: THREE.Vector3[],
  targetDensity: number,
  radius: number = 1.0
): { points: THREE.Vector3[]; normals: THREE.Vector3[] } {
  const densities = calculateLocalDensity(points, radius);
  const keepIndices: number[] = [];
  
  for (let i = 0; i < points.length; i++) {
    // Probability of keeping point decreases with density
    const keepProb = Math.min(1, targetDensity / (densities[i] + 0.001));
    
    if (Math.random() < keepProb) {
      keepIndices.push(i);
    }
  }
  
  const filteredPoints: THREE.Vector3[] = [];
  const filteredNormals: THREE.Vector3[] = [];
  
  for (const idx of keepIndices) {
    filteredPoints.push(points[idx]);
    filteredNormals.push(normals[idx]);
  }
  
  return { points: filteredPoints, normals: filteredNormals };
}

/**
 * Create density gradient based on distance from origin or custom point
 * 
 * @param center - Center point for gradient
 * @param innerRadius - Radius where density is maximum
 * @param outerRadius - Radius where density reaches minimum
 * @param minDensity - Minimum density multiplier (0-1)
 * @returns Function that returns density multiplier at given points
 */
export function createDensityGradient(
  center: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
  innerRadius: number = 5,
  outerRadius: number = 20,
  minDensity: number = 0.1
): (points: THREE.Vector3[]) => Float32Array {
  return (points: THREE.Vector3[]): Float32Array => {
    const multipliers = new Float32Array(points.length);
    
    for (let i = 0; i < points.length; i++) {
      const dist = points[i].distanceTo(center);
      
      if (dist <= innerRadius) {
        multipliers[i] = 1.0;
      } else if (dist >= outerRadius) {
        multipliers[i] = minDensity;
      } else {
        // Smooth interpolation
        const t = (dist - innerRadius) / (outerRadius - innerRadius);
        multipliers[i] = 1.0 - (1.0 - minDensity) * smoothstep(0, 1, t);
      }
    }
    
    return multipliers;
  };
}
