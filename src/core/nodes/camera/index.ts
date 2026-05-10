/**
 * Camera Nodes Module Export
 * Camera data access, depth of field, view properties, and Three.js integration
 */

export {
  // Node Classes
  CameraDataNode,
  DepthOfFieldNode,
  FieldOfViewNode,
  CameraRayNode,
  ViewMatrixNode,

  // Camera Integration
  CameraNodeExecutor,
  setActiveCamera,
  getActiveCamera,

  // Type Definitions
  type CameraNodeBase,
  type CameraDataInputs,
  type CameraDataOutputs,
  type DepthOfFieldInputs,
  type DepthOfFieldOutputs,
  type FieldOfViewInputs,
  type FieldOfViewOutputs,
  type CameraRayInputs,
  type CameraRayOutputs,
  type ViewMatrixInputs,
  type ViewMatrixOutputs,

  // Factory Functions
  createCameraDataNode,
  createDepthOfFieldNode,
  createFocalLengthNode,
  createCameraRayNode,
  createViewMatrixNode,
} from './CameraNodes';

// Backward-compatible aliases
export { FieldOfViewNode as FocalLengthNode } from './CameraNodes';
export type { FieldOfViewInputs as FocalLengthInputs, FieldOfViewOutputs as FocalLengthOutputs } from './CameraNodes';
