import * as THREE from 'three';
/**
 * Keyframe definition for camera trajectories
 */
export interface Keyframe {
    time: number;
    position: THREE.Vector3;
    target?: THREE.Vector3;
    fov?: number;
    roll?: number;
}
/**
 * Trajectory sample point
 */
export interface TrajectorySample {
    time: number;
    position: THREE.Vector3;
    target: THREE.Vector3;
    up: THREE.Vector3;
    fov: number;
    roll: number;
}
/**
 * Interpolation types for smooth camera motion
 */
export declare enum InterpolationMode {
    Linear = "linear",
    CatmullRom = "catmullrom",
    Bezier = "bezier",
    Step = "step"
}
/**
 * Trajectory configuration
 */
export interface TrajectoryConfig {
    keyframes: Keyframe[];
    interpolation?: InterpolationMode;
    loop?: boolean;
    duration?: number;
    samplesPerSecond?: number;
}
/**
 * Catmull-Rom spline interpolation for 3D vectors
 */
export declare function catmullRomSpline(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, t: number): THREE.Vector3;
/**
 * Linear interpolation between two 3D points
 */
export declare function interpolatePosition(start: THREE.Vector3, end: THREE.Vector3, t: number): THREE.Vector3;
/**
 * Bezier interpolation with control points
 */
export declare function bezierInterpolate(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, t: number): THREE.Vector3;
/**
 * Generate smooth trajectory from keyframes
 */
export declare function generateTrajectory(keyframes: Keyframe[], config?: TrajectoryConfig): TrajectorySample[];
/**
 * Create a Three.js Curve from trajectory for visualization
 */
export declare function createCurveFromTrajectory(samples: TrajectorySample[]): THREE.Curve<THREE.Vector3>;
/**
 * Calculate trajectory length
 */
export declare function calculateTrajectoryLength(samples: TrajectorySample[]): number;
/**
 * Resample trajectory at uniform distances
 */
export declare function resampleUniform(samples: TrajectorySample[], segmentLength: number): TrajectorySample[];
declare const _default: {
    generateTrajectory: typeof generateTrajectory;
    interpolatePosition: typeof interpolatePosition;
    catmullRomSpline: typeof catmullRomSpline;
    bezierInterpolate: typeof bezierInterpolate;
    createCurveFromTrajectory: typeof createCurveFromTrajectory;
    calculateTrajectoryLength: typeof calculateTrajectoryLength;
    resampleUniform: typeof resampleUniform;
    InterpolationMode: typeof InterpolationMode;
};
export default _default;
//# sourceMappingURL=TrajectoryGenerator.d.ts.map