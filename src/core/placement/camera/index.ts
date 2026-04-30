/**
 * Camera System Module
 * 
 * Exports camera placement, cinematography, and trajectory components.
 */

// Core camera system
export {
  // Types
  type CameraType,
  type ShotSize,
  type CameraAngle,
  type CameraMovement,
  type CameraProperties,
  type CompositionRule,
  type CameraPlacementConfig,
  type TrajectoryKeyframe,
  type TrajectoryConfig,
  
  // Constants
  DEFAULT_CAMERA_PROPERTIES,
  SHOT_SIZE_DISTANCES,
  CAMERA_ANGLE_ELEVATIONS,
  
  // Functions
  calculateOptimalPosition,
  generateTrajectoryKeyframes,
  
  // Constraints
  Frames,
  HasLineOfSight,
  MaintainsShotSize,
  HasCameraAngle,
  AvoidsObstruction,
  FollowsSubject,
} from './CameraSystem';

// Auto-placement algorithms (to be implemented)
// export {
//   AutoPlacementEngine,
//   ViewpointScorer,
//   ObstructionDetector,
// } from './AutoPlacement';

// Cinematography rules (to be implemented)
// export {
//   RuleOfThirdsComposer,
//   LeadingLinesAnalyzer,
//   FramingAssistant,
// } from './Cinematography';

// Trajectory generators (to be implemented)
// export {
//   DollyShotGenerator,
//   OrbitShotGenerator,
//   TrackingShotGenerator,
//   HandheldSimulator,
// } from './Trajectories';
