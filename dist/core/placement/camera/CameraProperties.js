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
export var FilmFormat;
(function (FilmFormat) {
    FilmFormat["FULL_FRAME"] = "full_frame";
    FilmFormat["APS_C"] = "aps_c";
    FilmFormat["MICRO_FOUR_THIRDS"] = "m43";
    FilmFormat["ONE_INCH"] = "one_inch";
    FilmFormat["SUPER_35"] = "super_35";
    FilmFormat["IMAX"] = "imax";
})(FilmFormat || (FilmFormat = {}));
/**
 * Sensor dimensions for common formats
 */
export const SENSOR_DIMENSIONS = {
    [FilmFormat.FULL_FRAME]: { width: 36, height: 24 },
    [FilmFormat.APS_C]: { width: 22.2, height: 14.8 },
    [FilmFormat.MICRO_FOUR_THIRDS]: { width: 17.3, height: 13 },
    [FilmFormat.ONE_INCH]: { width: 13.2, height: 8.8 },
    [FilmFormat.SUPER_35]: { width: 24.89, height: 18.66 },
    [FilmFormat.IMAX]: { width: 70.41, height: 52.63 },
};
/**
 * Default camera properties (typical DSLR settings)
 */
export const DEFAULT_CAMERA_PROPERTIES = {
    focalLength: 50,
    fStop: 2.8,
    focusDistance: 5,
    shutterSpeed: 1 / 60,
    iso: 400,
    filmFormat: FilmFormat.FULL_FRAME,
    lensDistortion: 0,
    chromaticAberration: 0,
    vignetting: 0,
    bokehIntensity: 0,
    exposureCompensation: 0,
    whiteBalance: 5600,
    tint: 0,
    cameraHeight: 1.6,
    tiltAngle: 0,
};
/**
 * Calculate depth of field
 */
export function calculateDepthOfField(focalLength, fStop, focusDistance, circleOfConfusion = 0.03) {
    const f = focalLength / 1000; // Convert to meters
    const N = fStop;
    const s = focusDistance;
    const c = circleOfConfusion / 1000; // Convert to meters
    const H = (f * f) / (N * c) + f; // Hyperfocal distance
    if (s >= H) {
        return {
            near: H / 2,
            far: Infinity,
            total: Infinity,
        };
    }
    const near = (H * s) / (H + (s - f));
    const far = (H * s) / (H - (s - f));
    return {
        near: Math.max(0, near),
        far: far > 0 ? far : Infinity,
        total: far === Infinity ? Infinity : far - near,
    };
}
/**
 * Calculate horizontal field of view
 */
export function calculateHorizontalFOV(focalLength, sensorWidth) {
    return 2 * Math.atan(sensorWidth / (2 * focalLength)) * (180 / Math.PI);
}
/**
 * Calculate vertical field of view
 */
export function calculateVerticalFOV(focalLength, sensorHeight) {
    return 2 * Math.atan(sensorHeight / (2 * focalLength)) * (180 / Math.PI);
}
/**
 * Get sensor dimensions from film format
 */
export function getSensorDimensions(format) {
    return SENSOR_DIMENSIONS[format];
}
/**
 * Calculate equivalent focal length for different sensor sizes
 */
export function calculateEquivalentFocalLength(focalLength, sourceFormat, targetFormat) {
    const sourceDiag = Math.hypot(SENSOR_DIMENSIONS[sourceFormat].width, SENSOR_DIMENSIONS[sourceFormat].height);
    const targetDiag = Math.hypot(SENSOR_DIMENSIONS[targetFormat].width, SENSOR_DIMENSIONS[targetFormat].height);
    return focalLength * (targetDiag / sourceDiag);
}
/**
 * Calculate exposure value (EV)
 */
export function calculateExposureValue(fStop, shutterSpeed, iso = 100) {
    return Math.log2((fStop * fStop) / shutterSpeed) - Math.log2(iso / 100);
}
/**
 * Apply properties to Three.js camera
 */
export function applyCameraProperties(camera, properties) {
    if (camera instanceof THREE.PerspectiveCamera) {
        if (properties.focalLength !== undefined && properties.sensorWidth !== undefined) {
            const fov = calculateHorizontalFOV(properties.focalLength, properties.sensorWidth);
            camera.fov = fov;
        }
        if (properties.filmFormat !== undefined) {
            const dims = getSensorDimensions(properties.filmFormat);
            camera.filmGauge = dims.width;
        }
    }
    // Store additional properties for post-processing
    camera.userData.cameraProperties = {
        ...camera.userData.cameraProperties,
        ...properties,
    };
}
/**
 * Preset camera configurations
 */
export const CAMERA_PRESETS = {
    CINEMATIC: {
        ...DEFAULT_CAMERA_PROPERTIES,
        focalLength: 35,
        fStop: 1.4,
        bokehIntensity: 0.8,
    },
    DOCUMENTARY: {
        ...DEFAULT_CAMERA_PROPERTIES,
        focalLength: 24,
        fStop: 4,
        cameraHeight: 1.5,
    },
    PORTRAIT: {
        ...DEFAULT_CAMERA_PROPERTIES,
        focalLength: 85,
        fStop: 1.8,
        bokehIntensity: 0.9,
    },
    LANDSCAPE: {
        ...DEFAULT_CAMERA_PROPERTIES,
        focalLength: 24,
        fStop: 8,
        focusDistance: 10,
    },
    MACRO: {
        ...DEFAULT_CAMERA_PROPERTIES,
        focalLength: 100,
        fStop: 5.6,
        focusDistance: 0.3,
    },
};
//# sourceMappingURL=CameraProperties.js.map