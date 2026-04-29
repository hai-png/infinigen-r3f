/**
 * Camera System for Infinigen R3F
 *
 * Complete camera placement, cinematography, and trajectory system.
 * Ported from: placement/camera.py (30.7KB)
 */
import type { Vector3, Euler } from 'three';
import type { Variable, ConstraintNode } from '../../constraints/language/types';
/**
 * Camera types supported by the system
 */
export type CameraType = 'perspective' | 'orthographic' | 'stereo' | 'panoramic' | 'fisheye';
/**
 * Shot size definitions for cinematography
 */
export type ShotSize = 'extreme_close_up' | 'close_up' | 'medium_close_up' | 'medium' | 'medium_long' | 'long' | 'very_long' | 'extreme_long';
/**
 * Camera angle types
 */
export type CameraAngle = 'bird_eye' | 'high_angle' | 'eye_level' | 'low_angle' | 'worm_eye';
/**
 * Camera movement types for trajectories
 */
export type CameraMovement = 'static' | 'dolly' | 'pan' | 'tilt' | 'truck' | 'pedestal' | 'orbit' | 'arc' | 'tracking' | 'crane' | 'handheld';
/**
 * Camera properties configuration
 */
export interface CameraProperties {
    /** Camera type */
    type: CameraType;
    /** Focal length in mm (default: 35mm) */
    focalLength?: number;
    /** F-stop / aperture (default: 2.8) */
    fStop?: number;
    /** Focus distance in meters (default: 10) */
    focusDistance?: number;
    /** Sensor size in mm (default: [36, 24] for full-frame) */
    sensorSize?: [number, number];
    /** Film grain / ISO (default: 100) */
    iso?: number;
    /** Shutter speed (default: 1/60) */
    shutterSpeed?: number;
    /** Field of view in degrees (calculated from focalLength if not set) */
    fov?: number;
    /** Near clipping plane (default: 0.1) */
    near?: number;
    /** Far clipping plane (default: 1000) */
    far?: number;
    /** Depth of field enabled */
    enableDOF?: boolean;
    /** Bokeh intensity (0-1) */
    bokehIntensity?: number;
    /** Chromatic aberration (0-1) */
    chromaticAberration?: number;
    /** Vignette intensity (0-1) */
    vignette?: number;
}
/**
 * Default camera properties by type
 */
export declare const DEFAULT_CAMERA_PROPERTIES: Record<CameraType, Partial<CameraProperties>>;
/**
 * Shot size distance ranges (in meters from subject)
 */
export declare const SHOT_SIZE_DISTANCES: Record<ShotSize, [number, number]>;
/**
 * Camera angle elevation ranges (in degrees)
 */
export declare const CAMERA_ANGLE_ELEVATIONS: Record<CameraAngle, [number, number]>;
/**
 * Composition rule types
 */
export type CompositionRule = 'rule_of_thirds' | 'golden_ratio' | 'leading_lines' | 'symmetry' | 'framing' | 'diagonal' | 'centered';
/**
 * Camera placement configuration
 */
export interface CameraPlacementConfig {
    /** Desired shot size */
    shotSize?: ShotSize;
    /** Desired camera angle */
    angle?: CameraAngle;
    /** Composition rules to follow */
    compositionRules?: CompositionRule[];
    /** Minimum distance to subject */
    minDistance?: number;
    /** Maximum distance to subject */
    maxDistance?: number;
    /** Avoid occlusions */
    avoidOcclusion?: boolean;
    /** Maintain line of sight */
    maintainLineOfSight?: boolean;
    /** Preferred height range */
    heightRange?: [number, number];
    /** Exclusion zones (areas camera cannot be placed) */
    exclusionZones?: Array<{
        center: Vector3;
        radius: number;
    }>;
}
/**
 * Trajectory keyframe
 */
export interface TrajectoryKeyframe {
    /** Time in seconds */
    time: number;
    /** Position */
    position: Vector3;
    /** Target look-at point */
    target?: Vector3;
    /** Optional rotation (if not looking at target) */
    rotation?: Euler;
    /** FOV at this keyframe */
    fov?: number;
    /** Easing function name */
    easing?: 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out';
}
/**
 * Trajectory configuration
 */
export interface TrajectoryConfig {
    /** Movement type */
    movement: CameraMovement;
    /** Duration in seconds */
    duration: number;
    /** Keyframes (auto-generated for simple movements) */
    keyframes?: TrajectoryKeyframe[];
    /** Subject to track (for tracking shots) */
    trackSubject?: string;
    /** Orbit center (for orbit shots) */
    orbitCenter?: Vector3;
    /** Orbit radius */
    orbitRadius?: number;
    /** Arc angle in degrees (for arc shots, default 360) */
    arcAngle?: number;
    /** Shake intensity for handheld (0-1) */
    shakeIntensity?: number;
}
/**
 * Camera constraint: Frame a subject
 */
export declare function Frames(camera: Variable | string, subject: Variable | string, shotSize?: ShotSize): ConstraintNode;
/**
 * Camera constraint: Maintain clear line of sight
 */
export declare function HasLineOfSight(camera: Variable | string, subject: Variable | string, minVisibility?: number): ConstraintNode;
/**
 * Camera constraint: Maintain shot size
 */
export declare function MaintainsShotSize(camera: Variable | string, subject: Variable | string, shotSize: ShotSize): ConstraintNode;
/**
 * Camera constraint: Specific camera angle
 */
export declare function HasCameraAngle(camera: Variable | string, subject: Variable | string, angle: CameraAngle): ConstraintNode;
/**
 * Camera constraint: Avoid obstruction
 */
export declare function AvoidsObstruction(camera: Variable | string, subject: Variable | string, maxOcclusion?: number): ConstraintNode;
/**
 * Camera constraint: Follow subject
 */
export declare function FollowsSubject(camera: Variable | string, subject: Variable | string, followDistance?: number): ConstraintNode;
/**
 * Calculate optimal camera position based on composition rules
 */
export declare function calculateOptimalPosition(subjectPosition: Vector3, subjectDirection: Vector3, config: CameraPlacementConfig): Vector3;
/**
 * Generate trajectory keyframes for a movement type
 */
export declare function generateTrajectoryKeyframes(config: TrajectoryConfig, startPosition: Vector3, startTarget: Vector3): TrajectoryKeyframe[];
//# sourceMappingURL=CameraSystem.d.ts.map