/**
 * Enhanced Erosion System
 *
 * Implements advanced erosion simulation including thermal, hydraulic, and river formation.
 * Extends the GPU-based hydraulic erosion with additional erosion types.
 *
 * Features:
 * - Thermal erosion (scree/talus slopes)
 * - Hydraulic erosion (rainfall impact)
 * - River formation and meandering
 * - Sediment transport and deposition
 * - Cliff undercutting
 * - Multi-pass erosion for realism
 *
 * @see https://github.com/princeton-vl/infinigen
 */
export interface ErosionParams {
    thermalErosionEnabled: boolean;
    talusAngle: number;
    thermalIterations: number;
    hydraulicErosionEnabled: boolean;
    rainfallAmount: number;
    evaporationRate: number;
    sedimentCapacityFactor: number;
    minSedimentCapacity: number;
    erodeSpeed: number;
    depositSpeed: number;
    hydraulicIterations: number;
    riverFormationEnabled: boolean;
    riverSourceCount: number;
    riverLength: number;
    riverErosionMultiplier: number;
    maxErosionDepth: number;
    seed: number;
}
/**
 * Thermal erosion simulator
 * Simulates material sliding down slopes due to gravity
 */
export declare class ThermalErosion {
    private params;
    private heightmap;
    private width;
    private height;
    constructor(heightmap: Float32Array, width: number, height: number, params?: Partial<ErosionParams>);
    /**
     * Run thermal erosion simulation
     */
    simulate(): void;
    /**
     * Update parameters
     */
    updateParams(params: Partial<ErosionParams>): void;
}
/**
 * River formation simulator
 * Creates realistic river channels through terrain
 */
export declare class RiverFormation {
    private params;
    private heightmap;
    private width;
    private height;
    private rng;
    constructor(heightmap: Float32Array, width: number, height: number, params?: Partial<ErosionParams>);
    /**
     * Generate river network
     */
    simulate(): void;
    /**
     * Carve a single river channel
     */
    private carveRiver;
    /**
     * Update parameters
     */
    updateParams(params: Partial<ErosionParams>): void;
}
/**
 * Complete erosion system combining all erosion types
 */
export declare class ErosionSystem {
    private params;
    private heightmap;
    private width;
    private height;
    private thermalErosion?;
    private riverFormation?;
    constructor(heightmap: Float32Array, width: number, height: number, params?: Partial<ErosionParams>);
    /**
     * Initialize erosion subsystems
     */
    private initialize;
    /**
     * Run complete erosion simulation
     */
    simulate(): void;
    /**
     * Get modified heightmap
     */
    getHeightmap(): Float32Array;
    /**
     * Update erosion parameters
     */
    updateParams(params: Partial<ErosionParams>): void;
    /**
     * Reset with new heightmap
     */
    reset(heightmap: Float32Array): void;
}
export default ErosionSystem;
//# sourceMappingURL=ErosionSystem.d.ts.map