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
export enum FilmFormat {
  FULL_FRAME = 'full_frame',      // 36x24mm
  APS_C = 'aps_c',                // 22.2x14.8mm
  MICRO_FOUR_THIRDS = 'm43',      // 17.3x13mm
  ONE_INCH = 'one_inch',          // 13.2x8.8mm
  SUPER_35 = 'super_35',          // 24.89x18.66mm
  IMAX = 'imax',                  // 70.41x52.63mm
}

/**
 * Sensor dimensions for common formats
 */
export const SENSOR_DIMENSIONS: Record<FilmFormat, { width: number; height: number }> = {
  [FilmFormat.FULL_FRAME]: { width: 36, height: 24 },
  [FilmFormat.APS_C]: { width: 22.2, height: 14.8 },
  [FilmFormat.MICRO_FOUR_THIRDS]: { width: 17.3, height: 13 },
  [FilmFormat.ONE_INCH]: { width: 13.2, height: 8.8 },
  [FilmFormat.SUPER_35]: { width: 24.89, height: 18.66 },
  [FilmFormat.IMAX]: { width: 70.41, height: 52.63 },
};

/**
 * Camera optical and physical properties
 */
export interface CameraProperties {
  // Optical properties
  focalLength: number;           // mm
  fStop: number;                 // Aperture f-number
  focusDistance: number;         // meters
  shutterSpeed: number;          // seconds (e.g., 1/60)
  iso: number;                   // ISO sensitivity
  
  // Sensor properties
  filmFormat: FilmFormat;
  sensorWidth?: number;          // mm (auto from format if not specified)
  sensorHeight?: number;         // mm (auto from format if not specified)
  
  // Lens properties
  lensDistortion?: number;       // Radial distortion coefficient
  chromaticAberration?: number;  // Chromatic aberration strength
  vignetting?: number;           // Vignetting strength (0-1)
  bokehIntensity?: number;       // Bokeh effect strength
  
  // Exposure
  exposureCompensation?: number; // EV compensation
  whiteBalance?: number;         // Kelvin temperature
  tint?: number;                 // Green-magenta tint
  
  // Physical
  cameraHeight?: number;         // Height from ground (meters)
  tiltAngle?: number;            // Vertical tilt (degrees)
}

/**
 * Default camera properties (typical DSLR settings)
 */
export const DEFAULT_CAMERA_PROPERTIES: CameraProperties = {
  focalLength: 50,
  fStop: 2.8,
  focusDistance: 5,
  shutterSpeed: 1/60,
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
export function calculateDepthOfField(
  focalLength: number,
  fStop: number,
  focusDistance: number,
  circleOfConfusion: number = 0.03
): { near: number; far: number; total: number } {
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
export function calculateHorizontalFOV(focalLength: number, sensorWidth: number): number {
  return 2 * Math.atan(sensorWidth / (2 * focalLength)) * (180 / Math.PI);
}

/**
 * Calculate vertical field of view
 */
export function calculateVerticalFOV(focalLength: number, sensorHeight: number): number {
  return 2 * Math.atan(sensorHeight / (2 * focalLength)) * (180 / Math.PI);
}

/**
 * Get sensor dimensions from film format
 */
export function getSensorDimensions(format: FilmFormat): { width: number; height: number } {
  return SENSOR_DIMENSIONS[format];
}

/**
 * Calculate equivalent focal length for different sensor sizes
 */
export function calculateEquivalentFocalLength(
  focalLength: number,
  sourceFormat: FilmFormat,
  targetFormat: FilmFormat
): number {
  const sourceDiag = Math.hypot(
    SENSOR_DIMENSIONS[sourceFormat].width,
    SENSOR_DIMENSIONS[sourceFormat].height
  );
  const targetDiag = Math.hypot(
    SENSOR_DIMENSIONS[targetFormat].width,
    SENSOR_DIMENSIONS[targetFormat].height
  );
  
  return focalLength * (targetDiag / sourceDiag);
}

/**
 * Calculate exposure value (EV)
 */
export function calculateExposureValue(
  fStop: number,
  shutterSpeed: number,
  iso: number = 100
): number {
  return Math.log2((fStop * fStop) / shutterSpeed) - Math.log2(iso / 100);
}

/**
 * Apply properties to Three.js camera
 */
export function applyCameraProperties(
  camera: THREE.Camera,
  properties: Partial<CameraProperties>
): void {
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
export const CAMERA_PRESETS: Record<string, CameraProperties> = {
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

export default CameraProperties;
