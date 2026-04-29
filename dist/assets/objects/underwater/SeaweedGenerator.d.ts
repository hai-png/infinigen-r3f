import * as THREE from 'three';
/**
 * Seaweed types with specific characteristics
 */
export declare enum SeaweedType {
    KELP = "kelp",
    SARGASSUM = "sargassum",
    DULSE = "dulse",
    WAKAME = "wakame",
    SEA_LETTUCE = "sea_lettuce"
}
export interface SeaweedConfig {
    type: SeaweedType;
    height: number;
    segmentCount: number;
    baseWidth: number;
    tipWidth: number;
    color: THREE.Color;
    opacity: number;
    flowSpeed: number;
    flowAmplitude: number;
    bendFactor: number;
    leafCount: number;
    leafSize: number;
}
/**
 * Generates procedural seaweed meshes with natural flowing animation support
 */
export declare class SeaweedGenerator {
    private static materialCache;
    /**
     * Generate a single seaweed strand
     */
    static generateStrand(config: SeaweedConfig): THREE.Mesh;
    /**
     * Create seaweed strand geometry with segments for animation
     */
    private static createStrandGeometry;
    /**
     * Add leaf geometries to the main strand
     */
    private static addLeavesToGeometry;
    /**
     * Create individual leaf geometry
     */
    private static createLeafGeometry;
    /**
     * Get or create material for seaweed
     */
    private static getMaterial;
    /**
     * Generate kelp forest
     */
    static generateKelpForest(count: number, area: {
        width: number;
        depth: number;
    }, waterDepth: number): THREE.Group;
    /**
     * Get preset configurations for different seaweed types
     */
    static getPreset(type: SeaweedType): SeaweedConfig;
    /**
     * Update animation for seaweed strands
     */
    static updateAnimation(group: THREE.Group, deltaTime: number): void;
}
//# sourceMappingURL=SeaweedGenerator.d.ts.map