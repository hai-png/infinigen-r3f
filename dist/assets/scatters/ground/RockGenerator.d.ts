/**
 * RockGenerator - Procedural rock scattering for terrain
 *
 * Generates realistic rock distributions including:
 * - Boulders and large rocks
 * - Gravel and small stones
 * - Rock clusters and formations
 * - Erosion-based placement
 *
 * Ported from: infinigen/scatter/ground/rock_generator.py
 */
import * as THREE from 'three';
export interface RockConfig {
    seed: number;
    boulderDensity: number;
    gravelDensity: number;
    clusterProbability: number;
    clusterSize: [number, number];
    sizeVariation: number;
    altitudeRange: [number, number];
    slopePreference: number;
    erosionFactor: number;
    rockTypes: RockType[];
}
export interface RockType {
    name: string;
    colorBase: THREE.Color;
    colorVariation: THREE.Color;
    roughness: number;
    metalness: number;
    scaleMin: number;
    scaleMax: number;
}
export interface RockInstance {
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
    type: RockType;
    isCluster: boolean;
    clusterId?: number;
}
export declare class RockGenerator {
    private config;
    private noise;
    constructor(config?: Partial<RockConfig>);
    /**
     * Generate rock instances over terrain
     */
    generate(positions: THREE.Vector3[], normals: THREE.Vector3[], heights: Float32Array, resolution: number, worldSize: number, erosionMap?: Float32Array): RockInstance[];
    /**
     * Generate a single boulder
     */
    private generateBoulder;
    /**
     * Generate gravel (small rocks)
     */
    private generateGravel;
    /**
     * Generate rock clusters
     */
    private generateClusters;
    /**
     * Evaluate slope preference score
     */
    private evaluateSlopePreference;
    /**
     * Select rock type based on position and height
     */
    private selectRockType;
    /**
     * Calculate rotation aligned with surface normal
     */
    private calculateRotation;
    /**
     * Find nearest position from array
     */
    private findNearestPosition;
    /**
     * Create instanced mesh for rendering
     */
    createInstancedMesh(instances: RockInstance[], geometry: THREE.BufferGeometry, material: THREE.Material): THREE.InstancedMesh;
    /**
     * Update configuration
     */
    updateConfig(config: Partial<RockConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): RockConfig;
}
export default RockGenerator;
//# sourceMappingURL=RockGenerator.d.ts.map