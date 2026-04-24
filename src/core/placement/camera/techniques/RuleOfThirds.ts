/**
 * Rule of Thirds Composition Helper
 */

import * as THREE from 'three';

export interface GridIntersection {
  x: number;
  y: number;
  strength: number;
}

export function getRuleOfThirdsPoints(
  frameWidth: number,
  frameHeight: number
): GridIntersection[] {
  const thirdW = frameWidth / 3;
  const thirdH = frameHeight / 3;
  
  return [
    { x: thirdW, y: thirdH, strength: 1.0 },
    { x: thirdW * 2, y: thirdH, strength: 1.0 },
    { x: thirdW, y: thirdH * 2, strength: 1.0 },
    { x: thirdW * 2, y: thirdH * 2, strength: 1.0 },
  ];
}

export function alignSubjectToRuleOfThirds(
  subjectPosition: THREE.Vector3,
  cameraPosition: THREE.Vector3,
  frameWidth: number,
  frameHeight: number
): THREE.Vector3 {
  const points = getRuleOfThirdsPoints(frameWidth, frameHeight);
  
  // Find closest intersection point
  const projected = projectToWorld(subjectPosition, cameraPosition, frameWidth, frameHeight);
  
  let bestPoint = points[0];
  let minDist = Infinity;
  
  for (const point of points) {
    const dist = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (dist < minDist) {
      minDist = dist;
      bestPoint = point;
    }
  }
  
  return new THREE.Vector3(bestPoint.x, bestPoint.y, subjectPosition.z);
}

function projectToWorld(
  subject: THREE.Vector3,
  camera: THREE.Vector3,
  frameW: number,
  frameH: number
): { x: number; y: number } {
  // Simplified projection
  return {
    x: (subject.x - camera.x) * 10,
    y: (subject.y - camera.y) * 10,
  };
}

export default { getRuleOfThirdsPoints, alignSubjectToRuleOfThirds };
