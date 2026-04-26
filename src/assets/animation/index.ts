/**
 * Animation System Exports
 * 
 * Complete animation and dynamics system for procedural motion,
 * inverse kinematics, timeline-based animations, and gait generation.
 */

// Core Animation Engine & Timeline
export { AnimationEngine, getGlobalEngine, resetGlobalEngine } from './core/AnimationEngine';
export type { 
  AnimationEventType, 
  AnimationEvent, 
  TimeConfig, 
  AnimationEngineConfig, 
  Updatable 
} from './core/AnimationEngine';

export { Timeline, AnimationTrack, Easings, getEasing, lerp } from './core/Timeline';
export type { 
  EasingType, 
  EasingFunction, 
  Keyframe, 
  TrackConfig,
  InterpolationType
} from './core/Timeline';

// Procedural Motion
export { 
  OscillatoryMotion, 
  PatternGenerator, 
  evaluateWave,
  createPresetMotion,
  createPresetPattern 
} from './motion/OscillatoryMotion';
export type { 
  WaveType, 
  OscillatoryConfig, 
  PatternType, 
  PatternConfig 
} from './motion/OscillatoryMotion';

export { PathFollower, generateCameraPath } from './motion/PathFollowing';
export type { 
  SplineType, 
  OrientationMode, 
  SplineKeyframe, 
  PathFollowingConfig, 
  PathSample 
} from './motion/PathFollowing';

export { WindAnimationSystem, WindZone } from './motion/WindAnimationSystem';
export type { 
  WindLayer, 
  WindParams, 
  AnimationConfig 
} from './motion/WindAnimationSystem';

// Character Animation & IK
export { 
  InverseKinematics, 
  CCDIKSolver, 
  FABRIKSolver,
  createArmChain,
  createLegChain,
  createSnakeChain
} from './character/InverseKinematics';
export type { 
  JointConfig, 
  IKSolverType, 
  IKChainConfig, 
  JointState 
} from './character/InverseKinematics';

export { GaitGenerator, createPresetGait } from './character/GaitGenerator';
export type { 
  GaitType, 
  LegConfig, 
  GaitConfig, 
  LegState 
} from './character/GaitGenerator';

// Legacy Animation Policy (for backwards compatibility)
export { AnimationPolicyEngine, EasingFunctions, DefaultPolicies } from './AnimationPolicy';
export type {
  AnimationClip,
  AnimationCategory,
  Trajectory,
  AnimationPolicy,
  TrajectoryConstraint,
  ConstraintType,
  PolicyWeights,
  TrajectoryScore,
  AnimatedScene,
  AnimatedObject,
  QualityMetrics,
  AnimationContext,
  TrajectoryOptions
} from './AnimationPolicy';
