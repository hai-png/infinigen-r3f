/**
 * Camera Trajectories Module
 *
 * Exports trajectory generators for automated camera movement.
 */
export { TrajectoryType, EasingFunctions, CameraTrajectoryGenerator, } from './CameraTrajectoryGenerator.js';
export { InterpolationMode, catmullRomSpline, interpolatePosition, bezierInterpolate, generateTrajectory, createCurveFromTrajectory, calculateTrajectoryLength, resampleUniform, } from './TrajectoryGenerator.js';
// Shot types
export { DollyShot } from './DollyShot.js';
export { CraneShot } from './CraneShot.js';
export { OrbitShot } from './OrbitShot.js';
export { PanTilt } from './PanTilt.js';
export { TrackingShot } from './TrackingShot.js';
export { HandheldSim } from './HandheldSim.js';
//# sourceMappingURL=index.js.map