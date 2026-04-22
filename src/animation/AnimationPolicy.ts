/**
 * Animation Policy System
 * 
 * Trajectory scoring and animation policy evaluation for dynamic scenes.
 * Implements constraint-driven animation selection, trajectory optimization,
 * and motion quality assessment.
 * 
 * Based on original Infinigen's animation_policy.py (~727 LOC)
 * Ported to TypeScript with hybrid bridge support for complex trajectory calculations.
 */

import { Vector3 } from 'three';
import { HybridBridge } from '../bridge/hybrid-bridge';

export interface AnimationClip {
  /** Unique identifier */
  id: string;
  
  /** Animation name/type */
  name: string;
  
  /** Duration in seconds */
  duration: number;
  
  /** Number of keyframes */
  keyframeCount: number;
  
  /** Target object type (e.g., 'human', 'animal', 'vehicle') */
  targetType: string;
  
  /** Animation category */
  category: AnimationCategory;
  
  /** Root motion enabled */
  hasRootMotion: boolean;
  
  /** Metadata */
  metadata?: Record<string, any>;
}

export type AnimationCategory = 
  | 'locomotion'
  | 'gesture'
  | 'interaction'
  | 'idle'
  | 'transition'
  | 'combat'
  | 'dance'
  | 'sports';

export interface Trajectory {
  /** Sequence of positions */
  positions: Vector3[];
  
  /** Sequence of rotations (Y-axis angle) */
  rotations: number[];
  
  /** Timing for each keyframe (in seconds) */
  timings: number[];
  
  /** Total duration */
  duration: number;
  
  /** Start position */
  startPos: Vector3;
  
  /** End position */
  endPos: Vector3;
  
  /** Average speed (m/s) */
  avgSpeed: number;
  
  /** Maximum speed (m/s) */
  maxSpeed: number;
}

export interface AnimationPolicy {
  /** Policy identifier */
  id: string;
  
  /** Policy name */
  name: string;
  
  /** Priority (higher = more important) */
  priority: number;
  
  /** Applicable animation categories */
  categories: AnimationCategory[];
  
  /** Constraint functions */
  constraints: TrajectoryConstraint[];
  
  /** Scoring weights */
  weights: PolicyWeights;
}

export interface TrajectoryConstraint {
  /** Constraint type */
  type: ConstraintType;
  
  /** Parameter values */
  params: Record<string, any>;
  
  /** Weight (importance) */
  weight: number;
  
  /** Whether constraint is hard (must satisfy) or soft (prefer) */
  isHard: boolean;
}

export type ConstraintType =
  | 'path_length'
  | 'curvature'
  | 'collision_free'
  | 'smoothness'
  | 'speed_limit'
  | 'acceleration_limit'
  | 'orientation_align'
  | 'goal_reach'
  | 'obstacle_avoid';

export interface PolicyWeights {
  /** Weight for path efficiency (directness) */
  efficiency: number;
  
  /** Weight for smoothness */
  smoothness: number;
  
  /** Weight for collision avoidance */
  safety: number;
  
  /** Weight for natural motion */
  naturalness: number;
  
  /** Weight for goal achievement */
  goalOrientation: number;
  
  /** Weight for style/aesthetics */
  style: number;
}

export interface TrajectoryScore {
  /** Overall score (0-1) */
  totalScore: number;
  
  /** Breakdown by component */
  components: {
    efficiency: number;
    smoothness: number;
    safety: number;
    naturalness: number;
    goalOrientation: number;
    style: number;
  };
  
  /** Violated hard constraints */
  violations: string[];
  
  /** Whether trajectory is valid */
  isValid: boolean;
}

export interface AnimatedScene {
  /** Animated objects */
  animations: AnimatedObject[];
  
  /** Applied policies */
  appliedPolicies: string[];
  
  /** Total animation time */
  totalTime: number;
  
  /** Quality metrics */
  qualityMetrics: QualityMetrics;
}

export interface AnimatedObject {
  /** Object ID */
  objectId: string;
  
  /** Assigned animation */
  animation: AnimationClip;
  
  /** Start time offset */
  startTime: number;
  
