/**
 * CameraRig — Parent/child camera hierarchy system
 *
 * The original Infinigen has `spawn_camera_rigs()` which creates parent/child
 * camera hierarchies for stereo and multi-view rendering. This module provides:
 *
 *   - Stereo rig: left/right eye cameras with configurable interaxial distance
 *   - Multiview rig: N cameras arranged around a center point
 *   - Unified parent position/rotation that propagates to all children
 *
 * Each child camera has relative position/rotation offsets from the parent.
 * The rig can be moved/rotated as a unit, and all children update accordingly.
 *
 * @module placement/camera
 */

import * as THREE from 'three';

// ============================================================================
// Types
// ============================================================================

/** Describes a single child camera within a rig */
export interface ChildCameraDescriptor {
  /** Unique identifier for this child camera */
  id: string;
  /** Human-readable label (e.g., "left_eye", "right_eye", "view_0") */
  label: string;
  /** Position offset relative to the parent camera */
  positionOffset: THREE.Vector3;
  /** Rotation offset relative to the parent camera (Euler angles in radians) */
  rotationOffset: THREE.Euler;
  /** Computed world position (updated when parent moves) */
  worldPosition: THREE.Vector3;
  /** Computed world rotation (updated when parent moves) */
  worldQuaternion: THREE.Quaternion;
}

/** Configuration for creating a stereo rig */
export interface StereoRigConfig {
  /** Interaxial distance (distance between left and right eyes) in meters.
   *  Default: 0.065 (average human interpupillary distance) */
  interaxialDistance: number;
  /** Convergence distance in meters (0 = parallel stereo, >0 = toe-in).
   *  Default: 0 (parallel) */
  convergenceDistance: number;
  /** Whether to toe-in the cameras toward the convergence point.
   *  Default: false (parallel stereo) */
  toeIn: boolean;
}

/** Configuration for creating a multiview rig */
export interface MultiviewRigConfig {
  /** Number of cameras arranged around the center point.
   *  Must be >= 2. Default: 6 */
  viewCount: number;
  /** Radius from the center point in meters. Default: 0.3 */
  radius: number;
  /** Height offset from the parent camera position. Default: 0 */
  heightOffset: number;
  /** Starting angle in radians (0 = along +X axis). Default: 0 */
  startAngle: number;
  /** Whether all cameras look inward toward the center. Default: false */
  lookInward: boolean;
  /** Custom per-view offsets (overrides auto-computed positions).
   *  If provided, must have `viewCount` entries. */
  customOffsets?: THREE.Vector3[];
}

/** Default stereo rig configuration (human IPD, parallel stereo) */
export const DEFAULT_STEREO_RIG_CONFIG: StereoRigConfig = {
  interaxialDistance: 0.065,
  convergenceDistance: 0,
  toeIn: false,
};

/** Default multiview rig configuration */
export const DEFAULT_MULTIVIEW_RIG_CONFIG: MultiviewRigConfig = {
  viewCount: 6,
  radius: 0.3,
  heightOffset: 0,
  startAngle: 0,
  lookInward: false,
};

/** Result of creating a rig */
export interface CameraRigResult {
  /** The rig instance */
  rig: CameraRig;
  /** Descriptors for all child cameras */
  children: ChildCameraDescriptor[];
  /** The type of rig created */
  type: 'stereo' | 'multiview' | 'custom';
}

// ============================================================================
// CameraRig
// ============================================================================

/**
 * Manages a parent camera with N child cameras that maintain relative
 * position/rotation offsets from the parent.
 *
 * The parent camera represents the "ideal" viewpoint; children are offset
 * from it. Moving or rotating the parent automatically updates all children's
 * world-space positions and rotations.
 *
 * Usage:
 * ```ts
 * // Create a stereo rig
 * const rig = CameraRig.createStereoRig();
 * rig.updateParentPosition(new THREE.Vector3(10, 5, 20));
 * rig.updateParentRotation(new THREE.Euler(0, Math.PI / 4, 0));
 * const children = rig.getChildCameras();
 * // children[0] = left eye, children[1] = right eye
 * ```
 */
export class CameraRig {
  // ── Core state ──────────────────────────────────────────────────────

  /** Parent camera position (world space) */
  private parentPosition: THREE.Vector3;

  /** Parent camera rotation (world space) */
  private parentQuaternion: THREE.Quaternion;

  /** Child camera descriptors */
  private children: ChildCameraDescriptor[];

  /** Type of rig (set during creation) */
  private rigType: 'stereo' | 'multiview' | 'custom';

  /** Configuration snapshot (for reference) */
  private configSnapshot: StereoRigConfig | MultiviewRigConfig | null;

  constructor() {
    this.parentPosition = new THREE.Vector3(0, 0, 0);
    this.parentQuaternion = new THREE.Quaternion(); // identity
    this.children = [];
    this.rigType = 'custom';
    this.configSnapshot = null;
  }

  // ── Factory methods ──────────────────────────────────────────────────

