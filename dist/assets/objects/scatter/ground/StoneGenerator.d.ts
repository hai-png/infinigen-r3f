import * as THREE from 'three';
/**
 * Configuration for stone generation
 */
export interface StoneConfig {
    size: number;
    variation: number;
    roughness: number;
    colorBase: THREE.Color;
    colorVariation: THREE.Color;
    mossChance: number;
    wetChance: number;
    count: number;
    spreadRadius: number;
}
/**
 * Generates individual stone meshes for scatter systems
 * Distinct from pebbles by being larger, more detailed, and often unique
 */
export declare class StoneGenerator {
    private noiseUtils;
    private materialCache;
    constructor();
    /**
     * Generate a single detailed stone mesh
     */
    generateStone(config?: Partial<StoneConfig>): THREE.Mesh;
    /**
     * Generate multiple stones arranged in a cluster
     */
    generateStoneCluster(config: Partial<StoneConfig> & {
        clusterSize: number;
    }): THREE.Group;
    /**
     * Create irregular stone geometry using noise displacement
     */
    private createStoneGeometry;
    /**
     * Get or create material for stone
     */
    private getStoneMaterial;
    /**
     * Generate standing stones (monoliths)
     */
    generateStandingStone(height?: number): THREE.Mesh;
    /**
     * Clear material cache to free memory
     */
    dispose(): void;
}
//# sourceMappingURL=StoneGenerator.d.ts.map