/**
 * Camera Nodes Module
 * Camera data access, depth of field, and view properties
 * Ported from Blender Geometry Nodes
 *
 * Enhanced with Three.js camera integration:
 * - CameraNodeExecutor: Resolves camera data from a THREE.Camera instance
 * - setActiveCamera(): Inject the current camera into the node system
 * - Full perspective and orthographic camera support
 * - View ray generation for ray-marching and screen-space effects
 */

import * as THREE from 'three';
import { Camera } from 'three';
import type { NodeBase, AttributeDomain } from '../core/types';

/**
 * Extended Camera interface with Infinigen-specific properties
 * Three.js Camera doesn't include focal/near/far directly;
 * these are available on PerspectiveCamera but we reference them generically here.
 */
export interface InfinigenCamera extends Camera {
  focal?: number;
  near: number;
  far: number;
}

// ============================================================================
// Active Camera Management
// ============================================================================

/** Currently active camera instance */
let activeCamera: THREE.Camera | null = null;

/**
 * Set the active camera for the camera node system.
 *
 * Call this whenever the active camera changes (e.g., on viewport
 * switch or camera animation frame). All camera nodes will resolve
 * their data from this camera.
 *
 * @param camera - The THREE.Camera to use (PerspectiveCamera or OrthographicCamera)
 */
export function setActiveCamera(camera: THREE.Camera): void {
  activeCamera = camera;
}

/**
 * Get the currently active camera.
 *
 * @returns The active THREE.Camera, or null if none has been set
 */
export function getActiveCamera(): THREE.Camera | null {
  return activeCamera;
}

// ============================================================================
// Type Definitions
// ============================================================================

export interface CameraNodeBase extends NodeBase {
  category: 'camera';
}

// ----------------------------------------------------------------------------
// Camera Data Node
// ----------------------------------------------------------------------------

export interface CameraDataInputs {
  camera?: Camera;
  type?: 'view_matrix' | 'projection_matrix' | 'view_projection_matrix';
}

export interface CameraDataOutputs {
  matrix: number[];
  cameraMatrixWorld: number[];
  depth: number;
  distance: number;
  fov: number;
  near: number;
  far: number;
  aspect: number;
  position: THREE.Vector3;
  direction: THREE.Vector3;
  isPerspective: boolean;
}

export class CameraDataNode implements CameraNodeBase {
  readonly category = 'camera';
  readonly nodeType = 'camera_data';
  readonly name = 'Camera Data';
  readonly inputs: CameraDataInputs;
  readonly outputs: CameraDataOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  constructor(inputs: CameraDataInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      cameraMatrixWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      depth: 0,
      distance: 0,
      fov: 50,
      near: 0.1,
      far: 1000,
      aspect: 1.777,
      position: new THREE.Vector3(0, 0, 5),
      direction: new THREE.Vector3(0, 0, -1),
      isPerspective: true,
    };
  }

  /**
   * Execute the camera data node.
   *
   * Resolves camera data from either:
   * 1. The camera passed via `inputs.camera`
   * 2. The globally active camera set via `setActiveCamera()`
   *
   * Returns camera properties including FOV, near, far, aspect,
   * position, and direction.
   */
  execute(camera?: Camera, targetPosition?: THREE.Vector3): CameraDataOutputs {
    const cam = camera ?? this.inputs.camera ?? activeCamera;

    if (!cam) {
      // No camera available — return defaults
      return this.outputs;
    }

    const type = this.inputs.type || 'view_matrix';

    if (type === 'view_matrix') {
      this.outputs.matrix = cam.matrixWorldInverse.toArray();
    } else if (type === 'projection_matrix') {
      this.outputs.matrix = cam.projectionMatrix.toArray();
    } else if (type === 'view_projection_matrix') {
      const viewProj = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse);
      this.outputs.matrix = viewProj.toArray();
    }

    this.outputs.cameraMatrixWorld = cam.matrixWorld.toArray();

    // Camera position
    const cameraPos = new THREE.Vector3();
    cam.getWorldPosition(cameraPos);
    this.outputs.position = cameraPos;

    // Camera forward direction
    const cameraDir = new THREE.Vector3(0, 0, -1);
    cameraDir.applyQuaternion(cam.quaternion);
    this.outputs.direction = cameraDir;

    // Perspective camera properties
    const isPerspective = cam instanceof THREE.PerspectiveCamera;
    this.outputs.isPerspective = isPerspective;

    if (isPerspective) {
      const perspCam = cam as THREE.PerspectiveCamera;
      this.outputs.fov = THREE.MathUtils.radToDeg(perspCam.fov);
      this.outputs.near = perspCam.near;
      this.outputs.far = perspCam.far;
      this.outputs.aspect = perspCam.aspect;
    } else if (cam instanceof THREE.OrthographicCamera) {
      const orthoCam = cam as THREE.OrthographicCamera;
      this.outputs.fov = 0; // Orthographic has no FOV
      this.outputs.near = orthoCam.near;
      this.outputs.far = orthoCam.far;
      this.outputs.aspect = (orthoCam.right - orthoCam.left) / (orthoCam.top - orthoCam.bottom);
    } else {
      // Generic camera fallback
      const near = (cam as any).near ?? 0.1;
      const far = (cam as any).far ?? 1000;
      this.outputs.near = near;
      this.outputs.far = far;
      this.outputs.fov = 50;
      this.outputs.aspect = 1.777;
    }

    // Compute depth and distance
    if (targetPosition) {
      this.outputs.distance = cameraPos.distanceTo(targetPosition);
      const toTarget = new THREE.Vector3().subVectors(targetPosition, cameraPos);
      this.outputs.depth = toTarget.dot(cameraDir);
    } else {
      this.outputs.depth = (this.outputs.near + this.outputs.far) / 2;
      this.outputs.distance = this.outputs.depth;
    }

    return this.outputs;
  }
}

