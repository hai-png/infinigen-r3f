import { EventEmitter } from 'events';
/**
 * Animation Event Types
 */
export type AnimationEventType = 'tick' | 'start' | 'stop' | 'pause' | 'resume' | 'loop' | 'complete';
/**
 * Animation Event Interface
 */
export interface AnimationEvent {
    type: AnimationEventType;
    timestamp: number;
    deltaTime: number;
    totalTime: number;
}
/**
 * Time Scale Configuration
 */
export interface TimeConfig {
    scale: number;
    paused: boolean;
    maxDeltaTime: number;
}
/**
 * Animation Engine Configuration
 */
export interface AnimationEngineConfig {
    timeScale?: number;
    autoStart?: boolean;
    maxDeltaTime?: number;
    useRaf?: boolean;
}
/**
 * Updatable Interface for animated objects
 */
export interface Updatable {
    update(deltaTime: number, totalTime: number): void;
}
/**
 * Animation Engine
 *
 * Central manager for all animation systems.
 * Handles time management, update loops, and event dispatching.
 */
export declare class AnimationEngine extends EventEmitter {
    private timeConfig;
    private updatables;
    private isRunning;
    private lastTime;
    private totalTime;
    private rafId;
    private useRaf;
    constructor(config?: AnimationEngineConfig);
    /**
     * Start the animation loop
     */
    start(): void;
    /**
     * Stop the animation loop
     */
    stop(): void;
    /**
     * Pause the animation (time freezes)
     */
    pause(): void;
    /**
     * Resume the animation
     */
    resume(): void;
    /**
     * Toggle pause/resume
     */
    togglePause(): void;
    /**
     * Set global time scale
     * @param scale - Time multiplier (1.0 = normal, 0.5 = slow-mo, 2.0 = fast-forward)
     */
    setTimeScale(scale: number): void;
    /**
     * Get current time scale
     */
    getTimeScale(): number;
    /**
     * Get total elapsed time (in seconds)
     */
    getTotalTime(): number;
    /**
     * Check if engine is running
     */
    isEngineRunning(): boolean;
    /**
     * Check if engine is paused
     */
    isPaused(): boolean;
    /**
     * Register an updatable object
     */
    add(updatable: Updatable): void;
    /**
     * Unregister an updatable object
     */
    remove(updatable: Updatable): void;
    /**
     * Clear all registered updatables
     */
    clear(): void;
    /**
     * Get count of registered updatables
     */
    getUpdatableCount(): number;
    /**
     * Step the simulation by one frame (for manual control or testing)
     * @param deltaTime - Optional fixed delta time in seconds
     */
    step(deltaTime?: number): void;
    /**
     * RAF loop callback
     */
    private loop;
    /**
     * Create an animation event object
     */
    private createEvent;
    /**
     * Destroy the engine and clean up resources
     */
    destroy(): void;
}
/**
 * Get or create the global animation engine instance
 */
export declare function getGlobalEngine(config?: AnimationEngineConfig): AnimationEngine;
/**
 * Reset the global engine instance
 */
export declare function resetGlobalEngine(): void;
export default AnimationEngine;
//# sourceMappingURL=AnimationEngine.d.ts.map