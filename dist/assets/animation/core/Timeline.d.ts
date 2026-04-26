/**
 * Easing Function Types
 */
export type EasingType = 'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad' | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic' | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart' | 'easeInQuint' | 'easeOutQuint' | 'easeInOutQuint' | 'easeInSine' | 'easeOutSine' | 'easeInOutSine' | 'easeInExpo' | 'easeOutExpo' | 'easeInOutExpo' | 'easeInCirc' | 'easeOutCirc' | 'easeInOutCirc' | 'easeInBack' | 'easeOutBack' | 'easeInOutBack' | 'easeInElastic' | 'easeOutElastic' | 'easeInOutElastic' | 'easeInBounce' | 'easeOutBounce' | 'easeInOutBounce';
/**
 * Easing Function Interface
 */
export type EasingFunction = (t: number) => number;
/**
 * Keyframe Definition
 */
export interface Keyframe<T extends Record<string, number>> {
    time: number;
    values: T;
}
/**
 * Animation Track Configuration
 */
export interface TrackConfig<T extends Record<string, number>> {
    target: T;
    keyframes: Keyframe<T>[];
    easing?: EasingType | EasingFunction;
    loop?: boolean;
    yoyo?: boolean;
    offset?: number;
}
/**
 * Interpolation Methods
 */
export declare enum InterpolationType {
    Linear = "linear",
    Step = "step",
    Bezier = "bezier"
}
/**
 * Easing Functions Library
 */
export declare const Easings: Record<EasingType, EasingFunction>;
/**
 * Get easing function by name or return custom function
 */
export declare function getEasing(easing: EasingType | EasingFunction): EasingFunction;
/**
 * Interpolate between two values
 */
export declare function lerp(start: number, end: number, t: number): number;
/**
 * Animation Track
 *
 * Manages interpolation of numeric properties over time using keyframes.
 */
export declare class AnimationTrack<T extends Record<string, number>> {
    private target;
    private keyframes;
    private easing;
    private loop;
    private yoyo;
    private offset;
    private currentTime;
    private isPlaying;
    private direction;
    private duration;
    constructor(config: TrackConfig<T>);
    /**
     * Start the animation
     */
    play(): void;
    /**
     * Pause the animation
     */
    pause(): void;
    /**
     * Stop and reset the animation
     */
    stop(): void;
    /**
     * Seek to a specific time
     * @param time - Time in seconds
     */
    seek(time: number): void;
    /**
     * Update the animation
     * @param deltaTime - Time since last update
     * @param totalTime - Total elapsed time
     */
    update(deltaTime: number, totalTime: number): void;
    /**
     * Check if animation is complete
     */
    isComplete(): boolean;
    /**
     * Get current progress (0-1)
     */
    getProgress(): number;
    /**
     * Get current time
     */
    getCurrentTime(): number;
    /**
     * Get total duration
     */
    getDuration(): number;
    /**
     * Interpolate values at given time
     */
    private interpolate;
    /**
     * Apply interpolated values to target
     */
    private applyValues;
    /**
     * Get initial values from first keyframe or zeros
     */
    private getInitialValues;
}
/**
 * Timeline for composing multiple tracks
 */
export declare class Timeline {
    private tracks;
    private isPlaying;
    private onComplete?;
    constructor();
    /**
     * Add a track to the timeline
     */
    add<T extends Record<string, number>>(config: TrackConfig<T>, offset?: string | number): Timeline;
    /**
     * Add a parallel track (starts at same time as previous)
     */
    addParallel<T extends Record<string, number>>(config: TrackConfig<T>): Timeline;
    /**
     * Play all tracks
     */
    play(): Timeline;
    /**
     * Pause all tracks
     */
    pause(): Timeline;
    /**
     * Stop all tracks
     */
    stop(): Timeline;
    /**
     * Update all tracks
     */
    update(deltaTime: number, totalTime: number): void;
    /**
     * Set completion callback
     */
    then(callback: () => void): Timeline;
    /**
     * Get total duration
     */
    getDuration(): number;
    /**
     * Clear all tracks
     */
    clear(): void;
    /**
     * Get track count
     */
    getTrackCount(): number;
}
export default Timeline;
//# sourceMappingURL=Timeline.d.ts.map