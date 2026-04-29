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
export declare enum CameraType {
    PERSPECTIVE = "perspective",
    ORTHOGRAPHIC = "orthographic",
    STEREO = "stereo",
    PANORAMIC = "panoramic",
    FISHEYE = "fisheye"
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
    fov: number;
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
    eyeSeparation: number;
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
    curvature: number;
    distortion?: number;
}
/**
 * Union type for all camera configurations
 */
export type CameraConfig = PerspectiveCameraConfig | OrthographicCameraConfig | StereoCameraConfig | PanoramicCameraConfig | FisheyeCameraConfig;
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
export declare function createPerspectiveCamera(config: PerspectiveCameraConfig): THREE.PerspectiveCamera;
/**
 * Create an orthographic camera
 */
export declare function createOrthographicCamera(config: OrthographicCameraConfig): THREE.OrthographicCamera;
/**
 * Create a stereo camera setup (simplified - in production use @react-three/xr)
 */
export declare function createStereoCamera(config: StereoCameraConfig): {
    left: THREE.PerspectiveCamera;
    right: THREE.PerspectiveCamera;
    center: THREE.PerspectiveCamera;
};
/**
 * Create a panoramic camera (uses cube camera or equirectangular)
 */
export declare function createPanoramicCamera(config: PanoramicCameraConfig): {
    camera: THREE.PerspectiveCamera;
    renderTarget?: THREE.WebGLCubeRenderTarget;
};
/**
 * Create a fisheye camera (simulated via shader post-processing)
 */
export declare function createFisheyeCamera(config: FisheyeCameraConfig): THREE.PerspectiveCamera;
/**
 * Factory function to create any camera type
 */
export declare function createCamera(config: CameraConfig): TypedCamera;
/**
 * Get camera field of view (works for all camera types)
 */
export declare function getCameraFOV(camera: THREE.Camera): number;
/**
 * Check if camera is perspective
 */
export declare function isPerspective(camera: THREE.Camera): camera is THREE.PerspectiveCamera;
/**
 * Check if camera is orthographic
 */
export declare function isOrthographic(camera: THREE.Camera): camera is THREE.OrthographicCamera;
/**
 * Clone a camera with all its properties
 */
export declare function cloneCamera(camera: THREE.Camera): THREE.Camera;
/**
 * Update camera to look at target
 */
export declare function lookAt(camera: THREE.Camera, target: THREE.Vector3): void;
/**
 * Set camera position and update look direction
 */
export declare function setPosition(camera: THREE.Camera, position: THREE.Vector3, maintainLookAt?: boolean): void;
//# sourceMappingURL=CameraTypes.d.ts.map