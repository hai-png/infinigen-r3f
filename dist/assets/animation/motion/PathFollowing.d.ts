import { Vector3 } from 'three';
import { Quaternion } from '../../../core/util/math/quaternion';
/**
 * Spline Types
 */
export type SplineType = 'catmull-rom' | 'bezier' | 'bspline' | 'linear';
/**
 * Orientation Mode for path following
 */
export type OrientationMode = 'tangent' | 'lookAt' | 'frenet' | 'fixed';
/**
 * Keyframe for spline definition
 */
export interface SplineKeyframe {
    position: Vector3;
    inTangent?: Vector3;
    outTangent?: Vector3;
    time?: number;
}
/**
 * Path Following Configuration
 */
export interface PathFollowingConfig {
    splineType?: SplineType;
    orientationMode?: OrientationMode;
    lookAtTarget?: Vector3;
    fixedOrientation?: Quaternion;
    upVector?: Vector3;
    speed?: number;
    loop?: boolean;
    autoRotate?: boolean;
    rotationOffset?: Quaternion;
}
/**
 * Sample point on a path
 */
export interface PathSample {
    position: Vector3;
    tangent: Vector3;
    normal?: Vector3;
    binormal?: Vector3;
    progress: number;
}
/**
 * Path Follower
 *
 * Moves objects along spline paths with various orientation modes.
 */
export declare class PathFollower {
    private config;
    private spline;
    private progress;
    private distance;
    private isMoving;
    constructor(keyframes: Vector3[] | SplineKeyframe[], config?: PathFollowingConfig);
    /**
     * Start moving along the path
     */
    start(): void;
    /**
     * Stop moving
     */
    stop(): void;
    /**
     * Pause movement
     */
    pause(): void;
    /**
     * Resume movement
     */
    resume(): void;
    /**
     * Seek to a specific progress
     * @param t - Progress value (0-1)
     */
    seek(t: number): void;
    /**
     * Update position along path
     * @param deltaTime - Time delta in seconds
     */
    update(deltaTime: number): PathSample | null;
    /**
     * Sample the path at given progress
     */
    sample(t: number): PathSample | null;
    /**
     * Get current position
     */
    getPosition(): Vector3 | null;
    /**
     * Get current orientation quaternion
     */
    getOrientation(): Quaternion | null;
    /**
     * Get current transform (position + orientation)
     */
    getTransform(): {
        position: Vector3;
        orientation: Quaternion;
    } | null;
    /**
     * Reset to start
     */
    reset(): void;
    /**
     * Check if path is complete
     */
    isComplete(): boolean;
    /**
     * Get current progress
     */
    getProgress(): number;
    /**
     * Update configuration
     */
    setConfig(config: Partial<PathFollowingConfig>): void;
    /**
     * Helper: Create quaternion from direction and up vector
     */
    private quaternionFromDirection;
    /**
     * Helper: Create quaternion from Frenet frame
     */
    private quaternionFromFrame;
    /**
     * Helper: Extract quaternion from 4x4 matrix (column-major)
     */
    private quaternionFromMatrix;
}
/**
 * Generate keyframes for common camera movements
 */
export declare function generateCameraPath(type: 'orbit' | 'arc' | 'dolly' | 'pan' | 'crane' | 'tracking', options?: {
    center?: Vector3;
    radius?: number;
    startAngle?: number;
    endAngle?: number;
    height?: number;
    segments?: number;
    startPoint?: Vector3;
    endPoint?: Vector3;
}): Vector3[];
export default PathFollower;
//# sourceMappingURL=PathFollowing.d.ts.map