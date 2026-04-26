/**
 * Animation System Exports
 *
 * Complete animation and dynamics system for procedural motion,
 * inverse kinematics, timeline-based animations, and gait generation.
 */
// Core Animation Engine & Timeline
export { AnimationEngine, getGlobalEngine, resetGlobalEngine } from './core/AnimationEngine';
export { Timeline, AnimationTrack, Easings, getEasing, lerp } from './core/Timeline';
// Procedural Motion
export { OscillatoryMotion, PatternGenerator, evaluateWave, createPresetMotion, createPresetPattern } from './procedural/OscillatoryMotion';
export { PathFollower, generateCameraPath } from './procedural/PathFollowing';
export { WindAnimationSystem, WindZone } from './procedural/WindAnimationSystem';
// Character Animation & IK
export { InverseKinematics, CCDIKSolver, FABRIKSolver, createArmChain, createLegChain, createSnakeChain } from './character/InverseKinematics';
export { GaitGenerator, createPresetGait } from './character/GaitGenerator';
// Legacy Animation Policy (for backwards compatibility)
export { AnimationPolicyEngine, EasingFunctions, DefaultPolicies } from './AnimationPolicy';
//# sourceMappingURL=index.js.map