// ----------------------------------------------------------------------------
// Field of View Node
// ----------------------------------------------------------------------------

export interface FieldOfViewInputs {
  camera?: Camera;
  /** Override FOV (degrees). If set, computed from camera instead. */
  fov?: number;
  sensorWidth?: number;
}

export interface FieldOfViewOutputs {
  /** Horizontal FOV in degrees */
  fovH: number;
  /** Vertical FOV in degrees */
  fovV: number;
  /** Focal length in mm */
  focalLength: number;
  /** Sensor width in mm */
  sensorWidth: number;
  /** Whether this is a perspective camera */
  isPerspective: boolean;
  /** Orthographic width (0 if perspective) */
  orthoWidth: number;
  /** Orthographic height (0 if perspective) */
  orthoHeight: number;
}

export class FieldOfViewNode implements CameraNodeBase {
  readonly category = 'camera';
  readonly nodeType = 'field_of_view';
  readonly name = 'Field of View';
  readonly inputs: FieldOfViewInputs;
  outputs!: FieldOfViewOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  constructor(inputs: FieldOfViewInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      fovH: 39.6,
      fovV: 39.6,
      focalLength: 50,
      sensorWidth: 36,
      isPerspective: true,
      orthoWidth: 0,
      orthoHeight: 0,
    };
  }

  /**
   * Execute the Field of View node.
   *
   * Computes FOV from the actual camera (perspective or orthographic).
   * For perspective cameras, computes both horizontal and vertical FOV
   * and derives the focal length. For orthographic cameras, returns
   * the view bounds instead of FOV.
   */
  execute(camera?: InfinigenCamera): FieldOfViewOutputs {
    const cam = camera ?? (this.inputs.camera as InfinigenCamera) ?? activeCamera as InfinigenCamera;

    if (!cam) {
      return this.outputs;
    }

    const sensorWidth = this.inputs.sensorWidth ?? 36;
    const isPerspective = cam instanceof THREE.PerspectiveCamera;

    this.outputs.isPerspective = isPerspective;
    this.outputs.sensorWidth = sensorWidth;

    if (isPerspective) {
      const perspCam = cam as THREE.PerspectiveCamera;
      const fovVRad = THREE.MathUtils.degToRad(perspCam.fov);
      const fovV = perspCam.fov; // Vertical FOV in degrees
      const fovHRad = 2 * Math.atan(Math.tan(fovVRad / 2) * perspCam.aspect);
      const fovH = THREE.MathUtils.radToDeg(fovHRad);

      this.outputs.fovV = fovV;
      this.outputs.fovH = fovH;
      this.outputs.focalLength = (sensorWidth / 2) / Math.tan(fovVRad / 2);
      this.outputs.orthoWidth = 0;
      this.outputs.orthoHeight = 0;
    } else if (cam instanceof THREE.OrthographicCamera) {
      const orthoCam = cam as THREE.OrthographicCamera;
      this.outputs.fovH = 0;
      this.outputs.fovV = 0;
      this.outputs.focalLength = 0;
      this.outputs.orthoWidth = orthoCam.right - orthoCam.left;
      this.outputs.orthoHeight = orthoCam.top - orthoCam.bottom;
    } else {
      // Fallback for unknown camera types
      const fov = this.inputs.fov ?? cam.focal ?? 50;
      this.outputs.fovV = fov;
      this.outputs.fovH = fov;
      this.outputs.focalLength = (sensorWidth / 2) / Math.tan(THREE.MathUtils.degToRad(fov) / 2);
      this.outputs.orthoWidth = 0;
      this.outputs.orthoHeight = 0;
    }

    return this.outputs;
  }
}

