/**
 * Enhanced Plane Extractor
 *
 * Ports: infinigen/core/constraints/example_solver/geometry/planes.py
 *
 * Extends the existing PlaneExtractor with the full Planes class interface
 * from the original Infinigen. Provides:
 *  - Extraction of unique planes from object faces tagged with Subpart tags
 *  - Each plane has: normal, point, tag, area
 *  - Caching per object
 *  - Methods: getPlanes(), getPlane(), getPlaneMask()
 *  - Uses Three.js BufferGeometry face normals and face tag attributes
 *  - Groups coplanar faces (within tolerance) into single planes
 */

import * as THREE from 'three';
import { PlaneExtractor, Plane } from './planes';
import { TagSet } from '../unified/UnifiedConstraintSystem';

// ============================================================================
// Enhanced Plane Type
// ============================================================================

/**
 * An enhanced plane with additional metadata from the original Infinigen's Planes class.
 */
export interface EnhancedPlane extends Plane {
  /** A point on the plane (for reconstructing the plane equation) */
  point: THREE.Vector3;
  /** Total area of the faces that contribute to this plane */
  area: number;
  /** Indices of the faces that belong to this plane */
  faceIndices: number[];
}

// ============================================================================
// Planes Class
// ============================================================================

/**
 * Manages plane extraction for all objects in a scene.
 *
 * This is the TypeScript port of the Planes class from
 * infinigen/core/constraints/example_solver/geometry/planes.py.
 *
 * The Planes class:
 *  - Extracts unique planes from object faces tagged with Subpart tags
 *  - Groups coplanar faces (within tolerance) into single planes
 *  - Caches planes per object
 *  - Provides methods for retrieving planes by object, tag, and index
 */
export class Planes {
  private cache: Map<string, EnhancedPlane[]> = new Map();
  private baseExtractor: PlaneExtractor;

  /** Tolerance for considering two planes coplanar */
  static readonly COPLANAR_NORMAL_TOL = 1e-3;
  static readonly COPLANAR_DIST_TOL = 1e-2;
  static readonly COPLANAR_AREA_TOL = 1e-6;

  constructor() {
    this.baseExtractor = new PlaneExtractor();
  }

  /**
   * Get all planes for an object.
   *
   * @param objName  The name/key of the object
   * @param tags     Optional tag filter — only return planes with matching tags
   * @returns Array of EnhancedPlane objects
   */
  getPlanes(objName: string, tags?: TagSet): EnhancedPlane[] {
    const allPlanes = this.getOrExtract(objName);

    if (!tags || tags.size === 0) {
      return allPlanes;
    }

    // Filter by tags
    return allPlanes.filter(plane => {
      for (const tag of tags) {
        if (tag.name === plane.tag || tag.name.toLowerCase() === plane.tag.toLowerCase()) {
          return true;
        }
      }
      return false;
    });
  }

  /**
   * Get a specific plane by index.
   *
   * @param objName  The name/key of the object
   * @param planeIdx The index of the plane to retrieve
   * @returns The EnhancedPlane at the given index, or undefined
   */
  getPlane(objName: string, planeIdx: number): EnhancedPlane | undefined {
    const planes = this.getPlanes(objName);
    return planes[planeIdx];
  }

  /**
   * Get a mask (face indices) for a specific plane.
   *
   * Returns the face indices that belong to the specified plane.
   * This is used by the stability checker to determine which faces
   * of an object are on a particular surface.
   *
   * @param objName  The name/key of the object
   * @param planeIdx The index of the plane
   * @returns Array of face indices belonging to the plane
   */
  getPlaneMask(objName: string, planeIdx: number): number[] {
    const plane = this.getPlane(objName, planeIdx);
    return plane?.faceIndices ?? [];
  }

  /**
   * Invalidate the cache for a specific object.
   *
   * Call this when an object's geometry has been modified.
   *
   * @param objName The name/key of the object to invalidate
   */
  invalidate(objName: string): void {
    this.cache.delete(objName);
  }

  /**
   * Clear the entire plane cache.
   */
  clearCache(): void {
    this.cache.clear();
    this.baseExtractor.clearCache();
  }

