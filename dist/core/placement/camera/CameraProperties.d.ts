/**
 * Camera Properties for Infinigen R3F
 *
 * Defines physical and optical properties of cameras including
 * focal length, aperture, sensor size, and exposure settings.
 */
import * as THREE from 'three';
/**
 * Film format standards
 */
export declare enum FilmFormat {
    FULL_FRAME = "full_frame",// 36x24mm
    APS_C = "aps_c",// 22.2x14.8mm
    MICRO_FOUR_THIRDS = "m43",// 17.3x13mm
    ONE_INCH = "one_inch",// 13.2x8.8mm
    SUPER_35 = "super_35",// 24.89x18.66mm
    IMAX = "imax"
}
/**
 * Sensor dimensions for common formats
 */
export declare const SENSOR_DIMENSIONS: Record<FilmFormat, {
    width: number;
    height: number;
}>;
/**
 * Camera optical and physical properties
 */
export interface CameraProperties {
    focalLength: number;
    fStop: number;
    focusDistance: number;
    shutterSpeed: number;
    iso: number;
    filmFormat: FilmFormat;
    sensorWidth?: number;
    sensorHeight?: number;
    lensDistortion?: number;
    chromaticAberration?: number;
    vignetting?: number;
    bokehIntensity?: number;
    exposureCompensation?: number;
    whiteBalance?: number;
    tint?: number;
    cameraHeight?: number;
    tiltAngle?: number;
}
/**
 * Default camera properties (typical DSLR settings)
 */
export declare const DEFAULT_CAMERA_PROPERTIES: CameraProperties;
/**
 * Calculate depth of field
 */
export declare function calculateDepthOfField(focalLength: number, fStop: number, focusDistance: number, circleOfConfusion?: number): {
    near: number;
    far: number;
    total: number;
};
/**
 * Calculate horizontal field of view
 */
export declare function calculateHorizontalFOV(focalLength: number, sensorWidth: number): number;
/**
 * Calculate vertical field of view
 */
export declare function calculateVerticalFOV(focalLength: number, sensorHeight: number): number;
/**
 * Get sensor dimensions from film format
 */
export declare function getSensorDimensions(format: FilmFormat): {
    width: number;
    height: number;
};
/**
 * Calculate equivalent focal length for different sensor sizes
 */
export declare function calculateEquivalentFocalLength(focalLength: number, sourceFormat: FilmFormat, targetFormat: FilmFormat): number;
/**
 * Calculate exposure value (EV)
 */
export declare function calculateExposureValue(fStop: number, shutterSpeed: number, iso?: number): number;
/**
 * Apply properties to Three.js camera
 */
export declare function applyCameraProperties(camera: THREE.Camera, properties: Partial<CameraProperties>): void;
/**
 * Preset camera configurations
 */
export declare const CAMERA_PRESETS: Record<string, CameraProperties>;
export default CameraProperties;
//# sourceMappingURL=CameraProperties.d.ts.map