  /**
   * Create a stereo camera rig with left and right eye cameras.
   *
   * The left eye is offset by -interaxialDistance/2 along the parent's
   * local X axis; the right eye is offset by +interaxialDistance/2.
   *
   * If `toeIn` is true and `convergenceDistance > 0`, each eye camera
   * is rotated slightly inward to converge at the specified distance.
   */
  static createStereoRig(config: Partial<StereoRigConfig> = {}): CameraRig {
    const fullConfig: StereoRigConfig = {
      ...DEFAULT_STEREO_RIG_CONFIG,
      ...config,
    };

    const rig = new CameraRig();
    rig.rigType = 'stereo';
    rig.configSnapshot = fullConfig;

    const halfIAD = fullConfig.interaxialDistance / 2;

    // Left eye: offset -X in parent's local space
    const leftChild: ChildCameraDescriptor = {
      id: 'left_eye',
      label: 'Left Eye',
      positionOffset: new THREE.Vector3(-halfIAD, 0, 0),
      rotationOffset: new THREE.Euler(0, 0, 0),
      worldPosition: new THREE.Vector3(),
      worldQuaternion: new THREE.Quaternion(),
    };

    // Right eye: offset +X in parent's local space
    const rightChild: ChildCameraDescriptor = {
      id: 'right_eye',
      label: 'Right Eye',
      positionOffset: new THREE.Vector3(halfIAD, 0, 0),
      rotationOffset: new THREE.Euler(0, 0, 0),
      worldPosition: new THREE.Vector3(),
      worldQuaternion: new THREE.Quaternion(),
    };

    // Toe-in: rotate each eye slightly toward center
    if (fullConfig.toeIn && fullConfig.convergenceDistance > 0) {
      const toeInAngle = Math.atan2(halfIAD, fullConfig.convergenceDistance);
      // Left eye rotates clockwise (positive Y) to look right toward center
      leftChild.rotationOffset = new THREE.Euler(0, toeInAngle, 0);
      // Right eye rotates counter-clockwise (negative Y) to look left toward center
      rightChild.rotationOffset = new THREE.Euler(0, -toeInAngle, 0);
    }

    rig.children = [leftChild, rightChild];
    rig.updateChildTransforms();

    return rig;
  }

  /**
   * Create a multiview camera rig with N cameras arranged around a center.
   *
   * Cameras are placed at equal angular intervals around the parent position,
   * at the specified radius in the parent's local XZ plane.
   */
  static createMultiviewRig(config: Partial<MultiviewRigConfig> = {}): CameraRig {
    const fullConfig: MultiviewRigConfig = {
      ...DEFAULT_MULTIVIEW_RIG_CONFIG,
      ...config,
    };

    const rig = new CameraRig();
    rig.rigType = 'multiview';
    rig.configSnapshot = fullConfig;

    const {
      viewCount,
      radius,
      heightOffset,
      startAngle,
      lookInward,
      customOffsets,
    } = fullConfig;

    if (viewCount < 2) {
      throw new Error(
        `[CameraRig] Multiview rig requires at least 2 views, got ${viewCount}`,
      );
    }

    const children: ChildCameraDescriptor[] = [];

    for (let i = 0; i < viewCount; i++) {
      const angle = startAngle + (2 * Math.PI * i) / viewCount;

      // Position: on the XZ circle in parent's local space
      const posOffset = customOffsets
        ? customOffsets[i].clone()
        : new THREE.Vector3(
            Math.cos(angle) * radius,
            heightOffset,
            Math.sin(angle) * radius,
          );

      // Rotation: look inward toward center if requested
      let rotOffset: THREE.Euler;
      if (lookInward) {
        // Rotate to face the center (opposite of the radial direction)
        const inwardAngle = angle + Math.PI;
        rotOffset = new THREE.Euler(0, inwardAngle, 0);
      } else {
        // Face the same direction as parent
        rotOffset = new THREE.Euler(0, 0, 0);
      }

      children.push({
        id: `view_${i}`,
        label: `View ${i}`,
        positionOffset: posOffset,
        rotationOffset: rotOffset,
        worldPosition: new THREE.Vector3(),
        worldQuaternion: new THREE.Quaternion(),
      });
    }

    rig.children = children;
    rig.updateChildTransforms();

    return rig;
  }

  // ── Parent transform ─────────────────────────────────────────────────

  /**
   * Update the parent camera position (world space).
   * All child cameras are recomputed.
   */
  updateParentPosition(position: THREE.Vector3): void {
    this.parentPosition.copy(position);
    this.updateChildTransforms();
  }

  /**
   * Update the parent camera rotation (Euler angles, world space).
   * All child cameras are recomputed.
   */
  updateParentRotation(rotation: THREE.Euler): void {
    this.parentQuaternion.setFromEuler(rotation);
    this.updateChildTransforms();
  }

  /**
   * Update the parent camera rotation (quaternion, world space).
   * All child cameras are recomputed.
   */
  updateParentQuaternion(quaternion: THREE.Quaternion): void {
    this.parentQuaternion.copy(quaternion);
    this.updateChildTransforms();
  }

