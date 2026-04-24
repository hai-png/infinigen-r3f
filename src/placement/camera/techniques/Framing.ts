/**
 * Subject Framing Utilities
 */

import * as THREE from 'three';

export enum ShotSize {
  EXTREME_CLOSE_UP = 'extreme_close_up',
  CLOSE_UP = 'close_up',
  MEDIUM_CLOSE_UP = 'medium_close_up',
  MEDIUM_SHOT = 'medium_shot',
  MEDIUM_LONG_SHOT = 'medium_long_shot',
  LONG_SHOT = 'long_shot',
  VERY_LONG_SHOT = 'very_long_shot',
  EXTREME_LONG_SHOT = 'extreme_long_shot',
}

export const SHOT_SIZE_DISTANCES: Record<ShotSize, { head: number; waist: number; full: number }> = {
  [ShotSize.EXTREME_CLOSE_UP]: { head: 0.15, waist: 0.3, full: 0.5 },
  [ShotSize.CLOSE_UP]: { head: 0.3, waist: 0.6, full: 1.0 },
  [ShotSize.MEDIUM_CLOSE_UP]: { head: 0.5, waist: 1.0, full: 1.8 },
  [ShotSize.MEDIUM_SHOT]: { head: 0.8, waist: 1.5, full: 2.5 },
  [ShotSize.MEDIUM_LONG_SHOT]: { head: 1.2, waist: 2.5, full: 4.0 },
  [ShotSize.LONG_SHOT]: { head: 2.0, waist: 4.0, full: 7.0 },
  [ShotSize.VERY_LONG_SHOT]: { head: 4.0, waist: 8.0, full: 15.0 },
  [ShotSize.EXTREME_LONG_SHOT]: { head: 8.0, waist: 15.0, full: 30.0 },
};

export function calculateDistanceForShot(
  shotSize: ShotSize,
  subjectHeight: number,
  focalLength: number,
  sensorHeight: number
): number {
  const baseDistance = SHOT_SIZE_DISTANCES[shotSize].full;
  
  // Adjust based on focal length and sensor size
  const fov = 2 * Math.atan(sensorHeight / (2 * focalLength));
  const requiredHeight = subjectHeight * 1.2; // 20% padding
  
  return requiredHeight / (2 * Math.tan(fov / 2));
}

export function frameSubject(
  camera: THREE.Camera,
  subjectBox: THREE.Box3,
  shotSize: ShotSize,
  padding: number = 0.1
): void {
  const subjectSize = subjectBox.getSize(new THREE.Vector3());
  const subjectCenter = subjectBox.getCenter(new THREE.Vector3());
  
  const distance = calculateDistanceForShot(
    shotSize,
    subjectSize.y,
    camera instanceof THREE.PerspectiveCamera ? camera.fov : 50,
    24
  );
  
  // Position camera at calculated distance
  const direction = new THREE.Vector3(0, 0, 1);
  camera.position.copy(subjectCenter).add(direction.multiplyScalar(-distance));
  camera.lookAt(subjectCenter);
}

export default { ShotSize, calculateDistanceForShot, frameSubject };
