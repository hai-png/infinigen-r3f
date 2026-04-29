/**
 * Interpolation Methods
 */
export var InterpolationType;
(function (InterpolationType) {
    InterpolationType["Linear"] = "linear";
    InterpolationType["Step"] = "step";
    InterpolationType["Bezier"] = "bezier";
})(InterpolationType || (InterpolationType = {}));
/**
 * Easing Functions Library
 */
export const Easings = {
    linear: (t) => t,
    // Quad
    easeInQuad: (t) => t * t,
    easeOutQuad: (t) => t * (2 - t),
    easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    // Cubic
    easeInCubic: (t) => t * t * t,
    easeOutCubic: (t) => (--t) * t * t + 1,
    easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
    // Quart
    easeInQuart: (t) => t * t * t * t,
    easeOutQuart: (t) => 1 - (--t) * t * t * t,
    easeInOutQuart: (t) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
    // Quint
    easeInQuint: (t) => t * t * t * t * t,
    easeOutQuint: (t) => 1 + (--t) * t * t * t * t,
    easeInOutQuint: (t) => t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t,
    // Sine
    easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
    easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
    easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    // Expo
    easeInExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
    easeOutExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    easeInOutExpo: (t) => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
    // Circ
    easeInCirc: (t) => 1 - Math.sqrt(1 - Math.pow(t, 2)),
    easeOutCirc: (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
    easeInOutCirc: (t) => t < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2,
    // Back
    easeInBack: (t) => {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return c3 * t * t * t - c1 * t * t;
    },
    easeOutBack: (t) => {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    easeInOutBack: (t) => {
        const c1 = 1.70158;
        const c2 = c1 * 1.525;
        return t < 0.5
            ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
            : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
    },
    // Elastic
    easeInElastic: (t) => {
        const c4 = (2 * Math.PI) / 3;
        return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
    },
    easeOutElastic: (t) => {
        const c4 = (2 * Math.PI) / 3;
        return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
    easeInOutElastic: (t) => {
        const c5 = (2 * Math.PI) / 4.5;
        return t === 0
            ? 0
            : t === 1
                ? 1
                : t < 0.5
                    ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
                    : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
    },
    // Bounce
    easeInBounce: (t) => 1 - Easings.easeOutBounce(1 - t),
    easeOutBounce: (t) => {
        const n1 = 7.5625;
        const d1 = 2.75;
        if (t < 1 / d1) {
            return n1 * t * t;
        }
        else if (t < 2 / d1) {
            return n1 * (t -= 1.5 / d1) * t + 0.75;
        }
        else if (t < 2.5 / d1) {
            return n1 * (t -= 2.25 / d1) * t + 0.9375;
        }
        else {
            return n1 * (t -= 2.625 / d1) * t + 0.984375;
        }
    },
    easeInOutBounce: (t) => t < 0.5 ? (1 - Easings.easeOutBounce(1 - 2 * t)) / 2 : (1 + Easings.easeOutBounce(2 * t - 1)) / 2,
};
/**
 * Get easing function by name or return custom function
 */
export function getEasing(easing) {
    if (typeof easing === 'function') {
        return easing;
    }
    return Easings[easing] || Easings.linear;
}
/**
 * Interpolate between two values
 */
export function lerp(start, end, t) {
    return start + (end - start) * t;
}
/**
 * Animation Track
 *
 * Manages interpolation of numeric properties over time using keyframes.
 */
export class AnimationTrack {
    constructor(config) {
        this.target = config.target;
        this.keyframes = config.keyframes.sort((a, b) => a.time - b.time);
        this.easing = getEasing(config.easing ?? 'linear');
        this.loop = config.loop ?? false;
        this.yoyo = config.yoyo ?? false;
        this.offset = config.offset ?? 0;
        this.currentTime = -this.offset; // Start before offset
        this.isPlaying = false;
        this.direction = 1;
        // Calculate total duration
        const lastKeyframe = this.keyframes[this.keyframes.length - 1];
        this.duration = lastKeyframe ? lastKeyframe.time : 0;
    }
    /**
     * Start the animation
     */
    play() {
        this.isPlaying = true;
    }
    /**
     * Pause the animation
     */
    pause() {
        this.isPlaying = false;
    }
    /**
     * Stop and reset the animation
     */
    stop() {
        this.isPlaying = false;
        this.currentTime = -this.offset;
        this.direction = 1;
        this.applyValues(this.keyframes[0]?.values || this.getInitialValues());
    }
    /**
     * Seek to a specific time
     * @param time - Time in seconds
     */
    seek(time) {
        this.currentTime = time;
        this.update(0, time);
    }
    /**
     * Update the animation
     * @param deltaTime - Time since last update
     * @param totalTime - Total elapsed time
     */
    update(deltaTime, totalTime) {
        if (!this.isPlaying)
            return;
        // Handle offset
        if (this.currentTime < 0) {
            this.currentTime += deltaTime;
            if (this.currentTime < 0)
                return;
            // Apply first keyframe values at offset end
            this.applyValues(this.keyframes[0]?.values || this.getInitialValues());
            return;
        }
        // Advance time
        this.currentTime += deltaTime * this.direction;
        // Handle loop/yoyo
        if (this.currentTime >= this.duration) {
            if (this.loop) {
                if (this.yoyo) {
                    this.direction = -1;
                    this.currentTime = this.duration;
                }
                else {
                    this.currentTime = 0;
                }
            }
            else {
                this.currentTime = this.duration;
                this.isPlaying = false;
            }
        }
        else if (this.currentTime <= 0) {
            if (this.loop && this.yoyo) {
                this.direction = 1;
                this.currentTime = 0;
            }
            else {
                this.currentTime = 0;
                this.isPlaying = false;
            }
        }
        // Find current segment
        const values = this.interpolate(this.currentTime);
        this.applyValues(values);
    }
    /**
     * Check if animation is complete
     */
    isComplete() {
        return !this.isPlaying && this.currentTime >= this.duration;
    }
    /**
     * Get current progress (0-1)
     */
    getProgress() {
        return Math.max(0, Math.min(1, this.currentTime / this.duration));
    }
    /**
     * Get current time
     */
    getCurrentTime() {
        return Math.max(0, this.currentTime);
    }
    /**
     * Get total duration
     */
    getDuration() {
        return this.duration;
    }
    /**
     * Interpolate values at given time
     */
    interpolate(time) {
        if (this.keyframes.length === 0) {
            return this.getInitialValues();
        }
        if (this.keyframes.length === 1) {
            return { ...this.keyframes[0].values };
        }
        // Find surrounding keyframes
        let prevIndex = 0;
        let nextIndex = this.keyframes.length - 1;
        for (let i = 0; i < this.keyframes.length - 1; i++) {
            if (time >= this.keyframes[i].time && time <= this.keyframes[i + 1].time) {
                prevIndex = i;
                nextIndex = i + 1;
                break;
            }
        }
        const prev = this.keyframes[prevIndex];
        const next = this.keyframes[nextIndex];
        if (prev.time === next.time) {
            return { ...prev.values };
        }
        // Calculate normalized time within segment
        const segmentT = (time - prev.time) / (next.time - prev.time);
        const easedT = this.easing(segmentT);
        // Interpolate each property
        const result = {};
        const keys = Object.keys(prev.values);
        for (const key of keys) {
            const startVal = prev.values[key];
            const endVal = next.values[key];
            result[key] = lerp(startVal, endVal, easedT);
        }
        return result;
    }
    /**
     * Apply interpolated values to target
     */
    applyValues(values) {
        for (const key in values) {
            if (Object.prototype.hasOwnProperty.call(values, key)) {
                this.target[key] = values[key];
            }
        }
    }
    /**
     * Get initial values from first keyframe or zeros
     */
    getInitialValues() {
        if (this.keyframes.length > 0) {
            return { ...this.keyframes[0].values };
        }
        // Return zero-filled object with same keys as first keyframe
        return {};
    }
}
/**
 * Timeline for composing multiple tracks
 */
export class Timeline {
    constructor() {
        this.tracks = [];
        this.isPlaying = false;
    }
    /**
     * Add a track to the timeline
     */
    add(config, offset = 0) {
        let actualOffset = 0;
        // Parse offset string (e.g., "+=0.5", "-=0.5")
        if (typeof offset === 'string') {
            const match = offset.match(/^([+-])=(\d+\.?\d*)$/);
            if (match) {
                const sign = match[1] === '+' ? 1 : -1;
                const value = parseFloat(match[2]);
                const lastTrack = this.tracks[this.tracks.length - 1];
                if (lastTrack) {
                    actualOffset = lastTrack.getDuration() + sign * value;
                }
            }
        }
        else {
            actualOffset = offset;
        }
        const track = new AnimationTrack({
            ...config,
            offset: actualOffset,
        });
        this.tracks.push(track);
        return this;
    }
    /**
     * Add a parallel track (starts at same time as previous)
     */
    addParallel(config) {
        const lastTrack = this.tracks[this.tracks.length - 1];
        const offset = lastTrack ? lastTrack.getDuration() : 0;
        return this.add(config, offset);
    }
    /**
     * Play all tracks
     */
    play() {
        this.isPlaying = true;
        this.tracks.forEach((track) => track.play());
        return this;
    }
    /**
     * Pause all tracks
     */
    pause() {
        this.isPlaying = false;
        this.tracks.forEach((track) => track.pause());
        return this;
    }
    /**
     * Stop all tracks
     */
    stop() {
        this.isPlaying = false;
        this.tracks.forEach((track) => track.stop());
        return this;
    }
    /**
     * Update all tracks
     */
    update(deltaTime, totalTime) {
        if (!this.isPlaying)
            return;
        for (const track of this.tracks) {
            track.update(deltaTime, totalTime);
        }
        // Check if all tracks are complete
        const allComplete = this.tracks.every((track) => track.isComplete());
        if (allComplete && this.isPlaying) {
            this.isPlaying = false;
            if (this.onComplete) {
                this.onComplete();
            }
        }
    }
    /**
     * Set completion callback
     */
    then(callback) {
        this.onComplete = callback;
        return this;
    }
    /**
     * Get total duration
     */
    getDuration() {
        if (this.tracks.length === 0)
            return 0;
        return Math.max(...this.tracks.map((t) => t.getDuration() + t.offset));
    }
    /**
     * Clear all tracks
     */
    clear() {
        this.tracks = [];
        this.isPlaying = false;
    }
    /**
     * Get track count
     */
    getTrackCount() {
        return this.tracks.length;
    }
}
export default Timeline;
//# sourceMappingURL=Timeline.js.map