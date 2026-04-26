/**
 * AnimationPolicySystem
 *
 * Manages animation policies for dynamic scenes, providing temporal control
 * over object animations, procedural motion patterns, and physics-based interactions.
 *
 * Features:
 * - Keyframe-based animation policies
 * - Procedural motion generators (sine, noise, perlin)
 * - Physics-driven animations (spring, damping, gravity)
 * - Event-triggered animations
 * - Animation blending and interpolation
 * - Timeline management with play/pause/seek
 * - Hierarchical animation inheritance
 */
import { Object3D, Vector3, Quaternion, Euler } from 'three';
export type AnimationBlendMode = 'replace' | 'additive' | 'multiply';
export type AnimationLoopMode = 'once' | 'loop' | 'pingpong' | 'pingpong_once';
export type AnimationSpace = 'local' | 'world';
export interface AnimationKeyframe {
    time: number;
    position?: Vector3;
    rotation?: Quaternion | Euler;
    scale?: Vector3;
    visible?: boolean;
    customData?: Record<string, any>;
}
export interface AnimationClip {
    name: string;
    duration: number;
    keyframes: AnimationKeyframe[];
    loopMode?: AnimationLoopMode;
    blendMode?: AnimationBlendMode;
    space?: AnimationSpace;
    weight?: number;
    enabled?: boolean;
}
export interface ProceduralMotionParams {
    type: 'sine' | 'noise' | 'perlin' | 'random_walk' | 'orbit' | 'figure8';
    amplitude?: Vector3;
    frequency?: number;
    phase?: number;
    center?: Vector3;
    axis?: Vector3;
    radius?: number;
    speed?: number;
    seed?: number;
}
export interface PhysicsAnimationParams {
    type: 'spring' | 'damped_spring' | 'gravity' | 'pendulum' | 'elastic';
    stiffness?: number;
    damping?: number;
    mass?: number;
    gravity?: Vector3;
    restPosition?: Vector3;
    initialVelocity?: Vector3;
}
export interface AnimationPolicy {
    id: string;
    targetObjects: string[];
    clip?: AnimationClip;
    proceduralMotion?: ProceduralMotionParams;
    physicsAnimation?: PhysicsAnimationParams;
    priority: number;
    layer: number;
    blendWeight: number;
    startTime: number;
    duration: number;
    loopMode: AnimationLoopMode;
    enabled: boolean;
    conditions?: AnimationCondition[];
    events?: AnimationEvent[];
}
export interface AnimationCondition {
    type: 'distance' | 'visibility' | 'tag' | 'custom';
    trigger: string | ((policy: AnimationPolicy, object: Object3D) => boolean);
    threshold?: number;
    inverted?: boolean;
}
export interface AnimationEvent {
    time: number;
    type: 'callback' | 'sound' | 'particle' | 'custom';
    callback?: (object: Object3D, policy: AnimationPolicy) => void;
    data?: any;
    triggered?: boolean;
}
export interface AnimationState {
    policyId: string;
    objectId: string;
    currentTime: number;
    elapsedTime: number;
    currentPose: {
        position: Vector3;
        rotation: Quaternion;
        scale: Vector3;
    };
    velocity: Vector3;
    angularVelocity: Vector3;
    isPlaying: boolean;
    isPaused: boolean;
    completedCycles: number;
}
export interface AnimationTimeline {
    totalTime: number;
    currentTime: number;
    playing: boolean;
    speed: number;
    policies: Map<string, AnimationPolicy>;
    states: Map<string, AnimationState>;
}
export declare class AnimationPolicySystem {
    private timeline;
    private clock;
    private objectMap;
    private eventListeners;
    constructor();
    /**
     * Register an object with the animation system
     */
    registerObject(object: Object3D, id?: string): string;
    /**
     * Unregister an object from the animation system
     */
    unregisterObject(objectId: string): void;
    /**
     * Create an animation policy with keyframe clip
     */
    createKeyframePolicy(targetObjects: string[], clip: Omit<AnimationClip, 'name'>, options?: Partial<Omit<AnimationPolicy, 'id' | 'targetObjects' | 'clip'>>): string;
    /**
     * Create an animation policy with procedural motion
     */
    createProceduralPolicy(targetObjects: string[], motion: ProceduralMotionParams, options?: Partial<Omit<AnimationPolicy, 'id' | 'targetObjects' | 'proceduralMotion'>>): string;
    /**
     * Create an animation policy with physics-based animation
     */
    createPhysicsPolicy(targetObjects: string[], physics: PhysicsAnimationParams, options?: Partial<Omit<AnimationPolicy, 'id' | 'targetObjects' | 'physicsAnimation'>>): string;
    /**
     * Remove an animation policy
     */
    removePolicy(policyId: string): void;
    /**
     * Enable or disable a policy
     */
    setPolicyEnabled(policyId: string, enabled: boolean): void;
    /**
     * Set the blend weight of a policy
     */
    setPolicyWeight(policyId: string, weight: number): void;
    /**
     * Start the animation timeline
     */
    play(): void;
    /**
     * Pause the animation timeline
     */
    pause(): void;
    /**
     * Stop and reset the animation timeline
     */
    stop(): void;
    /**
     * Seek to a specific time in the timeline
     */
    seek(time: number): void;
    /**
     * Set the playback speed
     */
    setSpeed(speed: number): void;
    /**
     * Update all animations
     */
    update(deltaTime?: number): void;
    /**
     * Apply keyframe animation to an object
     */
    private applyKeyframeAnimation;
    /**
     * Apply procedural animation to an object
     */
    private applyProceduralAnimation;
    /**
     * Apply physics animation to an object
     */
    private applyPhysicsAnimation;
    /**
     * Get the current state of an animation
     */
    getAnimationState(policyId: string, objectId: string): AnimationState | undefined;
    /**
     * Get all active policies
     */
    getActivePolicies(): AnimationPolicy[];
    /**
     * Get policy by ID
     */
    getPolicy(policyId: string): AnimationPolicy | undefined;
    /**
     * Export timeline state to JSON
     */
    exportToJSON(): string;
    /**
     * Import timeline state from JSON
     */
    importFromJSON(json: string): void;
    /**
     * Add an event listener for animation events
     */
    addEventListener(eventType: string, callback: Function): void;
    /**
     * Remove an event listener
     */
    removeEventListener(eventType: string, callback: Function): void;
    /**
     * Emit an event
     */
    private emitEvent;
    /**
     * Get statistics about the animation system
     */
    getStatistics(): {
        totalPolicies: number;
        activePolicies: number;
        totalStates: number;
        playingStates: number;
        registeredObjects: number;
    };
}
export default AnimationPolicySystem;
//# sourceMappingURL=AnimationPolicySystem.d.ts.map