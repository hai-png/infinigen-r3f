import * as THREE from 'three';
import { Keyframe, TrajectorySample } from './TrajectoryGenerator';
/**
 * Orbit shot configuration
 */
export interface OrbitShotConfig {
    center: THREE.Vector3;
    radius: number;
    startAngle?: number;
    endAngle?: number;
    elevation?: number;
    minElevation?: number;
    maxElevation?: number;
    rotations?: number;
    duration?: number;
    clockwise?: boolean;
    lookAtCenter?: boolean;
    samplesPerSecond?: number;
}
/**
 * Create an orbit camera trajectory around a center point
 */
export declare function createOrbitShot(config: OrbitShotConfig): Keyframe[];
/**
 * Generate sampled trajectory from orbit shot
 */
export declare function generateOrbitTrajectory(config: OrbitShotConfig): TrajectorySample[];
/**
 * Create a simple circular orbit (convenience function)
 */
export declare function createCircularOrbit(center: THREE.Vector3, radius: number, duration?: number, rotations?: number, elevation?: number): Keyframe[];
/**
 * Create a spiral orbit (changing radius over time)
 */
export declare function createSpiralOrbit(center: THREE.Vector3, startRadius: number, endRadius: number, duration?: number, rotations?: number, elevation?: number): Keyframe[];
declare const _default: {
    createOrbitShot: typeof createOrbitShot;
    generateOrbitTrajectory: typeof generateOrbitTrajectory;
    createCircularOrbit: typeof createCircularOrbit;
    createSpiralOrbit: typeof createSpiralOrbit;
};
export default _default;
//# sourceMappingURL=OrbitShot.d.ts.map