import * as THREE from 'three';
import { Keyframe, TrajectorySample } from './TrajectoryGenerator';
/**
 * Dolly shot configuration
 */
export interface DollyShotConfig {
    start: THREE.Vector3;
    end: THREE.Vector3;
    duration?: number;
    target?: THREE.Vector3;
    easeIn?: boolean;
    easeOut?: boolean;
    fovStart?: number;
    fovEnd?: number;
    samplesPerSecond?: number;
}
/**
 * Create a dolly shot (linear camera movement along Z-axis or arbitrary path)
 */
export declare function createDollyShot(config: DollyShotConfig): Keyframe[];
/**
 * Generate sampled trajectory from dolly shot
 */
export declare function generateDollyTrajectory(config: DollyShotConfig): TrajectorySample[];
/**
 * Create a push-in shot (dolly forward)
 */
export declare function createPushIn(startPosition: THREE.Vector3, targetPosition: THREE.Vector3, duration?: number, fovChange?: number): Keyframe[];
/**
 * Create a pull-back shot (dolly backward)
 */
export declare function createPullBack(startPosition: THREE.Vector3, endPosition: THREE.Vector3, duration?: number, fovChange?: number): Keyframe[];
/**
 * Create a dolly zoom (Vertigo/Hitchcock effect)
 * Moves camera while adjusting FOV to keep subject same size
 */
export declare function createDollyZoom(start: THREE.Vector3, end: THREE.Vector3, subjectPosition: THREE.Vector3, duration?: number, zoomIntensity?: number): Keyframe[];
/**
 * Create a tracking shot (lateral movement parallel to subject)
 */
export declare function createTrackingShot(start: THREE.Vector3, end: THREE.Vector3, trackTarget: THREE.Vector3, duration?: number, offset?: number): Keyframe[];
declare const _default: {
    createDollyShot: typeof createDollyShot;
    generateDollyTrajectory: typeof generateDollyTrajectory;
    createPushIn: typeof createPushIn;
    createPullBack: typeof createPullBack;
    createDollyZoom: typeof createDollyZoom;
    createTrackingShot: typeof createTrackingShot;
};
export default _default;
//# sourceMappingURL=DollyShot.d.ts.map