  /** Playback speed multiplier */
  speedMultiplier: number;
  
  /** Trajectory (if moving) */
  trajectory?: Trajectory;
  
  /** Loop settings */
  loop: boolean;
  
  /** Blend with previous animation */
  blendIn: number;
  blendOut: number;
}

export interface QualityMetrics {
  /** Average trajectory score */
  avgTrajectoryScore: number;
  
  /** Collision count */
  collisionCount: number;
  
  /** Smoothness score */
  smoothnessScore: number;
  
  /** Naturalness score */
  naturalnessScore: number;
  
  /** Diversity score (variety of animations) */
  diversityScore: number;
}

export class AnimationPolicyEngine {
  private policies: Map<string, AnimationPolicy>;
  private availableAnimations: Map<string, AnimationClip[]>;
  private bridge: HybridBridge | null;

  constructor() {
    this.policies = new Map();
    this.availableAnimations = new Map();
    this.bridge = HybridBridge.getInstance();
  }

  /**
   * Register an animation policy
   */
  registerPolicy(policy: AnimationPolicy): void {
    this.policies.set(policy.id, policy);
  }

  /**
   * Register available animations for a target type
   */
  registerAnimations(targetType: string, animations: AnimationClip[]): void {
    this.availableAnimations.set(targetType, animations);
  }

  /**
   * Score a trajectory against a policy
   */
  scoreTrajectory(trajectory: Trajectory, policy: AnimationPolicy): TrajectoryScore {
    const components = {
      efficiency: this.scoreEfficiency(trajectory),
      smoothness: this.scoreSmoothness(trajectory),
      safety: this.scoreSafety(trajectory),
      naturalness: this.scoreNaturalness(trajectory),
      goalOrientation: this.scoreGoalOrientation(trajectory),
      style: this.scoreStyle(trajectory, policy)
    };

    // Check hard constraints
    const violations = this.checkHardConstraints(trajectory, policy.constraints);
    const isValid = violations.length === 0;

    // Calculate weighted total
    const weights = policy.weights;
    let totalScore = 0;
    let totalWeight = 0;

    if (weights.efficiency > 0) {
      totalScore += components.efficiency * weights.efficiency;
      totalWeight += weights.efficiency;
    }
    if (weights.smoothness > 0) {
      totalScore += components.smoothness * weights.smoothness;
      totalWeight += weights.smoothness;
    }
    if (weights.safety > 0) {
      totalScore += components.safety * weights.safety;
      totalWeight += weights.safety;
    }
    if (weights.naturalness > 0) {
      totalScore += components.naturalness * weights.naturalness;
      totalWeight += weights.naturalness;
    }
    if (weights.goalOrientation > 0) {
      totalScore += components.goalOrientation * weights.goalOrientation;
      totalWeight += weights.goalOrientation;
    }
    if (weights.style > 0) {
      totalScore += components.style * weights.style;
      totalWeight += weights.style;
    }

    if (totalWeight > 0) {
      totalScore /= totalWeight;
    }

    // Penalize invalid trajectories
    if (!isValid) {
      totalScore *= 0.1;
    }

    return {
      totalScore: Math.max(0, Math.min(1, totalScore)),
      components,
      violations,
      isValid
    };
  }

  /**
   * Score trajectory efficiency (directness of path)
   */
  private scoreEfficiency(trajectory: Trajectory): number {
    if (trajectory.positions.length < 2) return 1.0;

    const directDistance = trajectory.startPos.distanceTo(trajectory.endPos);
    const actualPathLength = this.calculatePathLength(trajectory.positions);

    if (actualPathLength === 0) return 1.0;
    
    // Efficiency = direct distance / actual path length
    const efficiency = directDistance / actualPathLength;
    return Math.max(0, Math.min(1, efficiency));
  }