  /**
   * Move the parent camera by a delta (world space).
   * All child cameras are recomputed.
   */
  translateParent(delta: THREE.Vector3): void {
    this.parentPosition.add(delta);
    this.updateChildTransforms();
  }

  /**
   * Rotate the parent camera by a delta Euler (applied on top of current).
   * All child cameras are recomputed.
   */
  rotateParentBy(deltaRotation: THREE.Euler): void {
    const deltaQ = new THREE.Quaternion().setFromEuler(deltaRotation);
    this.parentQuaternion.premultiply(deltaQ);
    this.parentQuaternion.normalize();
    this.updateChildTransforms();
  }

  // ── Child access ─────────────────────────────────────────────────────

  /**
   * Get all child camera descriptors (with current world transforms).
   */
  getChildCameras(): readonly ChildCameraDescriptor[] {
    return this.children;
  }

  /**
   * Get a specific child camera by id.
   */
  getChildById(id: string): ChildCameraDescriptor | undefined {
    return this.children.find((c) => c.id === id);
  }

  /**
   * Get the parent camera position (world space).
   */
  getParentPosition(): THREE.Vector3 {
    return this.parentPosition.clone();
  }

  /**
   * Get the parent camera quaternion (world space).
   */
  getParentQuaternion(): THREE.Quaternion {
    return this.parentQuaternion.clone();
  }

  /**
   * Get the parent camera rotation as Euler angles.
   */
  getParentRotation(): THREE.Euler {
    return new THREE.Euler().setFromQuaternion(this.parentQuaternion);
  }

  /**
   * Get the rig type.
   */
  getRigType(): 'stereo' | 'multiview' | 'custom' {
    return this.rigType;
  }

  /**
   * Get the number of child cameras.
   */
  getChildCount(): number {
    return this.children.length;
  }

  /**
   * Get the configuration snapshot used to create this rig.
   */
  getConfig(): StereoRigConfig | MultiviewRigConfig | null {
    return this.configSnapshot;
  }

  // ── Child management ─────────────────────────────────────────────────

  /**
   * Add a custom child camera to the rig.
   */
  addChild(child: ChildCameraDescriptor): void {
    this.children.push(child);
    this.updateChildTransform(child);
  }

  /**
   * Remove a child camera by id.
   * Returns true if the child was found and removed.
   */
  removeChild(id: string): boolean {
    const index = this.children.findIndex((c) => c.id === id);
    if (index === -1) return false;
    this.children.splice(index, 1);
    return true;
  }

  /**
   * Update a child camera's offset. Recomputes its world transform.
   */
  updateChildOffset(
    id: string,
    positionOffset?: THREE.Vector3,
    rotationOffset?: THREE.Euler,
  ): boolean {
    const child = this.children.find((c) => c.id === id);
    if (!child) return false;

    if (positionOffset) child.positionOffset.copy(positionOffset);
    if (rotationOffset) child.rotationOffset.copy(rotationOffset);

    this.updateChildTransform(child);
    return true;
  }

  // ── Three.js Camera creation ─────────────────────────────────────────

  /**
   * Create THREE.PerspectiveCamera instances for the parent and all children.
   *
   * @param fov Field of view in degrees
   * @param aspect Aspect ratio (width/height)
   * @param near Near clipping plane
   * @param far Far clipping plane
   * @returns Object with parent camera and child cameras map
   */
  createCameras(
    fov: number = 60,
    aspect: number = 16 / 9,
    near: number = 0.1,
    far: number = 1000,
  ): {
    parent: THREE.PerspectiveCamera;
    children: Map<string, THREE.PerspectiveCamera>;
  } {
    const parentCamera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    parentCamera.position.copy(this.parentPosition);
    parentCamera.quaternion.copy(this.parentQuaternion);

    const childCameras = new Map<string, THREE.PerspectiveCamera>();

    for (const child of this.children) {
      const cam = new THREE.PerspectiveCamera(fov, aspect, near, far);
      cam.position.copy(child.worldPosition);
      cam.quaternion.copy(child.worldQuaternion);
      childCameras.set(child.id, cam);
    }

    return { parent: parentCamera, children: childCameras };
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Recompute world transforms for all child cameras.
   */
  private updateChildTransforms(): void {
    for (const child of this.children) {
      this.updateChildTransform(child);
    }
  }

  /**
   * Compute a single child's world position and rotation from the parent
   * transform and the child's local offset.
   *
   * World position = parentPosition + parentQuaternion * positionOffset
   * World rotation = parentQuaternion * rotationOffsetQuaternion
   */
  private updateChildTransform(child: ChildCameraDescriptor): void {
    // World position: parent position + rotated local offset
    const rotatedOffset = child.positionOffset
      .clone()
      .applyQuaternion(this.parentQuaternion);
    child.worldPosition.copy(this.parentPosition).add(rotatedOffset);

    // World rotation: parent rotation * local rotation
    const localQ = new THREE.Quaternion().setFromEuler(child.rotationOffset);
    child.worldQuaternion.copy(this.parentQuaternion).multiply(localQ);
    child.worldQuaternion.normalize();
  }
}
