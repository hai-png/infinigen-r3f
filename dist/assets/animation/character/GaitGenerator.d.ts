import { Vector3 } from 'three';
/**
 * Gait Types for procedural locomotion
 */
export type GaitType = 'walk' | 'trot' | 'run' | 'gallop' | 'crawl' | 'amble';
/**
 * Leg Configuration
 */
export interface LegConfig {
    name: string;
    startPosition: Vector3;
    restPosition: Vector3;
    strideLength?: number;
    strideHeight?: number;
    phaseOffset?: number;
}
/**
 * Gait Configuration
 */
export interface GaitConfig {
    gaitType: GaitType;
    legs: LegConfig[];
    speed?: number;
    strideFrequency?: number;
    stanceDuration?: number;
}
/**
 * Leg State
 */
export interface LegState {
    config: LegConfig;
    currentPosition: Vector3;
    isStance: boolean;
    phase: number;
    liftProgress: number;
}
/**
 * Gait Generator
 *
 * Generates procedural walking/running cycles for multi-legged creatures.
 * Supports bipeds, quadrupeds, hexapods, and arbitrary leg configurations.
 */
export declare class GaitGenerator {
    private config;
    private time;
    private legStates;
    private gaitSpeed;
    private strideFrequency;
    constructor(config: GaitConfig);
    /**
     * Calculate default phase offset for a leg based on gait type
     */
    private calculatePhaseOffset;
    /**
     * Update gait state
     * @param deltaTime - Time delta in seconds
     */
    update(deltaTime: number): void;
    /**
     * Get all leg positions
     */
    getLegPositions(): Map<string, Vector3>;
    /**
     * Get specific leg position
     */
    getLegPosition(legName: string): Vector3 | null;
    /**
     * Check if specific leg is in stance phase
     */
    isLegInStance(legName: string): boolean;
    /**
     * Get gait cycle progress
     */
    getCycleProgress(): number;
    /**
     * Set gait speed multiplier
     */
    setSpeed(speed: number): void;
    /**
     * Set stride frequency
     */
    setStrideFrequency(frequency: number): void;
    /**
     * Change gait type
     */
    setGaitType(gaitType: GaitType): void;
    /**
     * Get current gait type
     */
    getGaitType(): GaitType;
    /**
     * Reset gait to initial state
     */
    reset(): void;
    /**
     * Get all leg states
     */
    getLegStates(): LegState[];
    /**
     * Calculate body height adjustment based on leg positions
     * Useful for terrain adaptation
     */
    getBodyHeightOffset(terrainHeights: Map<string, number>): number;
    /**
     * Get stride length for current speed
     */
    getCurrentStrideLength(): number;
    /**
     * Create preset quadruped configuration
     */
    static createQuadrupedConfig(bodyLength?: number, bodyWidth?: number, legLength?: number): LegConfig[];
    /**
     * Create preset hexapod configuration
     */
    static createHexapodConfig(bodyLength?: number, bodyWidth?: number, legLength?: number): LegConfig[];
    /**
     * Create preset biped configuration
     */
    static createBipedConfig(hipWidth?: number, legLength?: number): LegConfig[];
}
/**
 * Create a preset gait generator for common creature types
 */
export declare function createPresetGait(creatureType: 'quadruped' | 'hexapod' | 'biped', gaitType?: GaitType, options?: {
    bodyLength?: number;
    bodyWidth?: number;
    legLength?: number;
    speed?: number;
}): GaitGenerator;
export default GaitGenerator;
//# sourceMappingURL=GaitGenerator.d.ts.map