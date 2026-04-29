/**
 * Snow System for Terrain
 * Implements snow accumulation, slope-based sliding, wind-driven patterns, and melting
 */
import * as THREE from 'three';
export interface SnowParams {
    /** Base snow depth in meters */
    baseDepth: number;
    /** Maximum snow depth on flat surfaces */
    maxDepth: number;
    /** Slope angle threshold for snow sliding (degrees) */
    slideThreshold: number;
    /** Wind strength (0-1) */
    windStrength: number;
    /** Wind direction vector */
    windDirection: THREE.Vector3;
    /** Temperature for melting simulation */
    temperature: number;
    /** Melting rate per second */
    meltRate: number;
    /** Accumulation rate per second */
    accumulateRate: number;
    /** Enable wind-driven drifts */
    enableDrifts: boolean;
    /** Drift scale */
    driftScale: number;
}
export declare class SnowSystem {
    private params;
    private snowDepthMap;
    private width;
    private height;
    constructor(params?: Partial<SnowParams>);
    /**
     * Initialize snow depth map
     */
    initialize(width: number, height: number): void;
    /**
     * Simulate snow accumulation based on slope and wind
     */
    simulate(heightMap: Float32Array, normalMap: Float32Array, deltaTime: number): Float32Array;
    /**
     * Get snow depth at a specific position
     */
    getDepth(x: number, y: number): number;
    /**
     * Apply snow to geometry by displacing vertices
     */
    applyToGeometry(geometry: THREE.BufferGeometry, heightMap: Float32Array): THREE.BufferGeometry;
    /**
     * Update parameters
     */
    setParams(params: Partial<SnowParams>): void;
    /**
     * Get current snow depth map
     */
    getDepthMap(): Float32Array | null;
}
export default SnowSystem;
//# sourceMappingURL=SnowSystem.d.ts.map