  /**
   * Score trajectory smoothness (jerk minimization)
   */
  private scoreSmoothness(trajectory: Trajectory): number {
    if (trajectory.positions.length < 3) return 1.0;

    let totalCurvature = 0;
    let sampleCount = 0;

    for (let i = 1; i < trajectory.positions.length - 1; i++) {
      const prev = trajectory.positions[i - 1];
      const curr = trajectory.positions[i];
      const next = trajectory.positions[i + 1];

      const v1 = new Vector3().subVectors(curr, prev).normalize();
      const v2 = new Vector3().subVectors(next, curr).normalize();
      
      // Angle change
      const angleChange = Math.acos(Math.max(-1, Math.min(1, v1.dot(v2))));
      totalCurvature += angleChange;
      sampleCount++;
    }

    if (sampleCount === 0) return 1.0;

    const avgCurvature = totalCurvature / sampleCount;
    
    // Lower curvature = smoother = higher score
    // Normalize: assume max reasonable curvature is PI/2 per segment
    const smoothness = 1.0 - Math.min(1, avgCurvature / (Math.PI / 2));
    return smoothness;
  }

  /**
   * Score trajectory safety (collision avoidance)
   */
  private scoreSafety(trajectory: Trajectory): number {
    // Simplified: check if trajectory stays within reasonable bounds
    // In full implementation, would use raycasting against scene geometry
    
    if (!this.bridge || !HybridBridge.isConnected()) {
      // Fallback: basic bound checking
      return this.basicSafetyCheck(trajectory);
    }

    // TODO: Use bridge for detailed collision checking
    return this.basicSafetyCheck(trajectory);
  }

  /**
   * Basic safety check fallback
   */
  private basicSafetyCheck(trajectory: Trajectory): number {
    // Check for extreme accelerations or speeds
    if (trajectory.maxSpeed > 20) { // 20 m/s = very fast
      return 0.5;
    }
    
    // Check for sudden direction changes
    let sharpTurns = 0;
    for (let i = 1; i < trajectory.rotations.length; i++) {
      const delta = Math.abs(trajectory.rotations[i] - trajectory.rotations[i - 1]);
      if (delta > Math.PI / 2) {
        sharpTurns++;
      }
    }

    const turnPenalty = sharpTurns / Math.max(1, trajectory.rotations.length);
    return 1.0 - turnPenalty;
  }

  /**
   * Score naturalness of motion
   */
  private scoreNaturalness(trajectory: Trajectory): number {
    // Check for human-like movement patterns
    const avgSpeed = trajectory.avgSpeed;
    
    // Typical human walking speed: 1.4 m/s, running: 3-6 m/s
    const naturalWalkingRange = [0.8, 2.5];
    const naturalRunningRange = [2.5, 7.0];
    
    const isNaturalWalk = avgSpeed >= naturalWalkingRange[0] && avgSpeed <= naturalWalkingRange[1];
    const isNaturalRun = avgSpeed >= naturalRunningRange[0] && avgSpeed <= naturalRunningRange[1];
    
    if (isNaturalWalk || isNaturalRun) {
      return 1.0;
    }
    
    // Penalize unnatural speeds
    if (avgSpeed < naturalWalkingRange[0]) {
      return 0.7; // Too slow
    }
    if (avgSpeed > naturalRunningRange[1]) {
      return 0.5; // Too fast
    }
    
    return 0.8;
  }

  /**
   * Score goal orientation (how well trajectory reaches intended goal)
   */
  private scoreGoalOrientation(trajectory: Trajectory): number {
    // Assume last position is the goal
    const goal = trajectory.endPos;
    const finalPos = trajectory.positions[trajectory.positions.length - 1];
    
    const distanceToGoal = finalPos.distanceTo(goal);
    
    // Score based on proximity to goal
    // Perfect = 0 distance, score = 1.0
    // Poor = >5m from goal, score = 0.0
    const maxDistance = 5.0;
    const score = 1.0 - Math.min(1, distanceToGoal / maxDistance);
    
    return score;
  }

