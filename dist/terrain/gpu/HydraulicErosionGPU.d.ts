/**
 * Infinigen R3F Port - Hydraulic Erosion System
 * GPU-Accelerated Particle-Based Erosion Simulation
 *
 * Based on original Infinigen hydraulic erosion implementation
 */
export interface ErosionConfig {
    seed: number;
    iterations: number;
    inertia: number;
    sedimentCapacityFactor: number;
    erodeSpeed: number;
    depositSpeed: number;
    evaporateSpeed: number;
    gravity: number;
    maxDropletLifetime: number;
    resolution: number;
}
export interface ErosionData {
    heightMap: Float32Array;
    moistureMap: Float32Array;
    sedimentMap: Float32Array;
    erosionMask: Uint8Array;
}
export declare class HydraulicErosionGPU {
    private config;
    private width;
    private height;
    private rng;
    constructor(config?: Partial<ErosionConfig>);
    /**
     * Execute erosion simulation on heightmap
     */
    erode(heightMap: Float32Array): ErosionData;
    /**
     * Reseed the erosion simulator
     */
    reseed(seed: number): void;
    /**
     * Get configuration
     */
    getConfig(): ErosionConfig;
    /**
     * Update configuration
     */
    setConfig(config: Partial<ErosionConfig>): void;
}
//# sourceMappingURL=HydraulicErosionGPU.d.ts.map