/**
 * Camera Type Definitions for Infinigen R3F
 * 
 * Defines all camera types supported by the system including
 * perspective, orthographic, stereo, panoramic, and fisheye cameras.
 */

import * as THREE from 'three';

/**
 * Enumeration of available camera types
 */
export enum CameraType {
  PERSPECTIVE = 'perspective',
  ORTHOGRAPHIC = 'orthographic',
  STEREO = 'stereo',
  PANORAMIC = 'panoramic',
  FISHEYE = 'fisheye',
}

/**
 * Base configuration for all camera types
 */
export interface BaseCameraConfig {
  type: CameraType;
  position?: THREE.Vector3;
  target?: THREE.Vector3;
  up?: THREE.Vector3;
  near?: number;
  far?: number;
  fov?: number;
  zoom?: number;
  filmGauge?: number;
  filmOffset?: number;
}

/**
 * Perspective camera configuration
 */
export interface PerspectiveCameraConfig extends BaseCameraConfig {
  type: CameraType.PERSPECTIVE;
  fov: number; // Field of view in degrees
  aspect?: number;
  focus?: number;
  filmGauge?: number;
  filmOffset?: number;
}

/**
 * Orthographic camera configuration
 */
export interface OrthographicCameraConfig extends BaseCameraConfig {
  type: CameraType.ORTHOGRAPHIC;
  left: number;
  right: number;
  top: number;
  bottom: number;
  zoom?: number;
}

/**
 * Stereo camera configuration (for VR)
 */
export interface StereoCameraConfig extends BaseCameraConfig {
  type: CameraType.STEREO;
  fov: number;
  aspect?: number;
  eyeSeparation: number; // Distance between eyes
  focalLength: number;
}

/**
 * Panoramic camera configuration (360°)
 */
export interface PanoramicCameraConfig extends BaseCameraConfig {
  type: CameraType.PANORAMIC;
  equirectangular: boolean;
  cubicMap?: boolean;
  resolution?: number;
}

/**
 * Fisheye camera configuration
 */
export interface FisheyeCameraConfig extends BaseCameraConfig {
  type: CameraType.FISHEYE;
  fov: number;
  aspect?: number;
  curvature: number; // Lens curvature factor
  distortion?: number; // Radial distortion
}

/**
 * Union type for all camera configurations
 */
export type CameraConfig = 
  | PerspectiveCameraConfig
  | OrthographicCameraConfig
  | StereoCameraConfig
  | PanoramicCameraConfig
  | FisheyeCameraConfig;

/**
 * Camera type with Three.js camera instance
 */
export interface TypedCamera {
  config: CameraConfig;
  camera: THREE.Camera;
  type: CameraType;
}

/**
 * Create a perspective camera
 */
export function createPerspectiveCamera(config: PerspectiveCameraConfig): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    config.fov,
    config.aspect || 16 / 9,
    config.near || 0.1,
    config.far || 1000
  );
  
  if (config.position) camera.position.copy(config.position);
  if (config.target) camera.lookAt(config.target);
  if (config.up) camera.up.copy(config.up);
  if (config.zoom) camera.zoom = config.zoom;
  if (config.focus !== undefined) camera.focus = config.focus;
  if (config.filmGauge !== undefined) camera.filmGauge = config.filmGauge;
  if (config.filmOffset !== undefined) camera.filmOffset = config.filmOffset;
  
  return camera;
}

/**
 * Create an orthographic camera
 */
export function createOrthographicCamera(config: OrthographicCameraConfig): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(
    config.left,
    config.right,
    config.top,
    config.bottom,
    config.near || 0.1,
    config.far || 1000
  );
  
  if (config.position) camera.position.copy(config.position);
  if (config.target) camera.lookAt(config.target);
  if (config.up) camera.up.copy(config.up);
  if (config.zoom) camera.zoom = config.zoom;
  
  return camera;
}

/**
 * Create a stereo camera setup (simplified - in production use @react-three/xr)
 */
export function createStereoCamera(config: StereoCameraConfig): { 
  left: THREE.PerspectiveCamera; 
  right: THREE.PerspectiveCamera;
  center: THREE.PerspectiveCamera;
} {
  const center = new THREE.PerspectiveCamera(
    config.fov,
    config.aspect || 16 / 9,
    config.near || 0.1,
    config.far || 1000
  );
  
  if (config.position) center.position.copy(config.position);
  if (config.target) center.lookAt(config.target);
  
  const halfSep = config.eyeSeparation / 2;
  
  const left = center.clone();
  left.position.add(new THREE.Vector3(-halfSep, 0, 0));
  left.lookAt(config.target || new THREE.Vector3(0, 0, -1));
  
  const right = center.clone();
  right.position.add(new THREE.Vector3(halfSep, 0, 0));
  right.lookAt(config.target || new THREE.Vector3(0, 0, -1));
  
  return { left, right, center };
}

