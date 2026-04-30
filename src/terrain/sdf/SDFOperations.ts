/**
 * SDF Operations - Re-export module
 * Provides compatibility import path for SDFOperations and SDFKernel
 */

export * from './sdf-operations';

// Re-export SignedDistanceField as SDFOperations for compatibility
export { SignedDistanceField as SDFOperations } from './sdf-operations';

/**
 * SDF Kernel - Represents a single SDF evaluation function
 * Used by terrain meshers to evaluate signed distance at arbitrary points
 */
export interface SDFKernel {
  /** Evaluate the SDF at a given position */
  evaluate(position: import('three').Vector3): number;
  /** Get the bounding box of this kernel's influence */
  getBounds(): import('three').Box3;
  /** Get the blend mode for this kernel */
  blendMode?: 'union' | 'smooth-union' | 'intersection' | 'difference';
  /** Smooth union blend factor */
  blendFactor?: number;
}
