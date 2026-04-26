/**
 * LakeGenerator - Procedural lake generation system
 *
 * Generates realistic lakes with:
 * - Shoreline erosion and sediment deposition
 * - Depth-based color variation
 * - Underwater terrain sculpting
 * - Reflection/refraction setup
 *
 * Ported from: infinigen/terrain/water/lake_generator.py
 */
import * as THREE from 'three';
export interface LakeConfig {
    seed: number;
    minElevation: number;
    maxElevation: number;
    targetArea: number;
    depthScale: number;
    shorelineSharpness: number;
    sedimentDeposit: number;
    waterColor: THREE.Color;
    waterOpacity: number;
    enableReflections: boolean;
    enableRefractions: boolean;
}
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
export interface RiverPoint {
    position: Vector3;
    width: number;
    depth: number;
    flowRate: number;
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
export declare class LakeGenerator {
    private config;
    private noise;
    constructor(config?: Partial<LakeConfig>);
    /**
     * Generate lake basin geometry
     */
    generateLakeBasin(centerX: number, centerZ: number, radius: number, heightmap: Float32Array, resolution: number, worldSize: number): {
        basin: Float32Array;
        shoreline: Vector3[];
        depthMap: Float32Array;
    };
    /**
     * Sculpt underwater terrain
     */
    sculptUnderwaterTerrain(basin: Float32Array, depthMap: Float32Array, resolution: number, worldSize: number): Float32Array;
    /**
     * Create lake water mesh
     */
    createWaterMesh(shoreline: Vector3[], baseLevel: number): THREE.BufferGeometry;
    /**
     * Compute concave hull from shoreline points
     */
    private computeConcaveHull;
    /**
     * Triangulate polygon for water surface
     */
    private triangulatePolygon;
    /**
     * Create water material with reflections/refractions
     */
    createWaterMaterial(): THREE.MeshPhysicalMaterial;
    /**
     * Generate complete lake system
     */
    generate(centerX: number, centerZ: number, radius: number, heightmap: Float32Array, resolution: number, worldSize: number): {
        terrain: Float32Array;
        waterGeometry: THREE.BufferGeometry;
        waterMaterial: THREE.MeshPhysicalMaterial;
        shoreline: Vector3[];
        depthMap: Float32Array;
    };
    /**
     * Update configuration
     */
    updateConfig(config: Partial<LakeConfig>): void;
}
//# sourceMappingURL=LakeGenerator.d.ts.map