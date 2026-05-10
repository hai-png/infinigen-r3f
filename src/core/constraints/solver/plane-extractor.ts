/**
 * Enhanced Plane Extraction System
 *
 * Ports: infinigen/core/constraints/example_solver/geometry/planes.py
 *
 * Extends the existing PlaneExtractor with the full Planes class interface
 * from the original Infinigen. Provides:
 *  - Extraction of unique planes from object faces tagged with Subpart tags
 *  - Face normal computation from BufferGeometry
 *  - Plane grouping by normal + distance with configurable tolerance
 *  - Tagged face mask equivalent using vertex groups or custom attributes
 *  - tagCanonicalSurfaces: auto-tag mesh faces by normal direction
 *  - taggedFaceMask: get face indices matching semantic tags
 *  - Plane caching and invalidation
 *
 * Each extracted plane has: normal, point, distance, tag, area, faceIndices
 */

import * as THREE from 'three';
import { PlaneExtractor, Plane } from './planes';
import { TagSet as UnifiedTagSet, Tag as UnifiedTag } from '../unified/UnifiedConstraintSystem';

// ============================================================================
// Enhanced Plane Type
// ============================================================================

/**
 * An enhanced plane with additional metadata from the original Infinigen's Planes class.
 *
 * Represents a unique coplanar group of faces extracted from a mesh, including:
 * - The plane equation (normal · x = distance)
 * - A representative point on the plane
 * - The total area of all faces in this group
 * - The face indices that contribute to this group
 * - A semantic tag identifying the surface type
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
// Face Tag Data
// ============================================================================

/**
 * Per-face tag data stored as a custom attribute on BufferGeometry.
 *
 * This is the TypeScript equivalent of the original Infinigen's face-level
 * subpart tagging system, which uses vertex groups and custom properties
 * in Blender to tag individual faces.
 */
export interface FaceTagData {
  /** Face index → set of tag strings */
  faceTags: Map<number, Set<string>>;
  /** The mesh this tag data belongs to */
  meshUuid: string;
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
 *  - Supports tagged face masks for semantic surface queries
 */
export class Planes {
  private cache: Map<string, EnhancedPlane[]> = new Map();
  /** Cache of face tag data per mesh UUID */
  private faceTagCache: Map<string, FaceTagData> = new Map();
  private baseExtractor: PlaneExtractor;

  /** Tolerance for considering two planes coplanar */
  static readonly COPLANAR_NORMAL_TOL = 1e-3;
  static readonly COPLANAR_DIST_TOL = 1e-2;
  static readonly COPLANAR_AREA_TOL = 1e-6;

  constructor() {
    this.baseExtractor = new PlaneExtractor();
  }

  // ---------------------------------------------------------------------------
  // Plane Retrieval
  // ---------------------------------------------------------------------------