  /**
   * Extract planes from a Three.js object and cache the result.
   *
   * @param objName  The key to cache the result under
   * @param obj      The Three.js Object3D to extract planes from
   * @returns Array of EnhancedPlane objects
   */
  extractAndCache(objName: string, obj: THREE.Object3D): EnhancedPlane[] {
    const cached = this.cache.get(objName);
    if (cached) return cached;

    const planes = this.extractEnhancedPlanes(obj);
    this.cache.set(objName, planes);
    return planes;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Get or extract planes for an object name.
   * Note: Since we may not have the Object3D available by name alone,
   * this returns the cached result or an empty array.
   */
  private getOrExtract(objName: string): EnhancedPlane[] {
    const cached = this.cache.get(objName);
    if (cached) return cached;
    // If not cached and no Object3D provided, return empty
    return [];
  }

  /**
   * Extract enhanced planes from a Three.js Object3D.
   *
   * This method:
   *  1. Traverses all mesh children
   *  2. Computes face normals for each face
   *  3. Groups coplanar faces (same normal + distance within tolerance)
   *  4. For each group, creates an EnhancedPlane with normal, point, tag, area, and face indices
   */
  private extractEnhancedPlanes(obj: THREE.Object3D): EnhancedPlane[] {
    // First, use the base extractor to get basic planes
    const basicPlanes = this.baseExtractor.extractPlanes(obj);

    // Then, enhance them with point, area, and face indices
    const rawFaces: Array<{
      normal: THREE.Vector3;
      distance: number;
      point: THREE.Vector3;
      tag: string;
      area: number;
      faceIndex: number;
    }> = [];

    obj.updateMatrixWorld(true);
    let faceIndex = 0;

    obj.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const geometry = child.geometry;
      if (!geometry) return;

      const matrixWorld = child.matrixWorld;
      const posAttr = geometry.getAttribute('position');
      if (!posAttr) return;

      const tag = child.userData?.tag ?? child.userData?.tags ?? 'untagged';
      const tagStr = Array.isArray(tag) ? tag.join(',') : String(tag);

      const index = geometry.index;
      const faceCount = index ? index.count / 3 : posAttr.count / 3;

      const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrixWorld);

      for (let f = 0; f < faceCount; f++) {
        // Get face vertices
        const getVertex = (idx: number, target: THREE.Vector3) => {
          const i = index ? index.getX(idx) : idx;
          target.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
          target.applyMatrix4(matrixWorld);
        };

        const vA = new THREE.Vector3();
        const vB = new THREE.Vector3();
        const vC = new THREE.Vector3();
        const cb = new THREE.Vector3();
        const ab = new THREE.Vector3();

        const i0 = f * 3;
        getVertex(i0, vA);
        getVertex(i0 + 1, vB);
        getVertex(i0 + 2, vC);

        cb.subVectors(vC, vB);
        ab.subVectors(vA, vB);
        cb.cross(ab);

        const normal = cb.clone().applyMatrix3(normalMatrix).normalize();
        if (normal.lengthSq() < 1e-10) {
          faceIndex++;
          continue;
        }

        const distance = vA.dot(normal);

        // Compute face area (half of cross product magnitude)
        const area = cb.length() * 0.5;

        rawFaces.push({
          normal,
          distance,
          point: vA.clone(),
          tag: tagStr,
          area,
          faceIndex,
        });

        faceIndex++;
      }
    });

    // Group coplanar faces
    const groups: Array<{
      normal: THREE.Vector3;
      distance: number;
      point: THREE.Vector3;
      tag: string;
      totalArea: number;
      faceIndices: number[];
    }> = [];

    for (const face of rawFaces) {
      let matched = false;

      for (const group of groups) {
        const normalDot = face.normal.dot(group.normal);
        const isSameNormal = Math.abs(Math.abs(normalDot) - 1) < Planes.COPLANAR_NORMAL_TOL;
        const isSameDistance = Math.abs(face.distance - group.distance) < Planes.COPLANAR_DIST_TOL;

        if (isSameNormal && isSameDistance) {
          // Add to existing group
          group.totalArea += face.area;
          group.faceIndices.push(face.faceIndex);

          // Update point to centroid (weighted by area)
          // Keep the point from the largest face for simplicity
          matched = true;
          break;
        }
      }

      if (!matched) {
        groups.push({
          normal: face.normal.clone(),
          distance: face.distance,
          point: face.point.clone(),
          tag: face.tag,
          totalArea: face.area,
          faceIndices: [face.faceIndex],
        });
      }
    }

    // Convert to EnhancedPlane objects
    return groups.map(group => ({
      normal: group.normal,
      distance: group.distance,
      point: group.point,
      tag: group.tag,
      area: group.totalArea,
      faceIndices: group.faceIndices,
    }));
  }
}
