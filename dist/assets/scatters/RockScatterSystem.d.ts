/**
 * RockScatterSystem
 *
 * Advanced rock scattering system that combines procedural rock generation
 * with instance-based distribution for realistic terrain decoration.
 *
 * Features:
 * - Integration with RockGenerator for mesh creation
 * - Altitude-based rock type selection
 * - Slope-aware placement logic
 * - Cluster formation for natural rock groups
 * - LOD support for performance
 * - Biome-specific configurations
 * - Erosion-based distribution
 *
 * Usage:
 * ```typescript
 * const rockScatter = new RockScatterSystem();
 * rockScatter.configure({
 *   boulderDensity: 15,
 *   gravelDensity: 3,
 *   clusterProbability: 0.4
 * });
 *
 * const result = rockScatter.scatter(terrainGeometry, terrainMatrix);
 * scene.add(result.group);
 * ```
 */
import * as THREE from 'three';
import { RockType, RockInstance } from './ground/RockGenerator.js';
export interface RockScatterConfig {
    boulderDensity: number;
    gravelDensity: number;
    pebbleDensity: number;
    clusterProbability: number;
    clusterSizeMin: number;
    clusterSizeMax: number;
    clusterSpread: number;
    sizeVariation: number;
    boulderScaleMin: number;
    boulderScaleMax: number;
    gravelScaleMin: number;
    gravelScaleMax: number;
    altitudeRange: [number, number];
    slopePreference: number;
    erosionFactor: number;
    rockTypes: RockType[];
    useLOD: boolean;
    lodDistances: [number, number, number];
    maxInstances: number;
}
export interface RockBiomePreset {
    name: string;
    config: Partial<RockScatterConfig>;
}
export declare class RockScatterSystem {
    private config;
    private rockGenerator;
    private scatterSystem;
    private noise;
    private instances;
    private instancedMeshes;
    private group;
    constructor(config?: Partial<RockScatterConfig>);
    /**
     * Get default rock types
     */
    private getDefaultRockTypes;
    /**
     * Configure the scatter system
     */
    configure(config: Partial<RockScatterConfig>): void;
    /**
     * Apply a biome preset
     */
    applyBiomePreset(biomeName: string): void;
    /**
     * Scatter rocks on terrain
     */
    scatter(positions: THREE.Vector3[], normals: THREE.Vector3[], heights: Float32Array, resolution: number, worldSize: number, erosionMap?: Float32Array): {
        group: THREE.Group;
        instances: RockInstance[];
        stats: RockScatterStats;
    };
    /**
     * Create instanced meshes for rendering
     */
    private createInstancedMeshes;
    /**
     * Create simplified rock geometry
     */
    private createRockGeometry;
    /**
     * Create rock material
     */
    private createRockMaterial;
    /**
     * Calculate scatter statistics
     */
    private calculateStats;
    /**
     * Calculate rock type distribution
     */
    private calculateTypeDistribution;
    /**
     * Estimate memory usage
     */
    private estimateMemoryUsage;
    /**
     * Clear all instances
     */
    clear(): void;
    /**
     * Get the group containing all rock meshes
     */
    getGroup(): THREE.Group;
    /**
     * Get all instances
     */
    getInstances(): RockInstance[];
    /**
     * Update configuration
     */
    updateConfig(config: Partial<RockScatterConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): RockScatterConfig;
}
export interface RockScatterStats {
    totalInstances: number;
    boulderCount: number;
    gravelCount: number;
    clusterCount: number;
    rockTypeDistribution: Record<string, number>;
    computationTime: number;
    memoryUsage: number;
}
export default RockScatterSystem;
//# sourceMappingURL=RockScatterSystem.d.ts.map