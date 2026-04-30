/**
 * Camera Nodes Module
 * Camera data access, depth of field, and view properties
 * Ported from Blender Geometry Nodes
 */

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
    };
  }

  execute(camera: Camera): CameraDataOutputs {
    const type = this.inputs.type || 'view_matrix';
    
    if (type === 'view_matrix') {
      this.outputs.matrix = camera.matrixWorldInverse.toArray();
    } else if (type === 'projection_matrix') {
      this.outputs.matrix = camera.projectionMatrix.toArray();
    } else if (type === 'view_projection_matrix') {
      const viewProj = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
      this.outputs.matrix = viewProj.toArray();
    }

    this.outputs.cameraMatrixWorld = camera.matrixWorld.toArray();
    
    // Calculate depth and distance (simplified)
    this.outputs.depth = 0;
    this.outputs.distance = 0;

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
      focusDistance: inputs.focusDistance ?? 10,
      aperture: inputs.fStop ?? 2.8,
      focalLength: inputs.focalLength ?? 50,
      sensorWidth: inputs.sensorWidth ?? 36,
    };
  }

  execute(camera: InfinigenCamera): DepthOfFieldOutputs {
    const focalLength = this.inputs.focalLength ?? camera.focal ?? 50;
    const fStop = this.inputs.fStop ?? 2.8;
    const focusDistance = this.inputs.focusDistance ?? 10;
    const sensorWidth = this.inputs.sensorWidth ?? 36;

    // Calculate aperture diameter: focal_length / f_stop
    const aperture = focalLength / fStop;

    this.outputs = {
      focusDistance,
      aperture,
      focalLength,
      sensorWidth,
    };

    return this.outputs;
  }
}

// ----------------------------------------------------------------------------
// Focal Length Node
// ----------------------------------------------------------------------------

export interface FocalLengthInputs {
  camera?: Camera;
  focalLength?: number;
  sensorWidth?: number;
  fov?: number;
}

export interface FocalLengthOutputs {
  focalLength: number;
  fov: number;
  sensorWidth: number;
}

export class FocalLengthNode implements CameraNodeBase {
  readonly category = 'camera';
  readonly nodeType = 'focal_length';
  readonly name = 'Focal Length';
  readonly inputs: FocalLengthInputs;
  outputs!: FocalLengthOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  constructor(inputs: FocalLengthInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      focalLength: inputs.focalLength ?? 50,
      fov: inputs.fov ?? 39.6,
      sensorWidth: inputs.sensorWidth ?? 36,
    };
  }

  execute(camera: InfinigenCamera): FocalLengthOutputs {
    let focalLength = this.inputs.focalLength ?? camera.focal ?? 50;
    const sensorWidth = this.inputs.sensorWidth ?? 36;
    
    // If FOV is provided, calculate focal length
    if (this.inputs.fov !== undefined) {
      const fovRad = (this.inputs.fov * Math.PI) / 180;
      focalLength = (sensorWidth / 2) / Math.tan(fovRad / 2);
    }

    // Calculate FOV from focal length
    const fov = 2 * Math.atan((sensorWidth / 2) / focalLength) * (180 / Math.PI);

    this.outputs = {
      focalLength,
      fov,
      sensorWidth,
    };

    return this.outputs;
  }
}

// ----------------------------------------------------------------------------
// View Matrix Node
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

  execute(camera: Camera): ViewMatrixOutputs {
    this.outputs.viewMatrix = camera.matrixWorldInverse.toArray();
    this.outputs.inverseViewMatrix = camera.matrixWorld.toArray();
    return this.outputs;
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

export function createFocalLengthNode(inputs?: FocalLengthInputs): FocalLengthNode {
  return new FocalLengthNode(inputs);
}

export function createViewMatrixNode(inputs?: ViewMatrixInputs): ViewMatrixNode {
  return new ViewMatrixNode(inputs);
}

