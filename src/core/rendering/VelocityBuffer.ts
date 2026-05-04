/**
 * Velocity Buffer for Infinigen R3F
 *
 * Tracks per-object previous/current world matrices so that optical flow
 * can be computed frame-accurately from the difference between transforms.
 *
 * The buffer automatically:
 *   - Stores the previous-frame world matrix for every tracked Object3D
 *   - Swaps current → previous at the start of each frame via `updateFrame()`
 *   - Provides per-object 2D screen-space motion vectors via `getMotionVector()`
 *   - Handles camera motion (subtracts camera contribution when requested)
 *
 * Typical lifecycle:
 * ```ts
 * const vb = new VelocityBuffer();
 * // Each frame:
 * vb.updateFrame(scene.children);
 * // ... render with optical-flow material using vb.getPrevMatrix(obj) ...
 * ```
 *
 * @module rendering
 */

import {
  Object3D,
  Matrix4,
  Vector3,
  Vector2,
  Camera,
  PerspectiveCamera,
} from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Per-object tracked transform data.
 */
export interface ObjectVelocityData {
  /** Object reference (weak-style, used for identity) */
  object: Object3D;
  /** World matrix from the *previous* frame */
  prevMatrixWorld: Matrix4;
  /** World matrix from the *current* frame (updated each call to updateFrame) */
  currMatrixWorld: Matrix4;
  /** Whether this is the first frame the object has been seen */
  isFirstFrame: boolean;
}

/**
 * Camera velocity data for separating object vs. camera motion.
 */
export interface CameraVelocityData {
  prevMatrixWorldInverse: Matrix4;
  prevProjectionMatrix: Matrix4;
  currMatrixWorldInverse: Matrix4;
  currProjectionMatrix: Matrix4;
}

// ---------------------------------------------------------------------------
// Reusable temporaries (avoids per-call allocations)
// ---------------------------------------------------------------------------

const _v3A = new Vector3();
const _v3B = new Vector3();
const _m4A = new Matrix4();
const _m4B = new Matrix4();

// ---------------------------------------------------------------------------
// VelocityBuffer
// ---------------------------------------------------------------------------

export class VelocityBuffer {
  /** Tracked per-object velocity data, keyed by object UUID */
  private objectData: Map<string, ObjectVelocityData> = new Map();

  /** Camera velocity data for the most recent frame pair */
  private cameraData: CameraVelocityData | null = null;

  /** Whether camera data has been initialized (first frame skipped) */
  private cameraInitialized: boolean = false;

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Call once per frame *before* rendering to snapshot current transforms
   * and rotate previous-frame data.
   *
   * @param objects - All objects that should be tracked (typically scene.children
   *                  or the result of a scene traverse)
   */
  updateFrame(objects: Object3D[]): void {
    for (const obj of objects) {
      this.updateObject(obj);
    }
  }

  /**
   * Update a single object's velocity data.
   * Call this for objects added mid-frame or for selective tracking.
   */
  updateObject(obj: Object3D): void {
    const key = obj.uuid;
    const existing = this.objectData.get(key);

    if (existing) {
      // Shift current → previous
      existing.prevMatrixWorld.copy(existing.currMatrixWorld);
      existing.currMatrixWorld.copy(obj.matrixWorld);
      existing.isFirstFrame = false;
    } else {
      // First time we see this object – both prev and curr are the same
      // so that the first frame produces zero flow rather than a spurious jump.
      this.objectData.set(key, {
        object: obj,
        prevMatrixWorld: obj.matrixWorld.clone(),
        currMatrixWorld: obj.matrixWorld.clone(),
        isFirstFrame: true,
      });
    }
  }

  /**
   * Update camera velocity data. Call once per frame with the active camera.
   *
   * @param camera - The current frame's camera
   */
  updateCamera(camera: Camera): void {
    const viewMatrix = camera.matrixWorldInverse;
    const projMatrix = (camera as PerspectiveCamera).projectionMatrix;

    if (!this.cameraData || !this.cameraInitialized) {
      // First frame – zero flow
      this.cameraData = {
        prevMatrixWorldInverse: viewMatrix.clone(),
        prevProjectionMatrix: projMatrix.clone(),
        currMatrixWorldInverse: viewMatrix.clone(),
        currProjectionMatrix: projMatrix.clone(),
      };
      this.cameraInitialized = true;
    } else {
      this.cameraData.prevMatrixWorldInverse.copy(this.cameraData.currMatrixWorldInverse);
      this.cameraData.prevProjectionMatrix.copy(this.cameraData.currProjectionMatrix);
      this.cameraData.currMatrixWorldInverse.copy(viewMatrix);
      this.cameraData.currProjectionMatrix.copy(projMatrix);
    }
  }

