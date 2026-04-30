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
} from './CameraTrajectoryGenerator';

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
} from './TrajectoryGenerator';

// Shot types (re-export defaults as named exports)
export { default as DollyShot } from './DollyShot';
export { default as CraneShot } from './CraneShot';
export { default as OrbitShot } from './OrbitShot';
export { default as PanTilt } from './PanTilt';
export { default as TrackingShot } from './TrackingShot';
export { default as HandheldSim } from './HandheldSim';
