import { Vector3 } from 'three';
/**
 * Wave Types for oscillatory motion
 */
export type WaveType = 'sine' | 'cosine' | 'square' | 'triangle' | 'sawtooth';
/**
 * Oscillatory Motion Configuration
 */
export interface OscillatoryConfig {
    amplitude: number;
    frequency: number;
    phase?: number;
    waveType?: WaveType;
    axis?: 'x' | 'y' | 'z' | Vector3;
    decay?: number;
    offset?: Vector3;
}
/**
 * Procedural Motion Pattern Types
 */
export type PatternType = 'sine' | 'cosine' | 'square' | 'triangle' | 'sawtooth' | 'lissajous' | 'spiral' | 'pendulum' | 'noise' | 'damped';
/**
 * Pattern Configuration
 */
export interface PatternConfig {
    type: PatternType;
    amplitudeX?: number;
    amplitudeY?: number;
    amplitudeZ?: number;
    frequencyX?: number;
    frequencyY?: number;
    frequencyZ?: number;
    phaseX?: number;
    phaseY?: number;
    phaseZ?: number;
    scale?: number;
    speed?: number;
    noiseScale?: number;
    damping?: number;
    center?: Vector3;
}
/**
 * Evaluate wave function
 */
export declare function evaluateWave(waveType: WaveType, t: number, amplitude: number, frequency: number, phase?: number): number;
/**
 * Oscillatory Motion Generator
 *
 * Generates continuous oscillatory motion for procedural animation.
 */
export declare class OscillatoryMotion {
    private config;
    private time;
    private initialValue;
    constructor(config: OscillatoryConfig);
    /**
     * Update motion state
     * @param deltaTime - Time delta in seconds
     */
    update(deltaTime: number): void;
    /**
     * Get current displacement value
     */
    getValue(): number;
    /**
     * Get current position with offset
     */
    getPosition(): Vector3;
    /**
     * Reset motion to initial state
     */
    reset(): void;
    /**
     * Set time directly
     */
    setTime(time: number): void;
    /**
     * Get current time
     */
    getTime(): number;
    /**
     * Update configuration
     */
    setConfig(config: Partial<OscillatoryConfig>): void;
}
/**
 * Pattern Generator for complex procedural motions
 */
export declare class PatternGenerator {
    private config;
    private time;
    constructor(config: PatternConfig);
    /**
     * Update pattern state
     */
    update(deltaTime: number): void;
    /**
     * Get current position on the pattern
     */
    getPosition(): Vector3;
    /**
     * Get current velocity (approximate)
     */
    getVelocity(deltaTime?: number): Vector3;
    /**
     * Reset pattern
     */
    reset(): void;
    /**
     * Update configuration
     */
    setConfig(config: Partial<PatternConfig>): void;
    /**
     * Simple 1D noise function (pseudo-random smoothing)
     */
    private noise1D;
    /**
     * Simple hash function
     */
    private hash;
}
/**
 * Create a preset oscillatory motion
 */
export declare function createPresetMotion(preset: 'bounce' | 'float' | 'vibrate' | 'pulse' | 'swing', options?: Partial<OscillatoryConfig>): OscillatoryMotion;
/**
 * Create a preset pattern
 */
export declare function createPresetPattern(preset: 'orbit' | 'figure8' | 'helix' | 'random', options?: Partial<PatternConfig>): PatternGenerator;
export default OscillatoryMotion;
//# sourceMappingURL=OscillatoryMotion.d.ts.map