// ----------------------------------------------------------------------------
// Depth of Field Node
// ----------------------------------------------------------------------------

export interface DepthOfFieldInputs {
  camera?: Camera;
  focusDistance?: number;
  fStop?: number;
  focalLength?: number;
  sensorWidth?: number;
}

export interface DepthOfFieldOutputs {
  focusDistance: number;
  aperture: number;
  focalLength: number;
  sensorWidth: number;
  /** Near limit of the DOF region */
  nearLimit: number;
  /** Far limit of the DOF region */
  farLimit: number;
  /** Circle of confusion size at infinity (mm) */
  cocInfinity: number;
}

export class DepthOfFieldNode implements CameraNodeBase {
  readonly category = 'camera';
  readonly nodeType = 'depth_of_field';
  readonly name = 'Depth of Field';
  readonly inputs: DepthOfFieldInputs;
  outputs!: DepthOfFieldOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  constructor(inputs: DepthOfFieldInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      focusDistance: 10,
      aperture: 17.86,
      focalLength: 50,
      sensorWidth: 36,
      nearLimit: 5.2,
      farLimit: 42.8,
      cocInfinity: 0.03,
    };
  }

  /**
   * Execute the Depth of Field node.
   *
   * Computes DOF parameters from the camera. Sets up focus distance,
   * aperture, near/far limits, and circle of confusion.
   * Supports both perspective and orthographic cameras.
   */
  execute(camera?: InfinigenCamera): DepthOfFieldOutputs {
    const cam = camera ?? (this.inputs.camera as InfinigenCamera) ?? activeCamera as InfinigenCamera;

    // Determine focal length
    let focalLength = this.inputs.focalLength ?? 50;
    if (cam instanceof THREE.PerspectiveCamera) {
      // Derive focal length from the camera's FOV
      const fovRad = THREE.MathUtils.degToRad(cam.fov);
      const sensorWidth = this.inputs.sensorWidth ?? 36;
      focalLength = (sensorWidth / 2) / Math.tan(fovRad / 2);
    } else if (cam && (cam as InfinigenCamera).focal) {
      focalLength = (cam as InfinigenCamera).focal!;
    }

    const fStop = this.inputs.fStop ?? 2.8;
    const focusDistance = this.inputs.focusDistance ?? 10;
    const sensorWidth = this.inputs.sensorWidth ?? 36;

    // Calculate aperture diameter
    const aperture = focalLength / fStop;

    // Calculate DOF limits using thin lens equation
    // H = f² / (N * c) where c = circle of confusion
    const cocStandard = sensorWidth / 1500; // Standard CoC for 35mm equiv
    const hyperfocal = (focalLength * focalLength) / (fStop * cocStandard);

    // Near and far limits
    let nearLimit = (focusDistance * (hyperfocal - focalLength)) /
      (hyperfocal + focusDistance - 2 * focalLength);
    let farLimit = (focusDistance * (hyperfocal - focalLength)) /
      (hyperfocal - focusDistance);

    // Clamp values
    nearLimit = Math.max(nearLimit, 0.01);
    if (farLimit < 0 || !isFinite(farLimit)) {
      farLimit = Infinity; // Everything beyond hyperfocal is in focus
    }

    // Circle of confusion at infinity
    const cocInfinity = (focalLength * focalLength) / (fStop * hyperfocal);

    this.outputs = {
      focusDistance,
      aperture,
      focalLength,
      sensorWidth,
      nearLimit,
      farLimit,
      cocInfinity,
    };

    return this.outputs;
  }
}

// ----------------------------------------------------------------------------
// Camera Ray Node
// ----------------------------------------------------------------------------

export interface CameraRayInputs {
  camera?: Camera;
  /** Screen-space UV coordinates [0,1] (defaults to fragment UV) */
  screenUV?: THREE.Vector2;
  /** Override origin point (defaults to camera position) */
  origin?: THREE.Vector3;
}