  /**
   * Score style/aesthetic quality
   */
  private scoreStyle(trajectory: Trajectory, policy: AnimationPolicy): number {
    // Style scoring is policy-dependent
    // Default: prefer varied, interesting motions
    
    const hasVariation = trajectory.positions.some((pos, i) => {
      if (i === 0) return false;
      const prev = trajectory.positions[i - 1];
      return pos.distanceTo(prev) > 0.1;
    });

    if (!hasVariation) {
      return 0.5; // Static or minimal movement
    }

    // Check rotation variety
    const rotationRange = Math.max(...trajectory.rotations) - Math.min(...trajectory.rotations);
    const rotationScore = Math.min(1, rotationRange / Math.PI);
    
    return 0.5 + 0.5 * rotationScore;
  }

  /**
   * Check hard constraints
   */
  private checkHardConstraints(trajectory: Trajectory, constraints: TrajectoryConstraint[]): string[] {
    const violations: string[] = [];

    for (const constraint of constraints) {
      if (!constraint.isHard) continue;

      let violated = false;

      switch (constraint.type) {
        case 'path_length': {
          const maxLength = constraint.params.maxLength ?? Infinity;
          const actualLength = this.calculatePathLength(trajectory.positions);
          violated = actualLength > maxLength;
          if (violated) violations.push(`path_length:${maxLength}`);
          break;
        }
        
        case 'speed_limit': {
          const maxSpeed = constraint.params.maxSpeed ?? Infinity;
          violated = trajectory.maxSpeed > maxSpeed;
          if (violated) violations.push(`speed_limit:${maxSpeed}`);
          break;
        }
        
        case 'goal_reach': {
          const tolerance = constraint.params.tolerance ?? 1.0;
          const distance = trajectory.endPos.distanceTo(trajectory.positions[trajectory.positions.length - 1]);
          violated = distance > tolerance;
          if (violated) violations.push(`goal_reach:${tolerance}`);
          break;
        }
      }
    }

    return violations;
  }

  /**
   * Calculate total path length
   */
  private calculatePathLength(positions: Vector3[]): number {
    let length = 0;
    for (let i = 1; i < positions.length; i++) {
      length += positions[i].distanceTo(positions[i - 1]);
    }
    return length;
  }

  /**
   * Select best animation for an object based on policies
   */
  selectBestAnimation(
    objectType: string,
    context: AnimationContext,
    preferredCategories?: AnimationCategory[]
  ): AnimationClip | null {
    const animations = this.availableAnimations.get(objectType);
    if (!animations || animations.length === 0) {
      return null;
    }

    // Filter by category if specified
    let candidates = animations;
    if (preferredCategories && preferredCategories.length > 0) {
      candidates = animations.filter(a => 
        preferredCategories.includes(a.category)
      );
    }

    if (candidates.length === 0) {
      candidates = animations; // Fallback to all
    }

    // Score each candidate
    let bestAnimation: AnimationClip | null = null;
    let bestScore = -1;

    for (const animation of candidates) {
      const score = this.scoreAnimation(animation, context);
      if (score > bestScore) {
        bestScore = score;
        bestAnimation = animation;
      }
    }

    return bestAnimation;
  }

