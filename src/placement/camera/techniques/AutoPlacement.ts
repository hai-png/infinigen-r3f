/**
 * Automatic Camera Placement Algorithms
 */

import * as THREE from 'three';
import { CameraProperties } from '../CameraProperties';

export interface AutoPlacementOptions {
  ruleOfThirds?: boolean;
  goldenRatio?: boolean;
  leadingLines?: boolean;
  subjectFocus?: boolean;
  minDistance?: number;
  maxDistance?: number;
  preferredHeight?: number;
}

export function calculateOptimalCameraPosition(
  subjectPosition: THREE.Vector3,
  subjectBounds: THREE.Box3,
  options: AutoPlacementOptions = {}
): THREE.Vector3 {
  const center = subjectBounds.getCenter(new THREE.Vector3());
  const size = subjectBounds.getSize(new THREE.Vector3());
  const diagonal = size.length();
  
  const distance = Math.max(
    options.minDistance || diagonal * 2,
    Math.min(options.maxDistance || diagonal * 5, diagonal * 3)
  );
  
  // Default position based on rule of thirds
  let angle = Math.PI / 4;
  let height = options.preferredHeight || 1.6;
  
  if (options.ruleOfThirds) {
    // Offset from center using rule of thirds
    const offset = diagonal / 3;
    return new THREE.Vector3(
      center.x + Math.cos(angle) * distance + offset,
      center.y + height,
      center.z + Math.sin(angle) * distance
    );
  }
  
  return new THREE.Vector3(
    center.x + Math.cos(angle) * distance,
    center.y + height,
    center.z + Math.sin(angle) * distance
  );
}

export function evaluateViewpointQuality(
  cameraPosition: THREE.Vector3,
  subjectPosition: THREE.Vector3,
  sceneObjects: THREE.Object3D[]
): number {
  let score = 1.0;
  
  // Check for obstructions
  const direction = new THREE.Vector3().subVectors(subjectPosition, cameraPosition).normalize();
  const distance = cameraPosition.distanceTo(subjectPosition);
  
  for (const obj of sceneObjects) {
    const box = new THREE.Box3().setFromObject(obj);
    if (box.intersectsLine(new THREE.Line3(cameraPosition, subjectPosition))) {
      score *= 0.5; // Penalty for obstruction
    }
  }
  
  // Prefer eye-level heights
  const heightDiff = Math.abs(cameraPosition.y - subjectPosition.y);
  if (heightDiff > 2) score *= 0.8;
  
  // Prefer good angles (not too steep)
  const angle = Math.atan2(direction.y, Math.hypot(direction.x, direction.z));
  if (Math.abs(angle) > Math.PI / 4) score *= 0.7;
  
  return score;
}

export default { calculateOptimalCameraPosition, evaluateViewpointQuality };
