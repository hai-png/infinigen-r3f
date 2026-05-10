/**
 * State Bridge — Adapter between evaluator/state.ts ObjectState and unified ObjectState
 *
 * Gap 1 Fix: Provides a migration path from the legacy ObjectState
 * (evaluator/state.ts) to the canonical unified ObjectState
 * (unified/UnifiedConstraintSystem.ts).
 *
 * The unified ObjectState uses THREE.Vector3 positions, Polygon2D footprints,
 * and typed bounding boxes. The legacy ObjectState uses plain {x,y,z} objects
 * and has `polygon: any = null`.
 *
 * Usage:
 *   import { toUnified, toUnifiedStateMap } from './StateBridge';
 *   const unified = toUnified(legacyObjState);
 */

import * as THREE from 'three';
import {
  ObjectState as UnifiedObjectState,
  TagSet,
  Tag,
  Polygon2D,
  DOFConstraints,
} from './UnifiedConstraintSystem';
import {
  ObjectState as LegacyObjectState,
  State as LegacyState,
} from '../evaluator/state';

/**
 * Convert a legacy ObjectState (evaluator/state.ts) to the unified ObjectState.
 *
 * This creates a fully-populated unified ObjectState from the legacy representation:
 * - Position {x,y,z} → THREE.Vector3
 * - Rotation {x,y,z} → THREE.Euler
 * - Scale {x,y,z} → THREE.Vector3
 * - TagSet → unified TagSet (converted via Tag.parse)
 * - boundingBox → computed from 3D object or position+scale
 * - footprint → computed from bounding box (projected onto XZ)
 * - DOF → translated from dofMatrixTranslation/dofRotationAxis
 */
export function toUnified(legacy: LegacyObjectState): UnifiedObjectState {
  // Convert position
  const position = new THREE.Vector3(
    legacy.position.x,
    legacy.position.y,
    legacy.position.z
  );

  // Convert rotation
  const rotation = new THREE.Euler(
    legacy.rotation.x,
    legacy.rotation.y,
    legacy.rotation.z
  );

  // Convert scale
  const scale = new THREE.Vector3(
    legacy.scale.x,
    legacy.scale.y,
    legacy.scale.z
  );

  // Convert tags
  const tags = new TagSet();
  for (const tag of legacy.tags.toArray()) {
    const tagStr = tag.toString();
    tags.add(Tag.parse(tagStr));
  }

  // Compute bounding box from 3D object or approximate from position+scale
  let boundingBox = new THREE.Box3();
  if (legacy.obj) {
    boundingBox.setFromObject(legacy.obj);
  } else {
    // Approximate from position and scale
    const halfScale = scale.clone().multiplyScalar(0.5);
    boundingBox = new THREE.Box3(
      position.clone().sub(halfScale),
      position.clone().add(halfScale)
    );
  }

  // Compute footprint from bounding box (XZ projection)
  const footprint = Polygon2D.fromBoundingBox(boundingBox);

  // Convert DOF constraints
  const dofConstraints = convertDOF(legacy);

  return new UnifiedObjectState({
    id: legacy.id || legacy.name,
    type: legacy.tags.toArray().map(t => t.toString()).find(t => !t.startsWith('!')) || '',
    position,
    rotation,
    scale,
    tags,
    relations: new Map(),
    dofConstraints,
    footprint,
    boundingBox,
  });
}

/**
 * Convert an entire legacy State (map of ObjectState) to a unified state map.
 */
export function toUnifiedStateMap(legacyState: LegacyState): Map<string, UnifiedObjectState> {
  const result = new Map<string, UnifiedObjectState>();
  for (const [key, legacyObj] of legacyState.objects) {
    result.set(key, toUnified(legacyObj));
  }
  return result;
}

/**
 * Convert legacy DOF information to unified DOFConstraints.
 */
function convertDOF(legacy: LegacyObjectState): DOFConstraints {
  const transAxes: [boolean, boolean, boolean] = [
    legacy.dofMatrixTranslation?.x !== 0 || legacy.dofMatrixTranslation === null,
    legacy.dofMatrixTranslation?.y !== 0 || legacy.dofMatrixTranslation === null,
    legacy.dofMatrixTranslation?.z !== 0 || legacy.dofMatrixTranslation === null,
  ];
  // If dofMatrixTranslation is null, treat as free translation
  if (legacy.dofMatrixTranslation === null) {
    transAxes[0] = true;
    transAxes[1] = true;
    transAxes[2] = true;
  }

  const rotAxes: [boolean, boolean, boolean] = [
    legacy.dofRotationAxis?.x !== 0 || legacy.dofRotationAxis === null,
    legacy.dofRotationAxis?.y !== 0 || legacy.dofRotationAxis === null,
    legacy.dofRotationAxis?.z !== 0 || legacy.dofRotationAxis === null,
  ];
  // If dofRotationAxis is (0,1,0), only Y rotation
  if (legacy.dofRotationAxis && legacy.dofRotationAxis.y === 1 &&
      legacy.dofRotationAxis.x === 0 && legacy.dofRotationAxis.z === 0) {
    rotAxes[0] = false;
    rotAxes[1] = true;
    rotAxes[2] = false;
  }

  return new DOFConstraints(transAxes, rotAxes);
}

/**
 * Quick check if a legacy ObjectState has sufficient data for unified conversion.
 * Returns true if the legacy state has a valid position.
 */
export function canConvert(legacy: LegacyObjectState): boolean {
  return legacy.position !== null &&
    typeof legacy.position.x === 'number' &&
    typeof legacy.position.y === 'number' &&
    typeof legacy.position.z === 'number';
}
