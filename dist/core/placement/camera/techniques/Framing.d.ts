/**
 * Subject Framing Utilities
 */
import * as THREE from 'three';
export declare enum ShotSize {
    EXTREME_CLOSE_UP = "extreme_close_up",
    CLOSE_UP = "close_up",
    MEDIUM_CLOSE_UP = "medium_close_up",
    MEDIUM_SHOT = "medium_shot",
    MEDIUM_LONG_SHOT = "medium_long_shot",
    LONG_SHOT = "long_shot",
    VERY_LONG_SHOT = "very_long_shot",
    EXTREME_LONG_SHOT = "extreme_long_shot"
}
export declare const SHOT_SIZE_DISTANCES: Record<ShotSize, {
    head: number;
    waist: number;
    full: number;
}>;
export declare function calculateDistanceForShot(shotSize: ShotSize, subjectHeight: number, focalLength: number, sensorHeight: number): number;
export declare function frameSubject(camera: THREE.Camera, subjectBox: THREE.Box3, shotSize: ShotSize, padding?: number): void;
declare const _default: {
    ShotSize: typeof ShotSize;
    calculateDistanceForShot: typeof calculateDistanceForShot;
    frameSubject: typeof frameSubject;
};
export default _default;
//# sourceMappingURL=Framing.d.ts.map