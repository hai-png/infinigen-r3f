/**
 * RiverNetwork - Procedural river system generation
 *
 * Generates realistic river networks with:
 * - Watershed analysis and flow accumulation
 * - Meandering river paths
 * - Erosion and sediment transport
 * - Tributary formation
 * - Delta creation at endpoints
 *
 * Ported from: infinigen/terrain/water/river_network.py
 */
export interface RiverConfig {
    seed: number;
    minElevation: number;
    maxElevation: number;
    riverDensity: number;
    meanderIntensity: number;
    erosionRate: number;
    sedimentCapacity: number;
    minRiverLength: number;
    maxRiverLength: number;
    tributaryProbability: number;
    deltaSize: number;
}
interface FlowData {
    direction: number;
    accumulation: number;
    slope: number;
}
interface RiverPoint {
    position: Vector3;
    width: number;
    depth: number;
    flowRate: number;
}
export declare class RiverNetwork {
    private config;
    private noise;
    private flowData;
    constructor(config?: Partial<RiverConfig>);
    /**
     * Compute flow direction and accumulation for entire heightmap
     */
    computeFlowField(heightmap: Float32Array, resolution: number, worldSize: number): FlowData[];
    /**
     * Trace flow path and accumulate water
     */
    private traceFlow;
    /**
     * Extract river paths from flow field
     */
    extractRiverPaths(heightmap: Float32Array, resolution: number, worldSize: number): RiverPoint[][];
    /**
     * Trace a single river path with meandering
     */
    private traceRiverPath;
    /**
     * Compute meandering offset using noise
     */
    private computeMeanderOffset;
    /**
     * Carve river channel into terrain
     */
    carveRiverChannel(heightmap: Float32Array, rivers: RiverPoint[][], resolution: number, worldSize: number): Float32Array;
    /**
     * Create delta at river endpoint
     */
    createDelta(riverEnd: RiverPoint, heightmap: Float32Array, resolution: number, worldSize: number): Float32Array;
    /**
     * Generate complete river network
     */
    generate(heightmap: Float32Array, resolution: number, worldSize: number): {
        carvedTerrain: Float32Array;
        rivers: RiverPoint[][];
        flowData: FlowData[];
    };
    /**
     * Update configuration
     */
    updateConfig(config: Partial<RiverConfig>): void;
}
export {};
//# sourceMappingURL=RiverNetwork.d.ts.map