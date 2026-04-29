/**
 * Infinigen R3F Port - Phase 10: Terrain Generation
 * Core Terrain Generator with Multi-Octave Noise, Erosion, and Tectonics
 */
export type HeightMap = Float32Array;
export type MaskMap = Uint8Array;
export interface TerrainConfig {
    seed: number;
    width: number;
    height: number;
    scale: number;
    octaves: number;
    persistence: number;
    lacunarity: number;
    elevationOffset: number;
    erosionStrength: number;
    erosionIterations: number;
    tectonicPlates: number;
    seaLevel: number;
}
export interface TerrainData {
    heightMap: HeightMap;
    normalMap: HeightMap;
    slopeMap: HeightMap;
    biomeMask: MaskMap;
    config: TerrainConfig;
}
export declare class TerrainGenerator {
    private rng;
    private config;
    private width;
    private height;
    private permutationTable;
    constructor(config?: Partial<TerrainConfig>);
    /**
     * Generate complete terrain data
     */
    generate(): TerrainData;
    /**
     * Generate base heightmap using Fractal Brownian Motion
     */
    private generateBaseHeightMap;
    /**
     * Apply tectonic plate simulation for mountain ranges
     */
    private applyTectonics;
    /**
     * Apply hydraulic erosion simulation
     */
    private applyErosion;
    /**
     * Normalize heightmap to 0-1 range with optional offset
     */
    private normalizeHeightMap;
    /**
     * Calculate normal vectors for lighting
     */
    private calculateNormals;
    /**
     * Calculate slope values for biome determination
     */
    private calculateSlopes;
    /**
     * Generate biome mask based on height and slope
     */
    private generateBiomeMask;
    /**
     * Perlin noise implementation
     */
    private perlinNoise;
    private fade;
    private lerp;
    private grad;
    /**
     * Initialize permutation table for noise
     */
    private initPermutationTable;
    /**
     * Reseed the generator
     */
    reseed(seed: number): void;
    /**
     * Get height at specific coordinates
     */
    getHeightAt(x: number, y: number): number;
}
//# sourceMappingURL=TerrainGenerator.d.ts.map