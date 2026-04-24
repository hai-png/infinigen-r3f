/**
 * Camera Trajectories Module
 * 
 * Exports trajectory generators for automated camera movement.
 */

export {
  TrajectoryType,
  OrbitConfig,
  SplineConfig,
  FPSConfig,
  CinematicConfig,
  TrajectorySample,
  TrajectoryData,
  EasingFunctions,
  CameraTrajectoryGenerator,
} from './CameraTrajectoryGenerator.js';

export {
  Keyframe,
  TrajectorySample as LegacyTrajectorySample,
  InterpolationMode,
  TrajectoryConfig,
  catmullRomSpline,
  interpolatePosition,
  bezierInterpolate,
  generateTrajectory,
  createCurveFromTrajectory,
  calculateTrajectoryLength,
  resampleUniform,
} from './TrajectoryGenerator.js';

// Shot types
export { DollyShot } from './DollyShot.js';
export { CraneShot } from './CraneShot.js';
export { OrbitShot } from './OrbitShot.js';
export { PanTilt } from './PanTilt.js';
export { TrackingShot } from './TrackingShot.js';
export { HandheldSim } from './HandheldSim.js';
