import * as THREE from "three";
export interface Keyframe { time: number; position: THREE.Vector3; target?: THREE.Vector3; }
export function generateTrajectory(keyframes: Keyframe[]): THREE.Vector3[] { return []; }
export function interpolatePosition(start: THREE.Vector3, end: THREE.Vector3, t: number): THREE.Vector3 { return new THREE.Vector3(); }
export default { generateTrajectory, interpolatePosition };