export interface CameraRayOutputs {
  /** Ray origin in world space */
  origin: THREE.Vector3;
  /** Ray direction in world space (normalized) */
  direction: THREE.Vector3;
  /** Near clip distance */
  near: number;
  /** Far clip distance */
  far: number;
  /** Inverse projection matrix */
  inverseProjection: THREE.Matrix4;
  /** Inverse view matrix */
  inverseView: THREE.Matrix4;
}

export class CameraRayNode implements CameraNodeBase {
  readonly category = 'camera';
  readonly nodeType = 'camera_ray';
  readonly name = 'Camera Ray';
  readonly inputs: CameraRayInputs;
  outputs!: CameraRayOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  constructor(inputs: CameraRayInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      origin: new THREE.Vector3(0, 0, 5),
      direction: new THREE.Vector3(0, 0, -1),
      near: 0.1,
      far: 1000,
      inverseProjection: new THREE.Matrix4(),
      inverseView: new THREE.Matrix4(),
    };
  }

  /**
   * Execute the Camera Ray node.
   *
   * Generates view rays from camera parameters. For perspective cameras,
   * computes rays from the camera position through the given screen-space
   * UV coordinate. For orthographic cameras, generates parallel rays.
   *
   * @param camera - Optional camera override
   * @param screenUV - Screen-space UV coordinate [0,1]
   */
  execute(camera?: Camera, screenUV?: THREE.Vector2): CameraRayOutputs {
    const cam = camera ?? this.inputs.camera ?? activeCamera;

    if (!cam) {
      return this.outputs;
    }

    const uv = screenUV ?? this.inputs.screenUV ?? new THREE.Vector2(0.5, 0.5);

    // Get camera position and direction
    const cameraPos = new THREE.Vector3();
    cam.getWorldPosition(cameraPos);

    this.outputs.near = (cam as any).near ?? 0.1;
    this.outputs.far = (cam as any).far ?? 1000;
    this.outputs.inverseProjection = cam.projectionMatrix.clone().invert();
    this.outputs.inverseView = cam.matrixWorld.clone();

    if (cam instanceof THREE.PerspectiveCamera) {
      // Perspective camera: ray from eye through screen pixel
      const perspCam = cam as THREE.PerspectiveCamera;

      // Convert screen UV to NDC [-1, 1]
      const ndcX = uv.x * 2.0 - 1.0;
      const ndcY = uv.y * 2.0 - 1.0;

      // Unproject from NDC to view space
      const viewCoord = new THREE.Vector3(ndcX, ndcY, -1.0);
      viewCoord.unproject(perspCam);

      // Compute direction from camera to unprojected point
      const direction = new THREE.Vector3();
      direction.subVectors(viewCoord, cameraPos).normalize();

      this.outputs.origin = cameraPos;
      this.outputs.direction = direction;
    } else if (cam instanceof THREE.OrthographicCamera) {
      // Orthographic camera: parallel rays
      const orthoCam = cam as THREE.OrthographicCamera;
      const cameraDir = new THREE.Vector3(0, 0, -1);
      cameraDir.applyQuaternion(cam.quaternion);

      // Compute ray origin from UV within the orthographic bounds
      const ndcX = uv.x * 2.0 - 1.0;
      const ndcY = uv.y * 2.0 - 1.0;

      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);

      const halfWidth = (orthoCam.right - orthoCam.left) / 2;
      const halfHeight = (orthoCam.top - orthoCam.bottom) / 2;

      const origin = cameraPos.clone()
        .add(right.multiplyScalar(ndcX * halfWidth))
        .add(up.multiplyScalar(ndcY * halfHeight));

      this.outputs.origin = origin;
      this.outputs.direction = cameraDir.normalize();
    } else {
      // Generic camera fallback
      const cameraDir = new THREE.Vector3(0, 0, -1);
      cameraDir.applyQuaternion(cam.quaternion);
      this.outputs.origin = cameraPos;
      this.outputs.direction = cameraDir.normalize();
    }

    return this.outputs;
  }

  /**
   * Generate an array of rays covering the screen.
   * Useful for ray-marching effects.
   *
   * @param camera - The camera to generate rays from
   * @param width  - Number of horizontal rays
   * @param height - Number of vertical rays
   * @returns Array of ray { origin, direction } objects
   */
  generateRayGrid(
    camera?: Camera,
    width: number = 8,
    height: number = 8,
  ): Array<{ origin: THREE.Vector3; direction: THREE.Vector3 }> {
    const rays: Array<{ origin: THREE.Vector3; direction: THREE.Vector3 }> = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const uv = new THREE.Vector2(
          (x + 0.5) / width,
          (y + 0.5) / height,
        );
        const result = this.execute(camera, uv);
        rays.push({
          origin: result.origin.clone(),
          direction: result.direction.clone(),
        });
      }
    }

    return rays;
  }
}