/**
 * Create a panoramic camera (uses cube camera or equirectangular)
 */
export function createPanoramicCamera(config: PanoramicCameraConfig): {
  camera: THREE.PerspectiveCamera;
  renderTarget?: THREE.WebGLCubeRenderTarget;
} {
  const camera = new THREE.PerspectiveCamera(
    config.fov || 75,
    1, // Cube aspect
    config.near || 0.1,
    config.far || 1000
  );
  
  if (config.position) camera.position.copy(config.position);
  
  let renderTarget: THREE.WebGLCubeRenderTarget | undefined;
  
  if (config.cubicMap || !config.equirectangular) {
    const size = config.resolution || 512;
    renderTarget = new THREE.WebGLCubeRenderTarget(size);
    renderTarget.texture.type = THREE.HalfFloatType;
  }
  
  return { camera, renderTarget };
}

/**
 * Create a fisheye camera (simulated via shader post-processing)
 */
export function createFisheyeCamera(config: FisheyeCameraConfig): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    config.fov,
    config.aspect || 16 / 9,
    config.near || 0.1,
    config.far || 1000
  );
  
  if (config.position) camera.position.copy(config.position);
  if (config.target) camera.lookAt(config.target);
  if (config.up) camera.up.copy(config.up);
  
  // Store fisheye parameters as user data for post-processing
  camera.userData.fisheye = {
    curvature: config.curvature,
    distortion: config.distortion || 0,
  };
  
  return camera;
}

/**
 * Factory function to create any camera type
 */
export function createCamera(config: CameraConfig): TypedCamera {
  let camera: THREE.Camera;
  
  switch (config.type) {
    case CameraType.PERSPECTIVE:
      camera = createPerspectiveCamera(config as PerspectiveCameraConfig);
      break;
    case CameraType.ORTHOGRAPHIC:
      camera = createOrthographicCamera(config as OrthographicCameraConfig);
      break;
    case CameraType.STEREO:
      // For stereo, return the center camera
      const stereo = createStereoCamera(config as StereoCameraConfig);
      camera = stereo.center;
      break;
    case CameraType.PANORAMIC:
      const pano = createPanoramicCamera(config as PanoramicCameraConfig);
      camera = pano.camera;
      break;
    case CameraType.FISHEYE:
      camera = createFisheyeCamera(config as FisheyeCameraConfig);
      break;
    default:
      throw new Error(`Unknown camera type: ${(config as any).type}`);
  }
  
  return {
    config,
    camera,
    type: config.type,
  };
}

/**
 * Get camera field of view (works for all camera types)
 */
export function getCameraFOV(camera: THREE.Camera): number {
  if (camera instanceof THREE.PerspectiveCamera) {
    return camera.fov;
  } else if (camera instanceof THREE.OrthographicCamera) {
    // Convert orthographic frustum to equivalent FOV
    const height = camera.top - camera.bottom;
    const distance = camera.position.length();
    return 2 * Math.atan(height / (2 * distance)) * (180 / Math.PI);
  }
  return 75; // Default
}

/**
 * Check if camera is perspective
 */
export function isPerspective(camera: THREE.Camera): camera is THREE.PerspectiveCamera {
  return camera instanceof THREE.PerspectiveCamera;
}

/**
 * Check if camera is orthographic
 */
export function isOrthographic(camera: THREE.Camera): camera is THREE.OrthographicCamera {
  return camera instanceof THREE.OrthographicCamera;
}

/**
 * Clone a camera with all its properties
 */
export function cloneCamera(camera: THREE.Camera): THREE.Camera {
  if (camera instanceof THREE.PerspectiveCamera) {
    return camera.clone();
  } else if (camera instanceof THREE.OrthographicCamera) {
    return camera.clone();
  }
  return camera.clone();
}

/**
 * Update camera to look at target
 */
export function lookAt(camera: THREE.Camera, target: THREE.Vector3): void {
  camera.lookAt(target);
}

/**
 * Set camera position and update look direction
 */
export function setPosition(camera: THREE.Camera, position: THREE.Vector3, maintainLookAt: boolean = true): void {
  const currentTarget = new THREE.Vector3();
  if (maintainLookAt) {
    camera.getWorldDirection(currentTarget);
    currentTarget.add(camera.position);
  }
  
  camera.position.copy(position);
  
  if (maintainLookAt && currentTarget.lengthSq() > 0) {
    camera.lookAt(currentTarget);
  }
}
