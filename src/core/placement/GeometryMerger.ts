/**
 * GeometryMerger — Shared geometry merge utility for the placement system
 *
 * Wraps GeometryPipeline.mergeGeometries() and adds placement-specific
 * utilities like mergeWithTransform (merge geometry with position/rotation/scale
 * applied) and mergeInstanced (merge multiple instances of the same geometry).
 *
 * All placement code should use this instead of custom mergeGeometries implementations.
 *
 * Usage:
 * ```ts
 * // Simple merge
 * const merged = GeometryMerger.merge([geo1, geo2, geo3]);
 *
 * // Merge with transform applied
 * const transformed = GeometryMerger.mergeWithTransform(
 *   baseGeo, position, rotation, scale,
 * );
 *
 * // Merge multiple instances of the same geometry
 * const instanced = GeometryMerger.mergeInstanced(baseGeo, transforms);
 *
 * // Merge and center at origin
 * const centered = GeometryMerger.mergeAndCenter([geo1, geo2]);
 * ```
 *
 * @module placement
 */

import * as THREE from 'three';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';

// ============================================================================
// GeometryMerger
// ============================================================================

/**
 * Static utility class for geometry merging operations in the placement system.
 *
 * Provides a canonical interface for:
 *   - Merging multiple geometries into one
 *   - Merging geometry with a transform applied
 *   - Merging multiple instances of the same geometry with different transforms
 *   - Centering merged geometry at origin
 *
 * Delegates core merge logic to GeometryPipeline.mergeGeometries() which
 * handles indexed/non-indexed geometries, preserves attributes, and
 * correctly offsets indices.
 */
export class GeometryMerger {
  /**
   * Canonical merge — delegates to GeometryPipeline.mergeGeometries().
   *
   * Merges an array of BufferGeometries into a single geometry.
   * Handles both indexed and non-indexed geometries, merges position,
   * normal, and UV attributes, and correctly offsets index values.
   *
   * @param geometries  Array of BufferGeometries to merge
   * @returns A single merged BufferGeometry
   */
  static merge(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    return GeometryPipeline.mergeGeometries(geometries);
  }

  /**
   * Merge geometry with a transform applied.
   *
   * Clones the geometry, applies the given position/rotation/scale
   * as a 4x4 matrix, and returns the transformed geometry.
   * Does NOT merge with other geometries — use merge() for that.
   *
   * @param geometry   The source geometry to transform
   * @param position   World-space position
   * @param rotation   Euler rotation
   * @param scale      Non-uniform scale
   * @returns A new BufferGeometry with the transform applied
   */
  static mergeWithTransform(
    geometry: THREE.BufferGeometry,
    position: THREE.Vector3,
    rotation: THREE.Euler,
    scale: THREE.Vector3,
  ): THREE.BufferGeometry {
    const cloned = geometry.clone();
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion().setFromEuler(rotation);
    matrix.compose(position, quaternion, scale);
    cloned.applyMatrix4(matrix);
    return cloned;
  }

  /**
   * Merge multiple instances of the same geometry with different transforms.
   *
   * For each transform, clones the base geometry, applies the transform,
   * and then merges all resulting geometries into one.
   *
   * This is useful for creating a single draw-call mesh from scatter results
   * where each instance has a different position/rotation/scale.
   *
   * @param baseGeometry  The geometry template to instance
   * @param transforms    Array of position/rotation/scale for each instance
   * @returns A single merged BufferGeometry with all instances
   */
  static mergeInstanced(
    baseGeometry: THREE.BufferGeometry,
    transforms: Array<{
      position: THREE.Vector3;
      rotation: THREE.Euler;
      scale: THREE.Vector3;
    }>,
  ): THREE.BufferGeometry {
    if (transforms.length === 0) {
      return new THREE.BufferGeometry();
    }

    if (transforms.length === 1) {
      const t = transforms[0];
      return this.mergeWithTransform(
        baseGeometry,
        t.position,
        t.rotation,
        t.scale,
      );
    }

    const geometries = transforms.map(t =>
      this.mergeWithTransform(baseGeometry, t.position, t.rotation, t.scale),
    );
    return this.merge(geometries);
  }

  /**
   * Merge geometries and center the result at the origin.
   *
   * Computes the bounding box of the merged geometry and translates
   * it so that its center is at (0, 0, 0).
   *
   * @param geometries  Array of BufferGeometries to merge and center
   * @returns A single merged and centered BufferGeometry
   */
  static mergeAndCenter(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    const merged = this.merge(geometries);
    merged.computeBoundingBox();
    merged.center();
    return merged;
  }

  /**
   * Merge geometries and compute bounding box.
   *
   * @param geometries  Array of BufferGeometries to merge
   * @returns Object with the merged geometry and its bounding box
   */
  static mergeWithBounds(
    geometries: THREE.BufferGeometry[],
  ): { geometry: THREE.BufferGeometry; bounds: THREE.Box3 } {
    const merged = this.merge(geometries);
    merged.computeBoundingBox();
    const bounds = merged.boundingBox ?? new THREE.Box3();
    return { geometry: merged, bounds };
  }

  /**
   * Merge scatter results into a single geometry.
   *
   * Takes a base geometry and scatter output (positions, rotations, scales),
   * creates a transformed clone for each scatter position, and merges them all.
   *
   * @param baseGeometry  The geometry to scatter
   * @param positions     Scatter positions
   * @param rotations     Optional per-instance rotations (defaults to identity)
   * @param scales        Optional per-instance scales (defaults to unit)
   * @returns A single merged BufferGeometry with all scattered instances
   */
  static mergeScatterResult(
    baseGeometry: THREE.BufferGeometry,
    positions: THREE.Vector3[],
    rotations?: THREE.Euler[],
    scales?: THREE.Vector3[],
  ): THREE.BufferGeometry {
    if (positions.length === 0) {
      return new THREE.BufferGeometry();
    }

    const defaultRotation = new THREE.Euler(0, 0, 0);
    const defaultScale = new THREE.Vector3(1, 1, 1);

    const transforms = positions.map((pos, i) => ({
      position: pos,
      rotation: rotations?.[i] ?? defaultRotation,
      scale: scales?.[i] ?? defaultScale,
    }));

    return this.mergeInstanced(baseGeometry, transforms);
  }
}