  /**
   * Score an animation in a given context
   */
  private scoreAnimation(animation: AnimationClip, context: AnimationContext): number {
    let score = 0.5; // Base score

    // Prefer animations matching context activity
    if (context.activity && animation.name.toLowerCase().includes(context.activity.toLowerCase())) {
      score += 0.3;
    }

    // Prefer appropriate duration
    if (context.preferredDuration) {
      const durationDiff = Math.abs(animation.duration - context.preferredDuration);
      const durationScore = Math.max(0, 1 - durationDiff / 5); // 5s tolerance
      score += 0.2 * durationScore;
    }

    // Consider root motion if needed
    if (context.needsRootMotion && !animation.hasRootMotion) {
      score -= 0.2;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Generate trajectory for locomotion animation
   */
  generateTrajectory(
    startPos: Vector3,
    endPos: Vector3,
    duration: number,
    options?: TrajectoryOptions
  ): Trajectory {
    const keyframeCount = options?.keyframeCount ?? 10;
    const positions: Vector3[] = [];
    const rotations: number[] = [];
    const timings: number[] = [];

    // Generate interpolated positions
    for (let i = 0; i <= keyframeCount; i++) {
      const t = i / keyframeCount;
      
      // Apply easing if specified
      const easedT = options?.easing ? options.easing(t) : t;
      
      const pos = new Vector3().lerpVectors(startPos, endPos, easedT);
      
      // Add optional curve offset
      if (options?.curveAmount) {
        const curveOffset = Math.sin(t * Math.PI) * options.curveAmount;
        // Apply perpendicular offset
        const dir = new Vector3().subVectors(endPos, startPos).normalize();
        const perp = new Vector3(-dir.z, 0, dir.x);
        pos.add(perp.multiplyScalar(curveOffset));
      }
      
      positions.push(pos);
      
      // Calculate rotation to face direction of travel
      if (i < keyframeCount) {
        const nextPos = positions[i + 1] || endPos;
        const dx = nextPos.x - pos.x;
        const dz = nextPos.z - pos.z;
        const rotation = Math.atan2(dx, dz);
        rotations.push(rotation);
      } else {
        rotations.push(rotations[rotations.length - 1] || 0);
      }
      
      timings.push(t * duration);
    }

    // Calculate speeds
    const pathLength = this.calculatePathLength(positions);
    const avgSpeed = pathLength / duration;
    const maxSpeed = this.calculateMaxSpeed(positions, timings);

    return {
      positions,
      rotations,
      timings,
      duration,
      startPos: startPos.clone(),
      endPos: endPos.clone(),
      avgSpeed,
      maxSpeed
    };
  }

  /**
   * Calculate maximum speed along trajectory
   */
  private calculateMaxSpeed(positions: Vector3[], timings: number[]): number {
    let maxSpeed = 0;
    
    for (let i = 1; i < positions.length; i++) {
      const dist = positions[i].distanceTo(positions[i - 1]);
      const time = timings[i] - timings[i - 1];
      
      if (time > 0) {
        const speed = dist / time;
        maxSpeed = Math.max(maxSpeed, speed);
      }
    }
    
    return maxSpeed;
  }

  /**
   * Animate a scene with multiple objects
   */
  async animateScene(
    objects: Array<{ id: string; type: string; startPos: Vector3; endPos?: Vector3 }>,
    policies: string[],
    totalDuration: number
  ): Promise<AnimatedScene> {
    const animations: AnimatedObject[] = [];
    const appliedPolicies: string[] = [];
    let currentTime = 0;

    // Get active policies
    const activePolicies = policies.map(id => this.policies.get(id)).filter((p): p is AnimationPolicy => !!p);
    appliedPolicies.push(...policies);

    for (const obj of objects) {
      // Select animation
      const context: AnimationContext = {
        activity: 'move',
        preferredDuration: totalDuration / objects.length
      };
      
      const animation = this.selectBestAnimation(obj.type, context);
      if (!animation) continue;

      // Generate trajectory if end position specified
      let trajectory: Trajectory | undefined;
      if (obj.endPos) {
        trajectory = this.generateTrajectory(obj.startPos, obj.endPos, animation.duration);
      }

      const animatedObj: AnimatedObject = {
        objectId: obj.id,
        animation,
        startTime: currentTime,
        speedMultiplier: 1.0,
        trajectory,
        loop: false,
        blendIn: 0.2,
        blendOut: 0.2
      };

      animations.push(animatedObj);
      currentTime += animation.duration * 0.8; // Overlap slightly
    }

    // Calculate quality metrics
    const qualityMetrics = this.calculateQualityMetrics(animations, activePolicies);

    return {
      animations,
      appliedPolicies,
      totalTime: currentTime,
      qualityMetrics
    };
  }

  /**
   * Calculate quality metrics for animated scene
   */
  private calculateQualityMetrics(
    animations: AnimatedObject[],
    policies: AnimationPolicy[]
  ): QualityMetrics {
    const trajectoryScores: number[] = [];
    let collisionCount = 0;
    let totalSmoothness = 0;
    let totalNaturalness = 0;

    for (const anim of animations) {
      if (anim.trajectory && policies.length > 0) {
        const score = this.scoreTrajectory(anim.trajectory, policies[0]);
        trajectoryScores.push(score.totalScore);
        totalSmoothness += score.components.smoothness;
        totalNaturalness += score.components.naturalness;
        
        if (!score.isValid) {
          collisionCount++;
        }
      }
    }

    const avgScore = trajectoryScores.length > 0 
      ? trajectoryScores.reduce((a, b) => a + b, 0) / trajectoryScores.length 
      : 0.5;
    
    const avgSmoothness = animations.length > 0 ? totalSmoothness / animations.length : 0.5;
    const avgNaturalness = animations.length > 0 ? totalNaturalness / animations.length : 0.5;

    // Diversity: ratio of unique animations to total
    const uniqueAnimations = new Set(animations.map(a => a.animation.id)).size;
    const diversityScore = animations.length > 0 ? uniqueAnimations / animations.length : 0;

    return {
      avgTrajectoryScore: avgScore,
      collisionCount,
      smoothnessScore: avgSmoothness,
      naturalnessScore: avgNaturalness,
      diversityScore
    };
  }

  /**
   * Optimize trajectories using hybrid bridge
   */
  async optimizeTrajectories(trajectories: Trajectory[]): Promise<Trajectory[]> {
    if (!this.bridge || !HybridBridge.isConnected()) {
      // Fallback: return as-is
      return trajectories;
    }

    try {
      const optimized = await this.bridge.optimizeTrajectories(trajectories);
      return optimized;
    } catch (error) {
      console.warn('Bridge optimization failed:', error);
      return trajectories;
    }
  }
}

export interface AnimationContext {
  /** Current activity (e.g., 'walking', 'running', 'sitting') */
  activity?: string;
  
  /** Preferred animation duration */
  preferredDuration?: number;
  
  /** Whether root motion is needed */
  needsRootMotion?: boolean;
  
  /** Environment context */
  environment?: 'indoor' | 'outdoor' | 'crowded' | 'open';
}

export interface TrajectoryOptions {
  /** Number of keyframes */
  keyframeCount?: number;
  
  /** Easing function */
  easing?: (t: number) => number;
  
  /** Curve amount for arc motion */
  curveAmount?: number;
  
  /** Avoid obstacles */
  avoidObstacles?: boolean;
}

// Pre-built easing functions
export const EasingFunctions = {
  linear: (t: number) => t,
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => (--t) * t * t + 1,
};

// Common animation policies
export const DefaultPolicies = {
  /** Natural walking policy */
  naturalWalking: (): AnimationPolicy => ({
    id: 'natural_walking',
    name: 'Natural Walking',
    priority: 10,
    categories: ['locomotion'],
    constraints: [
      {
        type: 'speed_limit',
        params: { maxSpeed: 2.5 },
        weight: 1.0,
        isHard: true
      },
      {
        type: 'smoothness',
        params: { minRadius: 0.5 },
        weight: 0.8,
        isHard: false
      }
    ],
    weights: {
      efficiency: 0.3,
      smoothness: 0.3,
      safety: 0.2,
      naturalness: 0.2,
      goalOrientation: 0.0,
      style: 0.0
    }
  }),

  /** Fast movement policy */
  fastMovement: (): AnimationPolicy => ({
    id: 'fast_movement',
    name: 'Fast Movement',
    priority: 8,
    categories: ['locomotion', 'sports'],
    constraints: [
      {
        type: 'speed_limit',
        params: { maxSpeed: 8.0 },
        weight: 1.0,
        isHard: true
      }
    ],
    weights: {
      efficiency: 0.5,
      smoothness: 0.1,
      safety: 0.2,
      naturalness: 0.1,
      goalOrientation: 0.1,
      style: 0.0
    }
  }),

  /** Cinematic policy */
  cinematic: (): AnimationPolicy => ({
    id: 'cinematic',
    name: 'Cinematic Motion',
    priority: 5,
    categories: ['gesture', 'dance', 'combat'],
    constraints: [],
    weights: {
      efficiency: 0.0,
      smoothness: 0.2,
      safety: 0.1,
      naturalness: 0.2,
      goalOrientation: 0.0,
      style: 0.5
    }
  })
};

export { AnimationPolicyEngine as default };