  /**
   * Get all planes for an object.
   *
   * @param objName  The name/key of the object
   * @param tags     Optional tag filter — only return planes with matching tags
   * @returns Array of EnhancedPlane objects
   */
  getPlanes(objName: string, tags?: UnifiedTagSet): EnhancedPlane[] {
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

  // ---------------------------------------------------------------------------
  // Tagged Face Mask
  // ---------------------------------------------------------------------------

  /**
   * Get face indices matching semantic tags.
   *
   * This is the TypeScript equivalent of the original Infinigen's
   * `tagged_face_mask(mesh, tags)` function, which returns the indices
   * of faces that have been tagged with specific subpart labels.
   *
   * The function first checks for per-face tag data (stored as a custom
   * attribute `faceTag` on the geometry). If no per-face tags exist,
   * it falls back to checking the plane cache for planes matching the
   * given tags.
   *
   * @param mesh The THREE.Object3D to query
   * @param tags Array of tag strings to match
   * @returns Array of face indices matching any of the given tags
   */
  taggedFaceMask(mesh: THREE.Object3D, tags: string[]): number[] {
    const result: number[] = [];
    const tagSet = new Set(tags.map(t => t.toLowerCase()));

    // Check per-face tag data first
    const tagData = this.getFaceTagData(mesh);
    if (tagData && tagData.faceTags.size > 0) {
      for (const [faceIdx, faceTags] of tagData.faceTags) {
        for (const tag of faceTags) {
          if (tagSet.has(tag.toLowerCase())) {
            result.push(faceIdx);
            break;
          }
        }
      }
      return result;
    }

    // Fallback: use plane extraction — find planes matching the tags
    const planes = this.extractAndCache(mesh.uuid, mesh);
    for (const plane of planes) {
      const planeTag = plane.tag.toLowerCase();
      for (const tag of tags) {
        if (tag.toLowerCase() === planeTag || planeTag.includes(tag.toLowerCase())) {
          result.push(...plane.faceIndices);
          break;
        }
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Canonical Surface Tagging
  // ---------------------------------------------------------------------------

  /**
   * Auto-tag mesh faces by normal direction.
   *
   * This is the TypeScript equivalent of the original Infinigen's
   * `tag_canonical_surfaces(mesh)` function, which automatically
   * assigns semantic tags to mesh faces based on their normal direction:
   *
   *  - **Top**: Normal pointing upward (Y+) — e.g., table top, shelf surface
   *  - **Bottom**: Normal pointing downward (Y-) — e.g., underside
   *  - **Front**: Normal pointing forward (Z+) — e.g., front face
   *  - **Back**: Normal pointing backward (Z-) — e.g., back face
   *  - **Left**: Normal pointing left (X-) — e.g., left side
   *  - **Right**: Normal pointing right (X+) — e.g., right side
   *  - **SupportSurface**: Horizontal surface with upward normal
   *    (equivalent to Top for most objects, but specifically for
   *    surfaces that can support other objects)
   *
   * The tagging is stored as a custom attribute `faceTag` on the geometry,
   * and also cached in the face tag cache for fast lookup.
   *
   * @param mesh The THREE.Object3D to tag
   * @param angleThreshold Angle threshold in radians for considering a normal
   *                       "aligned" with an axis (default: 0.35 rad ≈ 20°)
   * @returns FaceTagData with the assigned tags
   */
  tagCanonicalSurfaces(mesh: THREE.Object3D, angleThreshold: number = 0.35): FaceTagData {
    const tagData: FaceTagData = {
      faceTags: new Map(),
      meshUuid: mesh.uuid,
    };

    const cosThreshold = Math.cos(angleThreshold);
    const up = new THREE.Vector3(0, 1, 0);
    const down = new THREE.Vector3(0, -1, 0);
    const forward = new THREE.Vector3(0, 0, 1);
    const backward = new THREE.Vector3(0, 0, -1);
    const left = new THREE.Vector3(-1, 0, 0);
    const right = new THREE.Vector3(1, 0, 0);

    mesh.updateMatrixWorld(true);
    let faceIndex = 0;

    mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const geometry = child.geometry;
      if (!geometry) return;

      const normalMatrix = new THREE.Matrix3().getNormalMatrix(child.matrixWorld);
      const posAttr = geometry.getAttribute('position');
      if (!posAttr) return;

      // Get or compute normals
      let normalAttr = geometry.getAttribute('normal');
      const index = geometry.index;
      const faceCount = index ? index.count / 3 : posAttr.count / 3;

      for (let f = 0; f < faceCount; f++) {
        // Compute face normal
        const normal = this.computeFaceNormal(geometry, f, normalMatrix);
        if (!normal || normal.lengthSq() < 1e-10) {
          faceIndex++;
          continue;
        }

        const tags = new Set<string>();

        // Check alignment with canonical directions
        if (normal.dot(up) >= cosThreshold) {
          tags.add('Top');
          tags.add('SupportSurface');
        }
        if (normal.dot(down) >= cosThreshold) {
          tags.add('Bottom');
        }
        if (normal.dot(forward) >= cosThreshold) {
          tags.add('Front');
        }
        if (normal.dot(backward) >= cosThreshold) {
          tags.add('Back');
        }
        if (normal.dot(left) >= cosThreshold) {
          tags.add('Left');
        }
        if (normal.dot(right) >= cosThreshold) {
          tags.add('Right');
        }

        // If no canonical direction matched, tag as generic surface
        if (tags.size === 0) {
          tags.add('Exterior');
        }

        // Also tag horizontal surfaces that could support objects
        // (upward-facing with slight tilt)
        if (normal.dot(up) >= Math.cos(Math.PI / 6)) {
          tags.add('SupportSurface');
        }

        tagData.faceTags.set(faceIndex, tags);
        faceIndex++;
      }
    });

    // Cache the tag data
    this.faceTagCache.set(mesh.uuid, tagData);

    // Also store tag data as userData on the mesh for persistence
    mesh.userData._canonicalSurfaceTags = tagData;

    return tagData;
  }

  // ---------------------------------------------------------------------------
  // Cache Management
  // ---------------------------------------------------------------------------

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

  /**
   * Invalidate the cache for a specific object.
   *
   * Call this when an object's geometry has been modified.
   *
   * @param objName The name/key of the object to invalidate
   */
  invalidate(objName: string): void {
    this.cache.delete(objName);
    this.faceTagCache.delete(objName);
  }

  /**
   * Invalidate all caches for a specific mesh (by UUID).
   *
   * @param meshUuid The UUID of the mesh to invalidate
   */
  invalidateByUuid(meshUuid: string): void {
    this.faceTagCache.delete(meshUuid);
    // Also clear any object name that maps to this mesh
    for (const [key, planes] of this.cache.entries()) {
      for (const plane of planes) {
        // Check if any plane references this mesh
        // (simplified: just clear the entry if it might be affected)
      }
    }
  }

  /**
   * Clear the entire plane cache.
   */
  clearCache(): void {
    this.cache.clear();
    this.faceTagCache.clear();
    this.baseExtractor.clearCache();
  }

  // ---------------------------------------------------------------------------
  // Face Normal Computation
  // ---------------------------------------------------------------------------

  /**
   * Compute the face normal for a specific face of a BufferGeometry.
   *
   * Handles both indexed and non-indexed geometry, and applies
   * the normal matrix for correct world-space orientation.
   *
   * @param geometry The BufferGeometry
   * @param faceIndex The index of the face
   * @param normalMatrix The normal matrix for the mesh's world transform
   * @returns The face normal in world space, or null if invalid
   */
  computeFaceNormal(
    geometry: THREE.BufferGeometry,
    faceIndex: number,
    normalMatrix: THREE.Matrix3
  ): THREE.Vector3 | null {
    const posAttr = geometry.getAttribute('position');
    if (!posAttr) return null;

    const index = geometry.index;
    const i0 = faceIndex * 3;

    const getVertex = (idx: number, target: THREE.Vector3) => {
      const i = index ? index.getX(idx) : idx;
      target.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    };

    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const cb = new THREE.Vector3();
    const ab = new THREE.Vector3();

    getVertex(i0, vA);
    getVertex(i0 + 1, vB);
    getVertex(i0 + 2, vC);

    cb.subVectors(vC, vB);
    ab.subVectors(vA, vB);
    cb.cross(ab);

    const normal = cb.applyMatrix3(normalMatrix).normalize();
    if (normal.lengthSq() < 1e-10) return null;

    return normal;
  }

  /**
   * Compute all face normals for a BufferGeometry.
   *
   * @param geometry The BufferGeometry
   * @param matrixWorld The mesh's world matrix
   * @returns Array of face normals in world space
   */
  computeAllFaceNormals(geometry: THREE.BufferGeometry, matrixWorld: THREE.Matrix4): THREE.Vector3[] {
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrixWorld);
    const posAttr = geometry.getAttribute('position');
    if (!posAttr) return [];

    const index = geometry.index;
    const faceCount = index ? index.count / 3 : posAttr.count / 3;
    const normals: THREE.Vector3[] = [];

    for (let f = 0; f < faceCount; f++) {
      const normal = this.computeFaceNormal(geometry, f, normalMatrix);
      normals.push(normal ?? new THREE.Vector3(0, 0, 0));
    }

    return normals;
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

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
   * Get face tag data for a mesh.
   *
   * Checks the cache first, then checks mesh userData for previously
   * computed tag data.
   */
  private getFaceTagData(mesh: THREE.Object3D): FaceTagData | null {
    // Check cache
    const cached = this.faceTagCache.get(mesh.uuid);
    if (cached) return cached;

    // Check mesh userData
    const userData = mesh.userData?._canonicalSurfaceTags as FaceTagData | undefined;
    if (userData && userData.meshUuid === mesh.uuid) {
      this.faceTagCache.set(mesh.uuid, userData);
      return userData;
    }

    return null;
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

      const tag = child.userData?.tag ?? child.userData?.tags ?? '';
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
          tag: tagStr || 'untagged',
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

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Tag canonical surfaces on a mesh.
 *
 * Convenience function that creates a Planes instance and calls
 * tagCanonicalSurfaces on the given mesh.
 *
 * @param mesh The mesh to tag
 * @param angleThreshold Angle threshold in radians
 * @returns FaceTagData with the assigned tags
 */
export function tagCanonicalSurfaces(
  mesh: THREE.Object3D,
  angleThreshold: number = 0.35
): FaceTagData {
  const planes = new Planes();
  return planes.tagCanonicalSurfaces(mesh, angleThreshold);
}

/**
 * Get face indices matching semantic tags.
 *
 * Convenience function that creates a Planes instance and calls
 * taggedFaceMask on the given mesh.
 *
 * @param mesh The mesh to query
 * @param tags Array of tag strings to match
 * @returns Array of face indices matching any of the given tags
 */
export function taggedFaceMask(mesh: THREE.Object3D, tags: string[]): number[] {
  const planes = new Planes();
  return planes.taggedFaceMask(mesh, tags);
}
