import { Vector3 } from 'three';
/**
 * Evaluate wave function
 */
export function evaluateWave(waveType, t, amplitude, frequency, phase = 0) {
    const angle = 2 * Math.PI * frequency * t + phase;
    switch (waveType) {
        case 'sine':
            return amplitude * Math.sin(angle);
        case 'cosine':
            return amplitude * Math.cos(angle);
        case 'square':
            return amplitude * (Math.sin(angle) >= 0 ? 1 : -1);
        case 'triangle':
            return amplitude * (2 / Math.PI) * Math.asin(Math.sin(angle));
        case 'sawtooth':
            return amplitude * (2 * ((t * frequency) % 1) - 1);
        default:
            return amplitude * Math.sin(angle);
    }
}
/**
 * Oscillatory Motion Generator
 *
 * Generates continuous oscillatory motion for procedural animation.
 */
export class OscillatoryMotion {
    constructor(config) {
        this.config = {
            ...config,
            phase: config.phase ?? 0,
            decay: config.decay ?? 0,
        };
        this.time = 0;
        this.initialValue = 0;
    }
    /**
     * Update motion state
     * @param deltaTime - Time delta in seconds
     */
    update(deltaTime) {
        this.time += deltaTime;
    }
    /**
     * Get current displacement value
     */
    getValue() {
        let value = evaluateWave(this.config.waveType ?? 'sine', this.time, this.config.amplitude, this.config.frequency, this.config.phase);
        // Apply decay if present
        if (this.config.decay && this.config.decay > 0) {
            value *= Math.exp(-this.config.decay * this.time);
        }
        return value;
    }
    /**
     * Get current position with offset
     */
    getPosition() {
        const displacement = this.getValue();
        const offset = this.config.offset ?? new Vector3(0, 0, 0);
        if (typeof this.config.axis === 'string') {
            switch (this.config.axis) {
                case 'x':
                    return new Vector3(offset.x + displacement, offset.y, offset.z);
                case 'y':
                    return new Vector3(offset.x, offset.y + displacement, offset.z);
                case 'z':
                    return new Vector3(offset.x, offset.y, offset.z + displacement);
            }
        }
        else if (this.config.axis) {
            const axis = this.config.axis.clone().normalize();
            return offset.clone().add(axis.multiplyScalar(displacement));
        }
        return offset;
    }
    /**
     * Reset motion to initial state
     */
    reset() {
        this.time = 0;
    }
    /**
     * Set time directly
     */
    setTime(time) {
        this.time = time;
    }
    /**
     * Get current time
     */
    getTime() {
        return this.time;
    }
    /**
     * Update configuration
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
    }
}
/**
 * Pattern Generator for complex procedural motions
 */
export class PatternGenerator {
    constructor(config) {
        this.config = {
            type: config.type,
            amplitudeX: config.amplitudeX ?? 1,
            amplitudeY: config.amplitudeY ?? 1,
            amplitudeZ: config.amplitudeZ ?? 1,
            frequencyX: config.frequencyX ?? 1,
            frequencyY: config.frequencyY ?? 1,
            frequencyZ: config.frequencyZ ?? 1,
            phaseX: config.phaseX ?? 0,
            phaseY: config.phaseY ?? 0,
            phaseZ: config.phaseZ ?? 0,
            scale: config.scale ?? 1,
            speed: config.speed ?? 1,
            noiseScale: config.noiseScale ?? 0.1,
            damping: config.damping ?? 0,
            center: config.center ?? new Vector3(0, 0, 0),
        };
        this.time = 0;
    }
    /**
     * Update pattern state
     */
    update(deltaTime) {
        this.time += deltaTime * (this.config.speed ?? 1);
    }
    /**
     * Get current position on the pattern
     */
    getPosition() {
        const center = this.config.center ?? new Vector3(0, 0, 0);
        const t = this.time;
        // Apply damping if present
        const dampingFactor = this.config.damping && this.config.damping > 0
            ? Math.exp(-this.config.damping * t)
            : 1;
        let x = 0, y = 0, z = 0;
        switch (this.config.type) {
            case 'lissajous':
                // Lissajous curve: parametric equations
                x = this.config.amplitudeX * Math.sin(this.config.frequencyX * t + this.config.phaseX) * dampingFactor;
                y = this.config.amplitudeY * Math.sin(this.config.frequencyY * t + this.config.phaseY) * dampingFactor;
                z = this.config.amplitudeZ * Math.sin(this.config.frequencyZ * t + this.config.phaseZ) * dampingFactor;
                break;
            case 'spiral':
                // Spiral pattern
                const spiralAngle = this.config.frequencyX * t;
                const spiralRadius = this.config.amplitudeX * (1 - dampingFactor * 0.5);
                x = spiralRadius * Math.cos(spiralAngle) * dampingFactor;
                y = this.config.amplitudeY * t * 0.1 * dampingFactor; // Rise along Y
                z = spiralRadius * Math.sin(spiralAngle) * dampingFactor;
                break;
            case 'pendulum':
                // Simple pendulum motion (arc)
                const pendulumAngle = this.config.amplitudeX * Math.sin(this.config.frequencyX * t);
                const length = this.config.amplitudeY;
                x = length * Math.sin(pendulumAngle) * dampingFactor;
                y = -length * Math.cos(pendulumAngle) * dampingFactor;
                z = 0;
                break;
            case 'noise':
                // Perlin-like noise motion (simplified)
                x = this.noise1D(t * this.config.frequencyX) * this.config.amplitudeX * this.config.noiseScale * dampingFactor;
                y = this.noise1D(t * this.config.frequencyY + 100) * this.config.amplitudeY * this.config.noiseScale * dampingFactor;
                z = this.noise1D(t * this.config.frequencyZ + 200) * this.config.amplitudeZ * this.config.noiseScale * dampingFactor;
                break;
            case 'damped':
                // Damped sine wave
                x = this.config.amplitudeX * Math.sin(this.config.frequencyX * t) * dampingFactor;
                y = this.config.amplitudeY * Math.sin(this.config.frequencyY * t) * dampingFactor;
                z = this.config.amplitudeZ * Math.sin(this.config.frequencyZ * t) * dampingFactor;
                break;
            default:
                // Simple sine/cosine based on type
                const waveFunc = (amp, freq, phase) => evaluateWave(this.config.type, t, amp, freq, phase) * dampingFactor;
                x = waveFunc(this.config.amplitudeX, this.config.frequencyX, this.config.phaseX);
                y = waveFunc(this.config.amplitudeY, this.config.frequencyY, this.config.phaseY);
                z = waveFunc(this.config.amplitudeZ, this.config.frequencyZ, this.config.phaseZ);
        }
        return new Vector3(center.x + x, center.y + y, center.z + z).multiplyScalar(this.config.scale);
    }
    /**
     * Get current velocity (approximate)
     */
    getVelocity(deltaTime = 0.016) {
        const prevPos = this.getPosition();
        this.update(deltaTime);
        const currPos = this.getPosition();
        // Step back
        this.time -= deltaTime;
        return currPos.clone().sub(prevPos).divideScalar(deltaTime);
    }
    /**
     * Reset pattern
     */
    reset() {
        this.time = 0;
    }
    /**
     * Update configuration
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
    }
    /**
     * Simple 1D noise function (pseudo-random smoothing)
     */
    noise1D(t) {
        const i = Math.floor(t);
        const f = t - i;
        // Smoothstep interpolation
        const u = f * f * (3 - 2 * f);
        // Pseudo-random values based on integer part
        const rand1 = this.hash(i) / 255;
        const rand2 = this.hash(i + 1) / 255;
        return rand1 + u * (rand2 - rand1);
    }
    /**
     * Simple hash function
     */
    hash(n) {
        let h = n * 0x8da6b343;
        h = (h >> 16) ^ h;
        h = Math.imul(h, 0x45d9f3b);
        h = (h >> 16) ^ h;
        h = Math.imul(h, 0x8da6b343);
        return (h >> 16) ^ h;
    }
}
/**
 * Create a preset oscillatory motion
 */
export function createPresetMotion(preset, options = {}) {
    const presets = {
        bounce: {
            amplitude: 1,
            frequency: 2,
            waveType: 'sine',
            axis: 'y',
            decay: 0.5,
        },
        float: {
            amplitude: 0.5,
            frequency: 0.5,
            waveType: 'sine',
            axis: 'y',
        },
        vibrate: {
            amplitude: 0.1,
            frequency: 30,
            waveType: 'square',
        },
        pulse: {
            amplitude: 0.2,
            frequency: 2,
            waveType: 'sine',
        },
        swing: {
            amplitude: 1,
            frequency: 1,
            waveType: 'sine',
            axis: 'z',
        },
    };
    const config = { ...presets[preset], ...options };
    return new OscillatoryMotion(config);
}
/**
 * Create a preset pattern
 */
export function createPresetPattern(preset, options = {}) {
    const presets = {
        orbit: {
            type: 'lissajous',
            amplitudeX: 2,
            amplitudeY: 2,
            amplitudeZ: 0,
            frequencyX: 1,
            frequencyY: 1,
            phaseX: 0,
            phaseY: Math.PI / 2,
        },
        figure8: {
            type: 'lissajous',
            amplitudeX: 2,
            amplitudeY: 1,
            amplitudeZ: 0,
            frequencyX: 1,
            frequencyY: 2,
            phaseX: 0,
            phaseY: Math.PI / 2,
        },
        helix: {
            type: 'spiral',
            amplitudeX: 1,
            amplitudeY: 1,
            frequencyX: 2,
        },
        random: {
            type: 'noise',
            amplitudeX: 1,
            amplitudeY: 1,
            amplitudeZ: 1,
            frequencyX: 0.5,
            frequencyY: 0.5,
            frequencyZ: 0.5,
            noiseScale: 0.5,
        },
    };
    const config = { ...presets[preset], ...options };
    return new PatternGenerator(config);
}
export default OscillatoryMotion;
//# sourceMappingURL=OscillatoryMotion.js.map