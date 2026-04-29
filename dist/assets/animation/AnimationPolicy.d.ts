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
export type AnimationCategory = 'locomotion' | 'gesture' | 'interaction' | 'idle' | 'transition' | 'combat' | 'dance' | 'sports';
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
export type ConstraintType = 'path_length' | 'curvature' | 'collision_free' | 'smoothness' | 'speed_limit' | 'acceleration_limit' | 'orientation_align' | 'goal_reach' | 'obstacle_avoid';
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
export declare class AnimationPolicyEngine {
    private policies;
    private availableAnimations;
    private bridge;
    constructor();
    /**
     * Register an animation policy
     */
    registerPolicy(policy: AnimationPolicy): void;
    /**
     * Register available animations for a target type
     */
    registerAnimations(targetType: string, animations: AnimationClip[]): void;
    /**
     * Score a trajectory against a policy
     */
    scoreTrajectory(trajectory: Trajectory, policy: AnimationPolicy): TrajectoryScore;
    /**
     * Score trajectory efficiency (directness of path)
     */
    private scoreEfficiency;
    /**
     * Score trajectory smoothness (jerk minimization)
     */
    private scoreSmoothness;
    /**
     * Score trajectory safety (collision avoidance)
     */
    private scoreSafety;
    /**
     * Basic safety check fallback
     */
    private basicSafetyCheck;
    /**
     * Score naturalness of motion
     */
    private scoreNaturalness;
    /**
     * Score goal orientation (how well trajectory reaches intended goal)
     */
    private scoreGoalOrientation;
    /**
     * Score style/aesthetic quality
     */
    private scoreStyle;
    /**
     * Check hard constraints
     */
    private checkHardConstraints;
    /**
     * Calculate total path length
     */
    private calculatePathLength;
    /**
     * Select best animation for an object based on policies
     */
    selectBestAnimation(objectType: string, context: AnimationContext, preferredCategories?: AnimationCategory[]): AnimationClip | null;
    /**
     * Score an animation in a given context
     */
    private scoreAnimation;
    /**
     * Generate trajectory for locomotion animation
     */
    generateTrajectory(startPos: Vector3, endPos: Vector3, duration: number, options?: TrajectoryOptions): Trajectory;
    /**
     * Calculate maximum speed along trajectory
     */
    private calculateMaxSpeed;
    /**
     * Animate a scene with multiple objects
     */
    animateScene(objects: Array<{
        id: string;
        type: string;
        startPos: Vector3;
        endPos?: Vector3;
    }>, policies: string[], totalDuration: number): Promise<AnimatedScene>;
    /**
     * Calculate quality metrics for animated scene
     */
    private calculateQualityMetrics;
    /**
     * Optimize trajectories using hybrid bridge
     */
    optimizeTrajectories(trajectories: Trajectory[]): Promise<Trajectory[]>;
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
export declare const EasingFunctions: {
    linear: (t: number) => number;
    easeInQuad: (t: number) => number;
    easeOutQuad: (t: number) => number;
    easeInOutQuad: (t: number) => number;
    easeInCubic: (t: number) => number;
    easeOutCubic: (t: number) => number;
};
export declare const DefaultPolicies: {
    /** Natural walking policy */
    naturalWalking: () => AnimationPolicy;
    /** Fast movement policy */
    fastMovement: () => AnimationPolicy;
    /** Cinematic policy */
    cinematic: () => AnimationPolicy;
};
export { AnimationPolicyEngine as default };
//# sourceMappingURL=AnimationPolicy.d.ts.map