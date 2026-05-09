/**
 * csg-boolean.ts — Fixed CSG boolean operations using three-bvh-csg v0.0.18
 *
 * Root causes of the original bug (subtract / intersect broken, only union worked):
 *
 *  1. Missing attribute crash — The Evaluator defaults to
 *     `attributes = ['position', 'uv', 'normal']`.  If either input geometry
 *     lacks a `uv` (or `normal`) attribute, `GeometryBuilder.initFromGeometry`
 *     dereferences `undefined.array` and throws.  Union "worked" because the
 *     catch-block fell back to `mergeGeometries`, but subtract / intersect
 *     fell back to returning the first geometry unchanged — silently
 *     producing the wrong result.
 *
 *  2. Geometry mutation — `ensureIndexed` returned the *original* geometry
 *     without cloning when it was already indexed.  `Brush.prepareGeometry()`
 *     then mutates the geometry in place (adds boundsTree, halfEdges,
 *     groupIndices, converts to SharedArrayBuffers), corrupting the caller's
 *     data for subsequent operations.
 *
 *  3. Wrong fallback — On subtract / intersect failure the code returned
 *     `geometry.clone()` (a copy of meshA) rather than the original
 *     reference the caller expected.
 *
 * Fixes applied:
 *  - Clone both geometries before creating Brushes so originals are never
 *    mutated.
 *  - Add dummy `uv` and `normal` attributes when they are missing so the
 *    Evaluator never crashes on attribute access.
 *  - Configure the Evaluator's `attributes` list to only include attributes
 *    that actually exist on both prepared geometries.
 *  - Set `useGroups: false` — we only need the resulting geometry, not
 *    material groups.
 *  - For subtract / intersect failures, return the original `meshA`
 *    reference (not a clone), as the caller expects some geometry back.
 *  - Provide a robust `mergeGeometries` fallback for union.
 */

import * as THREE from 'three';
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type BooleanOperation = 'union' | 'subtract' | 'intersect';

// ---------------------------------------------------------------------------
// performCSGBoolean
// ---------------------------------------------------------------------------

/**
 * Perform a CSG boolean operation on two geometries.
 *
 * @param meshA - The first (base) geometry  — the minuend for subtract,
 *                one of the operands for intersect.
 * @param meshB - The second (operand) geometry — the subtrahend for
 *                subtract, the other operand for intersect.
 * @param operation - The boolean operation type.
 * @returns The resulting geometry.  On failure: for 'union' a simple merge
 *          is returned; for 'subtract' / 'intersect' the original `meshA`
 *          reference is returned (not a clone).
 */
export function performCSGBoolean(
  meshA: THREE.BufferGeometry,
  meshB: THREE.BufferGeometry,
  operation: BooleanOperation,
): THREE.BufferGeometry {
  // ---- Edge-case: null / empty inputs ----------------------------------

  if (!meshA) {
    return new THREE.BufferGeometry();
  }
  if (!meshB) {
    // No operand: union → just A, subtract → A unchanged, intersect → empty
    if (operation === 'intersect') return new THREE.BufferGeometry();
    return meshA; // return original ref, not a clone
  }

  const posA = meshA.getAttribute('position');
  const posB = meshB.getAttribute('position');

  if (!posA || posA.count === 0) {
    if (operation === 'union' && posB && posB.count > 0) return meshB;
    return new THREE.BufferGeometry();
  }
  if (!posB || posB.count === 0) {
    if (operation === 'intersect') return new THREE.BufferGeometry();
    return meshA; // original ref
  }

  // ---- Prepare geometries (clone + ensure indexed + add missing attrs) --

  const preparedA = prepareGeometry(meshA);
  const preparedB = prepareGeometry(meshB);

  // ---- Map operation name → three-bvh-csg constant ----------------------

  const operationMap: Record<BooleanOperation, number> = {
    union: ADDITION,        // 0  — A ∪ B
    subtract: SUBTRACTION,  // 1  — A − B  (order matters!)
    intersect: INTERSECTION, // 3  — A ∩ B
  };

  const csgOp = operationMap[operation];

  // ---- Determine which attributes to process ----------------------------
  //  The Evaluator must only be told about attributes that exist on BOTH
  //  prepared geometries.  Our `prepareGeometry` guarantees position,
  //  normal, and uv, so we can safely use all three.  But we compute the
  //  list dynamically in case a future caller bypasses `prepareGeometry`.

  const attrsA = new Set(Object.keys(preparedA.attributes));
  const attrsB = new Set(Object.keys(preparedB.attributes));

  // Always include position; optionally normal and uv if both have them
  const evalAttributes: string[] = ['position'];
  if (attrsA.has('normal') && attrsB.has('normal')) evalAttributes.push('normal');
  if (attrsA.has('uv') && attrsB.has('uv')) evalAttributes.push('uv');

  // ---- Perform the CSG evaluation ---------------------------------------

  try {
    // Create Brush instances from the *cloned* geometries.
    const brushA = new Brush(preparedA, new THREE.MeshBasicMaterial());
    const brushB = new Brush(preparedB, new THREE.MeshBasicMaterial());

    // Ensure world matrices are identity (default for new Object3D)
    brushA.updateMatrixWorld(true);
    brushB.updateMatrixWorld(true);

    // Build the BVH caches
    brushA.prepareGeometry();
    brushB.prepareGeometry();

    // Configure the Evaluator
    const evaluator = new Evaluator();
    evaluator.attributes = evalAttributes;
    evaluator.useGroups = false; // we only need geometry, not material groups

    // evaluate(brushA, brushB, SUBTRACTION) = A − B  ✓ correct operand order
    const resultBrush = evaluator.evaluate(brushA, brushB, csgOp);

    // Extract the resulting BufferGeometry
    const resultGeo = resultBrush.geometry;

    // Ensure the result has proper normals
    if (!resultGeo.getAttribute('normal') || (resultGeo.getAttribute('normal') as THREE.BufferAttribute).count === 0) {
      resultGeo.computeVertexNormals();
    }

    // Verify the result actually has geometry data
    const resultPos = resultGeo.getAttribute('position');
    if (!resultPos || resultPos.count === 0) {
      // CSG produced empty result — can happen with non-overlapping meshes
      // and intersect, or identical meshes with subtract
      if (operation === 'intersect') return new THREE.BufferGeometry();
      if (operation === 'union') return mergeGeometries(meshA, meshB);
      // subtract produced empty: means A was entirely inside B
      return new THREE.BufferGeometry();
    }

    return resultGeo;
  } catch (err) {
    // ---- Fallback handling -----------------------------------------------
    if (typeof console !== 'undefined') {
      console.warn(
        `[csg-boolean] CSG evaluation failed for "${operation}":`,
        err,
      );
    }

    switch (operation) {
      case 'union':
        // Best-effort: just merge the vertex data
        try {
          return mergeGeometries(meshA, meshB);
        } catch {
          return meshA; // original ref
        }

      case 'subtract':
      case 'intersect':
        // Cannot approximate subtract/intersect without CSG.
        // Return the original meshA reference (not a clone) as the
        // caller expects some geometry back.
        return meshA;

      default:
        return meshA;
    }
  }
}