// ----------------------------------------------------------------------------
// View Matrix Node (existing)
// ----------------------------------------------------------------------------

export interface ViewMatrixInputs {
  camera?: Camera;
}

export interface ViewMatrixOutputs {
  viewMatrix: number[];
  inverseViewMatrix: number[];
}

export class ViewMatrixNode implements CameraNodeBase {
  readonly category = 'camera';
  readonly nodeType = 'view_matrix';
  readonly name = 'View Matrix';
  readonly inputs: ViewMatrixInputs;
  readonly outputs: ViewMatrixOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  constructor(inputs: ViewMatrixInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      viewMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      inverseViewMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    };
  }

  execute(camera?: Camera): ViewMatrixOutputs {
    const cam = camera ?? this.inputs.camera ?? activeCamera;

    if (!cam) {
      return this.outputs;
    }

    this.outputs.viewMatrix = cam.matrixWorldInverse.toArray();
    this.outputs.inverseViewMatrix = cam.matrixWorld.toArray();
    return this.outputs;
  }
}

// ============================================================================
// CameraNodeExecutor
// ============================================================================

/**
 * CameraNodeExecutor - Resolves camera data from a THREE.Camera instance.
 *
 * This is the central executor that the node evaluation system uses
 * when it encounters camera-related node types. It delegates to the
 * appropriate node class based on the node type.
 */
export class CameraNodeExecutor {
  private cameraDataNode: CameraDataNode;
  private fovNode: FieldOfViewNode;
  private dofNode: DepthOfFieldNode;
  private rayNode: CameraRayNode;
  private viewMatrixNode: ViewMatrixNode;

  constructor() {
    this.cameraDataNode = new CameraDataNode();
    this.fovNode = new FieldOfViewNode();
    this.dofNode = new DepthOfFieldNode();
    this.rayNode = new CameraRayNode();
    this.viewMatrixNode = new ViewMatrixNode();
  }

  /**
   * Execute a camera node by type.
   *
   * @param nodeType - The camera node type string
   * @param inputs   - Node inputs
   * @param context  - Execution context (may include camera reference)
   * @returns The node's output values
   */
  execute(nodeType: string, inputs: Record<string, any>, context?: Record<string, any>): any {
    const camera = (inputs.camera as Camera) ?? context?.camera ?? activeCamera;

    switch (nodeType) {
      case 'camera_data':
        return this.cameraDataNode.execute(camera, inputs.targetPosition);

      case 'field_of_view':
        return this.fovNode.execute(camera as InfinigenCamera);

      case 'depth_of_field':
        return this.dofNode.execute(camera as InfinigenCamera);

      case 'camera_ray':
        return this.rayNode.execute(camera, inputs.screenUV);

      case 'view_matrix':
        return this.viewMatrixNode.execute(camera);

      default:
        console.warn(`[CameraNodeExecutor] Unknown camera node type: ${nodeType}`);
        return {};
    }
  }

  /**
   * Check if a node type is a camera node.
   */
  static isCameraNode(nodeType: string): boolean {
    return [
      'camera_data',
      'field_of_view',
      'depth_of_field',
      'camera_ray',
      'view_matrix',
    ].includes(nodeType);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createCameraDataNode(inputs?: CameraDataInputs): CameraDataNode {
  return new CameraDataNode(inputs);
}

export function createDepthOfFieldNode(inputs?: DepthOfFieldInputs): DepthOfFieldNode {
  return new DepthOfFieldNode(inputs);
}

export function createFocalLengthNode(inputs?: FieldOfViewInputs): FieldOfViewNode {
  return new FieldOfViewNode(inputs);
}

export function createCameraRayNode(inputs?: CameraRayInputs): CameraRayNode {
  return new CameraRayNode(inputs);
}

export function createViewMatrixNode(inputs?: ViewMatrixInputs): ViewMatrixNode {
  return new ViewMatrixNode(inputs);
}