  /**
   * Compute the 2D screen-space motion vector for an object.
   *
   * Projects the object's world-space center from both the previous and
   * current frame cameras and returns the pixel-space displacement.
   *
   * @param obj    - The object to compute motion for
   * @param camera - The current frame's camera
   * @param width  - Render target width in pixels
   * @param height - Render target height in pixels
   * @returns 2D motion vector in pixel coordinates (x = right, y = down)
   */
  getMotionVector(
    obj: Object3D,
    camera: Camera,
    width: number,
    height: number,
  ): Vector2 {
    const data = this.objectData.get(obj.uuid);
    if (!data) {
      return new Vector2(0, 0);
    }

    // Get world-space center of the object for current and previous frames
    const prevCenter = _v3A.setFromMatrixPosition(data.prevMatrixWorld);
    const currCenter = _v3B.setFromMatrixPosition(data.currMatrixWorld);

    // Project both to screen space
    const prevScreen = prevCenter.clone().project(camera);
    const currScreen = currCenter.clone().project(camera);

    // Convert NDC [-1,1] to pixel coordinates
    const prevPx = new Vector2(
      (prevScreen.x + 1) * 0.5 * width,
      (1 - prevScreen.y) * 0.5 * height,
    );
    const currPx = new Vector2(
      (currScreen.x + 1) * 0.5 * width,
      (1 - currScreen.y) * 0.5 * height,
    );

    return currPx.clone().sub(prevPx);
  }

  /**
   * Get the previous-frame world matrix for an object.
   * Returns the current matrix if the object was not tracked previously.
   */
  getPrevMatrix(obj: Object3D): Matrix4 {
    const data = this.objectData.get(obj.uuid);
    return data ? data.prevMatrixWorld : obj.matrixWorld;
  }

  /**
   * Get the current-frame world matrix for an object.
   */
  getCurrMatrix(obj: Object3D): Matrix4 {
    const data = this.objectData.get(obj.uuid);
    return data ? data.currMatrixWorld : obj.matrixWorld;
  }

  /**
   * Get camera velocity data for the previous/current frame pair.
   */
  getCameraData(): CameraVelocityData | null {
    return this.cameraData;
  }

  /**
   * Get the previous-frame camera inverse world matrix.
   */
  getPrevViewMatrix(): Matrix4 {
    return this.cameraData?.prevMatrixWorldInverse ?? new Matrix4();
  }

  /**
   * Get the previous-frame camera projection matrix.
   */
  getPrevProjectionMatrix(): Matrix4 {
    return this.cameraData?.prevProjectionMatrix ?? new Matrix4();
  }

  /**
   * Check if an object is being tracked.
   */
  hasObject(obj: Object3D): boolean {
    return this.objectData.has(obj.uuid);
  }

  /**
   * Check whether this is the first frame for an object
   * (i.e. no valid previous transform exists).
   */
  isFirstFrame(obj: Object3D): boolean {
    const data = this.objectData.get(obj.uuid);
    return data ? data.isFirstFrame : true;
  }

  /**
   * Remove an object from tracking.
   */
  removeObject(obj: Object3D): void {
    this.objectData.delete(obj.uuid);
  }

  /**
   * Get the number of tracked objects.
   */
  get size(): number {
    return this.objectData.size;
  }

  /**
   * Iterate over all tracked object velocity data.
   */
  entries(): IterableIterator<[string, ObjectVelocityData]> {
    return this.objectData.entries();
  }

  /**
   * Get all tracked object velocity data as an array.
   */
  getAllVelocities(): ObjectVelocityData[] {
    return Array.from(this.objectData.values());
  }

  /**
   * Get the full velocity map (object → {prevMatrix, currMatrix}).
   * Useful for passing to OpticalFlowPass.setObjectVelocities().
   */
  getVelocityMap(): Map<Object3D, { prevMatrix: Matrix4; currMatrix: Matrix4 }> {
    const map = new Map<Object3D, { prevMatrix: Matrix4; currMatrix: Matrix4 }>();
    for (const [, data] of this.objectData) {
      map.set(data.object, {
        prevMatrix: data.prevMatrixWorld,
        currMatrix: data.currMatrixWorld,
      });
    }
    return map;
  }

  /**
   * Reset all tracking data. Call when the scene changes drastically
   * (e.g. loading a new scene) to avoid stale matrices.
   */
  reset(): void {
    this.objectData.clear();
    this.cameraData = null;
    this.cameraInitialized = false;
  }

  /**
   * Dispose of all resources. After calling this the VelocityBuffer
   * should not be used again.
   */
  dispose(): void {
    this.reset();
  }
}

export default VelocityBuffer;