// ---------------------------------------------------------------------------
// mergeGeometries  (fallback for union)
// ---------------------------------------------------------------------------

/**
 * Merge two geometries by combining their vertex/index data.
 * Used as fallback when CSG fails.
 * Delegates to the canonical GeometryPipeline.mergeGeometries().
 */
export function mergeGeometries(
  a: THREE.BufferGeometry,
  b: THREE.BufferGeometry,
): THREE.BufferGeometry {
  const posA = a.getAttribute('position');
  const posB = b.getAttribute('position');
  if (!posA && !posB) return new THREE.BufferGeometry();
  if (!posA) return b.clone();
  if (!posB) return a.clone();

  return GeometryPipeline.mergeGeometries([a, b]);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Prepare a geometry for use with three-bvh-csg:
 *
 *  1. Clone the geometry so the original is never mutated.
 *  2. Ensure it is indexed (three-bvh-csg requires indexed geometry).
 *  3. Add a dummy `normal` attribute if missing.
 *  4. Add a dummy `uv` attribute if missing.
 *  5. Ensure the index uses Uint32Array (handles large meshes).
 */
function prepareGeometry(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  // Always clone first — three-bvh-csg mutates geometry in place via
  // prepareGeometry() (adds boundsTree, halfEdges, groupIndices,
  // and may convert arrays to SharedArrayBuffers).
  const cloned = geo.clone();

  // --- Ensure indexed ----------------------------------------------------
  // three-bvh-csg requires indexed BufferGeometry.  If the geometry is
  // non-indexed, each group of 3 consecutive vertices forms a triangle.
  // We create a sequential index [0, 1, 2, 3, 4, 5, …] which preserves
  // the same triangle winding.
  if (!cloned.getIndex()) {
    const count = cloned.getAttribute('position').count;
    const indices = new Uint32Array(count);
    for (let i = 0; i < count; i++) indices[i] = i;
    cloned.setIndex(new THREE.BufferAttribute(indices, 1));
  } else {
    // Ensure the index is Uint32Array — large meshes can exceed Uint16 range
    const existingIndex = cloned.getIndex()!;
    if (existingIndex.array instanceof Uint16Array) {
      const count = existingIndex.count;
      const newIndices = new Uint32Array(count);
      for (let i = 0; i < count; i++) {
        newIndices[i] = existingIndex.getX(i);
      }
      cloned.setIndex(new THREE.BufferAttribute(newIndices, 1));
    }
  }

  // --- Add missing normal attribute --------------------------------------
  // The Evaluator includes 'normal' in its default attribute list.
  // Without it, GeometryBuilder.initFromGeometry crashes.
  if (!cloned.getAttribute('normal')) {
    cloned.computeVertexNormals();
  }

  // --- Add missing uv attribute ------------------------------------------
  // The Evaluator includes 'uv' in its default attribute list.
  // Without it, GeometryBuilder.initFromGeometry crashes when it tries
  // to access `refAttributes['uv'].array.constructor` on undefined.
  // This was the PRIMARY root cause of the bug: geometries without UVs
  // caused the Evaluator to throw, which silently fell back to returning
  // the first geometry unchanged for subtract/intersect operations.
  if (!cloned.getAttribute('uv')) {
    const posAttr = cloned.getAttribute('position');
    const uvArray = new Float32Array(posAttr.count * 2);
    // Fill with zeros — dummy UVs.  The CSG operation doesn't use UVs
    // for geometry computation, only for interpolation on the result.
    cloned.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
  }

  return cloned;
}
