import * as THREE from 'three';
import { Keyframe, TrajectorySample } from './TrajectoryGenerator';
/**
 * Crane shot configuration (vertical movement)
 */
export interface CraneShotConfig {
    start: THREE.Vector3;
    end: THREE.Vector3;
    duration?: number;
    target?: THREE.Vector3;
    arcHeight?: number;
    easeIn?: boolean;
    easeOut?: boolean;
    samplesPerSecond?: number;
}
/**
 * Create a crane shot (vertical camera movement up or down)
 */
export declare function createCraneShot(config: CraneShotConfig): Keyframe[];
/**
 * Generate sampled trajectory from crane shot
 */
export declare function generateCraneTrajectory(config: CraneShotConfig): TrajectorySample[];
/**
 * Pan shot configuration (horizontal rotation around pivot)
 */
export interface PanShotConfig {
    center: THREE.Vector3;
    radius: number;
    startAngle?: number;
    endAngle?: number;
    elevation?: number;
    duration?: number;
    lookAtCenter?: boolean;
    samplesPerSecond?: number;
}
/**
 * Create a pan shot (horizontal camera rotation)
 */
export declare function createPanShot(config: PanShotConfig): Keyframe[];
/**
 * Tilt shot configuration (vertical rotation around pivot)
 */
export interface TiltShotConfig {
    center: THREE.Vector3;
    radius: number;
    startElevation?: number;
    endElevation?: number;
    azimuth?: number;
    duration?: number;
    lookAtCenter?: boolean;
    samplesPerSecond?: number;
}
/**
 * Create a tilt shot (vertical camera rotation)
 */
export declare function createTiltShot(config: TiltShotConfig): Keyframe[];
/**
 * Handheld simulation configuration
 */
export interface HandheldConfig {
    basePosition: THREE.Vector3;
    target?: THREE.Vector3;
    duration?: number;
    intensity?: number;
    frequency?: number;
    seed?: number;
    samplesPerSecond?: number;
}
/**
 * Create handheld camera simulation (organic shake)
 */
export declare function createHandheldSim(config: HandheldConfig): Keyframe[];
declare const _default: {
    createCraneShot: typeof createCraneShot;
    generateCraneTrajectory: typeof generateCraneTrajectory;
    createPanShot: typeof createPanShot;
    createTiltShot: typeof createTiltShot;
    createHandheldSim: typeof createHandheldSim;
};
export default _default;
//# sourceMappingURL=CraneShot.d.ts.map