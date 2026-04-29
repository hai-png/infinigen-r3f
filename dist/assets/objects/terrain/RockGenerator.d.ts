/**
 * RockGenerator - Procedural rock and terrain asset generation
 *
 * Generates realistic rocks, boulders, and terrain features using:
 * - Noise-based displacement on base geometries
 * - Multiple rock types with material variations
 * - LOD support for performance optimization
 * - Weathering and erosion effects
 * - Cluster and scatter generation
 *
 * Features:
 * - Boulder generation (large rocks)
 * - Cliff face segments
 * - Scattered stones and pebbles
 * - Material variation (granite, limestone, sandstone, basalt)
 * - Surface weathering (cracks, moss, lichen)
 * - Instanced rendering support
 */
import * as THREE from 'three';
export type RockType = 'granite' | 'limestone' | 'sandstone' | 'basalt' | 'cliff';
export interface RockMaterial {
    name: RockType;
    colorBase: THREE.Color;
    colorVariation: THREE.Color;
    roughness: number;
    metalness: number;
    bumpScale: number;
    normalStrength?: number;
}
export interface RockConfig {
    size: number;
    width: number;
    height: number;
    depth: number;
    segments: number;
    irregularity: number;
    noiseScale: number;
    noiseDetail: number;
    octaves: number;
    rockType: RockType;
    customMaterial?: RockMaterial;
    weatheringIntensity: number;
    crackDensity: number;
    mossCoverage: number;
    lichenCoverage: number;
    seed: number;
    randomness: number;
    useLOD: boolean;
    lodLevels: number;
}
export interface RockInstance {
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
    rockType: RockType;
    lodLevel: number;
}
export declare class RockGenerator {
    private config;
    private noise;
    private materialCache;
    constructor(config?: Partial<RockConfig>);
    /**
     * Generate a single rock mesh
     */
    generate(): THREE.Mesh;
    /**
     * Create rock geometry using noise displacement
     */
    private createRockGeometry;
    /**
     * Apply noise-based vertex displacement
     */
    private displaceVertices;
    /**
     * Add crack details to geometry
     */
    private addCracks;
    /**
     * Create rock material based on type
     */
    private createRockMaterial;
    /**
     * Apply weathering effects (moss, lichen, discoloration)
     */
    private applyWeathering;
    /**
     * Generate a cluster of rocks
     */
    generateCluster(count: number, spread: number): THREE.Group;
    /**
     * Generate LOD variants
     */
    generateLODVariants(): THREE.LOD;
    /**
     * Generate boulder variant (larger, smoother)
     */
    generateBoulder(): THREE.Mesh;
    /**
     * Generate gravel (small rocks)
     */
    generateGravel(count: number, area: number): THREE.Group;
    /**
     * Generate cliff face segment
     */
    generateCliffFace(width: number, height: number, depth: number): THREE.Mesh;
    /**
     * Layered noise for detailed surface variation
     */
    private layeredNoise;
    /**
     * Update configuration
     */
    setConfig(config: Partial<RockConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): RockConfig;
    /**
     * Dispose resources
     */
    dispose(): void;
}
export default RockGenerator;
//# sourceMappingURL=RockGenerator.d.ts.map