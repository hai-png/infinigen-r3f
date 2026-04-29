/**
 * WaterfallGenerator - Procedural waterfall generation system
 *
 * Generates realistic waterfalls with:
 * - Cliff detection and waterfall placement
 * - Multi-tier waterfall structures
 * - Plunge pool erosion
 * - Mist particle generation
 * - Sound zone markers
 *
 * Ported from: infinigen/terrain/water/waterfall_generator.py
 */
import * as THREE from 'three';
import { RiverPoint } from './RiverNetwork';
export interface WaterfallConfig {
    seed: number;
    minHeight: number;
    maxHeight: number;
    minSlope: number;
    plungePoolRadius: number;
    plungePoolDepth: number;
    mistDensity: number;
    tierProbability: number;
}
export interface Waterfall {
    position: Vector3;
    height: number;
    width: number;
    flowRate: number;
    tiers: WaterfallTier[];
    plungePool: PlungePool;
    mistParticles: Vector3[];
}
export interface WaterfallTier {
    position: Vector3;
    height: number;
    width: number;
    overhang: number;
}
export interface PlungePool {
    position: Vector3;
    radius: number;
    depth: number;
    erosion: Float32Array;
}
export declare class WaterfallGenerator {
    private config;
    private noise;
    constructor(config?: Partial<WaterfallConfig>);
    /**
     * Detect potential waterfall locations along river paths
     */
    detectWaterfallLocations(rivers: RiverPoint[][], heightmap: Float32Array, resolution: number, worldSize: number): {
        riverPoint: RiverPoint;
        slope: number;
        height: number;
    }[];
    /**
     * Generate waterfall structure at detected location
     */
    generateWaterfall(location: {
        riverPoint: RiverPoint;
        slope: number;
        height: number;
    }, heightmap: Float32Array, resolution: number, worldSize: number): Waterfall | null;
    /**
     * Determine number of tiers based on waterfall height
     */
    private determineNumTiers;
    /**
     * Compute cliff overhang for realistic waterfall profile
     */
    private computeOverhang;
    /**
     * Generate plunge pool at waterfall base
     */
    private generatePlungePool;
    /**
     * Generate mist particle positions
     */
    private generateMistParticles;
    /**
     * Carve waterfall into terrain
     */
    carveWaterfall(heightmap: Float32Array, waterfall: Waterfall, resolution: number, worldSize: number): Float32Array;
    /**
     * Create waterfall mesh geometry
     */
    createWaterfallMesh(waterfall: Waterfall): THREE.BufferGeometry;
    /**
     * Create waterfall material
     */
    createWaterfallMaterial(): THREE.MeshPhysicalMaterial;
    /**
     * Generate all waterfalls in scene
     */
    generate(rivers: RiverPoint[][], heightmap: Float32Array, resolution: number, worldSize: number): {
        waterfalls: Waterfall[];
        carvedTerrain: Float32Array;
    };
    /**
     * Update configuration
     */
    updateConfig(config: Partial<WaterfallConfig>): void;
}
//# sourceMappingURL=WaterfallGenerator.d.ts.map