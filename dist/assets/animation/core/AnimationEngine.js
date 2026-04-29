import { EventEmitter } from 'events';
/**
 * Animation Engine
 *
 * Central manager for all animation systems.
 * Handles time management, update loops, and event dispatching.
 */
export class AnimationEngine extends EventEmitter {
    constructor(config = {}) {
        super();
        /**
         * RAF loop callback
         */
        this.loop = (timestamp) => {
            if (!this.isRunning)
                return;
            if (!this.timeConfig.paused) {
                this.step();
            }
            else {
                // Still update lastTime while paused to prevent jump on resume
                this.lastTime = timestamp;
            }
            this.rafId = requestAnimationFrame(this.loop);
        };
        this.timeConfig = {
            scale: config.timeScale ?? 1.0,
            paused: false,
            maxDeltaTime: config.maxDeltaTime ?? 0.1, // 100ms cap
        };
        this.updatables = new Set();
        this.isRunning = false;
        this.lastTime = 0;
        this.totalTime = 0;
        this.rafId = null;
        this.useRaf = config.useRaf ?? true;
        if (config.autoStart !== false) {
            this.start();
        }
    }
    /**
     * Start the animation loop
     */
    start() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        this.lastTime = performance.now();
        if (this.useRaf) {
            this.rafId = requestAnimationFrame(this.loop);
        }
        else {
            // Fallback to setInterval for non-RAF environments
            const intervalId = setInterval(() => {
                if (!this.isRunning) {
                    clearInterval(intervalId);
                    return;
                }
                this.step();
            }, 16); // ~60fps
        }
        this.emit('start', this.createEvent('start'));
    }
    /**
     * Stop the animation loop
     */
    stop() {
        if (!this.isRunning)
            return;
        this.isRunning = false;
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.emit('stop', this.createEvent('stop'));
    }
    /**
     * Pause the animation (time freezes)
     */
    pause() {
        if (this.timeConfig.paused)
            return;
        this.timeConfig.paused = true;
        this.emit('pause', this.createEvent('pause'));
    }
    /**
     * Resume the animation
     */
    resume() {
        if (!this.timeConfig.paused)
            return;
        this.timeConfig.paused = false;
        this.lastTime = performance.now(); // Reset lastTime to prevent jump
        this.emit('resume', this.createEvent('resume'));
    }
    /**
     * Toggle pause/resume
     */
    togglePause() {
        if (this.timeConfig.paused) {
            this.resume();
        }
        else {
            this.pause();
        }
    }
    /**
     * Set global time scale
     * @param scale - Time multiplier (1.0 = normal, 0.5 = slow-mo, 2.0 = fast-forward)
     */
    setTimeScale(scale) {
        this.timeConfig.scale = Math.max(0, scale);
    }
    /**
     * Get current time scale
     */
    getTimeScale() {
        return this.timeConfig.scale;
    }
    /**
     * Get total elapsed time (in seconds)
     */
    getTotalTime() {
        return this.totalTime;
    }
    /**
     * Check if engine is running
     */
    isEngineRunning() {
        return this.isRunning && !this.timeConfig.paused;
    }
    /**
     * Check if engine is paused
     */
    isPaused() {
        return this.timeConfig.paused;
    }
    /**
     * Register an updatable object
     */
    add(updatable) {
        this.updatables.add(updatable);
    }
    /**
     * Unregister an updatable object
     */
    remove(updatable) {
        this.updatables.delete(updatable);
    }
    /**
     * Clear all registered updatables
     */
    clear() {
        this.updatables.clear();
    }
    /**
     * Get count of registered updatables
     */
    getUpdatableCount() {
        return this.updatables.size;
    }
    /**
     * Step the simulation by one frame (for manual control or testing)
     * @param deltaTime - Optional fixed delta time in seconds
     */
    step(deltaTime) {
        const now = performance.now();
        const rawDelta = deltaTime ?? ((now - this.lastTime) / 1000);
        // Cap delta time to prevent instability
        const cappedDelta = Math.min(rawDelta, this.timeConfig.maxDeltaTime);
        // Apply time scale
        const scaledDelta = cappedDelta * this.timeConfig.scale;
        this.lastTime = now;
        this.totalTime += scaledDelta;
        // Update all registered updatables
        for (const updatable of this.updatables) {
            updatable.update(scaledDelta, this.totalTime);
        }
        // Emit tick event
        this.emit('tick', this.createEvent('tick', scaledDelta));
    }
    /**
     * Create an animation event object
     */
    createEvent(type, deltaTime = 0) {
        return {
            type,
            timestamp: performance.now(),
            deltaTime,
            totalTime: this.totalTime,
        };
    }
    /**
     * Destroy the engine and clean up resources
     */
    destroy() {
        this.stop();
        this.clear();
        this.removeAllListeners();
    }
}
/**
 * Global singleton instance for convenience
 */
let globalEngine = null;
/**
 * Get or create the global animation engine instance
 */
export function getGlobalEngine(config) {
    if (!globalEngine) {
        globalEngine = new AnimationEngine(config);
    }
    return globalEngine;
}
/**
 * Reset the global engine instance
 */
export function resetGlobalEngine() {
    if (globalEngine) {
        globalEngine.destroy();
        globalEngine = null;
    }
}
export default AnimationEngine;
//# sourceMappingURL=AnimationEngine.js.map