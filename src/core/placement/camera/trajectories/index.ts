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

// Shot types
export { DollyShot } from './DollyShot';
export { CraneShot } from './CraneShot';
export { OrbitShot } from './OrbitShot';
export { PanTilt } from './PanTilt';
export { TrackingShot } from './TrackingShot';
export { HandheldSim } from './HandheldSim';
