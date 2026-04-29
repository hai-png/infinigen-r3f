import * as THREE from 'three';
/**
 * Seagrass types with specific characteristics
 */
export declare enum SeaGrassType {
    EELGRASS = "eelgrass",
    TURTLEGRASS = "turtlegrass",
    MANATEEGRASS = "manateegrass",
    PADDLEGRASS = "paddlegrass",
    SHOALGRASS = "shoalgrass"
}
export interface SeaGrassConfig {
    type: SeaGrassType;
    bladeHeight: number;
    bladeWidth: number;
    bladeCount: number;
    color: THREE.Color;
    opacity: number;
    flowSpeed: number;
    flowAmplitude: number;
    density: number;
    clusterSize: number;
}
/**
 * Generates procedural seagrass beds with instanced rendering for performance
 */
export declare class SeaGrassGenerator {
    private static materialCache;
    private static bladeGeometryCache;
    /**
     * Generate a seagrass bed using instanced mesh
     */
    static generateBed(config: SeaGrassConfig, area: {
        width: number;
        depth: number;
    }): THREE.InstancedMesh;
    /**
     * Get or create blade geometry
     */
    private static getBladeGeometry;
    /**
     * Get or create material for seagrass
     */
    private static getMaterial;
    /**
     * Generate single seagrass clump
     */
    static generateClump(config: SeaGrassConfig, position: THREE.Vector3): THREE.Group;
    /**
     * Get preset configurations for different seagrass types
     */
    static getPreset(type: SeaGrassType): SeaGrassConfig;
    /**
     * Update animation for seagrass beds
     */
    static updateAnimation(instancedMesh: THREE.InstancedMesh, deltaTime: number): void;
}
//# sourceMappingURL=SeaGrassGenerator.d.ts.map